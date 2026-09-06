import express from 'express';
import cors from 'cors';
import { WebSocketServer } from 'ws';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import readline from 'node:readline';
import { exec } from 'node:child_process';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';

import {
  getConnectedDevices,
  getDeviceTelemetry,
  listPhoneScreenshots,
  pullFileFromPhone,
  captureRemoteScreenshot,
  deleteRemotePhoneFile,
  deletePhoneMediaByName,
  enableTcpipMode,
  connectWifiAdb,
  disconnectWifiAdb,
  getDeviceWifiIp,
  ADB_BIN
} from './adb.js';
import { getExifData } from './exif.js';

const execAsync = promisify(exec);
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Deterministic Port from dport calc droid-sync-server
const PORT = process.env.PORT || 40880;

// Config paths: config.default.json (tracked in git) and config.json (user local overrides, gitignored)
const DEFAULT_CONFIG_FILE = path.join(__dirname, 'config.default.json');
const USER_CONFIG_FILE = path.join(__dirname, 'config.json');

// Helper to expand tilde path (~/Documents -> /Users/...)
const resolveHomeDir = (filepath) => {
  if (!filepath) return '';
  if (filepath.startsWith('~/') || filepath === '~') {
    return path.join(os.homedir(), filepath.slice(1));
  }
  return path.resolve(filepath);
};

// Load configuration with priority: built-in defaults < config.default.json < config.json (user overrides)
let config = {
  destinationDir: '~/Documents/Droid Sync',
  screenshotsPath: './screenshots',
  photosPath: './photos',
  phoneScreenshotsDirs: [
    '/sdcard/Pictures/Screenshots',
    '/sdcard/DCIM/Screenshots'
  ],
  phoneCameraDirs: [
    '/sdcard/DCIM/Camera',
    '/sdcard/DCIM/100ANDRO'
  ],
  hideJsonlFiles: false,
  syncScreenshots: true,
  syncCamera: true,
  pollIntervalMs: 2500,
  autoDeleteFromPhone: false,
  autoDeleteScreenshots: false,
  autoDeleteCamera: false,
  wifiIp: '',
  wifiPort: 5555,
  notifyOnMac: true
};

// 1. Load canonical config.default.json if present
try {
  if (fs.existsSync(DEFAULT_CONFIG_FILE)) {
    const defaultRaw = fs.readFileSync(DEFAULT_CONFIG_FILE, 'utf8');
    config = { ...config, ...JSON.parse(defaultRaw) };
  }
} catch (e) {
  console.error('[Default Config Load Error]:', e.message);
}

// 2. Load and overlay user local config.json (gitignored) with highest priority
try {
  if (fs.existsSync(USER_CONFIG_FILE)) {
    const userRaw = fs.readFileSync(USER_CONFIG_FILE, 'utf8');
    config = { ...config, ...JSON.parse(userRaw) };
  }
} catch (e) {
  console.error('[User Config Load Error]:', e.message);
}

// Ensure local destination directories exist
const getParentDestinationDir = () => {
  const resolved = resolveHomeDir(config.destinationDir || '~/Documents/Droid Sync');
  if (!fs.existsSync(resolved)) {
    fs.mkdirSync(resolved, { recursive: true });
  }
  return resolved;
};

const getLocalScreenshotsDir = () => {
  const parent = getParentDestinationDir();
  const rel = config.screenshotsPath || './screenshots';
  const resolved = path.isAbsolute(rel) ? rel : path.resolve(parent, rel);
  if (!fs.existsSync(resolved)) {
    fs.mkdirSync(resolved, { recursive: true });
  }
  return resolved;
};

const getLocalCameraDir = () => {
  const parent = getParentDestinationDir();
  const rel = config.photosPath || config.cameraDestinationDir || './photos';
  const resolved = path.isAbsolute(rel) ? rel : path.resolve(parent, rel);
  if (!fs.existsSync(resolved)) {
    fs.mkdirSync(resolved, { recursive: true });
  }
  return resolved;
};

const getLocalDestinationDir = getLocalScreenshotsDir;

// ==========================================
// PARENT DIRECTORY SYNC HISTORY ((.)sync-history-*.jsonl)
// ==========================================
const screenshotsHistory = {
  lastSyncTime: null,
  syncedFiles: new Set()
};

const cameraHistory = {
  lastSyncTime: null,
  syncedFiles: new Set()
};

const getHistoryFilePath = (type) => {
  const parent = getParentDestinationDir();
  const prefix = config.hideJsonlFiles ? '.' : '';
  const suffix = type === 'camera' ? 'photos' : 'screenshots';
  return path.join(parent, `${prefix}sync-history-${suffix}.jsonl`);
};

/**
 * Loads JSONL history from the parent destination directory into an in-memory Set
 */
const loadFolderHistory = async (type, historyStore) => {
  historyStore.syncedFiles.clear();
  const historyFile = getHistoryFilePath(type);
  if (!fs.existsSync(historyFile)) return;

  try {
    const fileStream = fs.createReadStream(historyFile, { encoding: 'utf8' });
    const rl = readline.createInterface({ input: fileStream, crlfDelay: Infinity });
    for await (const line of rl) {
      const trimmed = line.trim();
      if (!trimmed) continue;
      try {
        const entry = JSON.parse(trimmed);
        const name = typeof entry === 'string' ? entry : (entry.file || entry.filename);
        if (name) {
          historyStore.syncedFiles.add(name);
          if (entry.ts) historyStore.lastSyncTime = entry.ts;
        }
      } catch {}
    }
  } catch (e) {
    console.error(`[History Load Error for ${type}]:`, e.message);
  }
};

/**
 * Append a newly synced media item to the parent folder's sync-history JSONL (O(1) append-only)
 */
const recordSyncedFile = (filename, metadata = {}) => {
  if (!filename) return;
  const isCamera = metadata.type === 'camera';
  const type = isCamera ? 'camera' : 'screenshot';
  const targetHistory = isCamera ? cameraHistory : screenshotsHistory;

  targetHistory.syncedFiles.add(filename);
  targetHistory.lastSyncTime = new Date().toISOString();

  try {
    const historyFile = getHistoryFilePath(type);
    const line = JSON.stringify({ file: filename, ts: targetHistory.lastSyncTime, ...metadata }) + '\n';
    fs.appendFileSync(historyFile, line, 'utf8');
  } catch (err) {
    console.error(`[History Append Error for ${type}]:`, err.message);
  }
};

/**
 * Seamless auto-migration:
 * 1. Renames between dot and non-dot files if hideJsonlFiles was toggled
 * 2. Migrates subfolder .sync-history.jsonl into parent directory
 * 3. Migrates legacy server/sync-history.json[l] if any
 */
const migrateHistoryFiles = async () => {
  const parent = getParentDestinationDir();
  const screenshotsDir = getLocalScreenshotsDir();
  const cameraDir = getLocalCameraDir();

  // 1. Rename between dot and non-dot versions if hideJsonlFiles setting doesn't match on-disk file
  const activeScreenHist = getHistoryFilePath('screenshot');
  const inactiveScreenHist = path.join(parent, config.hideJsonlFiles ? 'sync-history-screenshots.jsonl' : '.sync-history-screenshots.jsonl');
  if (fs.existsSync(inactiveScreenHist) && !fs.existsSync(activeScreenHist)) {
    try {
      fs.renameSync(inactiveScreenHist, activeScreenHist);
    } catch {}
  }

  const activeCamHist = getHistoryFilePath('camera');
  const inactiveCamHist = path.join(parent, config.hideJsonlFiles ? 'sync-history-photos.jsonl' : '.sync-history-photos.jsonl');
  if (fs.existsSync(inactiveCamHist) && !fs.existsSync(activeCamHist)) {
    try {
      fs.renameSync(inactiveCamHist, activeCamHist);
    } catch {}
  }

  // 2. Migrate legacy subfolder .sync-history.jsonl files to parent directory
  const subScreen = path.join(screenshotsDir, '.sync-history.jsonl');
  if (fs.existsSync(subScreen)) {
    try {
      const content = fs.readFileSync(subScreen, 'utf8');
      fs.appendFileSync(activeScreenHist, content, 'utf8');
      fs.unlinkSync(subScreen);
      console.log('[History Migration] Moved screenshots/.sync-history.jsonl -> parent folder');
    } catch (e) {
      console.error('[Migration Error subScreen]:', e.message);
    }
  }

  const subCam = path.join(cameraDir, '.sync-history.jsonl');
  if (fs.existsSync(subCam)) {
    try {
      const content = fs.readFileSync(subCam, 'utf8');
      fs.appendFileSync(activeCamHist, content, 'utf8');
      fs.unlinkSync(subCam);
      console.log('[History Migration] Moved photos/.sync-history.jsonl -> parent folder');
    } catch (e) {
      console.error('[Migration Error subCam]:', e.message);
    }
  }

  // 3. Migrate legacy server/sync-history.json[l]
  const legacyJsonl = path.join(__dirname, 'sync-history.jsonl');
  const legacyJson = path.join(__dirname, 'sync-history.json');
  const filesToMigrate = [];

  if (fs.existsSync(legacyJsonl)) {
    try {
      const fileStream = fs.createReadStream(legacyJsonl, { encoding: 'utf8' });
      const rl = readline.createInterface({ input: fileStream, crlfDelay: Infinity });
      for await (const line of rl) {
        const trimmed = line.trim();
        if (!trimmed) continue;
        try {
          const entry = JSON.parse(trimmed);
          filesToMigrate.push(entry);
        } catch {}
      }
      fs.unlinkSync(legacyJsonl);
    } catch (e) {
      console.error('[Legacy JSONL Migration Error]:', e.message);
    }
  } else if (fs.existsSync(legacyJson)) {
    try {
      const raw = JSON.parse(fs.readFileSync(legacyJson, 'utf8'));
      for (const f of raw.syncedFiles || []) {
        filesToMigrate.push({ file: f, ts: raw.lastSyncTime });
      }
      fs.unlinkSync(legacyJson);
    } catch (e) {
      console.error('[Legacy JSON Migration Error]:', e.message);
    }
  }

  if (filesToMigrate.length > 0) {
    for (const entry of filesToMigrate) {
      const name = typeof entry === 'string' ? entry : (entry.file || entry.filename);
      if (!name) continue;
      const isCamera = entry.type === 'camera' || (!entry.type && !/screenshot|screencap/i.test(name));
      const type = isCamera ? 'camera' : 'screenshot';
      const targetHistory = isCamera ? cameraHistory : screenshotsHistory;

      if (!targetHistory.syncedFiles.has(name)) {
        targetHistory.syncedFiles.add(name);
        if (entry.ts) targetHistory.lastSyncTime = entry.ts;
        try {
          const histFile = getHistoryFilePath(type);
          fs.appendFileSync(histFile, JSON.stringify({
            file: name,
            ts: entry.ts || new Date().toISOString(),
            type: isCamera ? 'camera' : 'screenshot'
          }) + '\n', 'utf8');
        } catch {}
      }
    }
    console.log(`[History Migration] Successfully migrated ${filesToMigrate.length} legacy root entries into parent history`);
  }
};

// Initialize per-folder histories on startup
await migrateHistoryFiles();
await loadFolderHistory('screenshot', screenshotsHistory);
await loadFolderHistory('camera', cameraHistory);

const saveConfig = () => {
  try {
    fs.writeFileSync(USER_CONFIG_FILE, JSON.stringify(config, null, 2), 'utf8');
  } catch (err) {
    console.error('[Config Save Error]:', err.message);
  }
};

// System notification on macOS
const sendMacNotification = (title, message) => {
  if (!config.notifyOnMac) return;
  const script = `display notification "${message.replace(/"/g, '\\"')}" with title "${title.replace(/"/g, '\\"')}"`;
  exec(`osascript -e '${script}'`, (err) => {
    if (err) console.error('[Mac Notification Error]:', err.message);
  });
};

const app = express();
app.use(cors());
app.use((req, res, next) => {
  res.setHeader('Access-Control-Allow-Private-Network', 'true');
  if (req.method === 'OPTIONS') {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    return res.sendStatus(204);
  }
  next();
});
app.use(express.json());

// In-memory state
let currentDevice = null;
let currentTelemetry = null;
let isSyncing = false;
let previousDeviceSerial = null;
let previousDeviceAuthorized = false;

// WebSocket clients
const clients = new Set();
const broadcast = (type, payload) => {
  const msg = JSON.stringify({ type, data: payload, timestamp: Date.now() });
  for (const ws of clients) {
    if (ws.readyState === 1) { // OPEN
      ws.send(msg);
    }
  }
};

/**
 * Lists all downloaded media (screenshots & camera photos) from the local destination folders
 */
const getLocalScreenshotsList = () => {
  const screenshotsDir = getLocalScreenshotsDir();
  const cameraDir = getLocalCameraDir();
  const images = [];
  const seenFiles = new Set();

  const scanFolder = (dirPath, forceType) => {
    if (!fs.existsSync(dirPath)) return;
    const files = fs.readdirSync(dirPath);
    for (const file of files) {
      if (/\.(png|jpg|jpeg|webp)$/i.test(file) && !seenFiles.has(file)) {
        seenFiles.add(file);
        const fullPath = path.join(dirPath, file);
        try {
          const stats = fs.statSync(fullPath);
          const isScreen = /screenshot|screencap/i.test(file);
          images.push({
            filename: file,
            type: forceType || (isScreen ? 'screenshot' : 'camera'),
            sizeBytes: stats.size,
            mtime: stats.mtime.toISOString(),
            createdAt: stats.birthtime ? stats.birthtime.toISOString() : stats.mtime.toISOString(),
            url: `/api/screenshots/${encodeURIComponent(file)}`
          });
        } catch {
          // Skip inaccessible files
        }
      }
    }
  };

  scanFolder(screenshotsDir, 'screenshot');
  if (cameraDir !== screenshotsDir) {
    scanFolder(cameraDir, 'camera');
  }

  // Sort descending by modification time
  return images.sort((a, b) => new Date(b.mtime) - new Date(a.mtime));
};

/**
 * Synchronization logic
 */
const performSync = async () => {
  if (isSyncing) return { success: false, reason: 'already_syncing' };
  isSyncing = true;

  try {
    let devicesRes = await getConnectedDevices();
    if (!devicesRes.success || devicesRes.devices.length === 0) {
      // If we have a configured Wi-Fi IP, try to automatically re-establish connection
      if (config.wifiIp) {
        const tryConnect = await connectWifiAdb(config.wifiIp, config.wifiPort || 5555);
        if (tryConnect.success) {
          devicesRes = await getConnectedDevices();
        }
      }
    }

    if (!devicesRes.success || devicesRes.devices.length === 0) {
      const hadDevice = previousDeviceSerial !== null;
      currentDevice = null;
      currentTelemetry = null;
      previousDeviceSerial = null;
      previousDeviceAuthorized = false;
      if (hadDevice) {
        console.log('[Device] Phone disconnected');
        broadcast('device-disconnected', {});
      }
      return { success: false, reason: 'no_device_connected' };
    }

    const device = devicesRes.devices.find(d => d.isAuthorized) || devicesRes.devices[0];
    currentDevice = device;

    if (!device.isAuthorized) {
      previousDeviceSerial = device.serial;
      previousDeviceAuthorized = false;
      broadcast('device-unauthorized', { device });
      return { success: false, reason: 'device_unauthorized', device };
    }

    const isReconnection = !previousDeviceSerial || 
                           previousDeviceSerial !== device.serial || 
                           !previousDeviceAuthorized;

    previousDeviceSerial = device.serial;
    previousDeviceAuthorized = true;

    // Refresh telemetry
    currentTelemetry = await getDeviceTelemetry(device.serial);

    if (isReconnection) {
      console.log(`[Device] Connection established / reconnected: ${device.serial} (${device.model})`);
      broadcast('device-connected', {
        device,
        telemetry: currentTelemetry,
        screenshots: getLocalScreenshotsList()
      });
    }

    broadcast('device-status', { device, telemetry: currentTelemetry });

    // Build candidate directories based on sync toggles
    const candidateDirs = [];
    if (config.syncScreenshots !== false) {
      candidateDirs.push(...(config.phoneScreenshotsDirs || []));
    }
    if (config.syncCamera !== false) {
      candidateDirs.push(...(config.phoneCameraDirs || ['/sdcard/DCIM/Camera']));
    }

    if (candidateDirs.length === 0) {
      return { success: true, pulledCount: 0, pulledFiles: [], totalScreenshots: 0 };
    }

    // Scan remote phone media
    const remoteList = await listPhoneScreenshots(device.serial, candidateDirs);
    const screenshotsDest = getLocalScreenshotsDir();
    const cameraDest = getLocalCameraDir();

    // Auto-detect if user deleted history file manually from Finder
    const screenshotsHistFile = getHistoryFilePath('screenshot');
    if (!fs.existsSync(screenshotsHistFile) && screenshotsHistory.syncedFiles.size > 0) {
      console.log('[History] Detected manual removal of screenshots history, resetting in-memory cache');
      screenshotsHistory.syncedFiles.clear();
      screenshotsHistory.lastSyncTime = null;
    }

    const cameraHistFile = getHistoryFilePath('camera');
    if (!fs.existsSync(cameraHistFile) && cameraHistory.syncedFiles.size > 0) {
      console.log('[History] Detected manual removal of camera history, resetting in-memory cache');
      cameraHistory.syncedFiles.clear();
      cameraHistory.lastSyncTime = null;
    }

    // Filter candidate items that need to be pulled
    const itemsToPull = [];
    for (const item of remoteList) {
      const isCamera = item.type === 'camera';
      const targetDest = isCamera ? cameraDest : screenshotsDest;
      const targetHistory = isCamera ? cameraHistory : screenshotsHistory;

      if (!targetHistory.syncedFiles.has(item.filename) && !fs.existsSync(path.join(targetDest, item.filename))) {
        itemsToPull.push(item);
      }
    }

    const pulledNow = [];

    if (itemsToPull.length > 0) {
      broadcast('sync-started', {
        total: itemsToPull.length,
        files: itemsToPull.map(i => i.filename)
      });

      let lastGalleryBroadcast = Date.now();

      for (let idx = 0; idx < itemsToPull.length; idx++) {
        const item = itemsToPull[idx];
        const isCamera = item.type === 'camera';
        const targetDest = isCamera ? cameraDest : screenshotsDest;

        console.log(`[Sync] (${idx + 1}/${itemsToPull.length}) Pulling ${item.type || 'media'}: ${item.filename} -> ${targetDest}`);
        const pullRes = await pullFileFromPhone(device.serial, item.remotePath, targetDest);

        if (pullRes.success) {
          recordSyncedFile(item.filename, { type: item.type });
          pulledNow.push(item.filename);

          const shouldDelete = (item.type === 'screenshot' && (config.autoDeleteScreenshots || config.autoDeleteFromPhone)) ||
                               (item.type === 'camera' && config.autoDeleteCamera);

          if (shouldDelete) {
            console.log(`[Sync] Auto-deleting ${item.type} from phone: ${item.remotePath}`);
            await deleteRemotePhoneFile(device.serial, item.remotePath);
          }

          // Broadcast progress in real-time
          broadcast('sync-progress', {
            current: pulledNow.length,
            total: itemsToPull.length,
            percent: Math.round((pulledNow.length / itemsToPull.length) * 100),
            currentFile: item.filename,
            type: item.type
          });

          // Stream gallery updates every 1500ms or on the last file
          const now = Date.now();
          if (now - lastGalleryBroadcast > 1500 || idx === itemsToPull.length - 1) {
            lastGalleryBroadcast = now;
            broadcast('new-screenshots', {
              count: pulledNow.length,
              files: pulledNow,
              all: getLocalScreenshotsList()
            });
          }
        }
      }

      broadcast('sync-completed', {
        pulledCount: pulledNow.length,
        totalScreenshots: remoteList.length,
        all: getLocalScreenshotsList()
      });

      const screenshotCount = pulledNow.filter(f => /screenshot|screencap/i.test(f)).length;
      const cameraCount = pulledNow.length - screenshotCount;
      let notifMsg = '';
      if (screenshotCount > 0 && cameraCount > 0) {
        notifMsg = `Pobrano ${screenshotCount} zrzutów i ${cameraCount} zdjęć z aparatu`;
      } else if (cameraCount > 0) {
        notifMsg = `Pobrano ${cameraCount} nowych zdjęć z aparatu`;
      } else {
        notifMsg = `Pobrano ${screenshotCount} nowych zrzutów ekranu`;
      }

      sendMacNotification('droid-sync', notifMsg);
    }

    return {
      success: true,
      pulledCount: pulledNow.length,
      pulledFiles: pulledNow,
      totalScreenshots: remoteList.length
    };
  } catch (err) {
    console.error('[Sync Error]:', err);
    broadcast('sync-error', { message: err.message });
    return { success: false, error: err.message };
  } finally {
    isSyncing = false;
  }
};

// ==========================================
// REST API ROUTES
// ==========================================

// 1. General System & Device Status
app.get('/api/status', async (req, res) => {
  const devicesRes = await getConnectedDevices();
  const device = devicesRes.devices?.find(d => d.isAuthorized) || devicesRes.devices?.[0] || null;
  currentDevice = device;

  if (device && device.isAuthorized) {
    if (!currentTelemetry || !currentTelemetry.battery || currentTelemetry.battery.level === null || req.query.fresh === 'true') {
      currentTelemetry = await getDeviceTelemetry(device.serial);
    }
  } else {
    currentTelemetry = null;
  }

  const latestSyncTime = [screenshotsHistory.lastSyncTime, cameraHistory.lastSyncTime]
    .filter(Boolean)
    .sort()
    .pop() || null;
  const totalSynced = screenshotsHistory.syncedFiles.size + cameraHistory.syncedFiles.size;

  res.json({
    appName: 'droid-sync',
    adbBinary: ADB_BIN,
    serverPort: PORT,
    destinationDir: config.destinationDir,
    screenshotsPath: config.screenshotsPath,
    photosPath: config.photosPath,
    hideJsonlFiles: Boolean(config.hideJsonlFiles),
    cameraDestinationDir: config.photosPath || config.cameraDestinationDir,
    resolvedParentDir: getParentDestinationDir(),
    resolvedDestinationDir: getLocalScreenshotsDir(),
    resolvedCameraDestinationDir: getLocalCameraDir(),
    pollIntervalMs: config.pollIntervalMs,
    autoDeleteFromPhone: config.autoDeleteFromPhone,
    autoDeleteScreenshots: Boolean(config.autoDeleteScreenshots),
    autoDeleteCamera: Boolean(config.autoDeleteCamera),
    syncScreenshots: config.syncScreenshots !== false,
    syncCamera: config.syncCamera !== false,
    lastSyncTime: latestSyncTime,
    totalSyncedCount: totalSynced,
    device,
    telemetry: currentTelemetry,
    allDevices: devicesRes.devices || []
  });
});

// 1b. On-demand Telemetry Refresh
app.post('/api/telemetry/refresh', async (req, res) => {
  try {
    const devicesRes = await getConnectedDevices();
    const device = devicesRes.devices?.find(d => d.isAuthorized);

    if (!device) {
      currentDevice = null;
      currentTelemetry = null;
      return res.json({ success: false, error: 'no_authorized_device', telemetry: null });
    }

    currentDevice = device;
    currentTelemetry = await getDeviceTelemetry(device.serial);
    broadcast('device-status', { device, telemetry: currentTelemetry });

    res.json({
      success: true,
      device,
      telemetry: currentTelemetry
    });
  } catch (err) {
    console.error('[Telemetry Refresh Error]:', err.message);
    res.status(500).json({ success: false, error: err.message, telemetry: null });
  }
});

// 1c. Reset sync history endpoint
app.post('/api/history/reset', async (req, res) => {
  const type = req.body?.type || 'all'; // 'screenshots' | 'camera' | 'all'

  if (type === 'screenshots' || type === 'all') {
    screenshotsHistory.syncedFiles.clear();
    screenshotsHistory.lastSyncTime = null;
    const f = getHistoryFilePath('screenshot');
    if (fs.existsSync(f)) {
      try { fs.unlinkSync(f); } catch {}
    }
  }

  if (type === 'camera' || type === 'all') {
    cameraHistory.syncedFiles.clear();
    cameraHistory.lastSyncTime = null;
    const f = getHistoryFilePath('camera');
    if (fs.existsSync(f)) {
      try { fs.unlinkSync(f); } catch {}
    }
  }

  // Trigger sync in background immediately
  performSync().catch(err => console.error('[Reset Sync Error]:', err));

  res.json({
    success: true,
    message: 'Sync history reset successfully',
    type
  });
});

// 2. Screenshots List
app.get('/api/screenshots', (req, res) => {
  try {
    const list = getLocalScreenshotsList();
    res.json({
      success: true,
      count: list.length,
      destinationDir: config.destinationDir,
      cameraDestinationDir: config.cameraDestinationDir,
      screenshots: list
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// 3. Serve individual media image file (screenshots or camera photos)
app.get('/api/screenshots/:filename', (req, res) => {
  const filename = path.basename(req.params.filename);
  const screenshotsDest = getLocalScreenshotsDir();
  const cameraDest = getLocalCameraDir();

  let filePath = path.join(screenshotsDest, filename);
  if (!fs.existsSync(filePath)) {
    filePath = path.join(cameraDest, filename);
  }

  if (!fs.existsSync(filePath)) {
    return res.status(404).send('File not found');
  }

  const ext = path.extname(filename).toLowerCase();
  const mimeMap = {
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.webp': 'image/webp'
  };

  res.setHeader('Content-Type', mimeMap[ext] || 'image/png');
  res.setHeader('Content-Disposition', `inline; filename="${filename}"`);
  res.sendFile(filePath);
});

// 3b. Rotate Screenshot or Camera Photo In-Place (Lossless for PNG, 100% Quality for JPG, preserves EXIF)
app.post('/api/screenshots/rotate', async (req, res) => {
  try {
    const { filename, rotation } = req.body;
    if (!filename) {
      return res.status(400).json({ success: false, error: 'Missing filename' });
    }

    const safeName = path.basename(filename);
    const rotationDeg = Number(rotation) || 90;
    const normalizedDeg = ((rotationDeg % 360) + 360) % 360;

    if (normalizedDeg === 0) {
      return res.json({ success: true, message: 'No rotation needed' });
    }

    // Resolve file path across destinations
    const screenshotsDir = getLocalScreenshotsDir();
    const cameraDir = getLocalCameraDir();
    let filePath = path.join(screenshotsDir, safeName);
    if (!fs.existsSync(filePath)) {
      filePath = path.join(cameraDir, safeName);
    }

    if (!fs.existsSync(filePath)) {
      return res.status(404).json({ success: false, error: 'File not found' });
    }

    // Rotate using macOS sips: formatOptions 100 ensures max quality preservation and retains EXIF
    const cmd = `sips -r ${normalizedDeg} -s formatOptions 100 "${filePath}"`;
    await execAsync(cmd);

    const stats = fs.statSync(filePath);
    const updated = {
      filename: safeName,
      sizeBytes: stats.size,
      mtime: stats.mtime.toISOString(),
      url: `/api/screenshots/${encodeURIComponent(safeName)}`
    };

    broadcast('screenshot-updated', { image: updated });

    res.json({
      success: true,
      image: updated
    });
  } catch (err) {
    console.error('[Image Rotate Error]:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// 3c. Get EXIF & Hardware Telemetry for a media file
app.get('/api/screenshots/:filename/exif', async (req, res) => {
  try {
    const safeName = path.basename(req.params.filename);
    const screenshotsDir = getLocalScreenshotsDir();
    const cameraDir = getLocalCameraDir();

    let filePath = path.join(screenshotsDir, safeName);
    if (!fs.existsSync(filePath)) {
      filePath = path.join(cameraDir, safeName);
    }

    if (!fs.existsSync(filePath)) {
      return res.status(404).json({ success: false, error: 'File not found' });
    }

    const exif = await getExifData(filePath);
    res.json({ success: true, exif });
  } catch (err) {
    console.error('[EXIF Query Error]:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// 3d. Selective Delete of Media from Connected Android Device
app.post('/api/phone/delete', async (req, res) => {
  try {
    const { filename } = req.body;
    if (!filename) {
      return res.status(400).json({ success: false, error: 'Missing filename' });
    }

    if (!currentDevice || !currentDevice.isAuthorized) {
      return res.status(400).json({
        success: false,
        error: 'errNoUsbDevice'
      });
    }

    const candidateDirs = [
      ...(config.phoneScreenshotsDirs || ['/sdcard/Pictures/Screenshots', '/sdcard/DCIM/Screenshots']),
      ...(config.phoneCameraDirs || ['/sdcard/DCIM/Camera'])
    ];

    const result = await deletePhoneMediaByName(currentDevice.serial, filename, candidateDirs);
    if (result.success) {
      console.log(`[Phone Delete] Deleted ${filename} from ${result.deletedPath}`);
      res.json({ success: true, filename, deletedPath: result.deletedPath });
    } else {
      res.status(404).json({ success: false, error: result.error || 'File not found on device' });
    }
  } catch (err) {
    console.error('[Phone Delete Error]:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// 4. Trigger manual sync
app.post('/api/sync', async (req, res) => {
  const result = await performSync();
  res.json(result);
});

// 5. Trigger Remote Snap (Screencap)
app.post('/api/snap', async (req, res) => {
  const devicesRes = await getConnectedDevices();
  const device = devicesRes.devices?.find(d => d.isAuthorized);

  if (!device) {
    return res.status(400).json({
      success: false,
      error: 'Brak autoryzowanego urządzenia Android podłączonego przez USB lub Wi-Fi.'
    });
  }

  try {
    const dest = getLocalScreenshotsDir();
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const filename = `Screenshot_Remote_${timestamp}.png`;
    const localFilePath = path.join(dest, filename);

    console.log(`[Snap] Triggering remote screencap for ${device.serial} -> ${filename}`);
    await captureRemoteScreenshot(device.serial, localFilePath);

    recordSyncedFile(filename, { type: 'screenshot', source: 'remote-snap' });

    sendMacNotification('droid-sync', `Wykonano zrzut ekranu: ${filename}`);

    const newImage = {
      filename,
      type: 'screenshot',
      sizeBytes: fs.statSync(localFilePath).size,
      mtime: new Date().toISOString(),
      url: `/api/screenshots/${encodeURIComponent(filename)}`
    };

    broadcast('new-remote-snap', { image: newImage });

    res.json({
      success: true,
      image: newImage
    });
  } catch (err) {
    console.error('[Remote Snap Error]:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// 6. Open Destination Folder in macOS Finder
app.post('/api/open-folder', (req, res) => {
  const type = req.body?.type || 'parent';
  let dest;
  if (type === 'screenshots') {
    dest = getLocalScreenshotsDir();
  } else if (type === 'camera') {
    dest = getLocalCameraDir();
  } else {
    dest = getParentDestinationDir();
  }
  exec(`open "${dest}"`, (err) => {
    if (err) {
      return res.status(500).json({ success: false, error: err.message });
    }
    res.json({ success: true, folder: dest });
  });
});

// 7. Update Configuration
app.post('/api/config', async (req, res) => {
  const {
    destinationDir,
    screenshotsPath,
    photosPath,
    hideJsonlFiles,
    cameraDestinationDir,
    pollIntervalMs,
    autoDeleteFromPhone,
    autoDeleteScreenshots,
    autoDeleteCamera,
    notifyOnMac,
    wifiIp,
    wifiPort,
    syncScreenshots,
    syncCamera
  } = req.body;

  if (destinationDir !== undefined) config.destinationDir = destinationDir;
  if (screenshotsPath !== undefined) config.screenshotsPath = screenshotsPath;
  if (photosPath !== undefined) config.photosPath = photosPath;
  if (cameraDestinationDir !== undefined) config.photosPath = cameraDestinationDir;
  if (hideJsonlFiles !== undefined) config.hideJsonlFiles = Boolean(hideJsonlFiles);
  if (pollIntervalMs !== undefined) config.pollIntervalMs = Math.max(1000, Number(pollIntervalMs));
  if (autoDeleteFromPhone !== undefined) config.autoDeleteFromPhone = Boolean(autoDeleteFromPhone);
  if (autoDeleteScreenshots !== undefined) config.autoDeleteScreenshots = Boolean(autoDeleteScreenshots);
  if (autoDeleteCamera !== undefined) config.autoDeleteCamera = Boolean(autoDeleteCamera);
  if (notifyOnMac !== undefined) config.notifyOnMac = Boolean(notifyOnMac);
  if (wifiIp !== undefined) config.wifiIp = wifiIp;
  if (wifiPort !== undefined) config.wifiPort = Number(wifiPort) || 5555;
  if (syncScreenshots !== undefined) config.syncScreenshots = Boolean(syncScreenshots);
  if (syncCamera !== undefined) config.syncCamera = Boolean(syncCamera);

  saveConfig();
  await migrateHistoryFiles();
  getLocalScreenshotsDir();
  getLocalCameraDir();
  await loadFolderHistory('screenshot', screenshotsHistory);
  await loadFolderHistory('camera', cameraHistory);

  broadcast('config-updated', { config });
  res.json({ success: true, config });
});

// 8a. Wireless Mode: Automatically detect phone Wi-Fi IP
app.get('/api/wireless/detect-ip', async (req, res) => {
  try {
    const devicesRes = await getConnectedDevices();
    const usbDevice = devicesRes.devices?.find(d => !d.isWifi && d.isAuthorized);

    if (!usbDevice) {
      return res.json({ success: false, error: 'errNoUsbDevice', ip: null });
    }

    const ip = await getDeviceWifiIp(usbDevice.serial);
    if (!ip) {
      return res.json({ success: false, error: 'errNoWifiIpFound', ip: null });
    }

    res.json({ success: true, ip });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message, ip: null });
  }
});

// 8b. Wireless Mode: 1-Click Auto-Connect
app.post('/api/wireless/auto-connect', async (req, res) => {
  try {
    const devicesRes = await getConnectedDevices();
    const usbDevice = devicesRes.devices?.find(d => !d.isWifi && d.isAuthorized);

    if (!usbDevice) {
      return res.status(400).json({
        success: false,
        error: 'errNoUsbDevice'
      });
    }

    const ip = await getDeviceWifiIp(usbDevice.serial);
    if (!ip) {
      return res.status(400).json({
        success: false,
        error: 'errNoWifiIpFound'
      });
    }

    const port = req.body.port || config.wifiPort || 5555;

    console.log(`[Wireless] Auto-switching ${usbDevice.serial} to TCP/IP on port ${port}...`);
    const tcpRes = await enableTcpipMode(usbDevice.serial, port);
    if (!tcpRes.success) {
      return res.status(500).json({
        success: false,
        error: 'errTcpipFailed',
        details: tcpRes.output
      });
    }

    // Give ADB daemon 1500ms to restart in TCP/IP mode
    await new Promise(resolve => setTimeout(resolve, 1500));

    console.log(`[Wireless] Connecting over Wi-Fi to ${ip}:${port}...`);
    const connectRes = await connectWifiAdb(ip, port);

    if (connectRes.success) {
      config.wifiIp = ip;
      config.wifiPort = port;
      saveConfig();

      sendMacNotification('droid-sync', `Połączono bezprzewodowo z ${ip}:${port}`);

      return res.json({
        success: true,
        ip,
        port,
        target: `${ip}:${port}`
      });
    } else {
      return res.status(500).json({
        success: false,
        error: 'errWifiConnectFailed',
        ip,
        port,
        details: connectRes.output
      });
    }
  } catch (err) {
    console.error('[Auto Wireless Error]:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// 8c. Wireless Mode: Enable TCP/IP on USB Device
app.post('/api/wireless/enable', async (req, res) => {
  const devicesRes = await getConnectedDevices();
  const usbDevice = devicesRes.devices?.find(d => !d.isWifi && d.isAuthorized);

  if (!usbDevice) {
    return res.status(400).json({
      success: false,
      error: 'errNoUsbDevice'
    });
  }

  const port = req.body.port || config.wifiPort || 5555;
  const result = await enableTcpipMode(usbDevice.serial, port);

  res.json(result);
});

// 9. Wireless Mode: Connect over Wi-Fi
app.post('/api/wireless/connect', async (req, res) => {
  const ip = req.body.ip || config.wifiIp;
  const port = req.body.port || config.wifiPort || 5555;

  if (!ip) {
    return res.status(400).json({ success: false, error: 'Podaj adres IP telefonu w sieci Wi-Fi.' });
  }

  config.wifiIp = ip;
  config.wifiPort = port;
  saveConfig();

  const result = await connectWifiAdb(ip, port);
  res.json(result);
});

// 10. Wireless Mode: Disconnect
app.post('/api/wireless/disconnect', async (req, res) => {
  const ip = req.body.ip || config.wifiIp;
  const port = req.body.port || config.wifiPort || 5555;

  if (!ip) {
    return res.status(400).json({ success: false, error: 'Brak adresu IP do rozłączenia.' });
  }

  const result = await disconnectWifiAdb(ip, port);
  res.json(result);
});

// ==========================================
// START SERVER & BACKGROUND SYNC LOOP
// ==========================================
const server = app.listen(PORT, '0.0.0.0', () => {
  console.log(`\n🚀 [droid-sync-server] Running on http://127.0.0.1:${PORT}`);
  console.log(`📂 Destination: ${getLocalDestinationDir()}`);
  console.log(`⏱️  Poll Interval: ${config.pollIntervalMs}ms\n`);
});

const wss = new WebSocketServer({ server });

wss.on('connection', (ws) => {
  clients.add(ws);
  // Send initial state
  const latestSyncTime = [screenshotsHistory.lastSyncTime, cameraHistory.lastSyncTime]
    .filter(Boolean)
    .sort()
    .pop() || null;
  const totalSynced = screenshotsHistory.syncedFiles.size + cameraHistory.syncedFiles.size;

  ws.send(JSON.stringify({
    type: 'initial-state',
    data: {
      device: currentDevice,
      telemetry: currentTelemetry,
      destinationDir: config.destinationDir,
      cameraDestinationDir: config.cameraDestinationDir,
      syncScreenshots: config.syncScreenshots !== false,
      syncCamera: config.syncCamera !== false,
      lastSyncTime: latestSyncTime,
      totalSyncedCount: totalSynced,
      screenshots: getLocalScreenshotsList()
    }
  }));

  ws.on('close', () => {
    clients.delete(ws);
  });
});

// Recurring background polling loop
const pollLoop = async () => {
  try {
    await performSync();
  } catch (err) {
    console.error('[Background Poll Error]:', err.message);
  } finally {
    setTimeout(pollLoop, config.pollIntervalMs || 2500);
  }
};

// Start background loop
pollLoop();

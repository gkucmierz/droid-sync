import express from 'express';
import cors from 'cors';
import { WebSocketServer } from 'ws';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { exec } from 'node:child_process';
import { fileURLToPath } from 'node:url';

import {
  getConnectedDevices,
  getDeviceTelemetry,
  listPhoneScreenshots,
  pullFileFromPhone,
  captureRemoteScreenshot,
  deleteRemotePhoneFile,
  enableTcpipMode,
  connectWifiAdb,
  disconnectWifiAdb,
  getDeviceWifiIp,
  ADB_BIN
} from './adb.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Deterministic Port from dport calc droid-sync-server
const PORT = process.env.PORT || 40880;

// Config path and history store
const CONFIG_FILE = path.join(__dirname, 'config.json');
const HISTORY_FILE = path.join(__dirname, 'sync-history.json');

// Helper to expand tilde path (~/Documents -> /Users/...)
const resolveHomeDir = (filepath) => {
  if (!filepath) return '';
  if (filepath.startsWith('~/') || filepath === '~') {
    return path.join(os.homedir(), filepath.slice(1));
  }
  return path.resolve(filepath);
};

// Load configuration
let config = {
  destinationDir: '~/Documents/AndroidScreenshots',
  phoneScreenshotsDirs: [
    '/sdcard/Pictures/Screenshots',
    '/sdcard/DCIM/Screenshots'
  ],
  pollIntervalMs: 2500,
  autoDeleteFromPhone: false,
  wifiIp: '',
  wifiPort: 5555,
  notifyOnMac: true
};

try {
  if (fs.existsSync(CONFIG_FILE)) {
    const raw = fs.readFileSync(CONFIG_FILE, 'utf8');
    config = { ...config, ...JSON.parse(raw) };
  }
} catch (e) {
  console.error('[Config Load Error]:', e.message);
}

// Load sync history
let syncHistory = {
  lastSyncTime: null,
  syncedFiles: []
};

try {
  if (fs.existsSync(HISTORY_FILE)) {
    const raw = fs.readFileSync(HISTORY_FILE, 'utf8');
    syncHistory = { ...syncHistory, ...JSON.parse(raw) };
  }
} catch (e) {
  console.error('[History Load Error]:', e.message);
}

const saveSyncHistory = () => {
  try {
    fs.writeFileSync(HISTORY_FILE, JSON.stringify(syncHistory, null, 2), 'utf8');
  } catch (err) {
    console.error('[History Save Error]:', err.message);
  }
};

const saveConfig = () => {
  try {
    fs.writeFileSync(CONFIG_FILE, JSON.stringify(config, null, 2), 'utf8');
  } catch (err) {
    console.error('[Config Save Error]:', err.message);
  }
};

// Ensure local destination directory exists
const getLocalDestinationDir = () => {
  const resolved = resolveHomeDir(config.destinationDir);
  if (!fs.existsSync(resolved)) {
    fs.mkdirSync(resolved, { recursive: true });
  }
  return resolved;
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
 * Lists all downloaded screenshots from the local destination folder
 */
const getLocalScreenshotsList = () => {
  const dest = getLocalDestinationDir();
  if (!fs.existsSync(dest)) return [];

  const files = fs.readdirSync(dest);
  const images = [];

  for (const file of files) {
    if (/\.(png|jpg|jpeg|webp)$/i.test(file)) {
      const fullPath = path.join(dest, file);
      try {
        const stats = fs.statSync(fullPath);
        images.push({
          filename: file,
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
    const devicesRes = await getConnectedDevices();
    if (!devicesRes.success || devicesRes.devices.length === 0) {
      currentDevice = null;
      currentTelemetry = null;
      broadcast('device-disconnected', {});
      return { success: false, reason: 'no_device_connected' };
    }

    const device = devicesRes.devices.find(d => d.isAuthorized) || devicesRes.devices[0];
    currentDevice = device;

    if (!device.isAuthorized) {
      broadcast('device-unauthorized', { device });
      return { success: false, reason: 'device_unauthorized', device };
    }

    // Refresh telemetry
    currentTelemetry = await getDeviceTelemetry(device.serial);
    broadcast('device-status', { device, telemetry: currentTelemetry });

    // Scan remote phone screenshots
    const remoteList = await listPhoneScreenshots(device.serial, config.phoneScreenshotsDirs);
    const dest = getLocalDestinationDir();
    const pulledNow = [];

    const existingSynced = new Set(syncHistory.syncedFiles);

    for (const item of remoteList) {
      if (!existingSynced.has(item.filename)) {
        console.log(`[Sync] Pulling new screenshot: ${item.filename}`);
        const pullRes = await pullFileFromPhone(device.serial, item.remotePath, dest);

        if (pullRes.success) {
          existingSynced.add(item.filename);
          syncHistory.syncedFiles.push(item.filename);
          pulledNow.push(item.filename);

          if (config.autoDeleteFromPhone) {
            console.log(`[Sync] Auto-deleting from phone: ${item.remotePath}`);
            await deleteRemotePhoneFile(device.serial, item.remotePath);
          }
        }
      }
    }

    if (pulledNow.length > 0) {
      syncHistory.lastSyncTime = new Date().toISOString();
      saveSyncHistory();

      sendMacNotification(
        'droid-sync',
        `Pobrano ${pulledNow.length} nowych zrzutów ekranu do ~/Documents/AndroidScreenshots`
      );

      broadcast('new-screenshots', {
        count: pulledNow.length,
        files: pulledNow,
        all: getLocalScreenshotsList()
      });
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

  if (device && device.isAuthorized && !currentTelemetry) {
    currentTelemetry = await getDeviceTelemetry(device.serial);
  }

  res.json({
    appName: 'droid-sync',
    adbBinary: ADB_BIN,
    serverPort: PORT,
    destinationDir: config.destinationDir,
    resolvedDestinationDir: getLocalDestinationDir(),
    pollIntervalMs: config.pollIntervalMs,
    autoDeleteFromPhone: config.autoDeleteFromPhone,
    lastSyncTime: syncHistory.lastSyncTime,
    totalSyncedCount: syncHistory.syncedFiles.length,
    device,
    telemetry: currentTelemetry,
    allDevices: devicesRes.devices || []
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
      screenshots: list
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// 3. Serve individual screenshot image file
app.get('/api/screenshots/:filename', (req, res) => {
  const filename = path.basename(req.params.filename);
  const dest = getLocalDestinationDir();
  const filePath = path.join(dest, filename);

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
    const dest = getLocalDestinationDir();
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const filename = `Screenshot_Remote_${timestamp}.png`;
    const localFilePath = path.join(dest, filename);

    console.log(`[Snap] Triggering remote screencap for ${device.serial} -> ${filename}`);
    await captureRemoteScreenshot(device.serial, localFilePath);

    syncHistory.syncedFiles.push(filename);
    syncHistory.lastSyncTime = new Date().toISOString();
    saveSyncHistory();

    sendMacNotification('droid-sync', `Wykonano zrzut ekranu: ${filename}`);

    const newImage = {
      filename,
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
  const dest = getLocalDestinationDir();
  exec(`open "${dest}"`, (err) => {
    if (err) {
      return res.status(500).json({ success: false, error: err.message });
    }
    res.json({ success: true, folder: dest });
  });
});

// 7. Update Configuration
app.post('/api/config', (req, res) => {
  const { destinationDir, pollIntervalMs, autoDeleteFromPhone, notifyOnMac, wifiIp, wifiPort } = req.body;

  if (destinationDir !== undefined) config.destinationDir = destinationDir;
  if (pollIntervalMs !== undefined) config.pollIntervalMs = Math.max(1000, Number(pollIntervalMs));
  if (autoDeleteFromPhone !== undefined) config.autoDeleteFromPhone = Boolean(autoDeleteFromPhone);
  if (notifyOnMac !== undefined) config.notifyOnMac = Boolean(notifyOnMac);
  if (wifiIp !== undefined) config.wifiIp = wifiIp;
  if (wifiPort !== undefined) config.wifiPort = Number(wifiPort) || 5555;

  saveConfig();
  getLocalDestinationDir(); // Ensure directory exists

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
  ws.send(JSON.stringify({
    type: 'initial-state',
    data: {
      device: currentDevice,
      telemetry: currentTelemetry,
      destinationDir: config.destinationDir,
      lastSyncTime: syncHistory.lastSyncTime,
      totalSyncedCount: syncHistory.syncedFiles.length,
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

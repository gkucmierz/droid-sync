import { execFile, spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

// Candidate paths for ADB on macOS and UNIX systems
const ADB_CANDIDATE_PATHS = [
  '/opt/homebrew/bin/adb',
  '/usr/local/bin/adb',
  process.env.ADB_PATH || 'adb'
];

/**
 * Finds the working ADB executable path
 */
export const findAdbBinary = () => {
  for (const candidate of ADB_CANDIDATE_PATHS) {
    try {
      if (candidate === 'adb' || fs.existsSync(candidate)) {
        return candidate;
      }
    } catch {
      // Continue search
    }
  }
  return 'adb';
};

export const ADB_BIN = findAdbBinary();

/**
 * Executes an arbitrary ADB command
 */
export const runAdb = async (args, options = {}) => {
  try {
    const { stdout, stderr } = await execFileAsync(ADB_BIN, args, {
      timeout: options.timeout || 15000,
      maxBuffer: 10 * 1024 * 1024,
      ...options
    });
    return { stdout: stdout.trim(), stderr: stderr.trim() };
  } catch (err) {
    return {
      error: err.message,
      code: err.code,
      stdout: err.stdout ? err.stdout.trim() : '',
      stderr: err.stderr ? err.stderr.trim() : ''
    };
  }
};

/**
 * Parses `adb devices -l` output into structured objects
 */
export const getConnectedDevices = async () => {
  const res = await runAdb(['devices', '-l']);
  if (res.error) {
    return { success: false, error: res.error, devices: [] };
  }

  const lines = res.stdout.split('\n').map(l => l.trim()).filter(Boolean);
  const devices = [];

  for (let i = 1; i < lines.length; i++) {
    const line = lines[i];
    if (!line || line.startsWith('* daemon')) continue;

    // Pattern: serial state [usb:xxx product:xxx model:xxx device:xxx transport_id:x]
    const parts = line.split(/\s+/);
    if (parts.length >= 2) {
      const serial = parts[0];
      const state = parts[1]; // 'device' | 'unauthorized' | 'offline' | 'no permissions'

      let model = 'Android Device';
      let product = '';
      let isWifi = serial.includes(':') || /^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}/.test(serial);

      for (const token of parts.slice(2)) {
        if (token.startsWith('model:')) {
          model = token.replace('model:', '').replace(/_/g, ' ');
        } else if (token.startsWith('product:')) {
          product = token.replace('product:', '');
        } else if (token.startsWith('usb:')) {
          isWifi = false;
        }
      }

      devices.push({
        serial,
        state,
        isAuthorized: state === 'device',
        isWifi,
        model,
        product,
        raw: line
      });
    }
  }

  return { success: true, devices };
};

// In-memory cache for static hardware & OS specs (fetched once per connected device)
const staticSystemCache = new Map();

/**
 * Queries detailed battery and OS telemetry for an authorized device
 */
export const getDeviceTelemetry = async (serial) => {
  if (!serial) return null;

  try {
    // 1. Fetch dynamic battery dumpsys and wifi IP
    let [batteryRes, wifiIp] = await Promise.all([
      runAdb(['-s', serial, 'shell', 'dumpsys', 'battery']),
      getDeviceWifiIp(serial)
    ]);

    // Retry once with a brief 350ms delay if dumpsys battery returned empty (common during USB enumeration)
    if (!batteryRes.stdout || !/level:\s*\d+/i.test(batteryRes.stdout)) {
      await new Promise(resolve => setTimeout(resolve, 350));
      const retryRes = await runAdb(['-s', serial, 'shell', 'dumpsys', 'battery']);
      if (retryRes.stdout && /level:\s*\d+/i.test(retryRes.stdout)) {
        batteryRes = retryRes;
      }
    }

    let batteryLevel = null;
    let isCharging = false;
    let batteryStatus = 'Discharging';
    let powerSource = 'Battery';
    let voltageMv = null;
    let temperatureC = null;
    let healthCode = 1;
    let healthText = 'Unknown';
    let technology = 'Li-ion';
    let maxChargingCurrentMa = null;
    let cycleCount = null;

    if (batteryRes.stdout && /level:\s*\d+/i.test(batteryRes.stdout)) {
      const bText = batteryRes.stdout;
      const levelMatch = bText.match(/level:\s*(\d+)/i);
      const statusMatch = bText.match(/status:\s*(\d+)/i);
      const healthMatch = bText.match(/health:\s*(\d+)/i);
      const voltageMatch = bText.match(/voltage:\s*(\d+)/i);
      const tempMatch = bText.match(/temperature:\s*(\d+)/i);
      const techMatch = bText.match(/technology:\s*([^\r\n]+)/i);
      const maxCurMatch = bText.match(/Max charging current:\s*(\d+)/i);
      const cycleMatch = bText.match(/(?:mBatteryCycle|cycle_count|Cycle count):\s*(\d+)/i);

      const acPlugged = /AC powered:\s*true/i.test(bText);
      const usbPlugged = /USB powered:\s*true/i.test(bText);
      const wirelessPlugged = /Wireless powered:\s*true/i.test(bText);

      if (levelMatch) batteryLevel = parseInt(levelMatch[1], 10);
      if (voltageMatch) voltageMv = parseInt(voltageMatch[1], 10);
      if (tempMatch) temperatureC = parseFloat((parseInt(tempMatch[1], 10) / 10).toFixed(1));
      if (techMatch) technology = techMatch[1].trim();
      if (maxCurMatch) maxChargingCurrentMa = Math.round(parseInt(maxCurMatch[1], 10) / 1000);
      if (cycleMatch) cycleCount = parseInt(cycleMatch[1], 10);

      if (acPlugged) {
        isCharging = true;
        powerSource = 'AC';
      } else if (usbPlugged) {
        isCharging = true;
        powerSource = 'USB';
      } else if (wirelessPlugged) {
        isCharging = true;
        powerSource = 'Wireless';
      } else if (statusMatch && statusMatch[1] === '2') {
        isCharging = true;
        powerSource = 'Charging';
      }

      if (statusMatch) {
        const s = statusMatch[1];
        if (s === '2') batteryStatus = 'Charging';
        else if (s === '3') batteryStatus = 'Discharging';
        else if (s === '4') batteryStatus = 'Not charging';
        else if (s === '5') batteryStatus = 'Full';
      }

      if (healthMatch) {
        healthCode = parseInt(healthMatch[1], 10);
        const healthMap = {
          1: 'Unknown',
          2: 'Good',
          3: 'Overheat',
          4: 'Dead',
          5: 'Over Voltage',
          6: 'Unspecified Failure',
          7: 'Cold'
        };
        healthText = healthMap[healthCode] || 'Unknown';
      }
    } else {
      // Fallback directly to kernel sysfs (/sys/class/power_supply/battery or bms)
      try {
        const sysfsCmd = 'cat /sys/class/power_supply/battery/capacity 2>/dev/null || cat /sys/class/power_supply/bms/capacity 2>/dev/null; ' +
                         'cat /sys/class/power_supply/battery/status 2>/dev/null || cat /sys/class/power_supply/bms/status 2>/dev/null; ' +
                         'cat /sys/class/power_supply/battery/voltage_now 2>/dev/null || cat /sys/class/power_supply/bms/voltage_now 2>/dev/null; ' +
                         'cat /sys/class/power_supply/battery/temp 2>/dev/null || cat /sys/class/power_supply/bms/temp 2>/dev/null';
        const sysfsRes = await runAdb(['-s', serial, 'shell', sysfsCmd]);
        if (sysfsRes.stdout) {
          const lines = sysfsRes.stdout.split('\n').map(l => l.trim()).filter(Boolean);
          if (lines[0] && /^\d+$/.test(lines[0])) {
            batteryLevel = parseInt(lines[0], 10);
          }
          if (lines[1]) {
            batteryStatus = lines[1];
            isCharging = /charging/i.test(lines[1]);
            powerSource = isCharging ? 'Charging' : 'Battery';
          }
          if (lines[2] && /^\d+$/.test(lines[2])) {
            const rawV = parseInt(lines[2], 10);
            voltageMv = rawV > 10000 ? Math.round(rawV / 1000) : rawV;
          }
          if (lines[3] && /^\d+$/.test(lines[3])) {
            temperatureC = parseFloat((parseInt(lines[3], 10) / 10).toFixed(1));
          }
          healthText = 'Good';
          healthCode = 2;
        }
      } catch (sysErr) {
        console.error('[Sysfs Battery Fallback Error]:', sysErr.message);
      }
    }

    // Try cycle count from sysfs if not in dumpsys battery
    if (cycleCount === null) {
      try {
        const cycleRes = await runAdb([
          '-s', serial, 'shell',
          'cat /sys/class/power_supply/battery/cycle_count 2>/dev/null || cat /sys/class/power_supply/bms/cycle_count 2>/dev/null'
        ]);
        if (cycleRes.stdout && /^\d+$/.test(cycleRes.stdout.trim())) {
          cycleCount = parseInt(cycleRes.stdout.trim(), 10);
        }
      } catch (e) {}
    }

    // 2. Fetch or reuse cached static system details
    let staticSystem = staticSystemCache.get(serial);
    if (!staticSystem) {
      const [
        modelRes,
        brandRes,
        androidRes,
        sdkRes,
        patchRes,
        socRes,
        abiRes,
        kernelRes,
        wmSizeRes,
        wmDensityRes
      ] = await Promise.all([
        runAdb(['-s', serial, 'shell', 'getprop', 'ro.product.model']),
        runAdb(['-s', serial, 'shell', 'getprop', 'ro.product.brand']),
        runAdb(['-s', serial, 'shell', 'getprop', 'ro.build.version.release']),
        runAdb(['-s', serial, 'shell', 'getprop', 'ro.build.version.sdk']),
        runAdb(['-s', serial, 'shell', 'getprop', 'ro.build.version.security_patch']),
        runAdb(['-s', serial, 'shell', 'getprop ro.soc.model 2>/dev/null || getprop ro.board.platform 2>/dev/null']),
        runAdb(['-s', serial, 'shell', 'getprop', 'ro.product.cpu.abi']),
        runAdb(['-s', serial, 'shell', 'uname -r']),
        runAdb(['-s', serial, 'shell', 'wm size']),
        runAdb(['-s', serial, 'shell', 'wm density'])
      ]);

      staticSystem = {
        model: modelRes.stdout || 'Android Device',
        brand: brandRes.stdout ? brandRes.stdout.charAt(0).toUpperCase() + brandRes.stdout.slice(1) : '',
        androidVersion: androidRes.stdout || 'Unknown',
        sdkLevel: sdkRes.stdout || '',
        securityPatch: patchRes.stdout || '',
        soc: socRes.stdout || '',
        cpuAbi: abiRes.stdout || '',
        kernel: kernelRes.stdout ? kernelRes.stdout.trim() : '',
        screenResolution: wmSizeRes.stdout ? wmSizeRes.stdout.replace(/Physical size:\s*/i, '').trim() : '',
        screenDensity: wmDensityRes.stdout ? wmDensityRes.stdout.replace(/Physical density:\s*/i, '').trim() : ''
      };
      staticSystemCache.set(serial, staticSystem);
    }

    // 3. Dynamic system metrics (uptime, storage)
    let uptime = '';
    let storage = { total: '', used: '', free: '', percent: '' };
    try {
      const [uptimeRes, dfRes] = await Promise.all([
        runAdb(['-s', serial, 'shell', 'uptime']),
        runAdb(['-s', serial, 'shell', 'df -h /data'])
      ]);
      if (uptimeRes.stdout) {
        uptime = uptimeRes.stdout.trim().replace(/^[\s\d:]+\s+up\s+/, 'up ');
      }
      if (dfRes.stdout) {
        const dfLines = dfRes.stdout.trim().split('\n');
        if (dfLines.length >= 2) {
          const cols = dfLines[dfLines.length - 1].trim().split(/\s+/);
          if (cols.length >= 5) {
            storage = {
              total: cols[1],
              used: cols[2],
              free: cols[3],
              percent: cols[4]
            };
          }
        }
      }
    } catch (e) {}

    return {
      model: staticSystem.model,
      androidVersion: staticSystem.androidVersion,
      batteryLevel,
      isCharging,
      batteryStatus,
      wifiIp,
      battery: {
        level: batteryLevel,
        isCharging,
        batteryStatus,
        powerSource,
        voltageMv,
        temperatureC,
        healthCode,
        healthText,
        cycleCount,
        technology,
        maxChargingCurrentMa
      },
      system: {
        ...staticSystem,
        uptime,
        storage
      }
    };
  } catch (err) {
    console.error(`[ADB Telemetry Error for ${serial}]:`, err);
    return null;
  }
};

/**
 * Automatically discovers the device's local Wi-Fi IP address
 */
export const getDeviceWifiIp = async (serial) => {
  try {
    // Method 1: ip -f inet addr show wlan0
    let res = await runAdb(['-s', serial, 'shell', 'ip -f inet addr show wlan0']);
    if (res.stdout) {
      const match = res.stdout.match(/inet\s+(\d+\.\d+\.\d+\.\d+)/);
      if (match && match[1] && !match[1].startsWith('127.')) {
        return match[1];
      }
    }

    // Method 2: ip route
    res = await runAdb(['-s', serial, 'shell', 'ip route']);
    if (res.stdout) {
      const srcMatch = res.stdout.match(/src\s+(\d+\.\d+\.\d+\.\d+)/);
      if (srcMatch && srcMatch[1] && !srcMatch[1].startsWith('127.')) {
        return srcMatch[1];
      }
      const routeMatch = res.stdout.match(/dev\s+wlan0[^\n]+src\s+(\d+\.\d+\.\d+\.\d+)/);
      if (routeMatch && routeMatch[1]) {
        return routeMatch[1];
      }
    }

    // Method 3: getprop dhcp.wlan0.ipaddress
    res = await runAdb(['-s', serial, 'shell', 'getprop dhcp.wlan0.ipaddress']);
    if (res.stdout && /^\d+\.\d+\.\d+\.\d+$/.test(res.stdout.trim())) {
      return res.stdout.trim();
    }

    // Method 4: ifconfig wlan0
    res = await runAdb(['-s', serial, 'shell', 'ifconfig wlan0']);
    if (res.stdout) {
      const match = res.stdout.match(/inet addr:(\d+\.\d+\.\d+\.\d+)/) || res.stdout.match(/inet\s+(\d+\.\d+\.\d+\.\d+)/);
      if (match && match[1] && !match[1].startsWith('127.')) {
        return match[1];
      }
    }
  } catch (err) {
    console.error(`[ADB IP Resolution Error for ${serial}]:`, err);
  }

  return null;
};

/**
 * Lists screenshot files on Android device across candidate directories
 */
export const listPhoneScreenshots = async (serial, directories = ['/sdcard/Pictures/Screenshots', '/sdcard/DCIM/Screenshots']) => {
  const media = [];
  const seenFiles = new Set();

  for (const dir of directories) {
    // List directory with details
    const res = await runAdb(['-s', serial, 'shell', `ls -1 "${dir}"`]);
    if (res.stdout && !res.stdout.includes('No such file')) {
      const names = res.stdout.split('\n').map(n => n.trim()).filter(Boolean);
      for (const name of names) {
        if (/\.(png|jpg|jpeg|webp)$/i.test(name) && !seenFiles.has(name)) {
          seenFiles.add(name);
          const isScreenshot = /screenshot|screencap/i.test(name) || /screenshot/i.test(dir);
          media.push({
            filename: name,
            remotePath: `${dir}/${name}`,
            dir,
            type: isScreenshot ? 'screenshot' : 'camera'
          });
        }
      }
    }
  }

  return media;
};

export const listPhoneMedia = listPhoneScreenshots;

/**
 * Pulls a file from Android to the local macOS filesystem
 */
export const pullFileFromPhone = async (serial, remotePath, localDestDir) => {
  if (!fs.existsSync(localDestDir)) {
    fs.mkdirSync(localDestDir, { recursive: true });
  }

  const res = await runAdb(['-s', serial, 'pull', remotePath, localDestDir]);
  if (res.error || (res.stderr && res.stderr.includes('error:'))) {
    return { success: false, error: res.error || res.stderr };
  }

  const filename = path.basename(remotePath);
  const localFilePath = path.join(localDestDir, filename);

  return {
    success: true,
    localFilePath,
    filename
  };
};

/**
 * Triggers a real-time screenshot capture on phone and saves directly to macOS
 */
export const captureRemoteScreenshot = (serial, localFilePath) => {
  return new Promise((resolve, reject) => {
    const parentDir = path.dirname(localFilePath);
    if (!fs.existsSync(parentDir)) {
      fs.mkdirSync(parentDir, { recursive: true });
    }

    const writeStream = fs.createWriteStream(localFilePath);
    const adbProc = spawn(ADB_BIN, ['-s', serial, 'exec-out', 'screencap', '-p']);

    adbProc.stdout.pipe(writeStream);

    let errorData = '';
    adbProc.stderr.on('data', (chunk) => {
      errorData += chunk.toString();
    });

    adbProc.on('close', (code) => {
      if (code === 0 && fs.existsSync(localFilePath) && fs.statSync(localFilePath).size > 0) {
        resolve({ success: true, localFilePath });
      } else {
        reject(new Error(errorData || `screencap process exited with code ${code}`));
      }
    });

    adbProc.on('error', (err) => {
      reject(err);
    });
  });
};

/**
 * Removes a remote file from Android (if auto-delete is enabled)
 */
export const deleteRemotePhoneFile = async (serial, remotePath) => {
  const res = await runAdb(['-s', serial, 'shell', 'rm', '-f', `"${remotePath}"`]);
  return !res.error;
};

/**
 * Restarts ADB in TCP/IP mode on the specified port
 */
export const enableTcpipMode = async (serial, port = 5555) => {
  const res = await runAdb(['-s', serial, 'tcpip', String(port)]);
  return {
    success: !res.error && res.stdout.includes('restarting in TCP mode'),
    output: res.stdout || res.stderr
  };
};

/**
 * Connects to a device over Wi-Fi IP
 */
export const connectWifiAdb = async (ip, port = 5555) => {
  const target = `${ip}:${port}`;
  const res = await runAdb(['connect', target]);
  const isConnected = res.stdout.includes('connected to') && !res.stdout.includes('failed to connect');
  return {
    success: isConnected,
    output: res.stdout || res.stderr,
    target
  };
};

/**
 * Disconnects a Wi-Fi device
 */
export const disconnectWifiAdb = async (ip, port = 5555) => {
  const target = `${ip}:${port}`;
  const res = await runAdb(['disconnect', target]);
  return {
    success: !res.error,
    output: res.stdout || res.stderr
  };
};

/**
 * Deletes a specific media file by filename from the Android device
 */
export const deletePhoneMediaByName = async (serial, filename, candidateDirs = ['/sdcard/Pictures/Screenshots', '/sdcard/DCIM/Screenshots', '/sdcard/DCIM/Camera']) => {
  if (!serial || !filename) return { success: false, error: 'Missing serial or filename' };
  const safeName = path.basename(filename);

  let deletedPath = null;
  for (const dir of candidateDirs) {
    const remotePath = `${dir}/${safeName}`;
    const checkRes = await runAdb(['-s', serial, 'shell', `ls "${remotePath}" 2>/dev/null`]);
    if (checkRes.stdout && checkRes.stdout.includes(safeName)) {
      await runAdb(['-s', serial, 'shell', 'rm', '-f', `"${remotePath}"`]);
      // Notify Android MediaScanner so phone gallery drops the thumbnail immediately
      await runAdb(['-s', serial, 'shell', `am broadcast -a android.intent.action.MEDIA_SCANNER_SCAN_FILE -d "file://${remotePath}"`]);
      deletedPath = remotePath;
      break;
    }
  }

  if (deletedPath) {
    return { success: true, deletedPath, filename: safeName };
  }
  return { success: false, error: 'File not found on device' };
};


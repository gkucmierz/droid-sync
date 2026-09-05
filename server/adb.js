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

/**
 * Queries battery and OS telemetry for an authorized device
 */
export const getDeviceTelemetry = async (serial) => {
  if (!serial) return null;

  try {
    const [modelRes, androidRes, batteryRes] = await Promise.all([
      runAdb(['-s', serial, 'shell', 'getprop', 'ro.product.model']),
      runAdb(['-s', serial, 'shell', 'getprop', 'ro.build.version.release']),
      runAdb(['-s', serial, 'shell', 'dumpsys', 'battery'])
    ]);

    let batteryLevel = null;
    let isCharging = false;
    let batteryStatus = 'Unknown';

    if (batteryRes.stdout) {
      const levelMatch = batteryRes.stdout.match(/level:\s*(\d+)/i);
      const statusMatch = batteryRes.stdout.match(/status:\s*(\d+)/i);
      const pluggedMatch = batteryRes.stdout.match(/AC powered:\s*true|USB powered:\s*true|Wireless powered:\s*true/i);

      if (levelMatch) {
        batteryLevel = parseInt(levelMatch[1], 10);
      }
      if (pluggedMatch || (statusMatch && statusMatch[1] === '2')) {
        isCharging = true;
        batteryStatus = 'Charging';
      } else {
        batteryStatus = 'Discharging';
      }
    }

    const wifiIp = await getDeviceWifiIp(serial);

    return {
      model: modelRes.stdout || 'Android Device',
      androidVersion: androidRes.stdout || 'Unknown',
      batteryLevel,
      isCharging,
      batteryStatus,
      wifiIp
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

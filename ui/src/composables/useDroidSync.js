import { ref, computed, onMounted, onUnmounted } from 'vue';
import { useI18n } from '../locales.js';

const RUNNER_PORT = 40880;

export function useDroidSync() {
  const { t } = useI18n();
  const isRunnerConnected = ref(false);
  const device = ref(null);
  const telemetry = ref(null);
  const destinationDir = ref('~/Documents/Droid Sync');
  const screenshotsPath = ref('./screenshots');
  const photosPath = ref('./photos');
  const hideJsonlFiles = ref(false);
  const resolvedParentDir = ref('');
  const cameraDestinationDir = ref('~/Documents/Droid Sync/photos');
  const pollIntervalMs = ref(2500);
  const autoDeleteFromPhone = ref(false);
  const autoDeleteScreenshots = ref(false);
  const autoDeleteCamera = ref(false);
  const syncScreenshots = ref(true);
  const syncCamera = ref(true);
  const lastSyncTime = ref(null);
  const screenshots = ref([]);
  const isSyncing = ref(false);
  const syncProgress = ref({ current: 0, total: 0, percent: 0, currentFile: '', type: '' });
  const isSnapping = ref(false);
  const isRefreshingTelemetry = ref(false);
  const actionMessage = ref('');
  const messageType = ref('info'); // 'info' | 'success' | 'error'

  let socket = null;
  let pollTimer = null;

  const getRunnerHost = () => {
    if (typeof window === 'undefined') return '127.0.0.1';
    // If local dev or explicitly on localhost/127.0.0.1
    if (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') {
      return window.location.hostname;
    }
    // If served on cloud domain (e.g. droid-sync.7u.pl), runner daemon runs locally on the user's computer
    return '127.0.0.1';
  };

  // Base API URL
  const getApiBaseUrl = () => {
    // If in dev with Vite proxy or local runner on UI port
    if (typeof window !== 'undefined' && window.location.port === '49278') {
      return ''; // Uses Vite proxy to http://localhost:40880
    }
    return `http://${getRunnerHost()}:${RUNNER_PORT}`;
  };

  const getWsUrl = () => {
    return `ws://${getRunnerHost()}:${RUNNER_PORT}`;
  };

  const showFeedback = (text, type = 'info', durationMs = 3500) => {
    actionMessage.value = text;
    messageType.value = type;
    setTimeout(() => {
      if (actionMessage.value === text) {
        actionMessage.value = '';
      }
    }, durationMs);
  };

  // Fetch full status
  const fetchStatus = async () => {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 2000);
      const res = await fetch(`${getApiBaseUrl()}/api/status`, { signal: controller.signal });
      clearTimeout(timeoutId);

      if (res.ok) {
        const data = await res.json();
        const wasDisconnected = !isRunnerConnected.value;
        const prevDeviceOnline = device.value && device.value.isAuthorized;

        isRunnerConnected.value = true;
        device.value = data.device;
        telemetry.value = data.telemetry;
        destinationDir.value = data.destinationDir || '~/Documents/Droid Sync';
        if (data.screenshotsPath !== undefined) screenshotsPath.value = data.screenshotsPath;
        if (data.photosPath !== undefined) photosPath.value = data.photosPath;
        if (data.hideJsonlFiles !== undefined) hideJsonlFiles.value = Boolean(data.hideJsonlFiles);
        if (data.resolvedParentDir) resolvedParentDir.value = data.resolvedParentDir;
        cameraDestinationDir.value = data.photosPath || data.cameraDestinationDir || './photos';
        pollIntervalMs.value = data.pollIntervalMs;
        autoDeleteFromPhone.value = data.autoDeleteFromPhone;
        autoDeleteScreenshots.value = Boolean(data.autoDeleteScreenshots);
        autoDeleteCamera.value = Boolean(data.autoDeleteCamera);
        if (data.syncScreenshots !== undefined) syncScreenshots.value = data.syncScreenshots;
        if (data.syncCamera !== undefined) syncCamera.value = data.syncCamera;
        lastSyncTime.value = data.lastSyncTime;

        const nowDeviceOnline = data.device && data.device.isAuthorized;
        if (wasDisconnected || (!prevDeviceOnline && nowDeviceOnline)) {
          await fetchScreenshots();
          if (wasDisconnected) {
            setupWebSocket();
          }
        }
      } else {
        isRunnerConnected.value = false;
      }
    } catch {
      isRunnerConnected.value = false;
    }
  };

  // Fetch screenshots list
  const fetchScreenshots = async () => {
    try {
      const res = await fetch(`${getApiBaseUrl()}/api/screenshots`);
      if (res.ok) {
        const data = await res.json();
        screenshots.value = data.screenshots || [];
      }
    } catch (e) {
      console.error('[Fetch Screenshots Error]:', e);
    }
  };

  // Trigger manual sync
  const triggerSync = async () => {
    if (isSyncing.value) return;
    isSyncing.value = true;
    try {
      const res = await fetch(`${getApiBaseUrl()}/api/sync`, { method: 'POST' });
      const data = await res.json();
      if (data.success) {
        showFeedback(
          data.pulledCount > 0 
            ? t.value.toastSyncSuccess(data.pulledCount) 
            : t.value.toastSyncNone,
          'success'
        );
        await fetchScreenshots();
      } else {
        showFeedback(data.reason || data.error || t.value.toastSyncError, 'error');
      }
    } catch (err) {
      showFeedback(t.value.toastConnError(err.message), 'error');
    } finally {
      isSyncing.value = false;
    }
  };

  // Trigger Remote Snap
  const triggerRemoteSnap = async () => {
    if (isSnapping.value) return;
    isSnapping.value = true;
    try {
      const res = await fetch(`${getApiBaseUrl()}/api/snap`, { method: 'POST' });
      const data = await res.json();
      if (data.success) {
        showFeedback(t.value.toastSnapSuccess(data.image.filename), 'success');
        await fetchScreenshots();
      } else {
        showFeedback(data.error || t.value.toastSnapError, 'error');
      }
    } catch (err) {
      showFeedback(t.value.toastConnError(err.message), 'error');
    } finally {
      isSnapping.value = false;
    }
  };

  // Open folder in macOS Finder
  const openFolderInFinder = async () => {
    try {
      const res = await fetch(`${getApiBaseUrl()}/api/open-folder`, { method: 'POST' });
      const data = await res.json();
      if (data.success) {
        showFeedback(t.value.toastFinderSuccess, 'success');
      } else {
        showFeedback(t.value.toastFinderError, 'error');
      }
    } catch (err) {
      showFeedback(err.message, 'error');
    }
  };

  // Update config
  const updateConfig = async (newConfig) => {
    try {
      const res = await fetch(`${getApiBaseUrl()}/api/config`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newConfig)
      });
      const data = await res.json();
      if (data.success) {
        destinationDir.value = data.config.destinationDir;
        if (data.config.screenshotsPath !== undefined) screenshotsPath.value = data.config.screenshotsPath;
        if (data.config.photosPath !== undefined) photosPath.value = data.config.photosPath;
        if (data.config.hideJsonlFiles !== undefined) hideJsonlFiles.value = Boolean(data.config.hideJsonlFiles);
        if (data.config.cameraDestinationDir !== undefined) cameraDestinationDir.value = data.config.cameraDestinationDir;
        pollIntervalMs.value = data.config.pollIntervalMs;
        autoDeleteFromPhone.value = data.config.autoDeleteFromPhone;
        if (data.config.autoDeleteScreenshots !== undefined) autoDeleteScreenshots.value = data.config.autoDeleteScreenshots;
        if (data.config.autoDeleteCamera !== undefined) autoDeleteCamera.value = data.config.autoDeleteCamera;
        if (data.config.syncScreenshots !== undefined) syncScreenshots.value = data.config.syncScreenshots;
        if (data.config.syncCamera !== undefined) syncCamera.value = data.config.syncCamera;
        showFeedback(t.value.toastConfigSaved, 'success');
      }
    } catch (err) {
      showFeedback(t.value.toastConfigError(err.message), 'error');
    }
  };

  // Enable Wireless mode on USB device
  const enableWirelessAdb = async (port = 5555) => {
    try {
      const res = await fetch(`${getApiBaseUrl()}/api/wireless/enable`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ port })
      });
      const data = await res.json();
      if (data.success) {
        showFeedback(t.value.toastTcpipSuccess(port), 'success', 5000);
      } else {
        showFeedback(data.error || t.value.toastTcpipError, 'error');
      }
      return data;
    } catch (err) {
      showFeedback(err.message, 'error');
      return { success: false, error: err.message };
    }
  };

  // Connect over Wi-Fi
  const connectWifi = async (ip, port = 5555) => {
    try {
      const res = await fetch(`${getApiBaseUrl()}/api/wireless/connect`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ip, port })
      });
      const data = await res.json();
      if (data.success) {
        showFeedback(t.value.toastWifiSuccess(ip, port), 'success');
        await fetchStatus();
      } else {
        showFeedback(data.output || t.value.toastWifiError, 'error');
      }
      return data;
    } catch (err) {
      showFeedback(err.message, 'error');
      return { success: false, error: err.message };
    }
  };

  // Auto-detect phone Wi-Fi IP
  const detectWifiIp = async () => {
    try {
      const res = await fetch(`${getApiBaseUrl()}/api/wireless/detect-ip`);
      const data = await res.json();
      return data.ip || null;
    } catch {
      return null;
    }
  };

  // 1-Click Auto-Connect over Wi-Fi
  const autoConnectWireless = async (port = 5555) => {
    try {
      const res = await fetch(`${getApiBaseUrl()}/api/wireless/auto-connect`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ port })
      });
      const data = await res.json();
      if (data.success) {
        showFeedback(t.value.autoConnectSuccess(data.ip, data.port), 'success', 6000);
        await fetchStatus();
      } else {
        const errorMsg = t.value[data.error] || data.error || t.value.errWifiConnectFailed;
        showFeedback(errorMsg, 'error', 5000);
      }
      return data;
    } catch (err) {
      showFeedback(t.value.toastConnError(err.message), 'error');
      return { success: false, error: err.message };
    }
  };

  // Copy Image to macOS Clipboard (Canvas PNG conversion & rotation support)
  const copyImageToClipboard = async (imgUrl, rotation = 0) => {
    try {
      const resolvedUrl = imgUrl.startsWith('http') ? imgUrl : `${getApiBaseUrl()}${imgUrl}`;
      const res = await fetch(resolvedUrl);
      const originalBlob = await res.blob();

      // The W3C Clipboard API strictly requires 'image/png' across browsers.
      // We convert any format (JPEG, WebP, etc.) and apply rotation via in-memory Canvas.
      let pngBlob;
      if (originalBlob.type === 'image/png' && (rotation % 360 === 0)) {
        pngBlob = originalBlob;
      } else {
        pngBlob = await new Promise((resolve, reject) => {
          const img = new Image();
          const objUrl = URL.createObjectURL(originalBlob);
          img.onload = () => {
            URL.revokeObjectURL(objUrl);
            const canvas = document.createElement('canvas');
            const ctx = canvas.getContext('2d');
            const normalizedDeg = ((rotation % 360) + 360) % 360;
            const rad = (normalizedDeg * Math.PI) / 180;
            const is90or270 = normalizedDeg === 90 || normalizedDeg === 270;

            canvas.width = is90or270 ? img.naturalHeight : img.naturalWidth;
            canvas.height = is90or270 ? img.naturalWidth : img.naturalHeight;

            ctx.translate(canvas.width / 2, canvas.height / 2);
            ctx.rotate(rad);
            ctx.drawImage(img, -img.naturalWidth / 2, -img.naturalHeight / 2);

            canvas.toBlob((blob) => {
              if (blob) resolve(blob);
              else reject(new Error('Canvas conversion failed'));
            }, 'image/png');
          };
          img.onerror = (e) => {
            URL.revokeObjectURL(objUrl);
            reject(e);
          };
          img.src = objUrl;
        });
      }

      await navigator.clipboard.write([
        new ClipboardItem({ 'image/png': pngBlob })
      ]);
      showFeedback(t.value.toastClipboardSuccess, 'success');
    } catch (err) {
      console.error('[Clipboard Error]:', err);
      showFeedback(t.value.toastClipboardError, 'error');
    }
  };

  // Setup WebSocket connection
  const setupWebSocket = () => {
    try {
      socket = new WebSocket(getWsUrl());

      socket.onopen = () => {
        isRunnerConnected.value = true;
      };

      socket.onmessage = (event) => {
        try {
          const payload = JSON.parse(event.data);
          const { type, data } = payload;

          if (type === 'initial-state') {
            device.value = data.device;
            telemetry.value = data.telemetry;
            destinationDir.value = data.destinationDir;
            if (data.cameraDestinationDir !== undefined) cameraDestinationDir.value = data.cameraDestinationDir;
            if (data.autoDeleteScreenshots !== undefined) autoDeleteScreenshots.value = data.autoDeleteScreenshots;
            if (data.autoDeleteCamera !== undefined) autoDeleteCamera.value = data.autoDeleteCamera;
            if (data.syncScreenshots !== undefined) syncScreenshots.value = data.syncScreenshots;
            if (data.syncCamera !== undefined) syncCamera.value = data.syncCamera;
            lastSyncTime.value = data.lastSyncTime;
            screenshots.value = data.screenshots || [];
          } else if (type === 'device-connected') {
            device.value = data.device;
            telemetry.value = data.telemetry;
            if (data.screenshots) {
              screenshots.value = data.screenshots;
            }
            fetchScreenshots();
            fetchStatus();
            showFeedback(t.value.toastDeviceConnected, 'success');
          } else if (type === 'device-status') {
            const wasOffline = !device.value || !device.value.isAuthorized;
            const nowOnline = data.device && data.device.isAuthorized;
            device.value = data.device;
            telemetry.value = data.telemetry;
            if (wasOffline && nowOnline) {
              fetchScreenshots();
            }
          } else if (type === 'device-disconnected') {
            const wasOnline = Boolean(device.value);
            device.value = null;
            telemetry.value = null;
            if (wasOnline) {
              showFeedback(t.value.toastDeviceDisconnected, 'info');
            }
          } else if (type === 'sync-started') {
            isSyncing.value = true;
            syncProgress.value = {
              current: 0,
              total: data.total || 0,
              percent: 0,
              currentFile: '',
              type: ''
            };
          } else if (type === 'sync-progress') {
            isSyncing.value = true;
            syncProgress.value = {
              current: data.current || 0,
              total: data.total || 0,
              percent: data.percent || 0,
              currentFile: data.currentFile || '',
              type: data.type || ''
            };
          } else if (type === 'sync-completed') {
            isSyncing.value = false;
            syncProgress.value = { current: 0, total: 0, percent: 100, currentFile: '', type: '' };
            if (data.all) {
              screenshots.value = data.all;
            }
            fetchStatus();
          } else if (type === 'sync-error') {
            isSyncing.value = false;
            showFeedback(data.message || t.value.toastSyncError, 'error');
          } else if (type === 'new-screenshots') {
            if (data.all) {
              screenshots.value = data.all;
            } else {
              fetchScreenshots();
            }
          } else if (type === 'new-remote-snap') {
            fetchScreenshots();
            fetchStatus();
          } else if (type === 'config-updated') {
            destinationDir.value = data.config.destinationDir;
            if (data.config.cameraDestinationDir !== undefined) cameraDestinationDir.value = data.config.cameraDestinationDir;
            pollIntervalMs.value = data.config.pollIntervalMs;
            if (data.config.autoDeleteScreenshots !== undefined) autoDeleteScreenshots.value = data.config.autoDeleteScreenshots;
            if (data.config.autoDeleteCamera !== undefined) autoDeleteCamera.value = data.config.autoDeleteCamera;
            if (data.config.syncScreenshots !== undefined) syncScreenshots.value = data.config.syncScreenshots;
            if (data.config.syncCamera !== undefined) syncCamera.value = data.config.syncCamera;
          }
        } catch (e) {
          console.error('[WS Parse Error]:', e);
        }
      };

      socket.onclose = () => {
        isRunnerConnected.value = false;
        socket = null;
      };

      socket.onerror = () => {
        isRunnerConnected.value = false;
        socket = null;
      };
    } catch {
      isRunnerConnected.value = false;
      socket = null;
    }
  };

  // Force-refresh device telemetry (e.g. on modal open or manual refresh button)
  const refreshTelemetry = async () => {
    if (isRefreshingTelemetry.value) return telemetry.value;
    isRefreshingTelemetry.value = true;
    try {
      const res = await fetch(`${getApiBaseUrl()}/api/telemetry/refresh`, { method: 'POST' });
      if (res.ok) {
        const data = await res.json();
        if (data.success && data.telemetry) {
          telemetry.value = data.telemetry;
          if (data.device) device.value = data.device;
          return data.telemetry;
        }
      }
    } catch (err) {
      console.error('[Refresh Telemetry Error]:', err);
    } finally {
      isRefreshingTelemetry.value = false;
    }
    // Fallback to fetchStatus
    await fetchStatus();
    return telemetry.value;
  };

  // Reset sync history (deletes .sync-history.jsonl & clears cache)
  const resetSyncHistory = async (type = 'all') => {
    try {
      const res = await fetch(`${getApiBaseUrl()}/api/history/reset`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type })
      });
      const data = await res.json();
      if (data.success) {
        showFeedback(t.value.toastHistoryReset || 'Zresetowano historię synchronizacji', 'success');
        await fetchScreenshots();
        await fetchStatus();
      }
    } catch (err) {
      showFeedback(err.message, 'error');
    }
  };

  // Rotate image file on macOS disk (100% quality preservation & EXIF retained)
  const rotateImageOnDisk = async (filename, rotationDeg) => {
    try {
      const res = await fetch(`${getApiBaseUrl()}/api/screenshots/rotate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ filename, rotation: rotationDeg })
      });
      const data = await res.json();
      if (data.success) {
        showFeedback(t.value.toastRotateSaved || 'Zapisano obrót zdjęcia na dysku', 'success');
        // Update local image cache in screenshots list
        const idx = screenshots.value.findIndex(s => s.filename === filename);
        if (idx !== -1 && data.image) {
          const updated = {
            ...screenshots.value[idx],
            sizeBytes: data.image.sizeBytes,
            mtime: data.image.mtime,
            url: `/api/screenshots/${encodeURIComponent(filename)}?t=${Date.now()}`
          };
          screenshots.value.splice(idx, 1, updated);
        }
        return data;
      } else {
        throw new Error(data.error || 'Błąd zapisu obrotu');
      }
    } catch (err) {
      showFeedback(err.message, 'error');
      throw err;
    }
  };

  // Fetch EXIF metadata for an image
  const fetchExif = async (filename) => {
    try {
      const res = await fetch(`${getApiBaseUrl()}/api/screenshots/${encodeURIComponent(filename)}/exif`);
      if (res.ok) {
        const data = await res.json();
        return data.exif;
      }
    } catch (err) {
      console.error('[Fetch EXIF Error]:', err);
    }
    return null;
  };

  // Selective deletion of a media file directly from the Android phone
  const deleteFileFromPhone = async (filename) => {
    try {
      const res = await fetch(`${getApiBaseUrl()}/api/phone/delete`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ filename })
      });

      const contentType = res.headers.get('content-type') || '';
      if (!contentType.includes('application/json')) {
        const text = await res.text();
        throw new Error(res.status === 404
          ? 'Endpoint /api/phone/delete niedostępny. Zrestartuj proces serwera: node server/server.js'
          : `Błąd serwera (${res.status}): ${text.slice(0, 80)}`
        );
      }

      const data = await res.json();
      if (data.success) {
        showFeedback(t.value.toastPhoneDeleted?.(filename) || `Usunięto z telefonu: ${filename}`, 'success');
        return true;
      } else {
        const errMsg = data.error === 'errNoUsbDevice'
          ? (t.value.errNoUsbDevice || 'Brak autoryzowanego telefonu')
          : (data.error || 'Nie znaleziono pliku na telefonie');
        showFeedback(errMsg, 'error');
        return false;
      }
    } catch (err) {
      showFeedback(err.message, 'error');
      return false;
    }
  };

  let isPolling = false;
  let isMounted = true;

  const runPolling = async () => {
    if (!isMounted || isPolling) return;
    isPolling = true;
    try {
      await fetchStatus();
    } finally {
      isPolling = false;
      if (isMounted) {
        // Poll faster (2.5s) when searching for runner startup, relaxed (4s) when connected
        pollTimer = setTimeout(runPolling, isRunnerConnected.value ? 4000 : 2500);
      }
    }
  };

  onMounted(() => {
    isMounted = true;
    runPolling();
    fetchScreenshots();
    setupWebSocket();
  });

  onUnmounted(() => {
    isMounted = false;
    if (pollTimer) clearTimeout(pollTimer);
    if (socket) socket.close();
  });

  return {
    isRunnerConnected,
    device,
    telemetry,
    destinationDir,
    screenshotsPath,
    photosPath,
    hideJsonlFiles,
    resolvedParentDir,
    cameraDestinationDir,
    pollIntervalMs,
    autoDeleteFromPhone,
    autoDeleteScreenshots,
    autoDeleteCamera,
    syncScreenshots,
    syncCamera,
    lastSyncTime,
    screenshots,
    isSyncing,
    syncProgress,
    isSnapping,
    isRefreshingTelemetry,
    actionMessage,
    messageType,
    getApiBaseUrl,
    fetchStatus,
    fetchScreenshots,
    refreshTelemetry,
    resetSyncHistory,
    triggerSync,
    triggerRemoteSnap,
    openFolderInFinder,
    updateConfig,
    enableWirelessAdb,
    connectWifi,
    autoConnectWireless,
    detectWifiIp,
    copyImageToClipboard,
    rotateImageOnDisk,
    fetchExif,
    deleteFileFromPhone
  };
}

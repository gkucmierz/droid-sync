import { ref, computed, onMounted, onUnmounted } from 'vue';
import { useI18n } from '../locales.js';

const RUNNER_PORT = 40880;

export function useDroidSync() {
  const { t } = useI18n();
  const isRunnerConnected = ref(false);
  const device = ref(null);
  const telemetry = ref(null);
  const destinationDir = ref('~/Documents/AndroidScreenshots');
  const pollIntervalMs = ref(2500);
  const autoDeleteFromPhone = ref(false);
  const lastSyncTime = ref(null);
  const screenshots = ref([]);
  const isSyncing = ref(false);
  const isSnapping = ref(false);
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
        isRunnerConnected.value = true;
        device.value = data.device;
        telemetry.value = data.telemetry;
        destinationDir.value = data.destinationDir;
        pollIntervalMs.value = data.pollIntervalMs;
        autoDeleteFromPhone.value = data.autoDeleteFromPhone;
        lastSyncTime.value = data.lastSyncTime;

        if (wasDisconnected) {
          await fetchScreenshots();
          setupWebSocket();
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
        pollIntervalMs.value = data.config.pollIntervalMs;
        autoDeleteFromPhone.value = data.config.autoDeleteFromPhone;
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

  // Copy Image to macOS Clipboard
  const copyImageToClipboard = async (imgUrl) => {
    try {
      const resolvedUrl = imgUrl.startsWith('http') ? imgUrl : `${getApiBaseUrl()}${imgUrl}`;
      const res = await fetch(resolvedUrl);
      const blob = await res.blob();

      // Write PNG to clipboard
      await navigator.clipboard.write([
        new ClipboardItem({ [blob.type]: blob })
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
            lastSyncTime.value = data.lastSyncTime;
            screenshots.value = data.screenshots || [];
          } else if (type === 'device-status') {
            device.value = data.device;
            telemetry.value = data.telemetry;
          } else if (type === 'device-disconnected') {
            device.value = null;
            telemetry.value = null;
          } else if (type === 'new-screenshots' || type === 'new-remote-snap') {
            fetchScreenshots();
            fetchStatus();
          } else if (type === 'config-updated') {
            destinationDir.value = data.config.destinationDir;
            pollIntervalMs.value = data.config.pollIntervalMs;
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
    pollIntervalMs,
    autoDeleteFromPhone,
    lastSyncTime,
    screenshots,
    isSyncing,
    isSnapping,
    actionMessage,
    messageType,
    getApiBaseUrl,
    fetchStatus,
    fetchScreenshots,
    triggerSync,
    triggerRemoteSnap,
    openFolderInFinder,
    updateConfig,
    enableWirelessAdb,
    connectWifi,
    autoConnectWireless,
    detectWifiIp,
    copyImageToClipboard
  };
}

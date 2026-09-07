<script setup>
import { ref, onMounted } from 'vue';
import {
  Camera,
  RefreshCw,
  FolderOpen,
  Wifi,
  Settings,
  AlertTriangle,
  CheckCircle2,
  Info,
  Server,
  Sun,
  Moon
} from 'lucide-vue-next';

import { useDroidSync } from './composables/useDroidSync.js';
import { useI18n } from './locales.js';
import { useTheme } from './composables/useTheme.js';
import DeviceCard from './components/DeviceCard.vue';
import GalleryView from './components/GalleryView.vue';
import SettingsModal from './components/SettingsModal.vue';
import BatteryModal from './components/BatteryModal.vue';
import SystemModal from './components/SystemModal.vue';
import RunnerOfflineCard from './components/RunnerOfflineCard.vue';

const { currentLang, t, setLang } = useI18n();
const { theme, toggleTheme } = useTheme();

const {
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
  rotateImageOnDisk,
  fetchExif,
  deleteFileFromPhone,
  triggerSync,
  triggerRemoteSnap,
  openFolderInFinder,
  updateConfig,
  enableWirelessAdb,
  connectWifi,
  autoConnectWireless,
  detectWifiIp,
  copyImageToClipboard
} = useDroidSync();

const isSettingsOpen = ref(false);
const settingsActiveTab = ref('folders');
const isBatteryModalOpen = ref(false);
const isSystemModalOpen = ref(false);

const openSettings = (tab = 'folders') => {
  settingsActiveTab.value = tab;
  isSettingsOpen.value = true;
};

const closeSettings = () => {
  isSettingsOpen.value = false;
};

const openBatteryModal = () => {
  isBatteryModalOpen.value = true;
  if (device.value && device.value.isAuthorized) {
    refreshTelemetry();
  }
};

const openSystemModal = () => {
  isSystemModalOpen.value = true;
  if (device.value && device.value.isAuthorized) {
    refreshTelemetry();
  }
};

onMounted(() => {
  requestAnimationFrame(() => {
    document.documentElement.classList.remove('preload');
  });
});
</script>

<template>
  <div class="app-layout">
    <!-- Feedback Toast Banner -->
    <transition name="toast-fade">
      <div 
        v-if="actionMessage" 
        class="toast-banner" 
        :class="'toast-' + messageType"
      >
        <component 
          :is="messageType === 'success' ? CheckCircle2 : messageType === 'error' ? AlertTriangle : Info" 
          :size="18" 
        />
        <span>{{ actionMessage }}</span>
      </div>
    </transition>

    <!-- Header Hero Bar -->
    <header class="app-header glass-panel">
      <div class="header-left">
        <div class="logo-mark">
          <Camera :size="20" />
        </div>
        <div>
          <div style="display: flex; align-items: center; gap: 8px;">
            <h1 class="app-title">droid-sync</h1>
            <span class="app-version font-mono">v1.1.1</span>
          </div>
          <p class="app-subtitle">{{ t.appSubtitle }}</p>
        </div>
      </div>

      <!-- Header Controls: Runner Indicator + Language Switcher + Theme Switcher -->
      <div class="header-right">
        <!-- Runner Indicator (first from left) -->
        <div class="runner-indicator" :class="{ connected: isRunnerConnected }">
          <Server :size="14" />
          <span>{{ isRunnerConnected ? t.runnerPort(40880) : t.runnerDisconnected }}</span>
        </div>

        <!-- Language Switcher -->
        <div class="lang-switch">
          <button 
            type="button" 
            :class="{ active: currentLang === 'en' }" 
            @click="setLang('en')"
          >EN</button>
          <button 
            type="button" 
            :class="{ active: currentLang === 'pl' }" 
            @click="setLang('pl')"
          >PL</button>
        </div>

        <!-- Theme Toggle Button -->
        <button 
          class="btn-theme-toggle" 
          :aria-label="theme === 'dark' ? 'Włącz jasny motyw' : 'Włącz ciemny motyw'" 
          @click="toggleTheme" 
          type="button"
        >
          <Sun v-if="theme === 'dark'" :size="17" class="theme-icon-sun" />
          <Moon v-else :size="17" class="theme-icon-moon" />
        </button>
      </div>
    </header>

    <!-- Main Content Container -->
    <main class="main-content">
      <!-- Dedicated Runner Offline Onboarding Card -->
      <RunnerOfflineCard v-if="!isRunnerConnected" />

      <!-- Device Telemetry Card -->
      <DeviceCard 
        :is-runner-connected="isRunnerConnected"
        :device="device"
        :telemetry="telemetry"
        :destination-dir="destinationDir"
        :last-sync-time="lastSyncTime"
        @open-battery="openBatteryModal"
        @open-system="openSystemModal"
        @open-settings="openSettings"
      />

      <!-- Live Sync Progress Banner -->
      <div v-if="isSyncing || (syncProgress.total > 0 && syncProgress.percent < 100)" class="sync-progress-card glass-panel animate-fade-in">
        <div class="sync-card-top">
          <div class="sync-card-status">
            <RefreshCw :size="16" class="animate-spin sync-spinner-icon" />
            <span class="sync-title">{{ t.syncInProgress }}</span>
            <span v-if="syncProgress.currentFile" class="sync-current-file font-mono">{{ syncProgress.currentFile }}</span>
          </div>
          <div class="sync-card-counter font-mono">
            <span class="sync-numbers">{{ syncProgress.current }} / {{ syncProgress.total }}</span>
            <span class="sync-pct">{{ syncProgress.percent }}%</span>
          </div>
        </div>
        <div class="sync-progress-bar-wrap">
          <div class="sync-progress-bar-fill" :style="{ width: `${syncProgress.percent}%` }"></div>
        </div>
      </div>

      <!-- Quick Action Toolbar -->
      <div class="actions-toolbar glass-panel">
        <div class="action-buttons-group">
          <!-- 1. Remote Snap -->
          <button 
            class="action-btn primary-action" 
            :disabled="!device || !device.isAuthorized || isSnapping"
            @click="triggerRemoteSnap"
            type="button"
          >
            <Camera :size="17" :class="{ 'animate-pulse': isSnapping }" />
            <span>{{ isSnapping ? t.actionSnapping : t.actionSnap }}</span>
          </button>

          <!-- 2. Manual Sync -->
          <button 
            class="action-btn" 
            :disabled="!device || !device.isAuthorized || isSyncing"
            @click="triggerSync"
            type="button"
          >
            <RefreshCw :size="16" :class="{ 'animate-spin': isSyncing }" />
            <span>{{ isSyncing ? t.actionSyncing : t.actionSync }}</span>
          </button>

          <!-- 3. Open Folder in Finder -->
          <button 
            class="action-btn" 
            @click="openFolderInFinder"
            type="button"
          >
            <FolderOpen :size="16" />
            <span>{{ t.actionFinder }}</span>
          </button>

          <!-- 4. Wi-Fi Setup Quick Trigger -->
          <button 
            class="action-btn" 
            @click="openSettings('sync')"
            type="button"
          >
            <Wifi :size="16" />
            <span>{{ t.actionWifi }}</span>
          </button>
        </div>

        <!-- Settings Cog -->
        <button class="settings-trigger-btn" @click="openSettings('folders')" type="button">
          <Settings :size="18" />
          <span>{{ t.actionSettings }}</span>
        </button>
      </div>

      <!-- Screenshot Gallery Grid -->
      <GalleryView 
        :screenshots="screenshots"
        :api-base-url="getApiBaseUrl()"
        :is-syncing="isSyncing"
        :sync-progress="syncProgress"
        :device="device"
        @copy-clipboard="copyImageToClipboard"
        @rotate-disk="rotateImageOnDisk"
        @fetch-exif="fetchExif"
        @delete-phone="deleteFileFromPhone"
      />
    </main>

    <!-- Settings & Wireless Modal -->
    <SettingsModal 
      :is-open="isSettingsOpen"
      :initial-tab="settingsActiveTab"
      :parent-dir="destinationDir"
      :screenshots-path="screenshotsPath"
      :photos-path="photosPath"
      :hide-jsonl-files="hideJsonlFiles"
      :current-dir="destinationDir"
      :camera-dir="cameraDestinationDir"
      :poll-interval-ms="pollIntervalMs"
      :auto-delete="autoDeleteFromPhone"
      :auto-delete-screenshots="autoDeleteScreenshots"
      :auto-delete-camera="autoDeleteCamera"
      :sync-screenshots="syncScreenshots"
      :sync-camera="syncCamera"
      :device="device"
      :telemetry="telemetry"
      @close="closeSettings"
      @save="updateConfig"
      @enable-wireless="enableWirelessAdb"
      @connect-wifi="connectWifi"
      @auto-connect-wireless="autoConnectWireless"
      @reset-history="resetSyncHistory"
    />

    <!-- Battery Telemetry Modal -->
    <BatteryModal 
      :is-open="isBatteryModalOpen"
      :battery="telemetry?.battery"
      :is-refreshing="isRefreshingTelemetry"
      @refresh="refreshTelemetry"
      @close="isBatteryModalOpen = false"
    />

    <!-- System Details Modal -->
    <SystemModal 
      :is-open="isSystemModalOpen"
      :system="telemetry?.system"
      :is-refreshing="isRefreshingTelemetry"
      @refresh="refreshTelemetry"
      @close="isSystemModalOpen = false"
    />
  </div>
</template>

<style scoped>
.app-layout {
  max-width: 1380px;
  margin: 0 auto;
  padding: 24px 20px 60px 20px;
  display: flex;
  flex-direction: column;
  gap: 20px;
}

/* Toast Banner */
.toast-banner {
  position: fixed;
  top: 20px;
  right: 20px;
  z-index: 10000;
  padding: 12px 20px;
  border-radius: 10px;
  display: flex;
  align-items: center;
  gap: 12px;
  font-size: 0.85rem;
  font-weight: 700;
  box-shadow: 0 10px 30px rgba(0, 0, 0, 0.7);
  backdrop-filter: blur(12px);
}

.toast-success {
  background: rgba(16, 185, 129, 0.9);
  color: #fff;
  border: 1px solid rgba(255, 255, 255, 0.2);
}

.toast-error {
  background: rgba(239, 68, 68, 0.9);
  color: #fff;
  border: 1px solid rgba(255, 255, 255, 0.2);
}

.toast-info {
  background: rgba(34, 211, 238, 0.9);
  color: #090d16;
  border: 1px solid rgba(255, 255, 255, 0.2);
}

.toast-fade-enter-active,
.toast-fade-leave-active {
  transition: all 0.25s ease;
}

.toast-fade-enter-from,
.toast-fade-leave-to {
  opacity: 0;
  transform: translateY(-10px);
}

/* Header */
.app-header {
  padding: 18px 24px;
  border-radius: 14px;
  background: rgba(15, 23, 42, 0.75);
  border: 1px solid rgba(255, 255, 255, 0.08);
  display: flex;
  align-items: center;
  justify-content: space-between;
  flex-wrap: wrap;
  gap: 16px;
}

/* Window Controls Overlay (macOS Desktop PWA Integration) */
@media (display-mode: window-controls-overlay) {
  .app-layout {
    padding-top: 10px;
  }

  .app-header {
    /* Leave comfortable room for macOS traffic lights on the left */
    padding-left: max(24px, calc(env(titlebar-area-x, 0px) + 84px));
    padding-right: max(24px, calc(100vw - env(titlebar-area-width, 100vw) + 16px));
    -webkit-app-region: drag;
    app-region: drag;
  }

  .app-header button,
  .app-header .lang-switch,
  .app-header .runner-indicator,
  .app-header a {
    -webkit-app-region: no-drag;
    app-region: no-drag;
  }
}

.header-left {
  display: flex;
  align-items: center;
  gap: 14px;
}

.logo-mark {
  width: 42px;
  height: 42px;
  border-radius: 10px;
  background: rgba(34, 211, 238, 0.15);
  border: 1px solid rgba(34, 211, 238, 0.35);
  color: #22d3ee;
  display: flex;
  align-items: center;
  justify-content: center;
  box-shadow: 0 0 15px rgba(34, 211, 238, 0.2);
}

.app-title {
  margin: 0;
  font-size: 1.4rem;
  font-weight: 900;
  color: #f8fafc;
  letter-spacing: -0.02em;
}

.app-version {
  font-size: 0.72rem;
  padding: 1px 6px;
  border-radius: 4px;
  background: rgba(255, 255, 255, 0.08);
  color: #94a3b8;
}

.app-subtitle {
  margin: 2px 0 0 0;
  font-size: 0.8rem;
  color: #94a3b8;
}

.header-right {
  display: flex;
  align-items: center;
  gap: 12px;
}

.lang-switch {
  display: inline-flex;
  align-items: center;
  height: 36px;
  padding: 3px;
  gap: 3px;
  box-sizing: border-box;
  background: rgba(0, 0, 0, 0.45);
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 9px;
  box-shadow: inset 0 2px 4px rgba(0, 0, 0, 0.25);
  backdrop-filter: blur(8px);
}

.lang-switch button {
  background: transparent;
  border: 1px solid transparent;
  padding: 0 10px;
  height: 100%;
  border-radius: 6px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  color: #94a3b8;
  font-family: 'JetBrains Mono', monospace;
  font-size: 0.74rem;
  font-weight: 700;
  letter-spacing: 0.04em;
  cursor: pointer;
  transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
  outline: none !important;
  outline-offset: 0 !important;
  box-shadow: none !important;
}

.lang-switch button.active {
  color: #22d3ee;
  background: rgba(34, 211, 238, 0.18);
  border-color: rgba(34, 211, 238, 0.45);
  box-shadow: 0 0 12px rgba(34, 211, 238, 0.22), inset 0 1px 1px rgba(255, 255, 255, 0.15);
  font-weight: 800;
}

.lang-switch button:hover:not(.active) {
  color: #f8fafc;
  background: rgba(255, 255, 255, 0.06);
}

.btn-theme-toggle {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 36px;
  height: 36px;
  border-radius: 8px;
  background: var(--btn-bg);
  border: 1px solid var(--btn-border);
  cursor: pointer;
  transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
  outline: none !important;
  box-shadow: none !important;
  -webkit-tap-highlight-color: transparent;
}

.btn-theme-toggle:focus,
.btn-theme-toggle:focus-visible,
.btn-theme-toggle:active {
  outline: none !important;
  box-shadow: none !important;
}

.btn-theme-toggle:hover {
  background: var(--btn-bg-hover);
  border-color: rgba(251, 191, 36, 0.5);
  box-shadow: 0 0 10px rgba(251, 191, 36, 0.2);
}

:global([data-theme="light"]) .btn-theme-toggle:hover {
  border-color: rgba(168, 85, 247, 0.5) !important;
  background: rgba(168, 85, 247, 0.08) !important;
  box-shadow: 0 0 10px rgba(168, 85, 247, 0.2) !important;
}

.theme-icon-sun {
  color: #fbbf24 !important;
  stroke: #fbbf24 !important;
  filter: drop-shadow(0 0 6px rgba(251, 191, 36, 0.6));
  transition: transform 0.25s ease;
}

.theme-icon-moon {
  color: #c084fc !important;
  stroke: #c084fc !important;
  filter: drop-shadow(0 0 6px rgba(192, 132, 252, 0.6));
  transition: transform 0.25s ease;
}

:global([data-theme="light"]) .theme-icon-moon {
  color: #9333ea !important;
  stroke: #9333ea !important;
  filter: drop-shadow(0 0 6px rgba(147, 51, 234, 0.35)) !important;
}

.btn-theme-toggle:hover .theme-icon-sun {
  transform: rotate(30deg) scale(1.12);
}

.btn-theme-toggle:hover .theme-icon-moon {
  transform: rotate(-15deg) scale(1.12);
}

.runner-indicator {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  padding: 0 12px;
  height: 36px;
  box-sizing: border-box;
  border-radius: 8px;
  font-family: 'JetBrains Mono', monospace;
  font-size: 0.72rem;
  font-weight: 700;
  background: rgba(239, 68, 68, 0.12);
  color: #f87171;
  border: 1px solid rgba(239, 68, 68, 0.3);
}

.runner-indicator.connected {
  background: rgba(16, 185, 129, 0.12);
  color: #34d399;
  border-color: rgba(16, 185, 129, 0.3);
}

/* Main Content */
.main-content {
  display: flex;
  flex-direction: column;
  gap: 20px;
}

/* Live Sync Progress Card */
.sync-progress-card {
  padding: 14px 18px;
  border-radius: 12px;
  background: rgba(15, 23, 42, 0.75);
  border: 1px solid rgba(34, 211, 238, 0.35);
  display: flex;
  flex-direction: column;
  gap: 10px;
  box-shadow: 0 4px 20px rgba(34, 211, 238, 0.15);
}

.sync-card-top {
  display: flex;
  align-items: center;
  justify-content: space-between;
  flex-wrap: wrap;
  gap: 10px;
}

.sync-card-status {
  display: flex;
  align-items: center;
  gap: 10px;
}

.sync-spinner-icon {
  color: #22d3ee;
}

.sync-title {
  font-size: 0.85rem;
  font-weight: 700;
  color: #f8fafc;
}

.sync-current-file {
  font-size: 0.75rem;
  color: #94a3b8;
  max-width: 340px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  padding: 2px 6px;
  background: rgba(0, 0, 0, 0.3);
  border-radius: 4px;
}

.sync-card-counter {
  display: flex;
  align-items: center;
  gap: 8px;
}

.sync-numbers {
  font-size: 0.78rem;
  font-weight: 700;
  color: #22d3ee;
}

.sync-pct {
  font-size: 0.72rem;
  font-weight: 800;
  padding: 2px 6px;
  border-radius: 4px;
  background: rgba(34, 211, 238, 0.15);
  color: #22d3ee;
  border: 1px solid rgba(34, 211, 238, 0.3);
}

.sync-progress-bar-wrap {
  width: 100%;
  height: 6px;
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.08);
  overflow: hidden;
}

.sync-progress-bar-fill {
  height: 100%;
  border-radius: 999px;
  background: linear-gradient(90deg, #22d3ee, #a855f7);
  transition: width 0.25s ease-out;
  box-shadow: 0 0 10px rgba(34, 211, 238, 0.5);
}

/* Actions Toolbar */
.actions-toolbar {
  padding: 14px 20px;
  border-radius: 12px;
  background: rgba(15, 23, 42, 0.65);
  border: 1px solid rgba(255, 255, 255, 0.08);
  display: flex;
  align-items: center;
  justify-content: space-between;
  flex-wrap: wrap;
  gap: 12px;
}

.action-buttons-group {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-wrap: wrap;
}

.action-btn {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  padding: 8px 16px;
  border-radius: 8px;
  background: rgba(255, 255, 255, 0.05);
  border: 1px solid rgba(255, 255, 255, 0.12);
  color: #f8fafc;
  font-size: 0.82rem;
  font-weight: 700;
  cursor: pointer;
  transition: all 0.2s ease;
}

.action-btn:hover:not(:disabled) {
  background: rgba(255, 255, 255, 0.1);
  border-color: rgba(255, 255, 255, 0.25);
  transform: translateY(-1px);
}

.action-btn:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}

.primary-action {
  background: #22d3ee;
  border-color: #22d3ee;
  color: #090d16;
}

.primary-action:hover:not(:disabled) {
  background: #67e8f9;
  border-color: #67e8f9;
  box-shadow: 0 0 15px rgba(34, 211, 238, 0.4);
}

.settings-trigger-btn {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  padding: 8px 14px;
  border-radius: 8px;
  background: rgba(255, 255, 255, 0.03);
  border: 1px solid rgba(255, 255, 255, 0.08);
  color: #94a3b8;
  font-size: 0.82rem;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.2s;
}

.settings-trigger-btn:hover {
  color: #f8fafc;
  border-color: rgba(255, 255, 255, 0.2);
}

.animate-spin {
  animation: spin 1s linear infinite;
}

.animate-pulse {
  animation: pulse 1.5s cubic-bezier(0.4, 0, 0.6, 1) infinite;
}

@keyframes spin {
  from { transform: rotate(0deg); }
  to { transform: rotate(360deg); }
}

@keyframes pulse {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.5; }
}
</style>

<script setup>
import { ref, watch, onMounted, onUnmounted } from 'vue';
import { useI18n } from '../locales.js';
import {
  X,
  Folder,
  Clock,
  Trash2,
  Wifi,
  Usb,
  Save,
  CheckCircle2,
  Zap,
  ChevronDown,
  ChevronUp,
  AlertCircle,
  Smartphone,
  Camera
} from 'lucide-vue-next';

const props = defineProps({
  isOpen: { type: Boolean, default: false },
  currentDir: { type: String, default: '~/Documents/AndroidScreenshots' },
  cameraDir: { type: String, default: '~/Documents/AndroidPhotos' },
  pollIntervalMs: { type: Number, default: 2500 },
  autoDelete: { type: Boolean, default: false },
  autoDeleteScreenshots: { type: Boolean, default: false },
  autoDeleteCamera: { type: Boolean, default: false },
  syncScreenshots: { type: Boolean, default: true },
  syncCamera: { type: Boolean, default: true },
  device: { type: Object, default: null },
  telemetry: { type: Object, default: null }
});

const emit = defineEmits(['close', 'save', 'enable-wireless', 'connect-wifi', 'auto-connect-wireless']);

const { currentLang, t } = useI18n();

const localDir = ref(props.currentDir);
const localCameraDir = ref(props.cameraDir);
const localInterval = ref(props.pollIntervalMs / 1000);
const localAutoDeleteScreenshots = ref(props.autoDeleteScreenshots);
const localAutoDeleteCamera = ref(props.autoDeleteCamera);
const localSyncScreenshots = ref(props.syncScreenshots);
const localSyncCamera = ref(props.syncCamera);
const wifiIp = ref('');
const wifiPort = ref(5555);
const isAutoConnecting = ref(false);
const showManualWireless = ref(false);

watch(() => [props.isOpen, props.telemetry], () => {
  if (props.isOpen) {
    localDir.value = props.currentDir;
    localCameraDir.value = props.cameraDir || '~/Documents/AndroidPhotos';
    localInterval.value = props.pollIntervalMs / 1000;
    localAutoDeleteScreenshots.value = props.autoDeleteScreenshots ?? props.autoDelete ?? false;
    localAutoDeleteCamera.value = props.autoDeleteCamera ?? false;
    localSyncScreenshots.value = props.syncScreenshots;
    localSyncCamera.value = props.syncCamera;
    if (props.telemetry?.wifiIp) {
      wifiIp.value = props.telemetry.wifiIp;
    }
  }
}, { immediate: true });

const handleSave = () => {
  emit('save', {
    destinationDir: localDir.value,
    cameraDestinationDir: localCameraDir.value,
    pollIntervalMs: Math.max(1000, localInterval.value * 1000),
    autoDeleteScreenshots: localAutoDeleteScreenshots.value,
    autoDeleteCamera: localAutoDeleteCamera.value,
    autoDeleteFromPhone: localAutoDeleteScreenshots.value,
    syncScreenshots: localSyncScreenshots.value,
    syncCamera: localSyncCamera.value
  });
  emit('close');
};

const handleAutoConnect = async () => {
  if (isAutoConnecting.value) return;
  isAutoConnecting.value = true;
  try {
    emit('auto-connect-wireless', wifiPort.value);
  } finally {
    setTimeout(() => {
      isAutoConnecting.value = false;
    }, 3000);
  }
};

const handleEnableWireless = () => {
  emit('enable-wireless', wifiPort.value);
};

const handleConnectWifi = () => {
  if (!wifiIp.value.trim()) return;
  emit('connect-wifi', wifiIp.value.trim(), wifiPort.value);
};

// Universal ESC dismissal with proper cleanup (Rule 6.1)
const handleKeydown = (e) => {
  if (e.key === 'Escape' && props.isOpen) {
    e.stopPropagation();
    emit('close');
  }
};

onMounted(() => {
  window.addEventListener('keydown', handleKeydown);
});

onUnmounted(() => {
  window.removeEventListener('keydown', handleKeydown);
});
</script>

<template>
  <div v-if="isOpen" class="modal-overlay animate-fade-in" @click="$emit('close')">
    <div class="modal-card glass-panel" @click.stop>
      <!-- Modal Header -->
      <div class="modal-header">
        <h3 class="modal-title">{{ t.settingsTitle }}</h3>
        <button class="modal-close-btn" @click="$emit('close')" type="button" aria-label="Zamknij">
          <X :size="18" :stroke-width="2.2" />
        </button>
      </div>

      <div class="modal-body">
        <!-- 1. Screenshots Destination Folder -->
        <div class="form-group">
          <label class="form-label">
            <Folder :size="15" style="color: #f59e0b;" />
            <span>{{ t.destDirLabel }}</span>
          </label>
          <input 
            v-model="localDir" 
            type="text" 
            class="form-input font-mono" 
            placeholder="~/Documents/AndroidScreenshots"
          />
          <span class="form-hint">{{ t.destDirHint }}</span>
        </div>

        <!-- 2. Camera Photos Destination Folder -->
        <div class="form-group">
          <label class="form-label">
            <Folder :size="15" style="color: #c084fc;" />
            <span>{{ t.destCameraDirLabel }}</span>
          </label>
          <input 
            v-model="localCameraDir" 
            type="text" 
            class="form-input font-mono" 
            placeholder="~/Documents/AndroidPhotos"
          />
          <span class="form-hint">{{ t.destCameraDirHint }}</span>
        </div>

        <!-- 3. Poll Interval -->
        <div class="form-group">
          <label class="form-label">
            <Clock :size="15" style="color: #22d3ee;" />
            <span>{{ t.intervalLabel }}</span>
          </label>
          <div style="display: flex; align-items: center; gap: 10px;">
            <input 
              v-model.number="localInterval" 
              type="number" 
              min="1" 
              max="60" 
              step="0.5" 
              class="form-input font-mono" 
              style="width: 120px;" 
            />
            <span style="font-size: 0.85rem; color: #94a3b8;">{{ t.intervalUnit }}</span>
          </div>
          <span class="form-hint">{{ t.intervalHint }}</span>
        </div>

        <!-- 4. Sync Screenshots Toggle -->
        <div class="toggle-row-group">
          <div class="toggle-left">
            <label class="toggle-title-row" for="sync-screenshots-switch">
              <Smartphone :size="16" style="color: #22d3ee;" />
              <span class="toggle-title">{{ t.syncScreenshotsLabel }}</span>
            </label>
            <span class="form-hint">{{ t.syncScreenshotsHint }}</span>
          </div>

          <label class="switch-label" for="sync-screenshots-switch">
            <input 
              id="sync-screenshots-switch"
              v-model="localSyncScreenshots" 
              type="checkbox" 
              class="switch-input" 
            />
            <div class="switch-slider"></div>
          </label>
        </div>

        <!-- 5. Sync Camera Photos Toggle -->
        <div class="toggle-row-group">
          <div class="toggle-left">
            <label class="toggle-title-row" for="sync-camera-switch">
              <Camera :size="16" style="color: #c084fc;" />
              <span class="toggle-title">{{ t.syncCameraLabel }}</span>
            </label>
            <span class="form-hint">{{ t.syncCameraHint }}</span>
          </div>

          <label class="switch-label" for="sync-camera-switch">
            <input 
              id="sync-camera-switch"
              v-model="localSyncCamera" 
              type="checkbox" 
              class="switch-input" 
            />
            <div class="switch-slider"></div>
          </label>
        </div>

        <!-- 6. Auto-Delete Screenshots Toggle -->
        <div class="toggle-row-group">
          <div class="toggle-left">
            <label class="toggle-title-row" for="auto-delete-screenshots-switch">
              <Trash2 :size="16" style="color: #f87171;" />
              <span class="toggle-title">{{ t.autoDeleteScreenshotsLabel }}</span>
            </label>
            <span class="form-hint">{{ t.autoDeleteScreenshotsHint }}</span>
          </div>

          <label class="switch-label" for="auto-delete-screenshots-switch">
            <input 
              id="auto-delete-screenshots-switch"
              v-model="localAutoDeleteScreenshots" 
              type="checkbox" 
              class="switch-input" 
            />
            <div class="switch-slider"></div>
          </label>
        </div>

        <!-- 7. Auto-Delete Camera Photos Toggle (with prominent warning badge) -->
        <div class="toggle-row-group warning-group">
          <div class="toggle-left">
            <label class="toggle-title-row" for="auto-delete-camera-switch">
              <AlertCircle :size="16" style="color: #ef4444;" />
              <span class="toggle-title">{{ t.autoDeleteCameraLabel }}</span>
            </label>
            <span class="form-hint warning-hint">{{ t.autoDeleteCameraHint }}</span>
          </div>

          <label class="switch-label" for="auto-delete-camera-switch">
            <input 
              id="auto-delete-camera-switch"
              v-model="localAutoDeleteCamera" 
              type="checkbox" 
              class="switch-input switch-danger" 
            />
            <div class="switch-slider"></div>
          </label>
        </div>

        <!-- 4. Wireless ADB Setup Section -->
        <div class="wireless-section glass-panel">
          <div class="section-title-row">
            <Wifi :size="18" style="color: #10b981;" />
            <h4 class="section-title">{{ t.wirelessTitle }}</h4>
          </div>
          <p class="section-desc">{{ t.wirelessDesc }}</p>

          <!-- 1-Click Auto Connect Card (Zero user hassle) -->
          <div class="auto-wireless-card">
            <div class="auto-wireless-header">
              <div style="display: flex; align-items: center; gap: 8px;">
                <Zap :size="18" style="color: #22d3ee;" />
                <h5 class="auto-wireless-title">{{ t.autoWifiTitle }}</h5>
              </div>
            </div>
            <p class="auto-wireless-desc">{{ t.autoWifiDesc }}</p>

            <!-- Detected IP state -->
            <div v-if="device && !device.isWifi && device.isAuthorized" class="auto-detected-box">
              <div v-if="telemetry?.wifiIp" class="ip-detected-row">
                <span class="detected-ip-label">{{ t.detectedIpLabel }}</span>
                <span class="detected-ip-badge font-mono">{{ telemetry.wifiIp }}</span>
              </div>
              <div v-else class="ip-searching-row">
                <AlertCircle :size="15" style="color: #f59e0b;" />
                <span>{{ t.detectedIpNotFound }}</span>
              </div>

              <button 
                class="btn-auto-connect" 
                :disabled="!telemetry?.wifiIp || isAutoConnecting"
                @click="handleAutoConnect"
                type="button"
              >
                <Zap :size="15" :class="{ 'animate-pulse': isAutoConnecting }" />
                <span>{{ isAutoConnecting ? t.btnAutoConnecting : t.btnAutoConnect }}</span>
              </button>
            </div>

            <!-- Device is already on Wi-Fi -->
            <div v-else-if="device?.isWifi" class="wifi-connected-box">
              <CheckCircle2 :size="16" style="color: #10b981;" />
              <span>Telefon jest połączony przez Wi-Fi ({{ device.serial }})</span>
            </div>

            <!-- No USB phone connected -->
            <div v-else class="usb-needed-box">
              <Usb :size="16" style="color: #94a3b8;" />
              <span>{{ t.connectPrompt }}</span>
            </div>
          </div>

          <!-- Collapsible Manual Fallback -->
          <div class="manual-wireless-toggle" @click="showManualWireless = !showManualWireless">
            <span>{{ t.manualSectionTitle }}</span>
            <component :is="showManualWireless ? ChevronUp : ChevronDown" :size="16" />
          </div>

          <div v-if="showManualWireless" class="wireless-steps animate-fade-in">
            <!-- Step 1: Enable TCP/IP -->
            <div class="step-card">
              <span class="step-num">{{ t.step1Title }}</span>
              <div class="step-content">
                <span class="step-text">{{ t.step1Text }}</span>
                <button class="step-btn" @click="handleEnableWireless" type="button">
                  <Usb :size="14" />
                  <span>{{ t.step1Btn(wifiPort) }}</span>
                </button>
              </div>
            </div>

            <!-- Step 2: Connect IP -->
            <div class="step-card">
              <span class="step-num">{{ t.step2Title }}</span>
              <div class="step-content">
                <span class="step-text">{{ t.step2Text }}</span>
                <div style="display: flex; gap: 8px; margin-top: 6px;">
                  <input 
                    v-model="wifiIp" 
                    type="text" 
                    :placeholder="t.step2Plh" 
                    class="form-input font-mono" 
                    style="flex: 1;" 
                  />
                  <button class="step-btn connect-btn" @click="handleConnectWifi" type="button">
                    <Wifi :size="14" />
                    <span>{{ t.btnConnect }}</span>
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- Modal Footer -->
      <div class="modal-footer">
        <button class="btn-cancel" @click="$emit('close')" type="button">{{ t.btnCancel }}</button>
        <button class="btn-save" @click="handleSave" type="button">
          <Save :size="16" />
          <span>{{ t.btnSave }}</span>
        </button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.modal-overlay {
  position: fixed;
  inset: 0;
  z-index: 9999;
  background: rgba(3, 7, 18, 0.85);
  backdrop-filter: blur(12px);
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 20px;
}

.modal-card {
  width: 95vw;
  max-width: 650px;
  max-height: 90vh;
  overflow-y: auto;
  background: rgba(15, 23, 42, 0.95);
  border: 1px solid rgba(34, 211, 238, 0.3);
  border-radius: 14px;
  display: flex;
  flex-direction: column;
  box-shadow: 0 25px 60px rgba(0, 0, 0, 0.85);
}

.modal-header {
  padding: 16px 24px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.08);
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.modal-title {
  margin: 0;
  font-size: 1.15rem;
  font-weight: 800;
  color: #f8fafc;
}

.modal-close-btn {
  background: none;
  border: none;
  color: #94a3b8;
  cursor: pointer;
  padding: 4px;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 32px;
  height: 32px;
  border-radius: 6px;
  transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
  outline: none !important;
  box-shadow: none !important;
}

.modal-close-btn:hover {
  color: #ef4444;
  background: rgba(239, 68, 68, 0.15);
}

.modal-close-btn:focus,
.modal-close-btn:focus-visible,
.modal-close-btn:active {
  outline: none !important;
  box-shadow: none !important;
}

.modal-body {
  padding: 24px;
  display: flex;
  flex-direction: column;
  gap: 20px;
}

.form-group {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.form-label {
  font-size: 0.85rem;
  font-weight: 700;
  color: #e2e8f0;
  display: flex;
  align-items: center;
  gap: 8px;
}

.form-input {
  width: 100%;
  padding: 8px 12px;
  background: rgba(0, 0, 0, 0.35);
  border: 1px solid rgba(255, 255, 255, 0.12);
  border-radius: 8px;
  color: #f8fafc;
  font-size: 0.85rem;
  transition: all 0.2s;
}

.form-input:focus {
  border-color: rgba(34, 211, 238, 0.5);
  box-shadow: 0 0 10px rgba(34, 211, 238, 0.2);
}

.form-hint {
  font-size: 0.75rem;
  color: #64748b;
  line-height: 1.4;
}

/* LoL Style Switch */
.toggle-row-group {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  padding: 12px 16px;
  border-radius: 10px;
  background: rgba(255, 255, 255, 0.03);
  border: 1px solid rgba(255, 255, 255, 0.08);
  transition: all 0.2s ease;
}

.toggle-left {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.toggle-title-row {
  display: flex;
  align-items: center;
  gap: 8px;
  cursor: pointer;
}

.toggle-title {
  font-size: 0.88rem;
  font-weight: 700;
  color: #e2e8f0;
}

.switch-label {
  position: relative;
  display: inline-block;
  width: 44px;
  height: 24px;
  cursor: pointer;
  flex-shrink: 0;
  outline: none !important;
}

.switch-input {
  position: absolute;
  opacity: 0;
  width: 0;
  height: 0;
  pointer-events: none;
  outline: none !important;
}

.switch-slider {
  position: relative;
  width: 44px;
  height: 24px;
  background: rgba(15, 23, 42, 0.7);
  border: 1px solid rgba(255, 255, 255, 0.15);
  border-radius: 12px;
  cursor: pointer;
  transition: all 0.25s cubic-bezier(0.4, 0, 0.2, 1);
  outline: none !important;
  box-shadow: none !important;
}

.switch-slider::before {
  content: "";
  position: absolute;
  width: 16px;
  height: 16px;
  left: 3px;
  bottom: 3px;
  background: #94a3b8;
  border-radius: 50%;
  transition: transform 0.25s cubic-bezier(0.4, 0, 0.2, 1), background-color 0.25s;
}

.switch-input:checked + .switch-slider {
  background: rgba(34, 211, 238, 0.2);
  border-color: rgba(34, 211, 238, 0.5);
  box-shadow: 0 0 10px rgba(34, 211, 238, 0.3);
}

.switch-input:checked + .switch-slider::before {
  transform: translateX(20px);
  background: #22d3ee;
  box-shadow: 0 0 8px rgba(34, 211, 238, 0.6);
}

.switch-input.switch-danger:checked + .switch-slider {
  background: rgba(239, 68, 68, 0.2);
  border-color: rgba(239, 68, 68, 0.5);
  box-shadow: 0 0 10px rgba(239, 68, 68, 0.3);
}

.switch-input.switch-danger:checked + .switch-slider::before {
  background: #ef4444;
  box-shadow: 0 0 8px rgba(239, 68, 68, 0.6);
}

.warning-group {
  border-color: rgba(239, 68, 68, 0.25) !important;
}

.warning-hint {
  color: #f87171 !important;
  font-weight: 600;
}

.switch-input:focus + .switch-slider,
.switch-input:focus-visible + .switch-slider {
  outline: none !important;
  box-shadow: none !important;
}

/* Wireless ADB Section */
.wireless-section {
  padding: 16px;
  border-radius: 10px;
  background: rgba(16, 185, 129, 0.05);
  border: 1px solid rgba(16, 185, 129, 0.2);
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.section-title-row {
  display: flex;
  align-items: center;
  gap: 8px;
}

.section-title {
  margin: 0;
  font-size: 0.95rem;
  font-weight: 800;
  color: #10b981;
}

.section-desc {
  margin: 0;
  font-size: 0.78rem;
  color: #94a3b8;
  line-height: 1.4;
}

/* 1-Click Auto Wireless Card */
.auto-wireless-card {
  margin-top: 6px;
  padding: 14px 16px;
  background: rgba(34, 211, 238, 0.06);
  border: 1px solid rgba(34, 211, 238, 0.25);
  border-radius: 10px;
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.auto-wireless-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.auto-wireless-title {
  margin: 0;
  font-size: 0.95rem;
  font-weight: 700;
  color: #22d3ee;
}

.auto-wireless-desc {
  margin: 0;
  font-size: 0.8rem;
  line-height: 1.4;
  color: #94a3b8;
}

.auto-detected-box {
  margin-top: 4px;
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.ip-detected-row {
  display: flex;
  align-items: center;
  gap: 10px;
  font-size: 0.85rem;
}

.detected-ip-label {
  color: #cbd5e1;
}

.detected-ip-badge {
  padding: 3px 8px;
  border-radius: 6px;
  background: rgba(34, 211, 238, 0.15);
  color: #22d3ee;
  border: 1px solid rgba(34, 211, 238, 0.3);
  font-weight: 700;
}

.ip-searching-row {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 0.8rem;
  color: #f59e0b;
}

.btn-auto-connect {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  padding: 10px 18px;
  border-radius: 8px;
  background: #22d3ee;
  color: #090d16;
  font-weight: 700;
  font-size: 0.85rem;
  border: none;
  cursor: pointer;
  transition: 0.2s ease;
  box-shadow: 0 0 15px rgba(34, 211, 238, 0.35);
}

.btn-auto-connect:hover:not(:disabled) {
  background: #67e8f9;
  transform: translateY(-1px);
}

.btn-auto-connect:disabled {
  opacity: 0.5;
  cursor: not-allowed;
  box-shadow: none;
}

.wifi-connected-box, .usb-needed-box {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px 14px;
  border-radius: 8px;
  background: rgba(255, 255, 255, 0.04);
  font-size: 0.8rem;
  color: #94a3b8;
}

.manual-wireless-toggle {
  margin-top: 6px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 8px 12px;
  border-radius: 8px;
  background: rgba(255, 255, 255, 0.03);
  border: 1px solid rgba(255, 255, 255, 0.08);
  font-size: 0.8rem;
  color: #94a3b8;
  cursor: pointer;
  transition: 0.2s ease;
}

.manual-wireless-toggle:hover {
  background: rgba(255, 255, 255, 0.06);
  color: #f1f5f9;
}

/* Manual Steps */
.wireless-steps {
  display: flex;
  flex-direction: column;
  gap: 10px;
  margin-top: 4px;
}

.step-card {
  padding: 10px 14px;
  border-radius: 8px;
  background: rgba(255, 255, 255, 0.03);
  border: 1px solid rgba(255, 255, 255, 0.06);
  display: flex;
  align-items: flex-start;
  gap: 12px;
}

.step-num {
  font-size: 0.7rem;
  font-weight: 800;
  padding: 2px 6px;
  border-radius: 4px;
  background: rgba(16, 185, 129, 0.15);
  color: #10b981;
  text-transform: uppercase;
}

.step-content {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.step-text {
  font-size: 0.8rem;
  color: #cbd5e1;
}

.step-btn {
  align-self: flex-start;
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 6px 12px;
  border-radius: 6px;
  background: rgba(255, 255, 255, 0.08);
  border: 1px solid rgba(255, 255, 255, 0.15);
  color: #f8fafc;
  font-size: 0.78rem;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.2s;
}

.step-btn:hover {
  background: rgba(16, 185, 129, 0.2);
  border-color: #10b981;
  color: #10b981;
}

.connect-btn {
  align-self: stretch;
  background: rgba(16, 185, 129, 0.15);
  border-color: rgba(16, 185, 129, 0.35);
  color: #34d399;
}

.modal-footer {
  padding: 16px 24px;
  border-top: 1px solid rgba(255, 255, 255, 0.08);
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 12px;
}

.btn-cancel {
  padding: 8px 16px;
  border-radius: 6px;
  background: rgba(255, 255, 255, 0.05);
  border: 1px solid rgba(255, 255, 255, 0.1);
  color: #94a3b8;
  font-size: 0.82rem;
  font-weight: 600;
  cursor: pointer;
}

.btn-cancel:hover {
  color: #f8fafc;
  background: rgba(255, 255, 255, 0.08);
}

.btn-save {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  padding: 8px 18px;
  border-radius: 6px;
  background: #22d3ee;
  border: none;
  color: #090d16;
  font-size: 0.82rem;
  font-weight: 800;
  cursor: pointer;
  transition: all 0.2s;
}

.btn-save:hover {
  background: #67e8f9;
  box-shadow: 0 0 15px rgba(34, 211, 238, 0.4);
}
</style>

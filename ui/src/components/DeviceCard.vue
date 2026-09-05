<script setup>
import { computed } from 'vue';
import { useI18n } from '../locales.js';
import {
  Smartphone,
  Battery,
  BatteryCharging,
  Wifi,
  Usb,
  Folder,
  AlertCircle,
  CheckCircle2,
  Clock
} from 'lucide-vue-next';

const props = defineProps({
  isRunnerConnected: { type: Boolean, default: false },
  device: { type: Object, default: null },
  telemetry: { type: Object, default: null },
  destinationDir: { type: String, default: '' },
  lastSyncTime: { type: String, default: null }
});

const { currentLang, t } = useI18n();

const isOnline = computed(() => {
  return props.isRunnerConnected && props.device && props.device.isAuthorized;
});

const isUnauthorized = computed(() => {
  return props.isRunnerConnected && props.device && !props.device.isAuthorized;
});

const formatTime = (isoString) => {
  if (!isoString) return t.value.noSyncYet;
  const date = new Date(isoString);
  const locale = currentLang.value === 'pl' ? 'pl-PL' : 'en-US';
  return date.toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit', second: '2-digit' });
};
</script>

<template>
  <div class="device-card glass-panel">
    <!-- Top Row: Device Identity & Status Pill -->
    <div class="card-header">
      <div class="device-title-group">
        <div class="device-icon-wrap" :class="{ online: isOnline, warning: isUnauthorized }">
          <Smartphone :size="24" />
        </div>
        <div>
          <div class="model-row">
            <h3 class="device-model">
              {{ telemetry?.model || device?.model || (isRunnerConnected ? t.noDevice : t.runnerOffline) }}
            </h3>
            <span v-if="device?.isWifi" class="conn-tag wifi-tag">
              <Wifi :size="12" />
              <span>Wi-Fi</span>
            </span>
            <span v-else-if="device" class="conn-tag usb-tag">
              <Usb :size="12" />
              <span>USB</span>
            </span>
          </div>
          <span class="device-serial font-mono">
            {{ device?.serial || (isRunnerConnected ? t.connectPrompt : t.startRunnerPrompt) }}
            <span v-if="telemetry?.wifiIp && !device?.isWifi" style="color: #22d3ee; margin-left: 8px;">• Wi-Fi: {{ telemetry.wifiIp }}</span>
          </span>
        </div>
      </div>

      <div class="status-pill" :class="{ online: isOnline, unauthorized: isUnauthorized, offline: !isOnline && !isUnauthorized }">
        <span class="status-dot"></span>
        <span>
          {{ isOnline ? t.statusConnected : isUnauthorized ? t.statusUnauthorized : isRunnerConnected ? t.statusWaiting : t.statusNoRunner }}
        </span>
      </div>
    </div>

    <!-- Alert for Unauthorized Device -->
    <div v-if="isUnauthorized" class="unauthorized-banner">
      <AlertCircle :size="16" />
      <span>{{ t.unauthorizedWarning }}</span>
    </div>

    <!-- Telemetry & Folder Grid -->
    <div class="telemetry-grid">
      <!-- Battery Status -->
      <div class="telemetry-item">
        <span class="telemetry-label">{{ t.batteryLabel }}</span>
        <div class="telemetry-value">
          <component 
            :is="telemetry?.isCharging ? BatteryCharging : Battery" 
            :size="16" 
            :style="{ color: telemetry?.isCharging ? '#10b981' : (telemetry?.batteryLevel < 20 ? '#ef4444' : '#22d3ee') }" 
          />
          <span v-if="telemetry?.batteryLevel !== null && telemetry?.batteryLevel !== undefined">
            {{ telemetry.batteryLevel }}% {{ telemetry.isCharging ? t.charging : '' }}
          </span>
          <span v-else class="text-muted">—</span>
        </div>
      </div>

      <!-- Android Version -->
      <div class="telemetry-item">
        <span class="telemetry-label">{{ t.systemLabel }}</span>
        <div class="telemetry-value">
          <CheckCircle2 :size="16" style="color: #22d3ee;" />
          <span>{{ telemetry?.androidVersion ? 'Android ' + telemetry.androidVersion : '—' }}</span>
        </div>
      </div>

      <!-- Destination Folder -->
      <div class="telemetry-item folder-item">
        <span class="telemetry-label">{{ t.destinationLabel }}</span>
        <div class="telemetry-value font-mono folder-value">
          <Folder :size="16" style="color: #f59e0b;" />
          <span class="folder-path">{{ destinationDir }}</span>
        </div>
      </div>

      <!-- Last Sync Time -->
      <div class="telemetry-item">
        <span class="telemetry-label">{{ t.lastSyncLabel }}</span>
        <div class="telemetry-value font-mono">
          <Clock :size="16" style="color: #94a3b8;" />
          <span>{{ formatTime(lastSyncTime) }}</span>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.device-card {
  padding: 20px 24px;
  border-radius: 14px;
  background: rgba(15, 23, 42, 0.75);
  border: 1px solid rgba(255, 255, 255, 0.08);
  box-shadow: 0 10px 30px -10px rgba(0, 0, 0, 0.5);
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.card-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  flex-wrap: wrap;
  gap: 14px;
}

.device-title-group {
  display: flex;
  align-items: center;
  gap: 14px;
}

.device-icon-wrap {
  width: 48px;
  height: 48px;
  border-radius: 12px;
  background: rgba(255, 255, 255, 0.04);
  border: 1px solid rgba(255, 255, 255, 0.1);
  display: flex;
  align-items: center;
  justify-content: center;
  color: #94a3b8;
  transition: all 0.2s ease;
}

.device-icon-wrap.online {
  background: rgba(16, 185, 129, 0.12);
  border-color: rgba(16, 185, 129, 0.4);
  color: #10b981;
  box-shadow: 0 0 15px rgba(16, 185, 129, 0.2);
}

.device-icon-wrap.warning {
  background: rgba(245, 158, 11, 0.12);
  border-color: rgba(245, 158, 11, 0.4);
  color: #f59e0b;
}

.model-row {
  display: flex;
  align-items: center;
  gap: 10px;
}

.device-model {
  margin: 0;
  font-size: 1.25rem;
  font-weight: 800;
  color: #f8fafc;
  letter-spacing: -0.01em;
}

.device-serial {
  font-size: 0.78rem;
  color: #64748b;
}

.conn-tag {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 2px 8px;
  border-radius: 4px;
  font-size: 0.68rem;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.04em;
}

.wifi-tag {
  background: rgba(34, 211, 238, 0.12);
  border: 1px solid rgba(34, 211, 238, 0.3);
  color: #22d3ee;
}

.usb-tag {
  background: rgba(168, 85, 247, 0.12);
  border: 1px solid rgba(168, 85, 247, 0.3);
  color: #c084fc;
}

.status-pill {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  padding: 6px 14px;
  border-radius: 20px;
  font-size: 0.75rem;
  font-weight: 800;
  letter-spacing: 0.06em;
  background: rgba(255, 255, 255, 0.05);
  color: #94a3b8;
  border: 1px solid rgba(255, 255, 255, 0.1);
}

.status-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: #64748b;
}

.status-pill.online {
  background: rgba(16, 185, 129, 0.12);
  color: #34d399;
  border-color: rgba(16, 185, 129, 0.35);
}

.status-pill.online .status-dot {
  background: #10b981;
  box-shadow: 0 0 8px #10b981;
}

.status-pill.unauthorized {
  background: rgba(245, 158, 11, 0.12);
  color: #fbbf24;
  border-color: rgba(245, 158, 11, 0.35);
}

.status-pill.unauthorized .status-dot {
  background: #f59e0b;
}

.status-pill.offline .status-dot {
  background: #ef4444;
}

.unauthorized-banner {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px 14px;
  border-radius: 8px;
  background: rgba(245, 158, 11, 0.1);
  border: 1px solid rgba(245, 158, 11, 0.3);
  color: #fcd34d;
  font-size: 0.82rem;
}

.telemetry-grid {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 12px;
  padding-top: 14px;
  border-top: 1px solid rgba(255, 255, 255, 0.06);
}

.telemetry-item {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.telemetry-label {
  font-size: 0.7rem;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: #64748b;
}

.telemetry-value {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 0.88rem;
  font-weight: 600;
  color: #e2e8f0;
}

.folder-path {
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  max-width: 260px;
}

.text-muted {
  color: #64748b;
}

@media (max-width: 860px) {
  .telemetry-grid {
    grid-template-columns: repeat(2, 1fr);
  }
}
</style>

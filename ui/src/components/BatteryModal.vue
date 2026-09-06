<script setup>
import { computed, watch, onMounted, onUnmounted } from 'vue';
import { useI18n } from '../locales.js';
import {
  X,
  RefreshCw,
  Battery,
  BatteryCharging,
  Zap,
  Thermometer,
  Activity,
  RotateCcw,
  Layers,
  Cpu
} from 'lucide-vue-next';

const props = defineProps({
  isOpen: { type: Boolean, default: false },
  battery: { type: Object, default: null },
  isRefreshing: { type: Boolean, default: false }
});

const emit = defineEmits(['close', 'refresh']);
const { t } = useI18n();

const level = computed(() => props.battery?.level ?? null);
const isCharging = computed(() => Boolean(props.battery?.isCharging));
const voltage = computed(() => {
  if (!props.battery?.voltageMv) return null;
  return (props.battery.voltageMv / 1000).toFixed(2);
});

const temp = computed(() => props.battery?.temperatureC ?? null);
const tempStatus = computed(() => {
  if (temp.value === null) return null;
  if (temp.value < 35) return { text: t.value.batteryTempOptimal, color: '#10b981' };
  if (temp.value < 41) return { text: t.value.batteryTempWarm, color: '#f59e0b' };
  return { text: t.value.batteryTempHot, color: '#ef4444' };
});

const healthText = computed(() => {
  const code = props.battery?.healthCode;
  if (code === 2) return t.value.healthGood;
  if (code === 3) return t.value.healthOverheat;
  if (code === 4) return t.value.healthDead;
  if (code === 5) return t.value.healthOverVoltage;
  if (code === 7) return t.value.healthCold;
  return props.battery?.healthText || t.value.healthUnknown;
});

const healthColor = computed(() => {
  const code = props.battery?.healthCode;
  if (code === 2) return '#10b981';
  if (code === 3 || code === 4 || code === 5) return '#ef4444';
  return '#22d3ee';
});

const powerSourceText = computed(() => {
  const src = props.battery?.powerSource;
  if (src === 'AC') return t.value.sourceAc;
  if (src === 'USB') return t.value.sourceUsb;
  if (src === 'Wireless') return t.value.sourceWireless;
  return t.value.sourceBattery;
});

const cyclesDisplay = computed(() => {
  if (props.battery?.cycleCount !== null && props.battery?.cycleCount !== undefined) {
    return t.value.batteryCyclesCount(props.battery.cycleCount);
  }
  return t.value.batteryCyclesUnknown;
});

// Auto-refresh telemetry when modal is opened
watch(() => props.isOpen, (isOpen) => {
  if (isOpen) {
    emit('refresh');
  }
});

// Universal ESC dismissal (Rule 6.1)
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
        <div class="header-title-group">
          <BatteryCharging v-if="isCharging" :size="20" style="color: #10b981;" />
          <Battery v-else :size="20" style="color: #22d3ee;" />
          <h3 class="modal-title">{{ t.batteryModalTitle }}</h3>
        </div>
        <div class="modal-header-actions">
          <button 
            class="modal-icon-btn" 
            :class="{ 'animate-spin': isRefreshing }"
            :disabled="isRefreshing"
            @click="emit('refresh')" 
            type="button" 
            :aria-label="t.refreshTelemetry"
          >
            <RefreshCw :size="16" />
          </button>
          <button class="modal-close-btn" @click="$emit('close')" type="button" aria-label="Zamknij">
            <X :size="18" :stroke-width="2.2" />
          </button>
        </div>
      </div>

      <div class="modal-body">
        <!-- Hero Gauge Card -->
        <div class="hero-gauge-card glass-panel">
          <div class="gauge-top-row">
            <div class="gauge-level-wrap">
              <span class="gauge-number font-mono">{{ level !== null ? level : '—' }}</span>
              <span class="gauge-percent">%</span>
            </div>
            <div class="gauge-meta-wrap">
              <span class="power-source-badge font-mono" :class="{ 'is-charging': isCharging }">
                <Zap v-if="isCharging" :size="13" class="animate-pulse" />
                <span>{{ powerSourceText }}</span>
              </span>
              <span class="gauge-status-sub">{{ isCharging ? t.charging : t.batteryLevel }}</span>
            </div>
          </div>

          <!-- Progress Bar -->
          <div class="progress-track">
            <div 
              class="progress-fill" 
              :style="{ 
                width: `${Math.min(100, Math.max(0, level || 0))}%`,
                backgroundColor: isCharging ? '#10b981' : (level < 20 ? '#ef4444' : '#22d3ee')
              }"
            ></div>
          </div>
        </div>

        <!-- Telemetry Grid -->
        <div class="metrics-grid">
          <!-- 1. Kondycja ogniwa -->
          <div class="metric-card">
            <div class="metric-header">
              <Activity :size="15" :style="{ color: healthColor }" />
              <span class="metric-label">{{ t.batteryHealth }}</span>
            </div>
            <div class="metric-value-row">
              <span class="status-dot" :style="{ backgroundColor: healthColor }"></span>
              <span class="metric-value" :style="{ color: healthColor }">{{ healthText }}</span>
            </div>
          </div>

          <!-- 2. Cykle ładowania -->
          <div class="metric-card">
            <div class="metric-header">
              <RotateCcw :size="15" style="color: #22d3ee;" />
              <span class="metric-label">{{ t.batteryCycles }}</span>
            </div>
            <div class="metric-value-row">
              <span class="metric-value font-mono">{{ cyclesDisplay }}</span>
            </div>
          </div>

          <!-- 3. Temperatura -->
          <div class="metric-card">
            <div class="metric-header">
              <Thermometer :size="15" :style="{ color: tempStatus?.color || '#f59e0b' }" />
              <span class="metric-label">{{ t.batteryTemp }}</span>
            </div>
            <div class="metric-value-row">
              <span class="metric-value font-mono" :style="{ color: tempStatus?.color || '#f8fafc' }">
                {{ temp !== null ? `${temp} °C` : '—' }}
              </span>
              <span v-if="tempStatus" class="temp-badge font-mono" :style="{ color: tempStatus.color, borderColor: tempStatus.color }">
                {{ tempStatus.text }}
              </span>
            </div>
          </div>

          <!-- 4. Napięcie ogniwa -->
          <div class="metric-card">
            <div class="metric-header">
              <Zap :size="15" style="color: #f59e0b;" />
              <span class="metric-label">{{ t.batteryVoltage }}</span>
            </div>
            <div class="metric-value-row">
              <span class="metric-value font-mono">{{ voltage ? `${voltage} V` : '—' }}</span>
              <span v-if="battery?.voltageMv" class="metric-sub-val font-mono">({{ battery.voltageMv }} mV)</span>
            </div>
          </div>

          <!-- 5. Maksymalny prąd ładowania -->
          <div class="metric-card">
            <div class="metric-header">
              <Cpu :size="15" style="color: #a855f7;" />
              <span class="metric-label">{{ t.batteryMaxCurrent }}</span>
            </div>
            <div class="metric-value-row">
              <span class="metric-value font-mono">
                {{ battery?.maxChargingCurrentMa ? `${battery.maxChargingCurrentMa} mA` : '—' }}
              </span>
            </div>
          </div>

          <!-- 6. Technologia ogniwa -->
          <div class="metric-card">
            <div class="metric-header">
              <Layers :size="15" style="color: #38bdf8;" />
              <span class="metric-label">{{ t.batteryTechnology }}</span>
            </div>
            <div class="metric-value-row">
              <span class="metric-value font-mono">{{ battery?.technology || 'Li-ion' }}</span>
            </div>
          </div>
        </div>
      </div>

      <!-- Modal Footer -->
      <div class="modal-footer">
        <button class="btn-dismiss" @click="$emit('close')" type="button">
          {{ t.btnDismiss }}
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
  -webkit-backdrop-filter: blur(12px);
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 20px;
}

.modal-card {
  width: 95vw;
  max-width: 560px;
  max-height: 90vh;
  background: rgba(15, 23, 42, 0.95);
  border: 1px solid rgba(34, 211, 238, 0.3);
  border-radius: 14px;
  box-shadow: 0 25px 60px rgba(0, 0, 0, 0.85);
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.modal-header {
  padding: 16px 24px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.08);
  display: flex;
  align-items: center;
  justify-content: space-between;
  flex-shrink: 0;
}

.header-title-group {
  display: flex;
  align-items: center;
  gap: 10px;
}

.modal-title {
  margin: 0;
  font-size: 1.1rem;
  font-weight: 800;
  color: #f8fafc;
}

.modal-header-actions {
  display: flex;
  align-items: center;
  gap: 8px;
}

.modal-icon-btn {
  width: 32px;
  height: 32px;
  border-radius: 6px;
  border: none;
  background: transparent;
  color: #94a3b8;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
  outline: none !important;
  box-shadow: none !important;
}

.modal-icon-btn:hover:not(:disabled) {
  color: #22d3ee;
  background: rgba(34, 211, 238, 0.15);
}

.modal-icon-btn:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.modal-close-btn {
  width: 32px;
  height: 32px;
  border-radius: 6px;
  border: none;
  background: transparent;
  color: #94a3b8;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
  outline: none !important;
  box-shadow: none !important;
}

.modal-close-btn:hover {
  color: #ef4444;
  background: rgba(239, 68, 68, 0.15);
}

.modal-body {
  padding: 22px 24px;
  display: flex;
  flex-direction: column;
  gap: 18px;
  flex: 1 1 auto;
  min-height: 0;
  overflow-y: auto;
}

.modal-body::-webkit-scrollbar {
  width: 6px;
}

.modal-body::-webkit-scrollbar-track {
  background: transparent;
}

.modal-body::-webkit-scrollbar-thumb {
  background: rgba(255, 255, 255, 0.15);
  border-radius: 3px;
}

.modal-body::-webkit-scrollbar-thumb:hover {
  background: rgba(34, 211, 238, 0.4);
}

/* Hero Gauge Card */
.hero-gauge-card {
  padding: 18px 20px;
  background: rgba(255, 255, 255, 0.03);
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 12px;
  display: flex;
  flex-direction: column;
  gap: 14px;
}

.gauge-top-row {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
}

.gauge-level-wrap {
  display: flex;
  align-items: baseline;
  gap: 2px;
}

.gauge-number {
  font-size: 2.8rem;
  font-weight: 900;
  color: #f8fafc;
  line-height: 1;
}

.gauge-percent {
  font-size: 1.3rem;
  font-weight: 700;
  color: #94a3b8;
}

.gauge-meta-wrap {
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  gap: 4px;
}

.power-source-badge {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 4px 10px;
  border-radius: 20px;
  background: rgba(255, 255, 255, 0.08);
  border: 1px solid rgba(255, 255, 255, 0.12);
  color: #cbd5e1;
  font-size: 0.75rem;
  font-weight: 700;
}

.power-source-badge.is-charging {
  background: rgba(16, 185, 129, 0.15);
  border-color: rgba(16, 185, 129, 0.35);
  color: #34d399;
}

.gauge-status-sub {
  font-size: 0.78rem;
  color: #64748b;
}

.progress-track {
  width: 100%;
  height: 8px;
  background: rgba(255, 255, 255, 0.08);
  border-radius: 4px;
  overflow: hidden;
}

.progress-fill {
  height: 100%;
  border-radius: 4px;
  transition: width 0.4s cubic-bezier(0.4, 0, 0.2, 1);
  box-shadow: 0 0 10px currentColor;
}

/* Metrics Grid */
.metrics-grid {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 12px;
}

.metric-card {
  padding: 12px 14px;
  background: rgba(255, 255, 255, 0.02);
  border: 1px solid rgba(255, 255, 255, 0.06);
  border-radius: 10px;
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.metric-header {
  display: flex;
  align-items: center;
  gap: 6px;
}

.metric-label {
  font-size: 0.72rem;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  color: #64748b;
}

.metric-value-row {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}

.status-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  box-shadow: 0 0 6px currentColor;
}

.metric-value {
  font-size: 0.95rem;
  font-weight: 800;
  color: #f8fafc;
}

.metric-sub-val {
  font-size: 0.75rem;
  color: #64748b;
}

.temp-badge {
  font-size: 0.65rem;
  font-weight: 700;
  padding: 1px 6px;
  border-radius: 10px;
  border: 1px solid;
}

/* Modal Footer */
.modal-footer {
  padding: 14px 24px;
  border-top: 1px solid rgba(255, 255, 255, 0.08);
  display: flex;
  justify-content: flex-end;
}

.btn-dismiss {
  padding: 8px 18px;
  border-radius: 8px;
  background: rgba(255, 255, 255, 0.08);
  border: 1px solid rgba(255, 255, 255, 0.15);
  color: #f8fafc;
  font-size: 0.82rem;
  font-weight: 700;
  cursor: pointer;
  transition: all 0.2s ease;
}

.btn-dismiss:hover {
  background: rgba(255, 255, 255, 0.15);
}

/* Light Theme Overrides */
[data-theme="light"] .modal-card {
  background: #ffffff !important;
  border-color: rgba(15, 23, 42, 0.12) !important;
  box-shadow: 0 25px 60px rgba(0, 0, 0, 0.18) !important;
}

[data-theme="light"] .modal-title {
  color: #0f172a !important;
}

[data-theme="light"] .hero-gauge-card {
  background: rgba(15, 23, 42, 0.03) !important;
  border-color: rgba(15, 23, 42, 0.08) !important;
}

[data-theme="light"] .gauge-number {
  color: #0f172a !important;
}

[data-theme="light"] .metric-card {
  background: rgba(15, 23, 42, 0.02) !important;
  border-color: rgba(15, 23, 42, 0.08) !important;
}

[data-theme="light"] .metric-value {
  color: #0f172a !important;
}

[data-theme="light"] .btn-dismiss {
  background: rgba(15, 23, 42, 0.06) !important;
  border-color: rgba(15, 23, 42, 0.12) !important;
  color: #0f172a !important;
}

@media (max-width: 520px) {
  .metrics-grid {
    grid-template-columns: 1fr;
  }
}
</style>

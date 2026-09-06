<script setup>
import { computed, watch, onMounted, onUnmounted } from 'vue';
import { useI18n } from '../locales.js';
import {
  X,
  RefreshCw,
  Smartphone,
  Cpu,
  ShieldCheck,
  HardDrive,
  Monitor,
  Terminal,
  Clock,
  Layers,
  Info
} from 'lucide-vue-next';

const props = defineProps({
  isOpen: { type: Boolean, default: false },
  system: { type: Object, default: null },
  isRefreshing: { type: Boolean, default: false }
});

const emit = defineEmits(['close', 'refresh']);
const { t } = useI18n();

const model = computed(() => props.system?.model || 'Android Device');
const androidVer = computed(() => props.system?.androidVersion || '—');
const secPatch = computed(() => props.system?.securityPatch || '—');
const soc = computed(() => props.system?.soc || 'ARM Architecture');
const cpuAbi = computed(() => props.system?.cpuAbi || '—');
const displayInfo = computed(() => {
  const res = props.system?.screenResolution;
  const dens = props.system?.screenDensity;
  if (res && dens) return `${res} px @ ${dens}`;
  if (res) return `${res} px`;
  return '—';
});

const storage = computed(() => props.system?.storage || null);
const storagePercent = computed(() => {
  if (!storage.value?.percent) return 0;
  return parseInt(storage.value.percent.replace('%', ''), 10) || 0;
});

const uptime = computed(() => props.system?.uptime || '—');
const kernel = computed(() => props.system?.kernel || '—');
const sdk = computed(() => props.system?.sdkLevel || '—');

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
          <Smartphone :size="20" style="color: #22d3ee;" />
          <h3 class="modal-title">{{ t.systemModalTitle }}</h3>
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
        <!-- Hero System Card -->
        <div class="hero-sys-card glass-panel">
          <div class="hero-sys-top">
            <div class="hero-sys-title-wrap">
              <span class="hero-brand">{{ props.system?.brand || 'Google' }}</span>
              <h4 class="hero-model">{{ model }}</h4>
            </div>
            <div class="os-pill font-mono">
              <span class="os-dot"></span>
              <span>Android {{ androidVer }}</span>
            </div>
          </div>

          <div class="hero-patch-row">
            <div class="patch-item">
              <ShieldCheck :size="14" style="color: #10b981;" />
              <span class="patch-label">{{ t.sysSecurityPatch }}:</span>
              <span class="patch-val font-mono">{{ secPatch }}</span>
            </div>
            <div v-if="sdk !== '—'" class="patch-item">
              <span class="patch-label">{{ t.sysSdkLevel }}:</span>
              <span class="patch-val font-mono">API {{ sdk }}</span>
            </div>
          </div>
        </div>

        <!-- Specs Grid -->
        <div class="specs-grid">
          <!-- 1. Procesor / SoC -->
          <div class="spec-card">
            <div class="spec-header">
              <Cpu :size="15" style="color: #22d3ee;" />
              <span class="spec-label">{{ t.sysSoc }}</span>
            </div>
            <div class="spec-val-box">
              <span class="spec-val">{{ soc }}</span>
              <span class="spec-sub font-mono">{{ cpuAbi }}</span>
            </div>
          </div>

          <!-- 2. Ekran / Wyświetlacz -->
          <div class="spec-card">
            <div class="spec-header">
              <Monitor :size="15" style="color: #c084fc;" />
              <span class="spec-label">{{ t.sysDisplay }}</span>
            </div>
            <div class="spec-val-box">
              <span class="spec-val font-mono">{{ displayInfo }}</span>
            </div>
          </div>

          <!-- 3. Pamięć wewnętrzna -->
          <div class="spec-card span-2" v-if="storage?.total">
            <div class="spec-header" style="justify-content: space-between;">
              <div style="display: flex; align-items: center; gap: 6px;">
                <HardDrive :size="15" style="color: #f59e0b;" />
                <span class="spec-label">{{ t.sysStorage }}</span>
              </div>
              <span class="storage-text font-mono">
                {{ t.sysStorageUsed(storage.used, storage.total, storage.percent) }}
              </span>
            </div>
            <div class="storage-track">
              <div 
                class="storage-fill" 
                :style="{ width: `${storagePercent}%` }"
              ></div>
            </div>
          </div>

          <!-- 4. Wersja Kernela -->
          <div class="spec-card">
            <div class="spec-header">
              <Terminal :size="15" style="color: #38bdf8;" />
              <span class="spec-label">{{ t.sysKernel }}</span>
            </div>
            <div class="spec-val-box">
              <span class="spec-val font-mono kernel-text">{{ kernel }}</span>
            </div>
          </div>

          <!-- 5. Uptime telefonu -->
          <div class="spec-card">
            <div class="spec-header">
              <Clock :size="15" style="color: #10b981;" />
              <span class="spec-label">{{ t.sysUptime }}</span>
            </div>
            <div class="spec-val-box">
              <span class="spec-val font-mono">{{ uptime }}</span>
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
  max-width: 580px;
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

/* Hero Sys Card */
.hero-sys-card {
  padding: 18px 20px;
  background: rgba(255, 255, 255, 0.03);
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 12px;
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.hero-sys-top {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.hero-brand {
  font-size: 0.72rem;
  font-weight: 800;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  color: #64748b;
}

.hero-model {
  margin: 2px 0 0 0;
  font-size: 1.3rem;
  font-weight: 900;
  color: #f8fafc;
}

.os-pill {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  padding: 4px 12px;
  border-radius: 20px;
  background: rgba(34, 211, 238, 0.15);
  border: 1px solid rgba(34, 211, 238, 0.35);
  color: #22d3ee;
  font-size: 0.8rem;
  font-weight: 700;
}

.os-dot {
  width: 7px;
  height: 7px;
  border-radius: 50%;
  background: #22d3ee;
  box-shadow: 0 0 8px #22d3ee;
}

.hero-patch-row {
  display: flex;
  align-items: center;
  gap: 16px;
  padding-top: 10px;
  border-top: 1px solid rgba(255, 255, 255, 0.06);
}

.patch-item {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 0.78rem;
}

.patch-label {
  color: #94a3b8;
}

.patch-val {
  color: #f8fafc;
  font-weight: 700;
}

/* Specs Grid */
.specs-grid {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 12px;
}

.spec-card {
  padding: 12px 14px;
  background: rgba(255, 255, 255, 0.02);
  border: 1px solid rgba(255, 255, 255, 0.06);
  border-radius: 10px;
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.spec-card.span-2 {
  grid-column: span 2;
}

.spec-header {
  display: flex;
  align-items: center;
  gap: 6px;
}

.spec-label {
  font-size: 0.72rem;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  color: #64748b;
}

.spec-val-box {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.spec-val {
  font-size: 0.92rem;
  font-weight: 800;
  color: #f8fafc;
}

.spec-sub {
  font-size: 0.72rem;
  color: #64748b;
}

.kernel-text {
  font-size: 0.78rem !important;
  word-break: break-all;
}

.storage-text {
  font-size: 0.78rem;
  color: #cbd5e1;
  font-weight: 600;
}

.storage-track {
  width: 100%;
  height: 6px;
  background: rgba(255, 255, 255, 0.08);
  border-radius: 3px;
  overflow: hidden;
  margin-top: 4px;
}

.storage-fill {
  height: 100%;
  border-radius: 3px;
  background: #f59e0b;
  transition: width 0.3s ease;
}

/* Modal Footer */
.modal-footer {
  padding: 14px 24px;
  border-top: 1px solid rgba(255, 255, 255, 0.08);
  display: flex;
  justify-content: flex-end;
  flex-shrink: 0;
  background: rgba(10, 16, 30, 0.5);
  backdrop-filter: blur(8px);
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

[data-theme="light"] .hero-sys-card {
  background: rgba(15, 23, 42, 0.03) !important;
  border-color: rgba(15, 23, 42, 0.08) !important;
}

[data-theme="light"] .hero-model {
  color: #0f172a !important;
}

[data-theme="light"] .patch-val {
  color: #0f172a !important;
}

[data-theme="light"] .spec-card {
  background: rgba(15, 23, 42, 0.02) !important;
  border-color: rgba(15, 23, 42, 0.08) !important;
}

[data-theme="light"] .spec-val {
  color: #0f172a !important;
}

[data-theme="light"] .storage-text {
  color: #334155 !important;
}

[data-theme="light"] .btn-dismiss {
  background: rgba(15, 23, 42, 0.06) !important;
  border-color: rgba(15, 23, 42, 0.12) !important;
  color: #0f172a !important;
}

@media (max-width: 520px) {
  .specs-grid {
    grid-template-columns: 1fr;
  }
  .spec-card.span-2 {
    grid-column: span 1;
  }
}
</style>

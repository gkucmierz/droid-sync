<script setup>
import { onMounted, onUnmounted } from 'vue';
import { useI18n } from '../locales.js';
import { AlertTriangle, Trash2, ShieldCheck, X, Loader2 } from 'lucide-vue-next';

const props = defineProps({
  isOpen: {
    type: Boolean,
    default: false
  },
  title: {
    type: String,
    default: ''
  },
  description: {
    type: String,
    default: ''
  },
  targetName: {
    type: String,
    default: ''
  },
  safeNotice: {
    type: String,
    default: ''
  },
  confirmText: {
    type: String,
    default: ''
  },
  cancelText: {
    type: String,
    default: ''
  },
  isDanger: {
    type: Boolean,
    default: true
  },
  isLoading: {
    type: Boolean,
    default: false
  }
});

const emit = defineEmits(['confirm', 'close']);
const { t } = useI18n();

// Universal ESC dismissal with stack-based stopPropagation (Rule 6.1)
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
    <div class="modal-card glass-panel" :class="{ 'danger-glow': isDanger }" @click.stop>
      <!-- Modal Header -->
      <div class="modal-header">
        <div class="modal-title-group">
          <div class="icon-badge" :class="isDanger ? 'badge-danger' : 'badge-warning'">
            <Trash2 v-if="isDanger" :size="18" />
            <AlertTriangle v-else :size="18" />
          </div>
          <h3 class="modal-title">{{ title || t.confirmDeleteModalTitle }}</h3>
        </div>
        <button 
          class="modal-close-btn" 
          @click="$emit('close')" 
          type="button" 
          aria-label="Zamknij"
        >
          <X :size="18" :stroke-width="2.2" />
        </button>
      </div>

      <!-- Modal Body -->
      <div class="modal-body">
        <p class="modal-desc">{{ description || t.confirmDeleteModalDesc }}</p>

        <!-- Filename / Target identifier badge -->
        <div v-if="targetName" class="target-card font-mono">
          <span class="target-name">{{ targetName }}</span>
        </div>

        <!-- Safe Notice: Explains that local Mac copy remains untouched -->
        <div v-if="safeNotice" class="safe-notice-card">
          <ShieldCheck :size="18" class="shield-icon" />
          <span class="safe-notice-text">{{ safeNotice }}</span>
        </div>
      </div>

      <!-- Modal Footer Actions -->
      <div class="modal-footer">
        <button 
          class="btn-secondary" 
          @click="$emit('close')" 
          type="button"
          :disabled="isLoading"
        >
          {{ cancelText || t.btnCancel }}
        </button>
        <button 
          class="btn-danger-confirm" 
          :class="{ 'btn-loading': isLoading }"
          @click="$emit('confirm')" 
          type="button"
          :disabled="isLoading"
        >
          <Loader2 v-if="isLoading" :size="16" class="animate-spin" />
          <Trash2 v-else :size="16" />
          <span>{{ confirmText || t.confirmDeleteModalConfirmBtn }}</span>
        </button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.modal-overlay {
  position: fixed;
  inset: 0;
  z-index: 10001; /* Above standard preview lightboxes and settings modals */
  background: rgba(3, 7, 18, 0.85);
  backdrop-filter: blur(12px);
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 20px;
}

.modal-card {
  width: 95vw;
  max-width: 480px;
  background: rgba(15, 23, 42, 0.96);
  border: 1px solid rgba(239, 68, 68, 0.35);
  border-radius: 14px;
  display: flex;
  flex-direction: column;
  box-shadow: 0 25px 60px rgba(0, 0, 0, 0.85), 0 0 30px rgba(239, 68, 68, 0.15);
  animation: modalPopIn 0.2s cubic-bezier(0.16, 1, 0.3, 1);
  overflow: hidden;
}

@keyframes modalPopIn {
  from {
    opacity: 0;
    transform: scale(0.95) translateY(8px);
  }
  to {
    opacity: 1;
    transform: scale(1) translateY(0);
  }
}

.modal-header {
  padding: 18px 22px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.08);
  display: flex;
  align-items: center;
  justify-content: space-between;
  flex-shrink: 0;
}

.modal-title-group {
  display: flex;
  align-items: center;
  gap: 12px;
}

.icon-badge {
  width: 36px;
  height: 36px;
  border-radius: 8px;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}

.badge-danger {
  background: rgba(239, 68, 68, 0.15);
  color: #ef4444;
  border: 1px solid rgba(239, 68, 68, 0.3);
  box-shadow: 0 0 12px rgba(239, 68, 68, 0.2);
}

.badge-warning {
  background: rgba(245, 158, 11, 0.15);
  color: #f59e0b;
  border: 1px solid rgba(245, 158, 11, 0.3);
  box-shadow: 0 0 12px rgba(245, 158, 11, 0.2);
}

.modal-title {
  margin: 0;
  font-size: 1.05rem;
  font-weight: 800;
  color: #f8fafc;
  letter-spacing: -0.01em;
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

.modal-body {
  padding: 22px;
  display: flex;
  flex-direction: column;
  gap: 16px;
  flex: 1 1 auto;
  min-height: 0;
  overflow-y: auto;
}

.modal-desc {
  margin: 0;
  font-size: 0.92rem;
  color: #cbd5e1;
  line-height: 1.5;
}

.target-card {
  padding: 10px 14px;
  background: rgba(0, 0, 0, 0.45);
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 8px;
  display: flex;
  align-items: center;
  overflow: hidden;
}

.target-name {
  color: #38bdf8;
  font-size: 0.82rem;
  word-break: break-all;
  white-space: pre-wrap;
}

.safe-notice-card {
  display: flex;
  align-items: flex-start;
  gap: 10px;
  background: rgba(16, 185, 129, 0.08);
  border: 1px solid rgba(16, 185, 129, 0.25);
  border-radius: 8px;
  padding: 10px 12px;
}

.shield-icon {
  color: #10b981;
  flex-shrink: 0;
  margin-top: 1px;
}

.safe-notice-text {
  font-size: 0.8rem;
  color: #a7f3d0;
  line-height: 1.4;
}

.modal-footer {
  padding: 16px 22px;
  background: rgba(0, 0, 0, 0.25);
  border-top: 1px solid rgba(255, 255, 255, 0.08);
  display: flex;
  justify-content: flex-end;
  gap: 12px;
  flex-shrink: 0;
}

.btn-secondary {
  padding: 8px 16px;
  border-radius: 8px;
  background: rgba(255, 255, 255, 0.05);
  border: 1px solid rgba(255, 255, 255, 0.12);
  color: #cbd5e1;
  font-size: 0.85rem;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.2s;
  outline: none;
}

.btn-secondary:hover:not(:disabled) {
  background: rgba(255, 255, 255, 0.1);
  color: #f8fafc;
}

.btn-danger-confirm {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  padding: 8px 18px;
  border-radius: 8px;
  background: linear-gradient(135deg, #ef4444, #dc2626);
  border: 1px solid rgba(239, 68, 68, 0.6);
  color: #ffffff;
  font-size: 0.85rem;
  font-weight: 700;
  cursor: pointer;
  transition: all 0.2s;
  box-shadow: 0 4px 14px rgba(239, 68, 68, 0.35);
  outline: none;
}

.btn-danger-confirm:hover:not(:disabled) {
  background: linear-gradient(135deg, #dc2626, #b91c1c);
  box-shadow: 0 6px 20px rgba(239, 68, 68, 0.5);
  transform: translateY(-1px);
}

.btn-danger-confirm:active:not(:disabled) {
  transform: translateY(0);
}

.btn-danger-confirm:disabled,
.btn-secondary:disabled {
  opacity: 0.5;
  cursor: not-allowed;
  transform: none;
}
</style>

<script setup>
import { ref, computed } from 'vue';
import { useI18n } from '../locales.js';
import {
  Server,
  AlertTriangle,
  Copy,
  Check,
  Terminal,
  ExternalLink,
  Radio
} from 'lucide-vue-next';

const { t } = useI18n();

const activeTab = ref('github'); // 'github' | 'gitea' | 'cloned'
const isCopied = ref(false);

const commands = {
  github: `git clone git@github.com:gkucmierz/droid-sync.git\ncd droid-sync\nnpm install\nnpm run server`,
  gitea: `git clone git@gitea.7u.pl:gkucmierz/droid-sync.git\ncd droid-sync\nnpm install\nnpm run server`,
  cloned: `cd droid-sync\nnpm run server`
};

const currentCommand = computed(() => commands[activeTab.value] || commands.github);

const copyCommand = async () => {
  try {
    await navigator.clipboard.writeText(currentCommand.value);
    isCopied.value = true;
    setTimeout(() => {
      isCopied.value = false;
    }, 2000);
  } catch (err) {
    console.error('Failed to copy command:', err);
  }
};

const isHttps = computed(() => {
  return typeof window !== 'undefined' && window.location.protocol === 'https:';
});

const httpUrl = computed(() => {
  if (typeof window === 'undefined') return '';
  return `http://${window.location.host}${window.location.pathname}`;
});
</script>

<template>
  <div class="runner-offline-card glass-panel animate-fade-in">
    <div class="card-top-row">
      <div class="alert-icon-wrap">
        <Server :size="22" class="alert-icon" />
      </div>
      <div class="header-text-wrap">
        <div class="title-with-pulse">
          <h3 class="offline-title">{{ t.offlineTitle }}</h3>
          <div class="radar-beacon">
            <span class="pulse-ring"></span>
            <span class="beacon-dot"></span>
          </div>
        </div>
        <p class="offline-desc">{{ t.offlineDesc }}</p>
      </div>
    </div>

    <!-- Live Scanner Notice -->
    <div class="scanner-notice">
      <Radio :size="14" class="scanner-icon animate-pulse" />
      <span>{{ t.offlineListeningNotice }}</span>
    </div>

    <!-- Setup Guide with Tabs -->
    <div class="setup-container">
      <div class="setup-header">
        <div style="display: flex; align-items: center; gap: 8px;">
          <Terminal :size="16" style="color: #22d3ee;" />
          <span class="setup-label">{{ t.offlineCloneTitle }}</span>
        </div>

        <div class="tabs-group">
          <button 
            class="tab-btn" 
            :class="{ active: activeTab === 'github' }" 
            @click="activeTab = 'github'"
            type="button"
          >
            {{ t.tabGithub }}
          </button>
          <button 
            class="tab-btn" 
            :class="{ active: activeTab === 'gitea' }" 
            @click="activeTab = 'gitea'"
            type="button"
          >
            {{ t.tabGitea }}
          </button>
          <button 
            class="tab-btn" 
            :class="{ active: activeTab === 'cloned' }" 
            @click="activeTab = 'cloned'"
            type="button"
          >
            {{ t.tabAlreadyCloned }}
          </button>
        </div>
      </div>

      <!-- Code Box -->
      <div class="code-box font-mono">
        <pre><code>{{ currentCommand }}</code></pre>
        <button class="btn-copy-code" @click="copyCommand" type="button">
          <component :is="isCopied ? Check : Copy" :size="14" />
          <span>{{ isCopied ? t.copiedCmd : t.btnCopyCmd }}</span>
        </button>
      </div>
    </div>

    <!-- HTTPS Mixed Content Advice (if loaded over HTTPS) -->
    <div v-if="isHttps" class="https-notice">
      <AlertTriangle :size="15" style="color: #f59e0b; flex-shrink: 0;" />
      <div style="flex: 1;">
        <span>{{ t.offlineHttpsNotice }}</span>
        <a :href="httpUrl" class="http-link">
          <span>{{ t.openHttpBtn }}</span>
          <ExternalLink :size="12" />
        </a>
      </div>
    </div>
  </div>
</template>

<style scoped>
.runner-offline-card {
  padding: 20px 24px;
  border-radius: 14px;
  background: rgba(15, 23, 42, 0.85);
  border: 1px solid rgba(245, 158, 11, 0.35);
  box-shadow: 0 10px 30px -10px rgba(0, 0, 0, 0.6);
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.card-top-row {
  display: flex;
  align-items: flex-start;
  gap: 16px;
}

.alert-icon-wrap {
  width: 44px;
  height: 44px;
  border-radius: 10px;
  background: rgba(245, 158, 11, 0.15);
  border: 1px solid rgba(245, 158, 11, 0.4);
  color: #f59e0b;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}

.header-text-wrap {
  flex: 1;
}

.title-with-pulse {
  display: flex;
  align-items: center;
  gap: 12px;
}

.offline-title {
  margin: 0;
  font-size: 1.15rem;
  font-weight: 800;
  color: #f8fafc;
}

.radar-beacon {
  position: relative;
  width: 10px;
  height: 10px;
  display: flex;
  align-items: center;
  justify-content: center;
}

.beacon-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: #f59e0b;
}

.pulse-ring {
  position: absolute;
  width: 18px;
  height: 18px;
  border-radius: 50%;
  border: 2px solid rgba(245, 158, 11, 0.6);
  animation: radar-ping 2s cubic-bezier(0, 0, 0.2, 1) infinite;
}

@keyframes radar-ping {
  0% {
    transform: scale(0.8);
    opacity: 1;
  }
  100% {
    transform: scale(2.2);
    opacity: 0;
  }
}

.offline-desc {
  margin: 4px 0 0 0;
  font-size: 0.85rem;
  line-height: 1.5;
  color: #94a3b8;
}

.scanner-notice {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 14px;
  border-radius: 8px;
  background: rgba(34, 211, 238, 0.08);
  border: 1px solid rgba(34, 211, 238, 0.2);
  color: #22d3ee;
  font-size: 0.8rem;
  font-weight: 600;
}

.scanner-icon {
  color: #22d3ee;
}

/* Setup Container */
.setup-container {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.setup-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  flex-wrap: wrap;
  gap: 10px;
}

.setup-label {
  font-size: 0.85rem;
  font-weight: 700;
  color: #cbd5e1;
}

.tabs-group {
  display: inline-flex;
  background: rgba(0, 0, 0, 0.4);
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 6px;
  overflow: hidden;
}

.tab-btn {
  background: transparent;
  border: none;
  padding: 5px 12px;
  color: #64748b;
  font-size: 0.75rem;
  font-weight: 700;
  cursor: pointer;
  transition: all 0.2s;
}

.tab-btn.active {
  background: rgba(34, 211, 238, 0.2);
  color: #22d3ee;
}

.tab-btn:hover:not(.active) {
  color: #e2e8f0;
}

/* Code Box */
.code-box {
  position: relative;
  padding: 14px 18px;
  background: #090d16;
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 8px;
  overflow-x: auto;
}

.code-box pre {
  margin: 0;
  font-size: 0.82rem;
  line-height: 1.6;
  color: #38bdf8;
}

.btn-copy-code {
  position: absolute;
  top: 10px;
  right: 10px;
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 5px 10px;
  border-radius: 6px;
  background: rgba(255, 255, 255, 0.08);
  border: 1px solid rgba(255, 255, 255, 0.15);
  color: #cbd5e1;
  font-size: 0.72rem;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.2s;
}

.btn-copy-code:hover {
  background: #22d3ee;
  color: #090d16;
  border-color: #22d3ee;
}

/* HTTPS Notice */
.https-notice {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 8px 14px;
  border-radius: 8px;
  background: rgba(245, 158, 11, 0.08);
  border: 1px solid rgba(245, 158, 11, 0.2);
  font-size: 0.78rem;
  color: #fbbf24;
}

.http-link {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  margin-left: 8px;
  color: #22d3ee;
  text-decoration: underline;
  font-weight: 700;
}

.http-link:hover {
  color: #67e8f9;
}
</style>

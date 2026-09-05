<script setup>
import { ref, computed, onMounted, onUnmounted } from 'vue';
import { useI18n } from '../locales.js';
import {
  Copy,
  Download,
  Maximize2,
  Image as ImageIcon,
  Calendar,
  HardDrive,
  Search,
  X,
  Sparkles
} from 'lucide-vue-next';

const props = defineProps({
  screenshots: { type: Array, default: () => [] },
  apiBaseUrl: { type: String, default: '' }
});

const emit = defineEmits(['copy-clipboard']);

const { currentLang, t } = useI18n();

const searchQuery = ref('');
const selectedImage = ref(null);

const filteredScreenshots = computed(() => {
  if (!searchQuery.value.trim()) return props.screenshots;
  const q = searchQuery.value.toLowerCase().trim();
  return props.screenshots.filter(s => s.filename.toLowerCase().includes(q));
});

const formatSize = (bytes) => {
  if (!bytes) return '0 B';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
};

const formatDate = (isoString) => {
  if (!isoString) return '';
  const d = new Date(isoString);
  const locale = currentLang.value === 'pl' ? 'pl-PL' : 'en-US';
  return d.toLocaleDateString(locale, {
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit'
  });
};

const getFullUrl = (relativeUrl) => {
  if (!relativeUrl) return '';
  if (relativeUrl.startsWith('http')) return relativeUrl;
  return `${props.apiBaseUrl}${relativeUrl}`;
};

const copyImage = (img) => {
  emit('copy-clipboard', img.url);
};

// Universal ESC dismissal for image preview (Rule 6.1)
const handleKeydown = (e) => {
  if (e.key === 'Escape' && selectedImage.value) {
    e.stopPropagation();
    selectedImage.value = null;
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
  <div class="gallery-container">
    <!-- Gallery Top Controls -->
    <div class="gallery-toolbar glass-panel">
      <div class="toolbar-title-group">
        <div style="display: flex; align-items: center; gap: 10px;">
          <ImageIcon :size="20" style="color: #22d3ee;" />
          <h3 class="gallery-title">{{ t.galleryTitle }}</h3>
        </div>
        <span class="count-badge font-mono">{{ t.screenshotsCount(screenshots.length) }}</span>
      </div>

      <!-- Search filter -->
      <div class="search-box">
        <Search :size="15" class="search-icon" />
        <input 
          v-model="searchQuery" 
          type="text" 
          :placeholder="t.searchPlaceholder" 
          class="search-input"
        />
        <button v-if="searchQuery" class="clear-btn" @click="searchQuery = ''" type="button">
          <X :size="13" />
        </button>
      </div>
    </div>

    <!-- Screenshots Grid -->
    <div v-if="filteredScreenshots.length > 0" class="screenshots-grid">
      <div 
        v-for="img in filteredScreenshots" 
        :key="img.filename" 
        class="screenshot-card glass-panel"
      >
        <!-- Thumbnail Wrap -->
        <div class="thumb-wrap" @click="selectedImage = img">
          <img :src="getFullUrl(img.url)" :alt="img.filename" class="thumb-img" loading="lazy" />
          <div class="thumb-overlay">
            <button class="overlay-action-btn" @click.stop="selectedImage = img" type="button">
              <Maximize2 :size="16" />
            </button>
            <button class="overlay-action-btn" @click.stop="copyImage(img)" type="button">
              <Copy :size="16" />
            </button>
            <a :href="getFullUrl(img.url)" :download="img.filename" class="overlay-action-btn" @click.stop>
              <Download :size="16" />
            </a>
          </div>
        </div>

        <!-- Meta Footer -->
        <div class="card-meta">
          <span class="file-name">{{ img.filename }}</span>
          <div class="file-details font-mono">
            <span class="detail-badge">
              <Calendar :size="12" />
              {{ formatDate(img.mtime) }}
            </span>
            <span class="detail-badge">
              <HardDrive :size="12" />
              {{ formatSize(img.sizeBytes) }}
            </span>
          </div>
        </div>
      </div>
    </div>

    <!-- Empty State -->
    <div v-else class="empty-gallery glass-panel">
      <div class="empty-icon-wrap">
        <Sparkles :size="32" style="color: #22d3ee;" />
      </div>
      <h4 class="empty-title">{{ t.emptyTitle }}</h4>
      <p class="empty-desc">{{ t.emptyDesc }}</p>
    </div>

    <!-- Fullscreen Image Modal (Universal ESC Dismissal - Rule 6.1) -->
    <div 
      v-if="selectedImage" 
      class="preview-overlay animate-fade-in"
      @click="selectedImage = null"
    >
      <div class="preview-modal glass-panel" @click.stop>
        <div class="preview-header">
          <span class="preview-filename font-mono">{{ selectedImage.filename }}</span>
          <div style="display: flex; gap: 8px;">
            <button class="header-action-btn" @click="copyImage(selectedImage)" type="button">
              <Copy :size="15" />
              <span>{{ t.modalCopy }}</span>
            </button>
            <a :href="getFullUrl(selectedImage.url)" :download="selectedImage.filename" class="header-action-btn">
              <Download :size="15" />
              <span>{{ t.modalDownload }}</span>
            </a>
            <button class="close-btn" @click="selectedImage = null" type="button" aria-label="Zamknij">
              <X :size="18" :stroke-width="2.2" />
            </button>
          </div>
        </div>

        <div class="preview-img-wrap">
          <img :src="getFullUrl(selectedImage.url)" class="preview-img" />
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.gallery-container {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.gallery-toolbar {
  padding: 14px 20px;
  border-radius: 12px;
  background: rgba(15, 23, 42, 0.6);
  border: 1px solid rgba(255, 255, 255, 0.08);
  display: flex;
  align-items: center;
  justify-content: space-between;
  flex-wrap: wrap;
  gap: 14px;
}

.toolbar-title-group {
  display: flex;
  align-items: center;
  gap: 12px;
}

.gallery-title {
  margin: 0;
  font-size: 1.1rem;
  font-weight: 800;
  color: #f8fafc;
}

.count-badge {
  font-size: 0.72rem;
  font-weight: 700;
  padding: 2px 8px;
  border-radius: 12px;
  background: rgba(34, 211, 238, 0.12);
  color: #22d3ee;
  border: 1px solid rgba(34, 211, 238, 0.3);
}

.search-box {
  position: relative;
  min-width: 240px;
  display: flex;
  align-items: center;
}

.search-icon {
  position: absolute;
  left: 10px;
  color: #64748b;
  pointer-events: none;
}

.search-input {
  width: 100%;
  padding: 6px 32px 6px 32px;
  background: rgba(0, 0, 0, 0.35);
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 6px;
  color: #f8fafc;
  font-size: 0.8rem;
  transition: all 0.2s;
}

.search-input:focus {
  border-color: rgba(34, 211, 238, 0.5);
  box-shadow: 0 0 10px rgba(34, 211, 238, 0.2);
}

.clear-btn {
  position: absolute;
  right: 8px;
  background: none;
  border: none;
  color: #64748b;
  cursor: pointer;
}

.screenshots-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(240px, 1fr));
  gap: 16px;
}

.screenshot-card {
  border-radius: 12px;
  background: rgba(15, 23, 42, 0.65);
  border: 1px solid rgba(255, 255, 255, 0.07);
  overflow: hidden;
  transition: all 0.2s ease;
  display: flex;
  flex-direction: column;
}

.screenshot-card:hover {
  transform: translateY(-3px);
  border-color: rgba(34, 211, 238, 0.35);
  box-shadow: 0 12px 25px -5px rgba(0, 0, 0, 0.6), 0 0 15px rgba(34, 211, 238, 0.1);
}

.thumb-wrap {
  position: relative;
  width: 100%;
  height: 280px;
  background: rgba(0, 0, 0, 0.5);
  overflow: hidden;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
}

.thumb-img {
  width: 100%;
  height: 100%;
  object-fit: contain;
  transition: transform 0.25s ease;
}

.thumb-wrap:hover .thumb-img {
  transform: scale(1.03);
}

.thumb-overlay {
  position: absolute;
  inset: 0;
  background: rgba(15, 23, 42, 0.6);
  backdrop-filter: blur(4px);
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 12px;
  opacity: 0;
  transition: opacity 0.2s ease;
}

.thumb-wrap:hover .thumb-overlay {
  opacity: 1;
}

.overlay-action-btn {
  width: 40px;
  height: 40px;
  border-radius: 50%;
  background: rgba(255, 255, 255, 0.1);
  border: 1px solid rgba(255, 255, 255, 0.2);
  color: #f8fafc;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  transition: all 0.2s;
  text-decoration: none;
}

.overlay-action-btn:hover {
  background: rgba(34, 211, 238, 0.25);
  border-color: #22d3ee;
  color: #22d3ee;
  transform: scale(1.1);
}

.card-meta {
  padding: 12px 14px;
  display: flex;
  flex-direction: column;
  gap: 6px;
  background: rgba(15, 23, 42, 0.85);
  border-top: 1px solid rgba(255, 255, 255, 0.05);
}

.file-name {
  font-size: 0.82rem;
  font-weight: 700;
  color: #e2e8f0;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.file-details {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}

.detail-badge {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  font-size: 0.68rem;
  color: #94a3b8;
}

.empty-gallery {
  padding: 60px 20px;
  text-align: center;
  border-radius: 14px;
  background: rgba(15, 23, 42, 0.5);
  border: 1px dashed rgba(255, 255, 255, 0.1);
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 12px;
}

.empty-icon-wrap {
  width: 64px;
  height: 64px;
  border-radius: 50%;
  background: rgba(34, 211, 238, 0.1);
  border: 1px solid rgba(34, 211, 238, 0.25);
  display: flex;
  align-items: center;
  justify-content: center;
}

.empty-title {
  margin: 0;
  font-size: 1.15rem;
  font-weight: 800;
  color: #f8fafc;
}

.empty-desc {
  max-width: 440px;
  font-size: 0.85rem;
  color: #94a3b8;
  line-height: 1.5;
}

/* Fullscreen Preview Modal */
.preview-overlay {
  position: fixed;
  inset: 0;
  z-index: 9999;
  background: rgba(3, 7, 18, 0.88);
  backdrop-filter: blur(14px);
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 24px;
}

.preview-modal {
  width: 95vw;
  max-width: 900px;
  max-height: 92vh;
  display: flex;
  flex-direction: column;
  background: rgba(15, 23, 42, 0.95);
  border: 1px solid rgba(34, 211, 238, 0.3);
  border-radius: 14px;
  overflow: hidden;
  box-shadow: 0 25px 60px rgba(0, 0, 0, 0.9);
}

.preview-header {
  padding: 14px 20px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.08);
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

.preview-filename {
  font-size: 0.85rem;
  font-weight: 700;
  color: #f8fafc;
}

.header-action-btn {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 6px 12px;
  border-radius: 6px;
  background: rgba(255, 255, 255, 0.05);
  border: 1px solid rgba(255, 255, 255, 0.1);
  color: #e2e8f0;
  font-size: 0.78rem;
  font-weight: 600;
  cursor: pointer;
  text-decoration: none;
  transition: all 0.2s;
}

.header-action-btn:hover {
  background: rgba(34, 211, 238, 0.15);
  border-color: rgba(34, 211, 238, 0.4);
  color: #22d3ee;
}

.close-btn {
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

.close-btn:hover {
  color: #ef4444;
  background: rgba(239, 68, 68, 0.15);
}

.close-btn:focus,
.close-btn:focus-visible,
.close-btn:active {
  outline: none !important;
  box-shadow: none !important;
}

.preview-img-wrap {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 16px;
  overflow: hidden;
  background: rgba(0, 0, 0, 0.5);
}

.preview-img {
  max-width: 100%;
  max-height: 75vh;
  object-fit: contain;
  border-radius: 8px;
}
</style>

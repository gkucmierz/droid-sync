<script setup>
import { ref, computed, watch, onMounted, onUnmounted } from 'vue';
import { useI18n } from '../locales.js';
import ConfirmModal from './ConfirmModal.vue';
import {
  Copy,
  Download,
  Maximize2,
  Image as ImageIcon,
  Calendar,
  HardDrive,
  Search,
  X,
  Sparkles,
  Smartphone,
  Camera,
  RotateCw,
  Save,
  Info,
  Trash2,
  ExternalLink,
  Sliders,
  MapPin,
  Clock
} from 'lucide-vue-next';

const props = defineProps({
  screenshots: { type: Array, default: () => [] },
  apiBaseUrl: { type: String, default: '' },
  isSyncing: { type: Boolean, default: false },
  syncProgress: { type: Object, default: () => ({ current: 0, total: 0, percent: 0, currentFile: '' }) },
  device: { type: Object, default: null }
});

const emit = defineEmits(['copy-clipboard', 'rotate-disk', 'delete-phone']);

const { currentLang, t } = useI18n();

const searchQuery = ref('');
const selectedImage = ref(null);
const activeFilter = ref('all'); // 'all' | 'screenshot' | 'camera'
const rotationDegrees = ref(0);
const isSavingRotation = ref(false);
const showExifPanel = ref(false);
const currentExif = ref(null);
const isLoadingExif = ref(false);
const isDeletingPhone = ref(false);
const pendingDeleteImage = ref(null);

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

const getItemType = (img) => {
  if (img?.type) return img.type;
  const name = img?.filename || '';
  if (/screenshot|screencap/i.test(name)) return 'screenshot';
  if (/^PXL_|^IMG_|^DCIM|camera|photo/i.test(name)) return 'camera';
  return 'camera';
};

const matchesSearch = (img, query) => {
  if (!query || !query.trim()) return true;
  const q = query.toLowerCase().trim();
  const filename = (img?.filename || '').toLowerCase();
  if (filename.includes(q)) return true;

  if (img?.mtime && img.mtime.toLowerCase().includes(q)) return true;
  if (img?.createdAt && img.createdAt.toLowerCase().includes(q)) return true;
  const formatted = formatDate(img?.mtime).toLowerCase();
  if (formatted.includes(q)) return true;

  const tokens = q.split(/\s+/).filter(Boolean);
  if (tokens.length > 1) {
    const combined = `${filename} ${formatted} ${img?.mtime || ''}`.toLowerCase();
    return tokens.every(token => combined.includes(token));
  }

  return false;
};

const escapeRegExp = (str) => {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
};

// Splits filename into segments with match flags for search highlighting
const getHighlightedSegments = (text, query) => {
  if (!text) return [];
  const q = (query || '').trim();
  if (!q) return [{ text, isMatch: false }];

  const tokens = q.split(/\s+/).filter(Boolean);
  if (tokens.length === 0) return [{ text, isMatch: false }];

  try {
    const pattern = new RegExp(`(${tokens.map(escapeRegExp).join('|')})`, 'gi');
    const parts = text.split(pattern);
    const lowerTokens = tokens.map(t => t.toLowerCase());

    return parts.filter(Boolean).map(part => ({
      text: part,
      isMatch: lowerTokens.includes(part.toLowerCase())
    }));
  } catch {
    return [{ text, isMatch: false }];
  }
};

// All items filtered ONLY by search query (for accurate tab counts and match feedback)
const searchFilteredAll = computed(() => {
  if (!searchQuery.value.trim()) return props.screenshots;
  return props.screenshots.filter(s => matchesSearch(s, searchQuery.value));
});

// Category tab counts (reactively updated when searching!)
const counts = computed(() => {
  let screenshots = 0;
  let camera = 0;
  for (const img of searchFilteredAll.value) {
    if (getItemType(img) === 'screenshot') screenshots++;
    else camera++;
  }
  return {
    all: searchFilteredAll.value.length,
    screenshots,
    camera
  };
});

// Items filtered by BOTH active tab and search query
const filteredScreenshots = computed(() => {
  let list = searchFilteredAll.value;
  if (activeFilter.value !== 'all') {
    list = list.filter(s => getItemType(s) === activeFilter.value);
  }
  return list;
});

const formatSize = (bytes) => {
  if (!bytes) return '0 B';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
};

const getFullUrl = (relativeUrl) => {
  if (!relativeUrl) return '';
  if (relativeUrl.startsWith('http')) return relativeUrl;
  return `${props.apiBaseUrl}${relativeUrl}`;
};

const rotateImage = () => {
  rotationDegrees.value = (rotationDegrees.value + 90) % 360;
};

const saveRotationToDisk = async () => {
  if (!selectedImage.value || rotationDegrees.value % 360 === 0 || isSavingRotation.value) return;
  isSavingRotation.value = true;
  try {
    emit('rotate-disk', selectedImage.value.filename, rotationDegrees.value);
    await new Promise(r => setTimeout(r, 400));
    rotationDegrees.value = 0;
    if (showExifPanel.value && selectedImage.value) {
      loadExifForImage(selectedImage.value);
    }
  } catch (err) {
    console.error('[Save Rotation Error]:', err);
  } finally {
    isSavingRotation.value = false;
  }
};

const loadExifForImage = async (img) => {
  if (!img) return;
  isLoadingExif.value = true;
  try {
    const url = getFullUrl(`/api/screenshots/${encodeURIComponent(img.filename)}/exif`);
    const res = await fetch(url);
    if (res.ok) {
      const data = await res.json();
      if (selectedImage.value?.filename === img.filename) {
        currentExif.value = data.exif;
      }
    }
  } catch (e) {
    console.error('[EXIF fetch error]:', e);
  } finally {
    isLoadingExif.value = false;
  }
};

const toggleExifPanel = () => {
  showExifPanel.value = !showExifPanel.value;
  if (showExifPanel.value && !currentExif.value && selectedImage.value) {
    loadExifForImage(selectedImage.value);
  }
};

const handleDeleteFromPhone = (img = selectedImage.value) => {
  if (!img) return;
  if (!props.device || !props.device.isAuthorized) return;
  pendingDeleteImage.value = img;
};

const cancelDeleteFromPhone = () => {
  pendingDeleteImage.value = null;
};

const confirmDeleteFromPhone = async () => {
  if (!pendingDeleteImage.value) return;
  const filename = pendingDeleteImage.value.filename;
  isDeletingPhone.value = true;
  try {
    emit('delete-phone', filename);
    pendingDeleteImage.value = null;
  } finally {
    setTimeout(() => {
      isDeletingPhone.value = false;
    }, 600);
  }
};

watch(selectedImage, (newImg) => {
  rotationDegrees.value = 0;
  showExifPanel.value = false;
  currentExif.value = null;
  if (newImg) {
    loadExifForImage(newImg);
  }
});

const copyImage = (img) => {
  emit('copy-clipboard', img.url, rotationDegrees.value);
};

const downloadImage = async (img) => {
  const fullUrl = getFullUrl(img.url);
  if (rotationDegrees.value % 360 === 0) {
    const a = document.createElement('a');
    a.href = fullUrl;
    a.download = img.filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    return;
  }

  try {
    const res = await fetch(fullUrl);
    const blob = await res.blob();
    const objUrl = URL.createObjectURL(blob);
    const rotBlob = await new Promise((resolve, reject) => {
      const image = new Image();
      image.onload = () => {
        URL.revokeObjectURL(objUrl);
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');
        const deg = ((rotationDegrees.value % 360) + 360) % 360;
        const rad = (deg * Math.PI) / 180;
        const is90or270 = deg === 90 || deg === 270;

        canvas.width = is90or270 ? image.naturalHeight : image.naturalWidth;
        canvas.height = is90or270 ? image.naturalWidth : image.naturalHeight;

        ctx.translate(canvas.width / 2, canvas.height / 2);
        ctx.rotate(rad);
        ctx.drawImage(image, -image.naturalWidth / 2, -image.naturalHeight / 2);

        canvas.toBlob((b) => {
          if (b) resolve(b);
          else reject(new Error('Canvas export failed'));
        }, 'image/png');
      };
      image.onerror = (e) => {
        URL.revokeObjectURL(objUrl);
        reject(e);
      };
      image.src = objUrl;
    });

    const rotUrl = URL.createObjectURL(rotBlob);
    const a = document.createElement('a');
    a.href = rotUrl;
    const base = img.filename.replace(/\.[^.]+$/, '');
    a.download = `${base}_rot${rotationDegrees.value}.png`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(rotUrl), 10000);
  } catch (err) {
    console.error('[Download Rotated Error]:', err);
    window.open(fullUrl, '_blank');
  }
};

// --- Progressive Batch Rendering (Zero Jumping, Instant Theme Switch) ---
const INITIAL_BATCH = 60;
const BATCH_SIZE = 40;
const displayLimit = ref(INITIAL_BATCH);

const visibleScreenshots = computed(() => {
  return filteredScreenshots.value.slice(0, displayLimit.value);
});

let scrollTicking = false;
const onWindowScroll = () => {
  if (!scrollTicking) {
    window.requestAnimationFrame(() => {
      const scrollBottom = window.innerHeight + (window.scrollY || document.documentElement.scrollTop || 0);
      const docHeight = document.documentElement.scrollHeight;
      if (scrollBottom >= docHeight - 800) {
        if (displayLimit.value < filteredScreenshots.value.length) {
          displayLimit.value += BATCH_SIZE;
        }
      }
      scrollTicking = false;
    });
    scrollTicking = true;
  }
};

watch([activeFilter, searchQuery], () => {
  displayLimit.value = INITIAL_BATCH;
});

// Universal ESC dismissal for delete confirmation modal, EXIF sidebar, and image preview (Rule 6.1)
const handleKeydown = (e) => {
  if (e.key === 'Escape') {
    if (pendingDeleteImage.value) {
      e.stopPropagation();
      pendingDeleteImage.value = null;
      return;
    }
    if (selectedImage.value) {
      e.stopPropagation();
      if (showExifPanel.value) {
        showExifPanel.value = false;
      } else {
        selectedImage.value = null;
      }
    }
  }
};

onMounted(() => {
  window.addEventListener('keydown', handleKeydown);
  window.addEventListener('scroll', onWindowScroll, { passive: true });
});

onUnmounted(() => {
  window.removeEventListener('keydown', handleKeydown);
  window.removeEventListener('scroll', onWindowScroll);
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
        <span class="count-badge font-mono">
          <template v-if="searchQuery.trim()">
            {{ filteredScreenshots.length }} / {{ props.screenshots.length }} {{ t.searchMatches }}
          </template>
          <template v-else>
            {{ t.screenshotsCount(props.screenshots.length) }}
          </template>
        </span>
        <!-- Live sync badge inside gallery toolbar -->
        <div v-if="isSyncing" class="gallery-sync-badge font-mono animate-pulse">
          <RotateCw :size="12" class="animate-spin" />
          <span>{{ syncProgress.current }} / {{ syncProgress.total || '...' }}</span>
        </div>
      </div>

      <!-- Filter tabs -->
      <div class="tabs-group">
        <button 
          class="tab-btn" 
          :class="{ active: activeFilter === 'all' }" 
          @click="activeFilter = 'all'"
          type="button"
        >
          <span>{{ t.filterAll }}</span>
          <span class="tab-count font-mono">({{ counts.all }})</span>
        </button>
        <button 
          class="tab-btn" 
          :class="{ active: activeFilter === 'screenshot' }" 
          @click="activeFilter = 'screenshot'"
          type="button"
        >
          <Smartphone :size="13" />
          <span>{{ t.filterScreenshots }}</span>
          <span class="tab-count font-mono">({{ counts.screenshots }})</span>
        </button>
        <button 
          class="tab-btn" 
          :class="{ active: activeFilter === 'camera' }" 
          @click="activeFilter = 'camera'"
          type="button"
        >
          <Camera :size="13" />
          <span>{{ t.filterCamera }}</span>
          <span class="tab-count font-mono">({{ counts.camera }})</span>
        </button>
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
        v-for="img in visibleScreenshots" 
        :key="img.filename" 
        class="screenshot-card glass-panel"
      >
        <!-- Thumbnail Wrap -->
        <div class="thumb-wrap" @click="selectedImage = img">
          <span class="type-pill" :class="getItemType(img)">
            {{ getItemType(img) === 'screenshot' ? t.badgeScreenshot : t.badgeCamera }}
          </span>
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
            <!-- Quick selective delete from phone -->
            <button 
              v-if="device && device.isAuthorized" 
              class="overlay-action-btn delete-action" 
              @click.stop="handleDeleteFromPhone(img)" 
              type="button"
              :aria-label="t.btnDeleteFromPhone"
            >
              <Trash2 :size="15" />
            </button>
          </div>
        </div>

        <!-- Meta Footer -->
        <div class="card-meta">
          <span class="file-name">
            <template v-for="(seg, i) in getHighlightedSegments(img.filename, searchQuery)" :key="i">
              <mark v-if="seg.isMatch" class="search-match-highlight">{{ seg.text }}</mark>
              <template v-else>{{ seg.text }}</template>
            </template>
          </span>
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

    <!-- Empty State for Search -->
    <div v-else-if="props.screenshots.length > 0 && filteredScreenshots.length === 0" class="empty-gallery glass-panel search-empty">
      <div class="empty-icon-wrap search-empty-icon">
        <Search :size="30" style="color: #94a3b8;" />
      </div>
      <h4 class="empty-title">{{ t.searchNoResults }}</h4>
      <p class="empty-desc">{{ t.searchNoResultsDesc(searchQuery) }}</p>
      <button class="clear-search-action-btn" @click="searchQuery = ''" type="button">
        <X :size="14" />
        <span>{{ t.searchClear }}</span>
      </button>
    </div>

    <!-- Empty State when no media at all -->
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
      <div class="preview-modal glass-panel" :class="{ 'with-exif': showExifPanel }" @click.stop>
        <div class="preview-header">
          <div class="preview-title-area">
            <span class="preview-filename font-mono">
              <template v-for="(seg, i) in getHighlightedSegments(selectedImage.filename, searchQuery)" :key="i">
                <mark v-if="seg.isMatch" class="search-match-highlight">{{ seg.text }}</mark>
                <template v-else>{{ seg.text }}</template>
              </template>
            </span>
          </div>

          <div class="preview-controls-area">
            <div class="header-actions">
              <!-- EXIF info toggle button -->
              <button 
                class="header-action-btn" 
                :class="{ active: showExifPanel }" 
                @click="toggleExifPanel" 
                type="button"
              >
                <Info :size="15" />
                <span>EXIF</span>
              </button>

              <!-- Rotate button -->
              <button class="header-action-btn" @click="rotateImage" type="button">
                <RotateCw :size="15" />
                <span>{{ t.modalRotate }}</span>
                <span v-if="rotationDegrees" class="rot-badge font-mono">{{ rotationDegrees }}°</span>
              </button>

              <!-- Save rotation to disk button (shown when rotated > 0!) -->
              <button 
                v-if="rotationDegrees % 360 !== 0"
                class="header-action-btn save-rotation-btn animate-pulse" 
                :disabled="isSavingRotation"
                @click="saveRotationToDisk" 
                type="button"
              >
                <Save :size="15" />
                <span>{{ isSavingRotation ? t.modalSavingRotation : t.modalSaveRotation }}</span>
              </button>

              <!-- Copy button -->
              <button class="header-action-btn" @click="copyImage(selectedImage)" type="button">
                <Copy :size="15" />
                <span>{{ t.modalCopy }}</span>
              </button>

              <!-- Download button -->
              <button class="header-action-btn" @click="downloadImage(selectedImage)" type="button">
                <Download :size="15" />
                <span>{{ t.modalDownload }}</span>
              </button>

              <!-- Selective delete from phone button -->
              <button 
                v-if="device && device.isAuthorized"
                class="header-action-btn delete-phone-btn" 
                :disabled="isDeletingPhone"
                @click="handleDeleteFromPhone(selectedImage)" 
                type="button"
              >
                <Trash2 :size="15" />
                <span>{{ t.btnDeleteFromPhone }}</span>
              </button>
            </div>

            <div class="header-divider"></div>

            <!-- Close button permanently pinned to top right -->
            <button class="close-btn" @click="selectedImage = null" type="button" aria-label="Zamknij">
              <X :size="18" :stroke-width="2.2" />
            </button>
          </div>
        </div>

        <div class="preview-modal-body">
          <div class="preview-img-wrap">
            <img 
              :src="getFullUrl(selectedImage.url)" 
              class="preview-img" 
              :class="{ 'is-rotated-90': rotationDegrees % 180 !== 0 }"
              :style="{ transform: `rotate(${rotationDegrees}deg)` }"
            />
          </div>

          <!-- EXIF Sidebar Inspector -->
          <div v-if="showExifPanel" class="exif-inspector-panel animate-fade-in">
            <div class="exif-panel-header">
              <div style="display: flex; align-items: center; gap: 8px;">
                <Info :size="16" style="color: #22d3ee;" />
                <span class="exif-header-title">{{ t.exifTitle }}</span>
              </div>
              <button class="exif-close-btn" @click="showExifPanel = false" type="button">
                <X :size="15" />
              </button>
            </div>

            <div v-if="isLoadingExif" class="exif-loading-state">
              <RotateCw :size="20" class="animate-spin" style="color: #22d3ee;" />
              <span>{{ t.exifLoading }}</span>
            </div>

            <div v-else-if="currentExif" class="exif-details-body">
              <!-- Camera & Lens -->
              <div v-if="currentExif.camera?.model" class="exif-section">
                <div class="exif-section-label">
                  <Camera :size="13" />
                  <span>{{ t.exifCamera }}</span>
                </div>
                <div class="exif-section-val font-bold">
                  {{ currentExif.camera.make }} {{ currentExif.camera.model }}
                </div>
                <div v-if="currentExif.camera.software" class="exif-subval font-mono">
                  {{ currentExif.camera.software }}
                </div>
              </div>

              <!-- Exposure Settings -->
              <div v-if="currentExif.exposure?.aperture || currentExif.exposure?.shutter || currentExif.exposure?.iso" class="exif-section">
                <div class="exif-section-label">
                  <Sliders :size="13" />
                  <span>{{ t.exifExposure }}</span>
                </div>
                <div class="exif-exposure-grid font-mono">
                  <div v-if="currentExif.exposure.aperture" class="exif-pill">{{ currentExif.exposure.aperture }}</div>
                  <div v-if="currentExif.exposure.shutter" class="exif-pill">{{ currentExif.exposure.shutter }}</div>
                  <div v-if="currentExif.exposure.iso" class="exif-pill">{{ currentExif.exposure.iso }}</div>
                  <div v-if="currentExif.exposure.focalLength" class="exif-pill">{{ currentExif.exposure.focalLength }}</div>
                </div>
              </div>

              <!-- Dimensions & File info -->
              <div class="exif-section">
                <div class="exif-section-label">
                  <Maximize2 :size="13" />
                  <span>{{ t.exifDimensions }}</span>
                </div>
                <div class="exif-section-val font-mono">
                  {{ currentExif.dimensions?.resolution || formatSize(selectedImage.sizeBytes) }}
                  <span v-if="currentExif.dimensions?.megaPixels" class="exif-badge">{{ currentExif.dimensions.megaPixels }}</span>
                </div>
                <div class="exif-subval font-mono">
                  {{ currentExif.file?.format || getItemType(selectedImage).toUpperCase() }} • {{ formatSize(selectedImage.sizeBytes) }}
                </div>
              </div>

              <!-- Date taken -->
              <div v-if="currentExif.dateTime" class="exif-section">
                <div class="exif-section-label">
                  <Clock :size="13" />
                  <span>Data wykonania</span>
                </div>
                <div class="exif-section-val font-mono">
                  {{ currentExif.dateTime }}
                </div>
              </div>

              <!-- GPS Location -->
              <div v-if="currentExif.gps" class="exif-section">
                <div class="exif-section-label">
                  <MapPin :size="13" />
                  <span>{{ t.exifLocation }}</span>
                </div>
                <div class="exif-section-val font-mono">
                  {{ currentExif.gps.latitude }}°, {{ currentExif.gps.longitude }}°
                  <span v-if="currentExif.gps.altitude">({{ currentExif.gps.altitude }}m)</span>
                </div>
                <a 
                  :href="currentExif.gps.mapsUrl" 
                  target="_blank" 
                  rel="noopener noreferrer" 
                  class="exif-map-link"
                >
                  <ExternalLink :size="12" />
                  <span>{{ t.exifOpenMap }}</span>
                </a>
              </div>
            </div>

            <!-- No EXIF fallback -->
            <div v-else class="exif-empty-state">
              <span class="font-mono" style="font-size: 0.75rem; color: #94a3b8;">{{ t.exifNoData }}</span>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- Custom Delete Confirmation Modal (Replaces clunky browser confirm) -->
    <ConfirmModal 
      :isOpen="Boolean(pendingDeleteImage)"
      :title="t.confirmDeleteModalTitle"
      :description="t.confirmDeleteModalDesc"
      :targetName="pendingDeleteImage?.filename"
      :safeNotice="t.confirmDeleteModalSafeNotice"
      :confirmText="t.confirmDeleteModalConfirmBtn"
      :cancelText="t.btnCancel"
      :isLoading="isDeletingPhone"
      :isDanger="true"
      @confirm="confirmDeleteFromPhone"
      @close="cancelDeleteFromPhone"
    />
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

/* Tabs Group */
.tabs-group {
  display: inline-flex;
  background: rgba(0, 0, 0, 0.4);
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 6px;
  overflow: hidden;
}

[data-theme="light"] .tabs-group {
  background: rgba(15, 23, 42, 0.05);
  border-color: rgba(15, 23, 42, 0.12);
}

.tab-btn {
  background: transparent;
  border: none;
  padding: 6px 13px;
  color: #64748b;
  font-size: 0.78rem;
  font-weight: 700;
  cursor: pointer;
  transition: all 0.2s;
  display: inline-flex;
  align-items: center;
  gap: 6px;
}

.tab-btn.active {
  background: rgba(34, 211, 238, 0.2);
  color: #22d3ee;
}

[data-theme="light"] .tab-btn.active {
  background: rgba(2, 132, 199, 0.15);
  color: #0284c7;
}

.tab-btn:hover:not(.active) {
  color: #e2e8f0;
}

[data-theme="light"] .tab-btn:hover:not(.active) {
  color: #0f172a;
}

.tab-count {
  font-size: 0.7rem;
  opacity: 0.75;
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
  width: 100%;
}

.screenshot-card {
  contain: layout paint style;
  content-visibility: auto;
  contain-intrinsic-size: 240px 348px;
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

/* Type Badge Pill */
.type-pill {
  position: absolute;
  top: 10px;
  left: 10px;
  padding: 3px 8px;
  border-radius: 4px;
  font-size: 0.62rem;
  font-weight: 800;
  letter-spacing: 0.04em;
  z-index: 2;
  pointer-events: none;
  backdrop-filter: blur(8px);
  -webkit-backdrop-filter: blur(8px);
}

.type-pill.screenshot {
  background: rgba(14, 165, 233, 0.4);
  color: #38bdf8;
  border: 1px solid rgba(56, 189, 248, 0.5);
}

.type-pill.camera {
  background: rgba(168, 85, 247, 0.4);
  color: #e9d5ff;
  border: 1px solid rgba(192, 132, 252, 0.5);
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

.search-match-highlight {
  background: rgba(245, 158, 11, 0.28);
  color: #fbbf24;
  border-radius: 4px;
  padding: 0 4px;
  font-weight: 800;
  box-shadow: 0 0 8px rgba(245, 158, 11, 0.35);
  border: 1px solid rgba(245, 158, 11, 0.45);
  display: inline-block;
  line-height: 1.2;
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
  max-width: 1100px;
  max-height: 92vh;
  display: flex;
  flex-direction: column;
  background: rgba(15, 23, 42, 0.95);
  border: 1px solid rgba(34, 211, 238, 0.3);
  border-radius: 14px;
  overflow: hidden;
  box-shadow: 0 25px 60px rgba(0, 0, 0, 0.9);
  container-type: inline-size;
  container-name: preview-modal;
}

.preview-header {
  padding: 12px 18px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.08);
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 14px;
  min-height: 56px;
  flex-shrink: 0;
}

.preview-title-area {
  min-width: 140px;
  flex: 0 1 auto;
  overflow: hidden;
}

.preview-filename {
  font-size: 0.85rem;
  font-weight: 700;
  color: #f8fafc;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  display: block;
}

.preview-controls-area {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-shrink: 1;
  min-width: 0;
}

.header-actions {
  display: flex;
  align-items: center;
  gap: 6px;
  flex-wrap: nowrap;
  min-width: 0;
}

.header-divider {
  width: 1px;
  height: 20px;
  background: rgba(255, 255, 255, 0.12);
  margin: 0 2px;
  flex-shrink: 0;
}

.header-action-btn {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 6px 10px;
  border-radius: 6px;
  background: rgba(255, 255, 255, 0.05);
  border: 1px solid rgba(255, 255, 255, 0.1);
  color: #e2e8f0;
  font-size: 0.78rem;
  font-weight: 600;
  cursor: pointer;
  text-decoration: none;
  transition: all 0.2s;
  flex-shrink: 0;
  white-space: nowrap;
  outline: none !important;
  outline-offset: 0 !important;
  box-shadow: none !important;
}

.header-action-btn:focus,
.header-action-btn:focus-visible,
.header-action-btn:active {
  outline: none !important;
  outline-offset: 0 !important;
  box-shadow: none !important;
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
  outline-offset: 0 !important;
  box-shadow: none !important;
  flex-shrink: 0;
}

.close-btn:hover {
  color: #ef4444;
  background: rgba(239, 68, 68, 0.15);
}

.close-btn:focus,
.close-btn:focus-visible,
.close-btn:active {
  outline: none !important;
  outline-offset: 0 !important;
  box-shadow: none !important;
}

.preview-img-wrap {
  flex: 1 1 0%;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 16px;
  overflow: hidden;
  background: rgba(0, 0, 0, 0.5);
  min-height: 0;
  min-width: 0;
}

.preview-img {
  max-width: 100%;
  max-height: 75vh;
  object-fit: contain;
  border-radius: 8px;
  transition: transform 0.25s cubic-bezier(0.4, 0, 0.2, 1);
}

.preview-img.is-rotated-90 {
  max-width: 70vh;
  max-height: 65vw;
}

.rot-badge {
  font-size: 0.68rem;
  padding: 1px 5px;
  border-radius: 4px;
  background: rgba(34, 211, 238, 0.2);
  color: #22d3ee;
  border: 1px solid rgba(34, 211, 238, 0.4);
}

/* Gallery Sync Live Pill */
.gallery-sync-badge {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 2px 8px;
  border-radius: 12px;
  background: rgba(168, 85, 247, 0.15);
  color: #c084fc;
  border: 1px solid rgba(168, 85, 247, 0.35);
  font-size: 0.7rem;
  font-weight: 700;
}

/* Clear Search Button in Empty State */
.clear-search-action-btn {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 8px 16px;
  margin-top: 6px;
  border-radius: 8px;
  background: rgba(34, 211, 238, 0.15);
  border: 1px solid rgba(34, 211, 238, 0.3);
  color: #22d3ee;
  font-size: 0.8rem;
  font-weight: 700;
  cursor: pointer;
  transition: all 0.2s;
}

.clear-search-action-btn:hover {
  background: rgba(34, 211, 238, 0.25);
  transform: translateY(-1px);
}

/* Card Delete Overlay Button */
.overlay-action-btn.delete-action:hover {
  background: rgba(239, 68, 68, 0.25);
  border-color: #ef4444;
  color: #ef4444;
}

/* Save Rotation to Disk Button */
.save-rotation-btn {
  background: rgba(16, 185, 129, 0.18) !important;
  border-color: rgba(16, 185, 129, 0.45) !important;
  color: #34d399 !important;
  font-weight: 800 !important;
}

.save-rotation-btn:hover {
  background: rgba(16, 185, 129, 0.3) !important;
  box-shadow: 0 0 12px rgba(16, 185, 129, 0.3);
}

/* Delete From Phone Button */
.delete-phone-btn:hover {
  background: rgba(239, 68, 68, 0.15) !important;
  border-color: rgba(239, 68, 68, 0.4) !important;
  color: #f87171 !important;
}

.header-action-btn.active {
  background: rgba(34, 211, 238, 0.2);
  border-color: rgba(34, 211, 238, 0.5);
  color: #22d3ee;
}

/* Preview Modal & EXIF Split Layout */
.preview-modal.with-exif {
  max-width: 1300px;
}

.preview-modal-body {
  flex: 1;
  display: flex;
  flex-direction: row;
  min-height: 0;
  overflow: hidden;
}

@media (max-width: 768px) {
  .preview-modal-body {
    flex-direction: column;
  }
}

/* EXIF Sidebar Inspector */
.exif-inspector-panel {
  width: 320px;
  max-width: 100%;
  background: rgba(10, 15, 29, 0.85);
  border-left: 1px solid rgba(255, 255, 255, 0.08);
  display: flex;
  flex-direction: column;
  overflow-y: auto;
  backdrop-filter: blur(16px);
}

.exif-panel-header {
  padding: 12px 16px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.08);
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.exif-header-title {
  font-size: 0.82rem;
  font-weight: 800;
  color: #f8fafc;
}

.exif-close-btn {
  background: none;
  border: none;
  color: #94a3b8;
  cursor: pointer;
  padding: 4px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 4px;
  transition: all 0.2s;
}

.exif-close-btn:hover {
  color: #f8fafc;
  background: rgba(255, 255, 255, 0.1);
}

.exif-loading-state,
.exif-empty-state {
  padding: 40px 20px;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 12px;
  text-align: center;
}

.exif-details-body {
  padding: 16px;
  display: flex;
  flex-direction: column;
  gap: 14px;
}

.exif-section {
  display: flex;
  flex-direction: column;
  gap: 5px;
  padding-bottom: 10px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.05);
}

.exif-section:last-child {
  border-bottom: none;
}

.exif-section-label {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 0.72rem;
  font-weight: 700;
  color: #94a3b8;
  text-transform: uppercase;
  letter-spacing: 0.03em;
}

.exif-section-val {
  font-size: 0.84rem;
  color: #f8fafc;
  display: flex;
  align-items: center;
  gap: 8px;
}

.exif-subval {
  font-size: 0.74rem;
  color: #64748b;
}

.exif-badge {
  font-size: 0.68rem;
  padding: 1px 6px;
  border-radius: 4px;
  background: rgba(34, 211, 238, 0.12);
  color: #22d3ee;
  border: 1px solid rgba(34, 211, 238, 0.3);
}

.exif-exposure-grid {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin-top: 4px;
}

.exif-pill {
  padding: 3px 8px;
  border-radius: 6px;
  background: rgba(255, 255, 255, 0.06);
  border: 1px solid rgba(255, 255, 255, 0.1);
  color: #e2e8f0;
  font-size: 0.74rem;
  font-weight: 700;
}

.exif-map-link {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  margin-top: 4px;
  font-size: 0.74rem;
  font-weight: 700;
  color: #22d3ee;
  text-decoration: none;
  transition: all 0.2s;
}

.exif-map-link:hover {
  color: #67e8f9;
  text-decoration: underline;
}

@container preview-modal (max-width: 820px) {
  .header-action-btn span:not(.rot-badge) {
    display: none;
  }
}

@media (max-width: 980px) {
  .header-action-btn span:not(.rot-badge) {
    display: none;
  }
}
</style>

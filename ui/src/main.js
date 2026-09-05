import { createApp } from 'vue';
import App from './App.vue';
import './style.css';
import { tracker } from '@gkucmierz/analytics';

// Initialize Analytics Tracking
tracker.init('droid-sync', 'https://analytics.7u.pl');

createApp(App).mount('#app');

// Register Service Worker for PWA
if ('serviceWorker' in navigator && window.location.protocol.startsWith('http')) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').then((registration) => {
      registration.update();
    }).catch((err) => {
      console.warn('ServiceWorker registration error:', err);
    });
  });
}

import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [vue()],
  server: {
    port: 49278,
    host: '0.0.0.0',
    proxy: {
      '/api': {
        target: 'http://127.0.0.1:40880',
        changeOrigin: true
      }
    }
  }
});

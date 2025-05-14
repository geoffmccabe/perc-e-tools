import { defineConfig } from 'vite';

export default defineConfig({
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: 'http://localhost:3000',
        changeOrigin: true,
        secure: false,
        timeout: 60000,
        proxyTimeout: 60000
      },
      '/atlases': {
        target: 'http://localhost:3000',
        changeOrigin: true,
        secure: false,
        timeout: 60000,
        proxyTimeout: 60000
      }
    }
  }
});
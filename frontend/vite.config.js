import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  build: {
    // The PDF-report chunk (customerReportPdf) is ~600KB but already lazily
    // split - it's only fetched inside the report-generation handler, never
    // part of the main bundle - so Vite's default 500KB warning threshold
    // was flagging an already-correct split as if it were eager bloat.
    chunkSizeWarningLimit: 700,
  },
  server: {
    port: 5173,
    proxy: {
      // Proxies /api/* to the local backend bootstrap (backend/scripts/bootstrap-firestore-app.ts, port 4100).
      // Set DEV_API_PROXY_TARGET to point at a different backend - same-origin proxying keeps the httpOnly
      // session cookie working without any CORS setup.
      '/api': {
        target: process.env.DEV_API_PROXY_TARGET || 'http://localhost:4100',
        changeOrigin: true,
      },
    },
  },
});

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
      // Defaults to the live Prisma backend (port 4000). Set
      // DEV_API_PROXY_TARGET=http://localhost:4100 to point the dev server
      // at the standalone Firestore-rewrite bootstrap instead (see
      // backend/scripts/bootstrap-firestore-app.ts) - same-origin proxying
      // keeps the httpOnly session cookie working without any CORS setup.
      '/api': {
        target: process.env.DEV_API_PROXY_TARGET || 'http://localhost:4000',
        changeOrigin: true,
      },
    },
  },
});

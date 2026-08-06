import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// base './'：GitHub Pages 部署在仓库子路径下，全部资源走相对路径
export default defineConfig({
  base: './',
  plugins: [react()],
  build: {
    outDir: 'dist',
    chunkSizeWarningLimit: 1600
  }
});

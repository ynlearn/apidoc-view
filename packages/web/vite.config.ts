import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';

export default defineConfig({
  plugins: [vue()],
  server: {
    port: 5173,
    host: '0.0.0.0',
    proxy: {
      '/api': {
        target: 'http://localhost:3000',
        changeOrigin: true,
      },
    },
  },
  build: {
    chunkSizeWarningLimit: 900,
    rollupOptions: {
      output: {
        // 按库拆包：各 chunk 独立缓存，业务代码变更不会打掉整包缓存；
        // codemirror/json-pretty 体积大且非首屏必需，配合动态加载减少首屏解析量
        manualChunks(id: string) {
          if (!id.includes('node_modules')) return undefined;
          if (id.includes('element-plus') || id.includes('@element-plus')) return 'element-plus';
          if (id.includes('@codemirror') || id.includes('codemirror') || id.includes('lezer')) return 'codemirror';
          if (id.includes('vue-json-pretty')) return 'json-pretty';
          if (id.includes('/vue/') || id.includes('@vue/') || id.includes('vue-router') || id.includes('pinia') || id.includes('axios')) return 'vue-vendor';
          return 'vendor';
        },
      },
    },
  },
});

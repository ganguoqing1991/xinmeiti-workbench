import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';

export default defineConfig({
  plugins: [react()],
  root: 'client',
  build: {
    outDir: '../dist',
    // 稳定文件名（去 hash）：发布走「复用 sandbox」的增量上传，删除不同步，
    // 若带内容 hash 每次构建都会留下 index-<hash>.js 旧文件残留在线上（实测踩过），
    // 旧文件仍可通过 URL 直接取到，泄露历史硬编码内容。改成固定名后每次覆盖同名文件，
    // 配合 server.js 的 /assets/ 白名单，彻底封死旧产物外泄。
    rollupOptions: {
      output: {
        entryFileNames: 'assets/[name].js',
        chunkFileNames: 'assets/[name].js',
        assetFileNames: 'assets/[name][extname]',
      },
    },
  },
  server: {
    port: 5173,
    // 端口被占用时直接报错退出，绝不顺延到 5174 等其它端口
    strictPort: true,
    host: true,
    // 避免 dev 启动后动态发现新依赖触发 safe-delete shim
    watch: {
      ignored: ['**/node_modules/.vite/**', '**/dist/**'],
    },
  },
  optimizeDeps: {
    // 显式声明所有依赖，启动时一次性预打包，避免运行时自动发现触发沙箱超时
    include: [
      'react',
      'react-dom',
      'react-dom/client',
      'react/jsx-runtime',
      'react/jsx-dev-runtime',
      'react-router-dom',
      'framer-motion',
      'lucide-react',
      'recharts',
      'dayjs',
      'clsx',
      'xlsx',
    ],
  },
  resolve: {
    alias: {
      '@client': path.resolve(__dirname, 'client'),
    },
  },
  css: {
    postcss: path.resolve(__dirname, 'postcss.config.js'),
  },
});

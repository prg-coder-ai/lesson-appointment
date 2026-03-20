import { defineConfig } from 'vite';
import { resolve } from 'path';

// https://vitejs.dev/config/
export default defineConfig({
  // 开发服务器配置
  server: {
    port: 8080,          // 开发环境运行端口（访问：http://localhost:8080）
    open: true,          // 启动时自动打开浏览器
    cors: true           // 允许跨域（对接后端API时需要）
  },
  // 打包配置
  build: {
    outDir: 'dist',      // 打包输出目录（默认dist）
    assetsDir: 'assets', // 打包后的静态资源目录
    minify: 'terser',    // 代码压缩（terser比esbuild更彻底）
    terserOptions: {
      compress: {
        drop_console: true, // 生产打包移除console.log
        drop_debugger: true // 移除debugger
      }
    },
    rollupOptions: {
      // 多页面打包配置（关键：你的项目是多HTML页面）
      input: {
        index: resolve(__dirname, 'index.html'),       // 登录页
        admin: resolve(__dirname, 'src/pages/admin.html'), // 管理端
        teacher: resolve(__dirname, 'src/pages/teacher.html'), // 教师端
        student: resolve(__dirname, 'src/pages/student.html') // 学生端
      },
      // 打包后保持页面文件名不变
      output: {
        entryFileNames: 'assets/[name].js',
        chunkFileNames: 'assets/[name].js',
        assetFileNames: 'assets/[name].[ext]'
      }
    }
  },
  // 路径别名（可选，简化导入）
  resolve: {
    alias: {
      '@': resolve(__dirname, 'src') // 用@代替src目录
    }
  }
});
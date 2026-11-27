import path from 'node:path'
import { fileURLToPath } from 'node:url'
import vue from '@vitejs/plugin-vue'
import { defineConfig, loadEnv } from 'vite'

const dirname = path.dirname(fileURLToPath(import.meta.url))

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, path.resolve(dirname, '../..'), '')
  const apiUrl = env.VITE_API_URL
    || env.YUANSHU_REMOTE_API_URL
    || 'https://8-148-158-251.sslip.io'
  const apiPrefix = env.VITE_API_URL_PREFIX || '/api/v1'

  return {
    base: '/login-assets/',
    resolve: {
      alias: {
        '@': path.resolve(dirname, './src'),
      },
      dedupe: ['vue'],
    },
    plugins: [vue()],
    server: {
      host: '0.0.0.0',
      port: 3005,
      proxy: {
        [apiPrefix]: {
          target: apiUrl,
          changeOrigin: true,
          timeout: 900 * 1000,
          proxyTimeout: 900 * 1000,
        },
      },
    },
  }
})

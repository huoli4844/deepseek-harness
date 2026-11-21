import { defineConfig } from 'tsdown'

export default defineConfig({
  entry: ['src/index.ts'],
  outDir: 'lib',
  format: ['esm'],
  // package.json 的 main/exports 指向 lib/index.js；type=module 时需关闭固定 .mjs 扩展名
  fixedExtension: false,
  platform: 'node',
  target: 'es2024',
})

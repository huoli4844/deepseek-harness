import { defineConfig } from 'tsdown'

export default defineConfig({
  entry: ['src/index.ts'],
  dts: false,
  outDir: 'lib',
  format: ['esm'],
  platform: 'node',
  target: 'es2024',
})

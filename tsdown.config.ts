import { defineConfig } from 'tsdown';

export default defineConfig({
  entry: ['./src/index.ts', './src/transports/postMessage.ts'],
  outDir: './dist',
  format: ['esm', 'cjs'],
  minify: true,
  outExtensions: () => ({ dts: '.d.ts' }),
});

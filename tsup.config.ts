import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['server/index.ts'],
  format: ['cjs'],
  platform: 'node',
  target: 'node20',
  outDir: 'dist/server',
  clean: true,
  sourcemap: false,
  outExtension: () => ({ js: '.cjs' }),
  // The desktop build ships without a node_modules tree: keep the local
  // server self-contained so it can run inside the Electron app.
  noExternal: [/.*/],
});

import { fileURLToPath, URL } from 'node:url';

import { defineConfig, mergeConfig } from 'vite';

import base from '../vite.config';

// Dev config for the embedder e2e harness: same plugins/aliases/scoping as the
// package build config, but serving e2e/harness and allowing imports from the
// ui workspace (src/index.tsx pulls in ../../../src/lib/flamegraph).
export default mergeConfig(
  base,
  defineConfig({
    root: fileURLToPath(new URL('./harness', import.meta.url)),
    server: {
      fs: {
        allow: [fileURLToPath(new URL('../../', import.meta.url))],
      },
    },
  }),
);

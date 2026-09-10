// e2e harness for the ns-pyroscope embedder. It renders the real embedder
// component (src/index.tsx), which imports the real embedder stylesheet
// (src/style.css) through vite dev — so the browser sees exactly the CSS the
// published package ships (same postcss scoping), without a package build.
import React from 'react';
import { createRoot } from 'react-dom/client';

import { Pyroscope } from '../../src/index';

// Deep synthetic single-stack profile: 90 levels x ~22px per level puts the
// flamegraph canvas at ~1980px, far taller than the embedder's viewport-derived
// .fg-body height, so scroll behavior is unambiguous. Shape per
// src/adapter.ts: levels are flat [offset, total, self, nameIndex] tuples with
// a single root at level 0; sampleLevels carry 2 ints per node.
const DEPTH = 90;
const names = ['total'];
for (let i = 1; i < DEPTH; i++) names.push(`fn_level_${i}`);

const levels: number[][] = [];
for (let i = 0; i < DEPTH; i++) {
  levels.push(i === 0 ? [0, 1000, 0, 0] : [0, 1000, i % 5 === 0 ? 10 : 0, i]);
}
const sampleLevels: number[][] = levels.map((_, i) => [
  1000,
  i % 5 === 0 ? 10 : 0,
]);

const profile = {
  version: 1,
  flamebearer: {
    names,
    levels,
    sampleLevels,
    numSamples: 1000,
    format: 'single',
    spyName: 'nodejs',
    sampleRate: 100,
    units: 'samples',
  },
  metadata: { units: 'samples', sampleRate: 100 },
};

createRoot(document.getElementById('app')!).render(
  <Pyroscope data={profile} isContinuousProfileView={true} />,
);

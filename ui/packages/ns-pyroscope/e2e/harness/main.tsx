// e2e harness for the ns-pyroscope embedder. It renders the real embedder
// component (src/index.tsx), which imports the real embedder stylesheet
// (src/style.css) through vite dev — so the browser sees exactly the CSS the
// published package ships (same postcss scoping), without a package build.
import React, { useState } from 'react';
import { createRoot } from 'react-dom/client';

import { Pyroscope } from '../../src/index';
import type { FlamebearerProfile } from '../../src/types';

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

const profile: FlamebearerProfile = {
  version: 1,
  flamebearer: {
    names,
    levels,
    sampleLevels,
    numSamples: 1000,
    format: 'single',
  },
  metadata: { units: 'samples', sampleRate: 100, spyName: 'nodejs' },
};

const emptyProfile: FlamebearerProfile = {
  ...profile,
  flamebearer: { ...profile.flamebearer, levels: [] },
};

const otherProfile: FlamebearerProfile = {
  ...profile,
  flamebearer: {
    names: ['total', 'other_work'],
    levels: [
      [0, 2000, 0, 0],
      [0, 2000, 2000, 1],
    ],
    numSamples: 2000,
    sampleLevels: [
      [2000, 0],
      [2000, 2000],
    ],
    format: 'single',
  },
};

export function Harness() {
  const [data, setData] = useState<FlamebearerProfile>(
    new URLSearchParams(window.location.search).has('empty')
      ? emptyProfile
      : profile,
  );

  return (
    <>
      <button onClick={() => setData(emptyProfile)}>Empty refresh</button>
      <button onClick={() => setData({ ...profile })}>Valid refresh</button>
      <button onClick={() => setData(otherProfile)}>Switch profile</button>
      <Pyroscope data={data} isContinuousProfileView={true} />
    </>
  );
}

createRoot(document.getElementById('app')!).render(<Harness />);

// e2e harness for the ns-pyroscope embedder. It renders the real embedder
// component (src/index.tsx), which imports the real embedder stylesheet
// (src/style.css) through vite dev — so the browser sees exactly the CSS the
// published package ships (same postcss scoping), without a package build.
import React, { useState } from 'react';
import { createRoot } from 'react-dom/client';

import { Pyroscope } from '../../src/index';
import type { FlamebearerProfile, PyroscopeProps } from '../../src/types';

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

const detailsProfile: FlamebearerProfile = {
  flamebearer: {
    names: ['worker', 'total', 'entry A', 'entry B', 'worker', 'total'],
    levels: [
      [0, 1000, 0, 1],
      [0, 400, 100, 2, 0, 600, 100, 3],
      [0, 300, 100, 0, 100, 500, 100, 4],
      [0, 200, 200, 0, 200, 400, 400, 5],
    ],
  },
  metadata: { units: 'samples', spyName: 'ebpf' },
};

const groupedDetailsProfile: FlamebearerProfile = {
  flamebearer: {
    names: ['worker', 'total', 'entry', 'bridge', 'leaf'],
    levels: [
      [0, 1000, 0, 1],
      [0, 1000, 0, 2],
      [0, 1000, 300, 3],
      [0, 700, 200, 0],
      [0, 500, 500, 4],
    ],
  },
  metadata: { units: 'samples', spyName: 'ebpf' },
};

type FrameDetailsSelection = Parameters<
  NonNullable<PyroscopeProps['onFrameDetails']>
>[0];

export function Harness() {
  const params = new URLSearchParams(window.location.search);
  const [selection, setSelection] = useState<FrameDetailsSelection>();
  const [detailsEnabled, setDetailsEnabled] = useState(params.has('details'));
  const [data, setData] = useState<FlamebearerProfile>(
    params.has('empty')
      ? emptyProfile
      : params.has('groupedDetails')
        ? groupedDetailsProfile
        : params.has('detailsProfile')
          ? detailsProfile
          : profile,
  );

  return (
    <>
      <button onClick={() => setData(emptyProfile)}>Empty refresh</button>
      <button onClick={() => setData({ ...profile })}>Valid refresh</button>
      <button onClick={() => setData(otherProfile)}>Switch profile</button>
      {params.has('detailsProfile') && (
        <>
          <button onClick={() => setDetailsEnabled((enabled) => !enabled)}>
            Toggle details callback
          </button>
          <output data-testid="frame-details">
            {JSON.stringify(selection)}
          </output>
        </>
      )}
      <Pyroscope
        data={data}
        isContinuousProfileView={true}
        onFrameDetails={detailsEnabled ? setSelection : undefined}
      />
    </>
  );
}

createRoot(document.getElementById('app')!).render(<Harness />);

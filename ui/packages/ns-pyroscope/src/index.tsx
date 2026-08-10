import { useMemo, useState } from 'react';

import {
  FlameGraph,
  FlameGraphEnvironment,
} from '../../../src/lib/flamegraph/index.ts';

import { flamebearerToDataFrame } from './adapter.ts';
import type { PyroscopeProps } from './types.ts';

import './style.css';

export type {
  Flamebearer,
  FlamebearerProfile,
  PyroscopeProps,
  SourceLocation,
} from './types.ts';

export function Pyroscope({
  data,
  isContinuousProfileView = false,
}: PyroscopeProps) {
  const [root, setRoot] = useState<HTMLDivElement | null>(null);
  const frame = useMemo(() => flamebearerToDataFrame(data), [data]);

  return (
    <div
      ref={setRoot}
      className="ns-pyroscope"
      data-theme="dark"
      data-testid="ns-pyroscope"
    >
      <FlameGraphEnvironment root={root}>
        {frame ? (
          <FlameGraph
            data={frame}
            keepFocusOnDataChange={isContinuousProfileView}
            tableDensity="comfortable"
          />
        ) : (
          <div className="ns-pyroscope-empty" role="status">
            No profile data available
          </div>
        )}
      </FlameGraphEnvironment>
    </div>
  );
}

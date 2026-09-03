import { useEffect, useMemo, useRef, useState } from 'react';

import {
  FlameGraph,
  FlameGraphEnvironment,
} from '../../../src/lib/flamegraph/index.ts';
import type { DataFrame } from '../../../src/lib/flamegraph/FlameGraph/dataTransform.ts';

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

  // Dynamic refreshes (e.g. eBPF symbolization windows) can briefly deliver
  // profiles without renderable levels. Keep the last valid frame mounted in
  // that case so the flamegraph's internal state (focus, group expansion)
  // survives the transition instead of resetting on a remount.
  const lastFrameRef = useRef<DataFrame | undefined>(undefined);
  useEffect(() => {
    if (frame) {
      lastFrameRef.current = frame;
    }
  }, [frame]);
  const effectiveFrame = frame ?? lastFrameRef.current;

  return (
    <div
      ref={setRoot}
      className="ns-pyroscope"
      data-theme="dark"
      data-testid="ns-pyroscope"
    >
      <FlameGraphEnvironment root={root}>
        {effectiveFrame ? (
          <FlameGraph
            data={effectiveFrame}
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

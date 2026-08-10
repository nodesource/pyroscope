import type { FunctionComponent } from 'react';

export type Flamebearer = {
  names: string[];
  levels: number[][];
  numTicks?: number;
  maxSelf?: number;
  format?: 'single';
  // Total number of samples captured for temporal profiles (independent of the
  // nanosecond duration encoded in `levels`/`numTicks`).
  numSamples?: number;
  // Per-node sample counts aligned to `levels`. Each level holds two integers
  // per node, in the same order as levels[level]: [totalSamples, selfSamples, ...].
  sampleLevels?: number[][];
};

export type FlamebearerProfile = {
  version?: number;
  flamebearer: Flamebearer;
  metadata?: {
    format?: 'single';
    spyName?: string;
    sampleRate?: number;
    units?: string;
    name?: string;
  };
};

export type PyroscopeProps = {
  data?: FlamebearerProfile | null;
  isContinuousProfileView?: boolean;
};

export declare const Pyroscope: FunctionComponent<PyroscopeProps>;

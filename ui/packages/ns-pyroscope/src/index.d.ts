import type { FunctionComponent } from 'react';

export type Flamebearer = {
  names: string[];
  levels: number[][];
  numTicks?: number;
  maxSelf?: number;
  format?: 'single';
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

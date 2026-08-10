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

// Source location attached to a single flamebearer name. The producer may
// omit any field; the embed only renders what is present and valid.
export type SourceLocation = {
  file?: string;
  url?: string;
  lineNumber?: number;
  columnNumber?: number;
  functionName?: string;
};

export type FlamebearerProfile = {
  version?: number;
  flamebearer: Flamebearer;
  // Parallel to `flamebearer.names`: each entry is the source location of the
  // function at `names[i]`, or null when the producer has no location for it.
  sourceByNameIndex?: Array<SourceLocation | null>;
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

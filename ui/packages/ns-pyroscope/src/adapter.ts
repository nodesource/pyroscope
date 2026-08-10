import type { Flamebearer, FlamebearerProfile } from './types.ts';

const FieldType = {
  string: 'string',
  number: 'number',
} as const;

type DataFrame = {
  length: number;
  fields: Array<{
    name: string;
    type: (typeof FieldType)[keyof typeof FieldType];
    values: ReadonlyArray<string | number>;
    config: { unit?: string };
  }>;
  numSamples?: number;
};

type Node = {
  start: number;
  total: number;
  self: number;
  nameIndex: number;
  level: number;
  children: Node[];
  totalSamples?: number;
  selfSamples?: number;
};

const FLAMEBEARER_ROUNDING_TOLERANCE = 1;

export function flamebearerToDataFrame(
  profile: FlamebearerProfile | null | undefined,
): DataFrame | undefined {
  const flamebearer = profile?.flamebearer;
  if (
    !flamebearer ||
    flamebearer.format === undefined ||
    flamebearer.format === 'single'
  ) {
    return convertSingleFlamebearer(profile);
  }
  return undefined;
}

// Map the producer-declared metadata unit to the DataFrame unit consumed by
// the renderer. Temporal profiles (nanoseconds) keep the duration formatter;
// count profiles use the short (K/Mil/Bil) formatter; bytes use the binary
// formatter. Unknown units fall back to nanoseconds for compatibility.
function toDataFrameUnit(metadataUnit: string | undefined): string {
  switch (metadataUnit) {
    case 'nanoseconds':
    case 'ns':
      return 'ns';
    case 'samples':
    case 'count':
      return 'short';
    case 'bytes':
      return 'bytes';
    default:
      return 'ns';
  }
}

function convertSingleFlamebearer(
  profile: FlamebearerProfile | null | undefined,
): DataFrame | undefined {
  const flamebearer = profile?.flamebearer;
  if (
    !flamebearer ||
    !isNames(flamebearer.names) ||
    !Array.isArray(flamebearer.levels) ||
    flamebearer.levels.length === 0
  ) {
    return undefined;
  }

  // Prefer counts the producer supplied explicitly; otherwise derive them from
  // the exporter-declared sampleRate so temporal (ns) profiles report real
  // sample numbers without the producer having to compute them. Only derive
  // for temporal geometry (nanoseconds) so rate-derived counts are never shown
  // for count/byte profiles.
  const producerCounts = decodeSampleLevels(flamebearer);
  const derivedCounts = producerCounts ?? deriveSampleLevelsFromRate(flamebearer, profile);
  const sampleCounts = derivedCounts?.levelCounts;
  const numSamples = derivedCounts?.numSamples;
  // A profile carrying no sample evidence (neither supplied nor derivable)
  // cannot be labelled with sample numbers; it still renders its (temporal)
  // duration.
  const hasSamples =
    sampleCounts !== undefined &&
    isNonNegativeInteger(numSamples);

  const levels: Node[][] = [];
  for (
    let levelIndex = 0;
    levelIndex < flamebearer.levels.length;
    levelIndex++
  ) {
    const level = decodeLevel(
      flamebearer.levels[levelIndex],
      levelIndex,
      sampleCounts?.[levelIndex],
    );
    if (!level?.length) return undefined;
    levels.push(level);
  }

  if (levels[0].length !== 1 || levels[0][0].total <= 0) return undefined;

  for (let levelIndex = 1; levelIndex < levels.length; levelIndex++) {
    const parents = levels[levelIndex - 1];
    for (const node of levels[levelIndex]) {
      const matchingParents = parents.filter((parent) =>
        isWithinParent(node, parent),
      );
      if (matchingParents.length !== 1) return undefined;
      matchingParents[0].children.push(node);
    }
  }

  const labels: string[] = [];
  const nodeLevels: number[] = [];
  const values: number[] = [];
  const selfValues: number[] = [];
  const sampleValues: number[] = [];
  const selfSampleValues: number[] = [];
  const stack = [levels[0][0]];

  while (stack.length > 0) {
    const node = stack.shift();
    if (!node) return undefined;
    const label = flamebearer.names[node.nameIndex];
    if (label === undefined) return undefined;

    labels.push(label);
    nodeLevels.push(node.level);
    values.push(node.total);
    selfValues.push(node.self);
    sampleValues.push(node.totalSamples ?? 0);
    selfSampleValues.push(node.selfSamples ?? 0);
    stack.unshift(...node.children);
  }

  const length = labels.length;
  if (length !== levels.reduce((count, level) => count + level.length, 0)) {
    return undefined;
  }

  const unit = toDataFrameUnit(profile?.metadata?.units);
  const fields: DataFrame['fields'] = [
    {
      name: 'level',
      type: FieldType.number,
      values: nodeLevels,
      config: {},
    },
    {
      name: 'label',
      type: FieldType.string,
      values: labels,
      config: {},
    },
    {
      name: 'self',
      type: FieldType.number,
      values: selfValues,
      config: { unit },
    },
    {
      name: 'value',
      type: FieldType.number,
      values,
      config: { unit },
    },
  ];

  // Only attach sample fields when the producer supplied valid counts, so a
  // temporal profile without them never renders nanosecond durations as
  // samples.
  if (hasSamples) {
    fields.push(
      {
        name: 'samples',
        type: FieldType.number,
        values: sampleValues,
        config: { unit: 'short' },
      },
      {
        name: 'selfSamples',
        type: FieldType.number,
        values: selfSampleValues,
        config: { unit: 'short' },
      },
    );
  }

  const frame: DataFrame = {
    length,
    fields,
  };
  if (hasSamples) frame.numSamples = numSamples;
  return frame;
}

type DerivedCounts = {
  numSamples: number;
  levelCounts: number[][];
};

// Validate that `sampleLevels` is aligned with `levels`: same number of
// levels, exactly two safe non-negative integers per node in the same order,
// with selfSamples <= totalSamples. Returns the decoded counts per level, or
// undefined when any invariant fails so the caller falls back to rendering
// duration only.
function decodeSampleLevels(
  flamebearer: Flamebearer,
): DerivedCounts | undefined {
  const sampleLevels = flamebearer.sampleLevels;
  if (sampleLevels == null) return undefined;

  const { levels } = flamebearer;
  if (
    !Array.isArray(sampleLevels) ||
    sampleLevels.length !== levels.length
  ) {
    return undefined;
  }

  if (!isNonNegativeInteger(flamebearer.numSamples)) return undefined;

  const decoded: number[][] = [];
  for (let levelIndex = 0; levelIndex < levels.length; levelIndex++) {
    const level = sampleLevels[levelIndex];
    const nodeCount = levels[levelIndex].length / 4;
    if (!Array.isArray(level) || !Number.isInteger(nodeCount)) return undefined;
    // Two integers per node (totalSamples, selfSamples).
    if (level.length !== nodeCount * 2) return undefined;

    const counts: number[] = [];
    for (let index = 0; index < level.length; index += 2) {
      const totalSamples = level[index];
      const selfSamples = level[index + 1];
      if (
        !isNonNegativeInteger(totalSamples) ||
        !isNonNegativeInteger(selfSamples) ||
        selfSamples > totalSamples
      ) {
        return undefined;
      }
      counts.push(totalSamples, selfSamples);
    }
    decoded.push(counts);
  }

  return { numSamples: flamebearer.numSamples!, levelCounts: decoded };
}

// Derive per-node sample counts from the exporter-declared sampleRate when the
// producer did not supply explicit counts. Only applies to temporal geometry
// (`units` nanosecond) so the derivation never mislabels count/byte profiles.
// Returns { numSamples, levelCounts } aligned to `levels`, or undefined when
// any invariant fails so the caller falls back to rendering duration only.
function deriveSampleLevelsFromRate(
  flamebearer: Flamebearer,
  profile: FlamebearerProfile | null | undefined,
): DerivedCounts | undefined {
  const sampleRate = profile?.metadata?.sampleRate;
  const rate = typeof sampleRate === 'number' ? sampleRate : NaN;
  if (!Number.isFinite(rate) || rate <= 0) return undefined;

  const unit = profile?.metadata?.units;
  if (unit !== 'nanoseconds' && unit !== 'ns') return undefined;

  const { levels } = flamebearer;
  if (!Array.isArray(levels) || levels.length === 0) return undefined;

  const periodNs = 1e9 / rate;
  if (!Number.isFinite(periodNs) || periodNs <= 0) return undefined;

  const rootTotalNs = levels[0][1];
  if (!isNonNegativeFinite(rootTotalNs) || rootTotalNs <= 0) return undefined;

  const numSamples = Math.round(rootTotalNs / periodNs);
  if (!isNonNegativeInteger(numSamples) || numSamples <= 0) return undefined;

  const levelCounts: number[][] = [];
  for (let levelIndex = 0; levelIndex < levels.length; levelIndex++) {
    const level = levels[levelIndex];
    if (!Array.isArray(level) || level.length === 0 || level.length % 4 !== 0) {
      return undefined;
    }
    const counts: number[] = [];
    for (let index = 0; index < level.length; index += 4) {
      const totalNs = level[index + 1];
      const selfNs = level[index + 2];
      if (!isNonNegativeFinite(totalNs) || !isNonNegativeFinite(selfNs)) {
        return undefined;
      }
      const totalSamples = Math.round(totalNs / periodNs);
      // Rounding may nudge selfSamples a hair over totalSamples for nodes
      // whose self and total are nearly equal; clamp to stay within the
      // renderer contract (selfSamples <= totalSamples).
      const selfSamples = Math.min(
        totalSamples,
        Math.round(selfNs / periodNs),
      );
      if (!isNonNegativeInteger(totalSamples) || !isNonNegativeInteger(selfSamples)) {
        return undefined;
      }
      counts.push(totalSamples, selfSamples);
    }
    levelCounts.push(counts);
  }

  return { numSamples, levelCounts };
}

function decodeLevel(
  level: unknown,
  levelIndex: number,
  sampleCounts?: number[],
): Node[] | undefined {
  if (!Array.isArray(level) || level.length === 0 || level.length % 4 !== 0) {
    return undefined;
  }

  const nodes: Node[] = [];
  let previousEnd = 0;

  for (let index = 0; index < level.length; index += 4) {
    const encodedOffset = level[index];
    const total = level[index + 1];
    const self = level[index + 2];
    const nameIndex = level[index + 3];
    if (
      !isRoundingTolerantOffset(encodedOffset) ||
      !isNonNegativeFinite(total) ||
      !isNonNegativeFinite(self) ||
      self > total ||
      !Number.isSafeInteger(nameIndex) ||
      nameIndex < 0
    ) {
      return undefined;
    }

    const start = previousEnd + encodedOffset;
    const end = start + total;
    if (
      !Number.isSafeInteger(start) ||
      start < 0 ||
      !Number.isSafeInteger(end)
    ) {
      return undefined;
    }

    const node: Node = {
      start,
      total,
      self,
      nameIndex,
      level: levelIndex,
      children: [],
    };

    if (sampleCounts) {
      const nodeIndex = index / 4;
      const totalSamples = sampleCounts[nodeIndex * 2];
      const selfSamples = sampleCounts[nodeIndex * 2 + 1];
      if (
        !isNonNegativeInteger(totalSamples) ||
        !isNonNegativeInteger(selfSamples) ||
        selfSamples > totalSamples
      ) {
        return undefined;
      }
      node.totalSamples = totalSamples;
      node.selfSamples = selfSamples;
    }

    nodes.push(node);
    previousEnd = end;
  }

  return nodes;
}

function isWithinParent(node: Node, parent: Node): boolean {
  const nodeEnd = node.start + node.total;
  const parentEnd = parent.start + parent.total;
  const startsInside =
    node.total === 0
      ? node.start >= parent.start && node.start <= parentEnd
      : node.start >= parent.start && node.start < parentEnd;
  return startsInside && nodeEnd <= parentEnd + FLAMEBEARER_ROUNDING_TOLERANCE;
}

function isNames(value: unknown): value is string[] {
  return (
    Array.isArray(value) &&
    value.length > 0 &&
    value.every((name) => typeof name === 'string')
  );
}

function isNonNegativeFinite(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0;
}

function isNonNegativeInteger(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0;
}

function isRoundingTolerantOffset(value: unknown): value is number {
  return (
    typeof value === 'number' && Number.isSafeInteger(value) && value >= -1
  );
}

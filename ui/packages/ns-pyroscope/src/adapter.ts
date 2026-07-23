import type { FlamebearerProfile } from './types.ts';

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
};

type Node = {
  start: number;
  total: number;
  self: number;
  nameIndex: number;
  level: number;
  children: Node[];
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

  const levels: Node[][] = [];
  for (
    let levelIndex = 0;
    levelIndex < flamebearer.levels.length;
    levelIndex++
  ) {
    const level = decodeLevel(flamebearer.levels[levelIndex], levelIndex);
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
    stack.unshift(...node.children);
  }

  const length = labels.length;
  if (length !== levels.reduce((count, level) => count + level.length, 0)) {
    return undefined;
  }

  return {
    length,
    fields: [
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
        config: { unit: 'ns' },
      },
      {
        name: 'value',
        type: FieldType.number,
        values,
        config: { unit: 'ns' },
      },
    ],
  };
}

function decodeLevel(level: unknown, levelIndex: number): Node[] | undefined {
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

    nodes.push({
      start,
      total,
      self,
      nameIndex,
      level: levelIndex,
      children: [],
    });
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

function isRoundingTolerantOffset(value: unknown): value is number {
  return (
    typeof value === 'number' && Number.isSafeInteger(value) && value >= -1
  );
}

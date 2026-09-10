import { strict as assert } from 'node:assert';
import { describe, it } from 'node:test';

import { FlameGraphDataContainer } from '../../../src/lib/flamegraph/FlameGraph/dataTransform.ts';
import type { LevelItem } from '../../../src/lib/flamegraph/FlameGraph/dataTransform.ts';
import {
  mergeParentSubtrees,
  mergeSubtrees,
} from '../../../src/lib/flamegraph/FlameGraph/treeTransforms.ts';

// Sandwich view fixtures are small DataFrames in DFS preorder: each row is
// [level, label, value, self], which is the order nestedSetToLevels expects.
type Row = [level: number, label: string, value: number, self: number];

function makeContainer(rows: Row[]): FlameGraphDataContainer {
  return new FlameGraphDataContainer(
    {
      fields: [
        {
          name: 'level',
          type: 'number' as const,
          values: rows.map((row) => row[0]),
          config: {},
        },
        {
          name: 'label',
          type: 'string' as const,
          values: rows.map((row) => row[1]),
          config: {},
        },
        {
          name: 'value',
          type: 'number' as const,
          values: rows.map((row) => row[2]),
          config: {},
        },
        {
          name: 'self',
          type: 'number' as const,
          values: rows.map((row) => row[3]),
          config: {},
        },
      ],
      length: rows.length,
    },
    { collapsing: false },
  );
}

function item(
  index: number,
  value: number,
  children: LevelItem[] = [],
): LevelItem {
  return { start: 0, value, itemIndexes: [index], children, level: 0 };
}

// Caller-path fixture: a node linked to its first-parent chain (parents are
// read in order, and only parents[0] is ever followed).
function callerItem(
  index: number,
  value: number,
  parents: LevelItem[] = [],
): LevelItem {
  return {
    start: 0,
    value,
    itemIndexes: [index],
    children: [],
    level: 0,
    parents,
  };
}

// Labels by itemIndex, matching how the transforms and the projection resolve
// the merged rows through getLabel(itemIndexes[0]).
function labelResolver(labels: string[]) {
  return (index: number) => labels[index];
}

// Cycle-safe projection of a level forest: nodes get ids from their position in
// the returned levels and edges are projected to those ids, so the whole graph
// shape can be compared instead of only sums or counts.
function project(
  levels: LevelItem[][],
  getLabel: (index: number) => string,
): Array<Array<Record<string, unknown>>> {
  const ids = new Map<LevelItem, string>();
  levels.forEach((level, levelIndex) => {
    level.forEach((entry, entryIndex) => {
      ids.set(entry, `L${levelIndex}#${entryIndex}`);
    });
  });
  return levels.map((level) =>
    level.map((entry) => ({
      label: getLabel(entry.itemIndexes[0]),
      value: entry.value,
      start: entry.start,
      level: entry.level,
      itemIndexes: [...entry.itemIndexes],
      children: entry.children.map((child) => ids.get(child)),
      parents: (entry.parents ?? []).map((parent) => ids.get(parent)),
    })),
  );
}

describe('mergeSubtrees sibling grouping', () => {
  it('merges same-label siblings and offsets later groups by earlier values', () => {
    const labels = ['root', 'alpha', 'beta', 'alpha'];
    const first = item(1, 30);
    const beta = item(2, 20);
    const second = item(3, 50);
    const root = item(0, 100, [first, beta, second]);

    const levels = mergeSubtrees(
      [root],
      { getLabel: labelResolver(labels) },
      'children',
    );

    assert.deepEqual(project(levels, labelResolver(labels)), [
      [
        {
          label: 'root',
          value: 100,
          start: 0,
          level: 0,
          itemIndexes: [0],
          children: ['L1#0', 'L1#1'],
          parents: [],
        },
      ],
      [
        {
          label: 'alpha',
          value: 80,
          start: 0,
          level: 1,
          itemIndexes: [1, 3],
          children: [],
          parents: ['L0#0'],
        },
        {
          label: 'beta',
          value: 20,
          start: 80,
          level: 1,
          itemIndexes: [2],
          children: [],
          parents: ['L0#0'],
        },
      ],
    ]);

    // The input forest is read, not reordered or rewritten.
    assert.deepEqual(
      root.children.map((child) => child.itemIndexes),
      [[1], [2], [3]],
    );
    assert.deepEqual(root.children, [first, beta, second]);
  });

  it('keeps one sibling offset accumulator per output parent', () => {
    const labels = ['root', 'p1', 'p2', 'c1a', 'c1b', 'c2a', 'c2b'];
    const p1 = item(1, 10, [item(3, 1), item(4, 2)]);
    const p2 = item(2, 20, [item(5, 3), item(6, 4)]);
    const root = item(0, 30, [p1, p2]);

    const levels = mergeSubtrees(
      [root],
      { getLabel: labelResolver(labels) },
      'children',
    );

    assert.deepEqual(project(levels, labelResolver(labels)), [
      [
        {
          label: 'root',
          value: 30,
          start: 0,
          level: 0,
          itemIndexes: [0],
          children: ['L1#0', 'L1#1'],
          parents: [],
        },
      ],
      [
        {
          label: 'p1',
          value: 10,
          start: 0,
          level: 1,
          itemIndexes: [1],
          children: ['L2#0', 'L2#1'],
          parents: ['L0#0'],
        },
        {
          label: 'p2',
          value: 20,
          start: 10,
          level: 1,
          itemIndexes: [2],
          children: ['L2#2', 'L2#3'],
          parents: ['L0#0'],
        },
      ],
      [
        {
          label: 'c1a',
          value: 1,
          start: 0,
          level: 2,
          itemIndexes: [3],
          children: [],
          parents: ['L1#0'],
        },
        {
          label: 'c1b',
          value: 2,
          start: 1,
          level: 2,
          itemIndexes: [4],
          children: [],
          parents: ['L1#0'],
        },
        {
          label: 'c2a',
          value: 3,
          start: 10,
          level: 2,
          itemIndexes: [5],
          children: [],
          parents: ['L1#1'],
        },
        {
          label: 'c2b',
          value: 4,
          start: 13,
          level: 2,
          itemIndexes: [6],
          children: [],
          parents: ['L1#1'],
        },
      ],
    ]);
  });

  it('keeps Object.values ordering for integer-like labels', () => {
    const labels = ['root', '2', '10', '6'];
    const root = item(0, 6, [item(1, 1), item(2, 2), item(3, 3)]);

    const levels = mergeSubtrees(
      [root],
      { getLabel: labelResolver(labels) },
      'children',
    );

    // Integer-like group keys come back in ascending numeric order (2, 6, 10)
    // even though they were first seen as 2, 10, 6.
    assert.deepEqual(
      levels[1].map((entry) => [
        labels[entry.itemIndexes[0]],
        entry.value,
        entry.start,
      ]),
      [
        ['2', 1, 0],
        ['6', 3, 1],
        ['10', 2, 4],
      ],
    );
  });

  it('preserves the existing zero fallback for a non-finite sibling sum', () => {
    const labels = ['root', 'first', 'second'];
    const root = item(0, 1, [item(1, Number.NaN), item(2, 1)]);
    const levels = mergeSubtrees([root], { getLabel: labelResolver(labels) });

    assert.equal(Number.isNaN(levels[1][0].value), true);
    assert.deepEqual(
      levels[1].map((entry) => entry.start),
      [0, 0],
    );
  });

  it('accumulates sibling starts in sequential order for fractional values', () => {
    const labels = ['root', 'a', 'b', 'c', 'd'];
    const root = item(0, 1.3, [
      item(1, 0.1),
      item(2, 0.2),
      item(3, 0.3),
      item(4, 0.7),
    ]);

    const levels = mergeSubtrees(
      [root],
      { getLabel: labelResolver(labels) },
      'children',
    );

    // Exact IEEE-754 results of (((0 + 0.1) + 0.2) + 0.3); a different
    // addition order produces 0.6 for the last start.
    assert.deepEqual(
      levels[1].map((entry) => [labels[entry.itemIndexes[0]], entry.start]),
      [
        ['a', 0],
        ['b', 0.1],
        ['c', 0.30000000000000004],
        ['d', 0.6000000000000001],
      ],
    );
  });
});

describe('mergeParentSubtrees direct callers traversal', () => {
  it('sums per-root contributions through a shared ancestor without deduplicating', () => {
    const labels = ['grand', 'p', 'r1', 'r2'];
    const grand = callerItem(0, 100);
    const p = callerItem(1, 40, [grand]);
    const r1 = callerItem(2, 10, [p]);
    const r2 = callerItem(3, 30, [p]);

    const levels = mergeParentSubtrees([r1, r2], {
      getLabel: labelResolver(labels),
    });

    // Both chains carry their own root value (10 and 30), never the shared
    // ancestor's data-frame total (100), and both occurrences stay visible.
    assert.deepEqual(project(levels, labelResolver(labels)), [
      [
        {
          label: 'grand',
          value: 40,
          start: 0,
          level: 0,
          itemIndexes: [0, 0],
          children: ['L1#0'],
          parents: [],
        },
      ],
      [
        {
          label: 'p',
          value: 40,
          start: 0,
          level: 1,
          itemIndexes: [1, 1],
          children: ['L2#0'],
          parents: ['L0#0'],
        },
      ],
      [
        {
          label: 'r1',
          value: 40,
          start: 0,
          level: 2,
          itemIndexes: [2, 3],
          children: [],
          parents: ['L1#0'],
        },
      ],
    ]);
  });

  it('follows only the first parent entry', () => {
    const labels = ['alt', 'p', 'r'];
    const alt = callerItem(0, 99);
    const p = callerItem(1, 50, [alt]);
    const r = callerItem(2, 7, [p, alt]);

    const levels = mergeParentSubtrees([r], {
      getLabel: labelResolver(labels),
    });

    assert.deepEqual(project(levels, labelResolver(labels)), [
      [
        {
          label: 'alt',
          value: 7,
          start: 0,
          level: 0,
          itemIndexes: [0],
          children: ['L1#0'],
          parents: [],
        },
      ],
      [
        {
          label: 'p',
          value: 7,
          start: 0,
          level: 1,
          itemIndexes: [1],
          children: ['L2#0'],
          parents: ['L0#0'],
        },
      ],
      [
        {
          label: 'r',
          value: 7,
          start: 0,
          level: 2,
          itemIndexes: [2],
          children: [],
          parents: ['L1#0'],
        },
      ],
    ]);
  });

  it('keeps recursive occurrences and stops at parentless roots', () => {
    const labels = ['main', 'work', 'main'];
    const root = callerItem(0, 100);
    const work = callerItem(1, 60, [root]);
    const nested = callerItem(2, 30, [work]);

    const levels = mergeParentSubtrees([root, nested], {
      getLabel: labelResolver(labels),
    });

    // The parentless root contributes only its own occurrence; the nested
    // 'main' walks up to the same ancestor under its own contribution.
    assert.deepEqual(project(levels, labelResolver(labels)), [
      [
        {
          label: 'main',
          value: 30,
          start: 0,
          level: 0,
          itemIndexes: [0],
          children: ['L1#0'],
          parents: [],
        },
      ],
      [
        {
          label: 'work',
          value: 30,
          start: 0,
          level: 1,
          itemIndexes: [1],
          children: ['L2#0'],
          parents: ['L0#0'],
        },
      ],
      [
        {
          label: 'main',
          value: 130,
          start: 0,
          level: 2,
          itemIndexes: [0, 2],
          children: [],
          parents: ['L1#0'],
        },
      ],
    ]);
  });

  it('orders integer-like caller groups by Object.values', () => {
    const labels = ['2', '10', '6', 'rA', 'rB', 'rC'];
    const p2 = callerItem(0, 1);
    const p10 = callerItem(1, 2);
    const p6 = callerItem(2, 3);
    const rA = callerItem(3, 5, [p2]);
    const rB = callerItem(4, 6, [p10]);
    const rC = callerItem(5, 7, [p6]);

    const levels = mergeParentSubtrees([rA, rB, rC], {
      getLabel: labelResolver(labels),
    });

    // Keys were first seen as 2, 10, 6 but integer-like keys come back in
    // ascending numeric order, which also drives the running starts.
    assert.deepEqual(
      levels[0].map((entry) => [
        labels[entry.itemIndexes[0]],
        entry.value,
        entry.start,
      ]),
      [
        ['2', 5, 0],
        ['6', 7, 5],
        ['10', 6, 12],
      ],
    );
    assert.equal(levels[1][0].value, 18);
    assert.deepEqual(levels[1][0].itemIndexes, [3, 4, 5]);
  });

  it('falls back from a NaN sibling contribution when computing later starts', () => {
    const labels = ['pNaN', 'pOk', 'rNaN', 'rOk'];
    const pNaN = callerItem(0, 1);
    const pOk = callerItem(1, 2);
    const rNaN = callerItem(2, Number.NaN, [pNaN]);
    const rOk = callerItem(3, 5, [pOk]);

    const levels = mergeParentSubtrees([rNaN, rOk], {
      getLabel: labelResolver(labels),
    });

    assert.equal(Number.isNaN(levels[1][0].value), true);
    assert.equal(Number.isNaN(levels[0][0].value), true);
    assert.equal(levels[0][1].value, 5);
    // The NaN accumulator falls back to the previous start instead of NaN.
    assert.deepEqual(
      levels[0].map((entry) => entry.start),
      [0, 0],
    );
  });

  it('preserves the single empty root level for empty input', () => {
    const levels = mergeParentSubtrees([], { getLabel: labelResolver([]) });

    assert.equal(levels.length, 1);
    assert.deepEqual(levels[0], [
      {
        start: 0,
        value: 0,
        itemIndexes: [],
        children: [],
        level: 0,
        parents: [],
      },
    ]);
  });

  it('does not mutate the input nodes or their parent arrays', () => {
    const labels = ['grand', 'p', 'r'];
    const grand = callerItem(0, 100);
    const p = callerItem(1, 40, [grand]);
    const r = callerItem(2, 10, [p]);

    mergeParentSubtrees([r], { getLabel: labelResolver(labels) });

    assert.equal(r.value, 10);
    assert.deepEqual(r.itemIndexes, [2]);
    assert.deepEqual(r.parents, [p]);
    assert.deepEqual(r.children, []);
    assert.equal(p.value, 40);
    assert.deepEqual(p.parents, [grand]);
    assert.deepEqual(p.children, []);
    assert.equal(grand.value, 100);
    assert.deepEqual(grand.parents, []);
  });
});

describe('FlameGraphDataContainer.getSandwichLevels', () => {
  it('merges a repeated label across depths for callers and callees', () => {
    const container = makeContainer([
      [0, 'main', 100, 10],
      [1, 'work', 70, 10],
      [2, 'main', 50, 10],
      [2, 'leaf', 20, 5],
      [1, 'idle', 30, 10],
    ]);
    const projectTree = () =>
      project(container.getLevels(), (index) => container.getLabel(index));
    const before = projectTree();

    const [callers, callees] = container.getSandwichLevels('main');

    assert.deepEqual(
      project(callers, (index) => container.getLabel(index)),
      [
        [
          {
            label: 'main',
            value: 50,
            start: 0,
            level: 0,
            itemIndexes: [0],
            children: ['L1#0'],
            parents: [],
          },
        ],
        [
          {
            label: 'work',
            value: 50,
            start: 0,
            level: 1,
            itemIndexes: [1],
            children: ['L2#0'],
            parents: ['L0#0'],
          },
        ],
        [
          {
            label: 'main',
            value: 150,
            start: 0,
            level: 2,
            itemIndexes: [0, 2],
            children: [],
            parents: ['L1#0'],
          },
        ],
      ],
    );

    assert.deepEqual(
      project(callees, (index) => container.getLabel(index)),
      [
        [
          {
            label: 'main',
            value: 150,
            start: 0,
            level: 0,
            itemIndexes: [0, 2],
            children: ['L1#0', 'L1#1'],
            parents: [],
          },
        ],
        [
          {
            label: 'work',
            value: 70,
            start: 0,
            level: 1,
            itemIndexes: [1],
            children: ['L2#0', 'L2#1'],
            parents: ['L0#0'],
          },
          {
            label: 'idle',
            value: 30,
            start: 70,
            level: 1,
            itemIndexes: [4],
            children: [],
            parents: ['L0#0'],
          },
        ],
        [
          {
            label: 'main',
            value: 50,
            start: 0,
            level: 2,
            itemIndexes: [2],
            children: [],
            parents: ['L1#0'],
          },
          {
            label: 'leaf',
            value: 20,
            start: 50,
            level: 2,
            itemIndexes: [3],
            children: [],
            parents: ['L1#0'],
          },
        ],
      ],
    );

    assert.deepEqual(projectTree(), before);
  });

  it('merges a broad repeated label and keeps every merged item index', () => {
    const rows: Row[] = [[0, 'main', 80, 0]];
    for (let index = 0; index < 8; index++) {
      rows.push([1, 'work', 10, 0]);
    }
    const container = makeContainer(rows);
    const projectTree = () =>
      project(container.getLevels(), (index) => container.getLabel(index));
    const before = projectTree();

    const [callers, callees] = container.getSandwichLevels('work');

    assert.deepEqual(
      project(callers, (index) => container.getLabel(index)),
      [
        [
          {
            label: 'main',
            value: 80,
            start: 0,
            level: 0,
            itemIndexes: [0, 0, 0, 0, 0, 0, 0, 0],
            children: ['L1#0'],
            parents: [],
          },
        ],
        [
          {
            label: 'work',
            value: 80,
            start: 0,
            level: 1,
            itemIndexes: [1, 2, 3, 4, 5, 6, 7, 8],
            children: [],
            parents: ['L0#0'],
          },
        ],
      ],
    );

    assert.deepEqual(
      project(callees, (index) => container.getLabel(index)),
      [
        [
          {
            label: 'work',
            value: 80,
            start: 0,
            level: 0,
            itemIndexes: [1, 2, 3, 4, 5, 6, 7, 8],
            children: [],
            parents: [],
          },
        ],
      ],
    );

    assert.deepEqual(projectTree(), before);
  });

  it('groups callers per parent and keeps shared ancestors separate', () => {
    const container = makeContainer([
      [0, 'main', 100, 10],
      [1, 'work', 60, 10],
      [2, 'target', 10, 5],
      [2, 'target', 20, 5],
      [1, 'other', 40, 10],
      [2, 'target', 5, 5],
    ]);
    const projectTree = () =>
      project(container.getLevels(), (index) => container.getLabel(index));
    const before = projectTree();

    const [callers] = container.getSandwichLevels('target');

    // The two caller branches keep the shared 'main' ancestor as separate
    // rows (30 and 5), not as one row of the ancestor's total; callers are
    // grouped per output parent, so the second branch starts after the first.
    assert.deepEqual(
      project(callers, (index) => container.getLabel(index)),
      [
        [
          {
            label: 'main',
            value: 30,
            start: 0,
            level: 0,
            itemIndexes: [0, 0],
            children: ['L1#0'],
            parents: [],
          },
          {
            label: 'main',
            value: 5,
            start: 30,
            level: 0,
            itemIndexes: [0],
            children: ['L1#1'],
            parents: [],
          },
        ],
        [
          {
            label: 'work',
            value: 30,
            start: 0,
            level: 1,
            itemIndexes: [1, 1],
            children: ['L2#0'],
            parents: ['L0#0'],
          },
          {
            label: 'other',
            value: 5,
            start: 30,
            level: 1,
            itemIndexes: [4],
            children: ['L2#0'],
            parents: ['L0#1'],
          },
        ],
        [
          {
            label: 'target',
            value: 35,
            start: 0,
            level: 2,
            itemIndexes: [2, 3, 5],
            children: [],
            parents: ['L1#0', 'L1#1'],
          },
        ],
      ],
    );

    assert.deepEqual(projectTree(), before);
  });

  it('returns empty caller and callee levels for an absent label', () => {
    const container = makeContainer([[0, 'main', 10, 10]]);
    assert.deepEqual(container.getSandwichLevels('missing'), [[], []]);
  });
});

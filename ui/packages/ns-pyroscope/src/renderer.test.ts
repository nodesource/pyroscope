import { strict as assert } from 'node:assert';
import { describe, it } from 'node:test';

import { FlameGraphDataContainer } from '../../../src/lib/flamegraph/FlameGraph/dataTransform.ts';
import type { LevelItem } from '../../../src/lib/flamegraph/FlameGraph/dataTransform.ts';
import { getPrimaryPillText } from '../../../src/lib/flamegraph/FlameGraph/metadata.ts';
import {
  getCollapsedGroupSource,
  getTooltipData,
} from '../../../src/lib/flamegraph/FlameGraph/tooltipData.ts';

import { flamebearerToDataFrame } from './adapter.ts';
import {
  consoleShapeProfile,
  consoleShapeSources,
  nodeModulesProfile,
  nodeModulesSources,
} from './contract.fixture.ts';

const NS = (value: number) =>
  value * 1_000_000_000;

function buildTemporalFrame({
  selfValues = [NS(0.3), NS(0.9)],
  values = [NS(2.92), NS(1.75)],
  samples,
  selfSamples,
  numSamples,
  sources,
}: {
  selfValues?: number[];
  values?: number[];
  samples?: number[];
  selfSamples?: number[];
  numSamples?: number;
  sources?: Array<string>;
} = {}) {
  const fields: Array<{
    name: string;
    type: 'number' | 'string';
    values: Array<string | number>;
    config: { unit?: string };
  }> = [
    { name: 'level', type: 'number', values: [0, 1], config: {} },
    { name: 'label', type: 'string', values: ['total', 'app.work'], config: {} },
    { name: 'self', type: 'number', values: selfValues, config: { unit: 'ns' } },
    { name: 'value', type: 'number', values: values, config: { unit: 'ns' } },
  ];
  if (samples && selfSamples) {
    fields.push({
      name: 'samples',
      type: 'number',
      values: samples,
      config: { unit: 'short' },
    });
    fields.push({
      name: 'selfSamples',
      type: 'number',
      values: selfSamples,
      config: { unit: 'short' },
    });
  }
  if (sources) {
    fields.push({
      name: 'source',
      type: 'string',
      values: sources,
      config: {},
    });
  }
  return new FlameGraphDataContainer(
    { fields: fields as never, length: values.length, numSamples } as never,
    { collapsing: false },
  );
}

describe('metadata pill', () => {
  it('shows duration and sample count independently for temporal profiles', () => {
    const container = buildTemporalFrame({
      samples: [2922, 1753],
      selfSamples: [300, 900],
      numSamples: 2922,
    });
    assert.equal(
      getPrimaryPillText(container, container.getValue(0), undefined),
      '2.92 s | 2.92 K samples (Time)',
    );
  });

  it('shows only duration when the temporal profile has no valid counts', () => {
    const container = buildTemporalFrame();
    assert.equal(
      getPrimaryPillText(container, container.getValue(0), undefined),
      '2.92 s (Time)',
    );
  });

  it('keeps the previous count rendering for Count profiles', () => {
    const fields = [
      { name: 'level', type: 'number', values: [0, 1], config: {} },
      { name: 'label', type: 'string', values: ['total', 'x'], config: {} },
      { name: 'self', type: 'number', values: [300, 900], config: { unit: 'short' } },
      { name: 'value', type: 'number', values: [2922, 1753], config: { unit: 'short' } },
    ] as never;
    const container = new FlameGraphDataContainer(
      { fields, length: 2 } as never,
      { collapsing: false },
    );
    assert.equal(container.getUnitTitle(), 'Count');
    assert.equal(
      getPrimaryPillText(container, container.getValue(0), undefined),
      '2.92 K | 2.92 K samples (Count)',
    );
  });

  it('drops the sample segment in sandwich view', () => {
    const container = buildTemporalFrame({
      samples: [2922, 1753],
      selfSamples: [300, 900],
      numSamples: 2922,
    });
    assert.equal(
      getPrimaryPillText(container, container.getValue(0), 'app.work'),
      '2.92 s (Time)',
    );
  });
});

describe('tooltip samples', () => {
  it('reports exact sample counts from the samples field', () => {
    const container = buildTemporalFrame({
      samples: [1500, 1422],
      selfSamples: [300, 900],
      numSamples: 2922,
    });
    const tooltip = getTooltipData(
      container,
      { start: 0, value: container.getValue([0, 1]), itemIndexes: [0, 1], children: [], level: 0 },
      container.getValue(0),
    );
    assert.equal(tooltip.samples, '2,922');
  });

  it('sums sample counts for merged indexes', () => {
    const container = buildTemporalFrame({
      values: [NS(2.92), NS(1.4), NS(0.35)],
      selfValues: [NS(0.3), NS(0.9), NS(0.2)],
      samples: [2922, 1500, 1422],
      selfSamples: [300, 900, 900],
      numSamples: 2922,
    });
    const tooltip = getTooltipData(
      container,
      { start: 0, value: container.getValue([1, 2]), itemIndexes: [1, 2], children: [], level: 1 },
      container.getValue(0),
    );
    assert.equal(tooltip.samples, '2,922');
  });

  it('scales sandwich-trimmed nodes proportionally and rounds', () => {
    const container = buildTemporalFrame({
      values: [NS(2.92), NS(2.92)],
      selfValues: [NS(0.3), NS(0.9)],
      samples: [2922, 2922],
      selfSamples: [300, 900],
      numSamples: 2922,
    });
    // The callers tree trimmed a merged node to half its original value.
    const tooltip = getTooltipData(
      container,
      { start: 0, value: NS(1.46), itemIndexes: [0, 1], children: [], level: 0 },
      container.getValue(0),
    );
    assert.equal(tooltip.samples, '1,461');
  });

  it('never labels nanoseconds as samples without a sample field', () => {
    const container = buildTemporalFrame();
    const tooltip = getTooltipData(
      container,
      { start: 0, value: container.getValue(0), itemIndexes: [0], children: [], level: 0 },
      container.getValue(0),
    );
    assert.equal(tooltip.samples, undefined);
  });

  it('keeps the count as samples for Count profiles', () => {
    const fields = [
      { name: 'level', type: 'number', values: [0, 1], config: {} },
      { name: 'label', type: 'string', values: ['total', 'x'], config: {} },
      { name: 'self', type: 'number', values: [300, 900], config: { unit: 'short' } },
      { name: 'value', type: 'number', values: [2922, 1753], config: { unit: 'short' } },
    ] as never;
    const container = new FlameGraphDataContainer(
      { fields, length: 2 } as never,
      { collapsing: false },
    );
    const tooltip = getTooltipData(
      container,
      { start: 0, value: container.getValue(0), itemIndexes: [0], children: [], level: 0 },
      container.getValue(0),
    );
    assert.equal(tooltip.samples, '2,922');
  });
});

describe('source getter', () => {
  it('returns the aligned source string for a row with a source field', () => {
    const container = buildTemporalFrame({
      sources: ['', 'app.work.ts:42:7'],
    });
    assert.equal(container.getSource(0), undefined);
    assert.equal(container.getSource(1), 'app.work.ts:42:7');
  });

  it('returns undefined without a source field (generic frames unaffected)', () => {
    const container = buildTemporalFrame();
    assert.equal(container.getSource(0), undefined);
    assert.equal(container.getSource(1), undefined);
  });

  it('merges homogeneous sources but hides heterogeneous merged rows', () => {
    const homogeneous = buildTemporalFrame({
      values: [NS(0.1), NS(0.1), NS(0.1)],
      selfValues: [NS(0.05), NS(0.05), NS(0.05)],
      sources: ['a.ts:1', 'a.ts:1', 'a.ts:1'],
    });
    assert.equal(homogeneous.getSource([0, 1, 2]), 'a.ts:1');

    // Missing (empty) entries are ignored and do not contradict the source.
    const withMissing = buildTemporalFrame({
      values: [NS(0.1), NS(0.1), NS(0.1)],
      selfValues: [NS(0.05), NS(0.05), NS(0.05)],
      sources: ['a.ts:1', '', 'a.ts:1'],
    });
    assert.equal(withMissing.getSource([0, 1, 2]), 'a.ts:1');

    // Two distinct non-empty sources hide the location entirely.
    const heterogeneous = buildTemporalFrame({
      values: [NS(0.1), NS(0.1), NS(0.1)],
      selfValues: [NS(0.05), NS(0.05), NS(0.05)],
      sources: ['a.ts:1', 'b.ts:2', 'b.ts:2'],
    });
    assert.equal(heterogeneous.getSource([0, 1, 2]), undefined);
    assert.equal(heterogeneous.getSource(0), 'a.ts:1');
    assert.equal(heterogeneous.getSource([1, 2]), 'b.ts:2');
  });

  it('returns undefined for an empty index set', () => {
    const container = buildTemporalFrame({ sources: ['a.ts:1', 'a.ts:1'] });
    assert.equal(container.getSource([]), undefined);
  });
});

describe('tooltip source', () => {
  it('exposes the row source in the tooltip data', () => {
    const container = buildTemporalFrame({
      sources: ['', 'app.work.ts:42:7'],
    });
    const tooltip = getTooltipData(
      container,
      { start: 0, value: container.getValue([0, 1]), itemIndexes: [1], children: [], level: 1 },
      container.getValue(0),
    );
    assert.equal(tooltip.source, 'app.work.ts:42:7');
  });

  it('keeps source undefined when the frame has no source field (fallback)', () => {
    const container = buildTemporalFrame();
    const tooltip = getTooltipData(
      container,
      { start: 0, value: container.getValue(0), itemIndexes: [0], children: [], level: 0 },
      container.getValue(0),
    );
    assert.equal(tooltip.source, undefined);
  });

  it('resolves the source across merged indexes for the tooltip', () => {
    const container = buildTemporalFrame({
      values: [NS(0.1), NS(0.1), NS(0.1)],
      selfValues: [NS(0.05), NS(0.05), NS(0.05)],
      sources: ['a.ts:1', 'a.ts:1', 'b.ts:2'],
    });
    const tooltip = getTooltipData(
      container,
      { start: 0, value: container.getValue([0, 1]), itemIndexes: [0, 1], children: [], level: 0 },
      container.getValue(0),
    );
    assert.equal(tooltip.source, 'a.ts:1');
  });

  it('hides the source for merged indexes with distinct sources', () => {
    const container = buildTemporalFrame({
      values: [NS(0.1), NS(0.1), NS(0.1)],
      selfValues: [NS(0.05), NS(0.05), NS(0.05)],
      sources: ['a.ts:1', 'b.ts:2', 'b.ts:2'],
    });
    const tooltip = getTooltipData(
      container,
      { start: 0, value: container.getValue([0, 1]), itemIndexes: [0, 1], children: [], level: 0 },
      container.getValue(0),
    );
    assert.equal(tooltip.source, undefined);
  });

  it('keeps the Console contract path raw in tooltip text data (no pre-escape)', () => {
    const frame = flamebearerToDataFrame(consoleShapeProfile);
    const container = new FlameGraphDataContainer(
      frame as never,
      { collapsing: false },
    );

    // The first 'main' row (nameIndex 1) carries the HTML-special-character path.
    const tooltip = getTooltipData(
      container,
      { start: 0, value: container.getValue(1), itemIndexes: [1], children: [], level: 1 },
      container.getValue(0),
    );
    assert.equal(tooltip.source, consoleShapeSources[1]);
    assert.match(tooltip.source, /[<>&]/);

    // The second 'main' row (nameIndex 2) resolves to its own source.
    const otherMain = getTooltipData(
      container,
      { start: 0, value: container.getValue(3), itemIndexes: [3], children: [], level: 1 },
      container.getValue(0),
    );
    assert.equal(otherMain.source, consoleShapeSources[3]);

    // Merging the two 'main' rows hides the location entirely.
    const merged = getTooltipData(
      container,
      { start: 0, value: container.getValue([1, 3]), itemIndexes: [1, 3], children: [], level: 0 },
      container.getValue(0),
    );
    assert.equal(merged.source, undefined);
  });

  it('shows the normalized file (not the absolute url) for node_modules', () => {
    const frame = flamebearerToDataFrame(nodeModulesProfile);
    const container = new FlameGraphDataContainer(
      frame as never,
      { collapsing: false },
    );

    assert.equal(container.getSource(1), nodeModulesSources[1]);
    const tooltip = getTooltipData(
      container,
      { start: 0, value: container.getValue(1), itemIndexes: [1], children: [], level: 1 },
      container.getValue(0),
    );
    assert.equal(tooltip.source, 'node_modules/lodash/index.js:3:1');
  });
});

describe('collapsed group source', () => {
  function groupSource(frameSources: string[]) {
    const container = new FlameGraphDataContainer(
      {
        fields: [
          { name: 'level', type: 'number', values: [0, 1, 2], config: {} },
          { name: 'label', type: 'string', values: ['total', 'x', 'x'], config: {} },
          { name: 'self', type: 'number', values: [0, 1, 1], config: { unit: 'ns' } },
          { name: 'value', type: 'number', values: [2, 1, 1], config: { unit: 'ns' } },
          { name: 'source', type: 'string', values: frameSources, config: {} },
        ],
        length: 3,
      } as never,
      { collapsing: false },
    );
    const members: LevelItem[] = [
      { start: 0, value: 1, itemIndexes: [1], children: [], level: 1 },
      { start: 0, value: 1, itemIndexes: [2], children: [], level: 2 },
    ];
    return getCollapsedGroupSource(container, {
      items: members,
      collapsed: true,
    });
  }

  it('shows the shared source for a homogeneous collapsed group', () => {
    assert.equal(groupSource(['', 'x.ts:1', 'x.ts:1']), 'x.ts:1');
  });

  it('ignores members without source metadata', () => {
    assert.equal(groupSource(['', '', 'x.ts:1']), 'x.ts:1');
  });

  it('hides the location for a collapsed group spanning distinct sources', () => {
    assert.equal(groupSource(['', 'x.ts:1', 'y.ts:2']), undefined);
  });

  it('hides when a member is itself a heterogeneous merge', () => {
    const container = new FlameGraphDataContainer(
      {
        fields: [
          { name: 'level', type: 'number', values: [0, 1, 1, 2], config: {} },
          { name: 'label', type: 'string', values: ['total', 'x', 'x', 'x'], config: {} },
          { name: 'self', type: 'number', values: [0, 1, 1, 1], config: { unit: 'ns' } },
          { name: 'value', type: 'number', values: [3, 1, 1, 1], config: { unit: 'ns' } },
          { name: 'source', type: 'string', values: ['', 'a.ts:1', '', 'b.ts:2'], config: {} },
        ],
        length: 4,
      } as never,
      { collapsing: false },
    );
    const members: LevelItem[] = [
      { start: 0, value: 1, itemIndexes: [1, 2], children: [], level: 1 },
      { start: 0, value: 1, itemIndexes: [3], children: [], level: 2 },
    ];
    assert.equal(
      getCollapsedGroupSource(container, {
        items: members,
        collapsed: true,
      }),
      undefined,
    );
  });

  it('hides nested conflicts: member [a, b] plus member [a] spans distinct sources (exact regression)', () => {
    const container = new FlameGraphDataContainer(
      {
        fields: [
          { name: 'level', type: 'number', values: [0, 1, 1, 2], config: {} },
          { name: 'label', type: 'string', values: ['total', 'x', 'x', 'x'], config: {} },
          { name: 'self', type: 'number', values: [0, 1, 1, 1], config: { unit: 'ns' } },
          { name: 'value', type: 'number', values: [3, 1, 1, 1], config: { unit: 'ns' } },
          { name: 'source', type: 'string', values: ['', 'a.ts:1', 'b.ts:2', ''], config: {} },
        ],
        length: 4,
      } as never,
      { collapsing: false },
    );
    // Member one is a heterogeneous merge [a, b]; member two resolves to a.
    const members: LevelItem[] = [
      { start: 0, value: 2, itemIndexes: [1, 2], children: [], level: 1 },
      { start: 0, value: 1, itemIndexes: [1], children: [], level: 2 },
    ];
    assert.equal(
      getCollapsedGroupSource(container, {
        items: members,
        collapsed: true,
      }),
      undefined,
    );
  });
});

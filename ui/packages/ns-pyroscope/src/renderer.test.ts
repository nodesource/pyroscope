import { strict as assert } from 'node:assert';
import { describe, it } from 'node:test';

import { FlameGraphDataContainer } from '../../../src/lib/flamegraph/FlameGraph/dataTransform.ts';
import { getPrimaryPillText } from '../../../src/lib/flamegraph/FlameGraph/metadata.ts';
import { getTooltipData } from '../../../src/lib/flamegraph/FlameGraph/tooltipData.ts';

const NS = (value: number) =>
  value * 1_000_000_000;

function buildTemporalFrame({
  selfValues = [NS(0.3), NS(0.9)],
  values = [NS(2.92), NS(1.75)],
  samples,
  selfSamples,
  numSamples,
}: {
  selfValues?: number[];
  values?: number[];
  samples?: number[];
  selfSamples?: number[];
  numSamples?: number;
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

import { strict as assert } from 'node:assert';
import { describe, it } from 'node:test';

import { getTableDensityMetrics } from '../../../src/lib/flamegraph/TopTable/tableDensity.ts';

import { flamebearerToDataFrame } from './adapter.ts';
import type { FlamebearerProfile } from './types.ts';

describe('flamebearerToDataFrame', () => {
  it('decodes delta levels into nested-set preorder with nanosecond units', () => {
    const profile: FlamebearerProfile = {
      version: 1,
      flamebearer: {
        format: 'single',
        names: ['total', 'left', 'right', 'nested'],
        levels: [
          [0, 100, 10, 0],
          [0, 60, 20, 1, 0, 40, 30, 2],
          [10, 20, 5, 3],
        ],
      },
      metadata: { units: 'samples' },
    };
    const original = structuredClone(profile);

    const frame = flamebearerToDataFrame(profile);

    assert.deepEqual(profile, original);
    assert.equal(frame?.length, 4);
    assert.deepEqual(frame?.fields[0].values, [0, 1, 2, 1]);
    assert.deepEqual(frame?.fields[1].values, [
      'total',
      'left',
      'nested',
      'right',
    ]);
    assert.deepEqual(frame?.fields[2].values, [10, 20, 5, 30]);
    assert.deepEqual(frame?.fields[3].values, [100, 60, 20, 40]);
    assert.equal(frame?.fields[2].config.unit, 'ns');
    assert.equal(frame?.fields[3].config.unit, 'ns');
  });

  it('returns an empty result for missing and zero profiles', () => {
    assert.equal(flamebearerToDataFrame(undefined), undefined);
    assert.equal(
      flamebearerToDataFrame({
        flamebearer: { names: ['total'], levels: [[0, 0, 0, 0]] },
      }),
      undefined,
    );
  });

  it('accepts one nanosecond of parent-boundary rounding drift', () => {
    const frame = flamebearerToDataFrame({
      flamebearer: {
        names: ['total', 'first child', 'rounded child'],
        levels: [
          [0, 10, 0, 0],
          [0, 6, 1, 1, -1, 5, 1, 2],
        ],
      },
    });

    assert.equal(frame?.length, 3);
    assert.deepEqual(frame?.fields[1].values, [
      'total',
      'first child',
      'rounded child',
    ]);
  });

  for (const [name, profile] of [
    [
      'incomplete tuple',
      { flamebearer: { names: ['total'], levels: [[0, 1, 0]] } },
    ],
    [
      'invalid name index',
      { flamebearer: { names: ['total'], levels: [[0, 1, 0, 2]] } },
    ],
    [
      'self greater than total',
      { flamebearer: { names: ['total'], levels: [[0, 1, 2, 0]] } },
    ],
    [
      'child outside its parent',
      {
        flamebearer: {
          names: ['total', 'child'],
          levels: [
            [0, 10, 0, 0],
            [20, 1, 0, 1],
          ],
        },
      },
    ],
  ] as const) {
    it(`returns an empty result for ${name}`, () => {
      assert.equal(
        flamebearerToDataFrame(profile as FlamebearerProfile),
        undefined,
      );
    });
  }
});

describe('top table density', () => {
  it('keeps the renderer compact by default', () => {
    assert.deepEqual(getTableDensityMetrics(), {
      rowHeight: 25,
      headerHeight: 27,
    });
  });

  it('provides comfortable metrics for the NodeSource embed', () => {
    assert.deepEqual(getTableDensityMetrics('comfortable'), {
      rowHeight: 36,
      headerHeight: 29,
    });
  });
});

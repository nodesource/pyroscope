import { strict as assert } from 'node:assert';
import { describe, it } from 'node:test';

import { getTableDensityMetrics } from '../../../src/lib/flamegraph/TopTable/tableDensity.ts';

import { flamebearerToDataFrame } from './adapter.ts';
import {
  consoleOmittedFieldsProfile,
  consoleOmittedFieldsSources,
  consoleShapeProfile,
  consoleShapeSources,
  nodeModulesProfile,
  nodeModulesSources,
} from './contract.fixture.ts';
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
      metadata: { units: 'nanoseconds' },
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

  it('maps metadata units to the DataFrame unit', () => {
    const units: Array<[string, string]> = [
      ['nanoseconds', 'ns'],
      ['ns', 'ns'],
      ['samples', 'short'],
      ['count', 'short'],
      ['bytes', 'bytes'],
      ['made-up-unit', 'ns'],
    ];
    for (const [metadataUnit, expected] of units) {
      const frame = flamebearerToDataFrame({
        flamebearer: {
          names: ['total'],
          levels: [[0, 1000000000, 1000000000, 0]],
        },
        metadata: { units: metadataUnit },
      });
      assert.equal(frame?.fields[2].config.unit, expected, metadataUnit);
      assert.equal(frame?.fields[3].config.unit, expected, metadataUnit);
    }
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

  it('encodes producer-provided sample counts into optional sample fields', () => {
    const profile: FlamebearerProfile = {
      version: 1,
      flamebearer: {
        format: 'single',
        names: ['total', 'left', 'nested'],
        // Level 0: one root; level 1: two nodes (left, nested order in BFS is
        // left then nested). Levels carry nanosecond geometry; sampleLevels
        // carry [totalSamples, selfSamples] per node in the same order.
        levels: [
          [0, 100, 10, 0],
          [0, 60, 30, 1, 0, 40, 30, 2],
        ],
        numSamples: 2922,
        sampleLevels: [
          [2922, 300],
          [1753, 900, 1169, 900],
        ],
      },
      metadata: { units: 'nanoseconds' },
    };

    const frame = flamebearerToDataFrame(profile);

    assert.equal(frame?.length, 3);
    assert.equal(frame?.numSamples, 2922);

    const samples = frame?.fields.find((f) => f.name === 'samples');
    const selfSamples = frame?.fields.find((f) => f.name === 'selfSamples');
    assert.ok(samples, 'samples field present');
    assert.ok(selfSamples, 'selfSamples field present');
    // Aligned to the BFS ordering of the dataframe (total, left, nested).
    assert.deepEqual(samples?.values, [2922, 1753, 1169]);
    assert.deepEqual(selfSamples?.values, [300, 900, 900]);
    assert.deepEqual(samples?.config, { unit: 'short' });
  });

  it('keeps duration only when sampleLevels are misaligned or invalid', () => {
    const base = {
      flamebearer: {
        names: ['total', 'child'],
        levels: [
          [0, 100, 10, 0],
          [0, 90, 20, 1],
        ],
      },
      metadata: { units: 'nanoseconds' },
    };
    const fallbacks: FlamebearerProfile[] = [
      // numSamples is not a safe non-negative integer
      { ...base, flamebearer: { ...base.flamebearer, numSamples: -1, sampleLevels: [[100, 10], [90, 20]] } },
      // fewer levels than levels
      { ...base, flamebearer: { ...base.flamebearer, numSamples: 100, sampleLevels: [[100, 10]] } },
      // more levels than levels
      { ...base, flamebearer: { ...base.flamebearer, numSamples: 100, sampleLevels: [[100, 10], [90, 20], [1, 1]] } },
      // not two integers per node (odd length)
      { ...base, flamebearer: { ...base.flamebearer, numSamples: 100, sampleLevels: [[100, 10], [90]] } },
      // selfSamples greater than totalSamples
      { ...base, flamebearer: { ...base.flamebearer, numSamples: 100, sampleLevels: [[100, 10], [90, 95]] } },
      // non-integer count
      { ...base, flamebearer: { ...base.flamebearer, numSamples: 100, sampleLevels: [[100, 10], [90.5, 20]] } },
    ];

    for (const profile of fallbacks) {
      const frame = flamebearerToDataFrame(profile);
      // The temporal profile still decodes...
      assert.equal(frame?.length, 2, 'tree decodes despite invalid counts');
      // ...but without any sample fields so nothing renders as samples.
      assert.equal(
        frame?.fields.find((f) => f.name === 'samples'),
        undefined,
      );
      assert.equal(frame?.numSamples, undefined);
    }
  });

  it('omits sample fields when no sampleLevels are provided', () => {
    const frame = flamebearerToDataFrame({
      flamebearer: {
        names: ['total'],
        levels: [[0, 100, 10, 0]],
        numSamples: 50,
      },
      metadata: { units: 'nanoseconds' },
    });
    assert.equal(frame?.length, 1);
    assert.equal(frame?.numSamples, undefined);
    assert.equal(frame?.fields.find((f) => f.name === 'samples'), undefined);
  });

  it('derives sample counts from the sampleRate for temporal profiles', () => {
    // sampleRate 1000 Hz => period 1ms. Root total is 2.922s in ns.
    const profile: FlamebearerProfile = {
      flamebearer: {
        names: ['total', 'left', 'right'],
        levels: [
          [0, 2922000000, 300000000, 0],
          [0, 1753000000, 900000000, 1, 0, 1169000000, 900000000, 2],
        ],
      },
      metadata: { units: 'nanoseconds', sampleRate: 1000 },
    };

    const frame = flamebearerToDataFrame(profile);

    assert.equal(frame?.length, 3);
    assert.equal(frame?.numSamples, 2922);

    const samples = frame?.fields.find((f) => f.name === 'samples');
    const selfSamples = frame?.fields.find((f) => f.name === 'selfSamples');
    assert.ok(samples, 'samples field present');
    assert.ok(selfSamples, 'selfSamples field present');
    assert.deepEqual(samples?.values, [2922, 1753, 1169]);
    assert.deepEqual(selfSamples?.values, [300, 900, 900]);
  });

  it('does not derive samples for non-temporal or rateless profiles', () => {
    // Missing sampleRate => no derivation.
    const noRate = flamebearerToDataFrame({
      flamebearer: {
        names: ['total'],
        levels: [[0, 2922000000, 300000000, 0]],
      },
      metadata: { units: 'nanoseconds' },
    });
    assert.equal(noRate?.fields.find((f) => f.name === 'samples'), undefined);

    // Count profile, even with a sampleRate, keeps count semantics only.
    const count = flamebearerToDataFrame({
      flamebearer: {
        names: ['total'],
        levels: [[0, 2922000000, 300000000, 0]],
      },
      metadata: { units: 'samples', sampleRate: 1000 },
    });
    assert.equal(count?.fields.find((f) => f.name === 'samples'), undefined);
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
      // These fixtures are deliberately malformed; the double cast bypasses
      // TS2352 from readonly `as const` literals without widening their types.
      assert.equal(
        flamebearerToDataFrame(profile as unknown as FlamebearerProfile),
        undefined,
      );
    });
  }
});

describe('flamebearerToDataFrame sourceByNameIndex', () => {
  const baseProfile: FlamebearerProfile = {
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
    metadata: { units: 'nanoseconds' },
  };

  function sourceField(frame: ReturnType<typeof flamebearerToDataFrame>) {
    return frame?.fields.find((f) => f.name === 'source');
  }

  it('maps each nameIndex to its source aligned to the dataframe rows', () => {
    // Row order is BFS preorder (total, left, nested, right) with nameIndexes
    // 0, 1, 3, 2 respectively.
    const frame = flamebearerToDataFrame({
      ...baseProfile,
      sourceByNameIndex: [
        null,
        {
          url: 'https://github.com/app/a.ts',
          file: 'local/a.ts',
          lineNumber: 10,
          columnNumber: 2,
        },
        { file: 'b.ts', lineNumber: 3 },
        { file: 'nested.ts' },
      ],
    });

    assert.deepEqual(frame?.fields[1].values, [
      'total',
      'left',
      'nested',
      'right',
    ]);
    assert.deepEqual(sourceField(frame)?.values, [
      '',
      'local/a.ts:10:2',
      'nested.ts',
      'b.ts:3',
    ]);
    // file is preferred over url for the visible path.
    assert.equal(sourceField(frame)?.values[1], 'local/a.ts:10:2');
  });

  it('keeps distinct sources for rows that share the same label', () => {
    const frame = flamebearerToDataFrame({
      flamebearer: {
        names: ['total', 'work', 'work'],
        levels: [
          [0, 100, 10, 0],
          [0, 60, 20, 1, 0, 40, 30, 2],
        ],
      },
      sourceByNameIndex: [
        null,
        { file: 'a.js', lineNumber: 5 },
        { file: 'b.js', lineNumber: 7 },
      ],
    });

    assert.deepEqual(frame?.fields[1].values, ['total', 'work', 'work']);
    assert.deepEqual(sourceField(frame)?.values, ['', 'a.js:5', 'b.js:7']);
  });

  it('only appends line and column when they are safe non-negative integers', () => {
    const frame = flamebearerToDataFrame({
      flamebearer: {
        names: ['n0', 'n1', 'n2', 'n3', 'n4', 'n5'],
        levels: [
          [0, 600, 60, 0],
          [0, 100, 20, 1, 0, 100, 20, 2, 0, 100, 20, 3, 0, 100, 20, 4, 0, 100, 20, 5],
        ],
      },
      sourceByNameIndex: [
        null,
        { file: 'ok.ts', lineNumber: 4, columnNumber: 0 },
        { file: 'neg.ts', lineNumber: -3 },
        { file: 'float.ts', lineNumber: 2.5, columnNumber: 1 },
        { file: 'str.ts', lineNumber: '12' as unknown as number },
        { file: 'noline.ts', columnNumber: 8 },
      ],
    });

    assert.deepEqual(sourceField(frame)?.values, [
      '',
      'ok.ts:4:0',
      'neg.ts',
      'float.ts',
      'str.ts',
      'noline.ts',
    ]);
  });

  it('never parses ambiguous path strings', () => {
    const frame = flamebearerToDataFrame({
      ...baseProfile,
      sourceByNameIndex: [
        null,
        { file: 'src/app.ts:100', lineNumber: 5 },
      ],
    });
    assert.equal(sourceField(frame)?.values[1], 'src/app.ts:100:5');
  });

  it('omits the source field when no sourceByNameIndex is provided', () => {
    const frame = flamebearerToDataFrame(baseProfile);
    assert.equal(frame?.length, 4);
    assert.equal(sourceField(frame), undefined);
  });

  it('degrades gracefully on malformed source metadata', () => {
    const notAnArray = {
      ...baseProfile,
      sourceByNameIndex: 'nope' as unknown as Array<never>,
    };
    // Still renders, with no source field.
    const invalid = flamebearerToDataFrame(notAnArray);
    assert.equal(invalid?.length, 4);
    assert.equal(sourceField(invalid), undefined);

    // Short array, null and non-object entries resolve to empty sources but
    // the profile keeps decoding.
    const partial = flamebearerToDataFrame({
      ...baseProfile,
      sourceByNameIndex: [null, 42 as unknown as null],
    });
    assert.equal(partial?.length, 4);
    assert.deepEqual(sourceField(partial)?.values, ['', '', '', '']);
  });

  it('honors the Console contract: SourceLocation objects, duplicated labels with distinct sources, raw special chars', () => {
    const frame = flamebearerToDataFrame(consoleShapeProfile);

    // Duplicated label across two nameIndexes keeps distinct sources.
    assert.deepEqual(frame?.fields[1].values, [
      'total',
      'main',
      'helper',
      'main',
    ]);
    assert.deepEqual(sourceField(frame)?.values, consoleShapeSources);

    // Special characters survive the adapter raw — React escapes at render.
    const raw = sourceField(frame)?.values[1];
    assert.equal(raw, 'https://console.example.com/<app>/main.js?a=1&b=2>:11:2');
    assert.match(raw, /[<>&]/);
  });

  it('decodes Console objects with omitted (non-null) fields', () => {
    const frame = flamebearerToDataFrame(consoleOmittedFieldsProfile);
    assert.deepEqual(frame?.fields[1].values, [
      'total',
      'noLine',
      'noCol',
      'bareFile',
    ]);
    assert.deepEqual(sourceField(frame)?.values, consoleOmittedFieldsSources);
  });

  it('tolerates null fields defensively at runtime without breaking the profile', () => {
    const frame = flamebearerToDataFrame({
      flamebearer: {
        names: ['total'],
        levels: [[0, 10, 1, 0]],
      },
      sourceByNameIndex: [
        {
          file: 'x.ts',
          url: null as unknown as string,
          lineNumber: null as unknown as number,
          columnNumber: 2,
          functionName: null as unknown as string,
        },
      ],
    });
    // The location renders from `file`; the null lineNumber (and thus the
    // column, which only appends after a valid line) is dropped.
    assert.deepEqual(sourceField(frame)?.values, ['x.ts']);
  });

  it('prefers the normalized file over the absolute url for node_modules', () => {
    const frame = flamebearerToDataFrame(nodeModulesProfile);
    assert.deepEqual(sourceField(frame)?.values, nodeModulesSources);
  });
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

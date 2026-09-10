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

describe('flamebearerToDataFrame parent range matching', () => {
  it('links a child to the only parent that contains it', () => {
    const profile: FlamebearerProfile = {
      flamebearer: {
        names: ['root', 'left', 'right', 'child'],
        levels: [
          [0, 100, 10, 0],
          [0, 40, 10, 1, 20, 40, 10, 2],
          [0, 20, 5, 3],
        ],
      },
    };
    const original = structuredClone(profile);

    const frame = flamebearerToDataFrame(profile);

    assert.deepEqual(profile, original);
    assert.equal(frame?.length, 4);
    assert.deepEqual(frame?.fields[0].values, [0, 1, 2, 1]);
    assert.deepEqual(frame?.fields[1].values, [
      'root',
      'left',
      'child',
      'right',
    ]);
    assert.deepEqual(frame?.fields[2].values, [10, 10, 5, 10]);
    assert.deepEqual(frame?.fields[3].values, [100, 40, 20, 40]);
  });

  it('rejects a child that falls in the gap between parents', () => {
    const frame = flamebearerToDataFrame({
      flamebearer: {
        names: ['root', 'left', 'right', 'orphan'],
        levels: [
          [0, 100, 10, 0],
          [0, 40, 10, 1, 20, 40, 10, 2],
          [45, 5, 5, 3],
        ],
      },
    });
    assert.equal(frame, undefined);
  });

  it('rejects a child contained by two overlapping parents', () => {
    const frame = flamebearerToDataFrame({
      flamebearer: {
        names: ['root', 'wide', 'overlapping', 'child'],
        levels: [
          [0, 100, 10, 0],
          [0, 60, 10, 1, -1, 40, 10, 2],
          [59, 1, 1, 3],
        ],
      },
    });
    assert.equal(frame, undefined);
  });

  it('rejects a zero-width node on the shared boundary of adjacent parents', () => {
    const frame = flamebearerToDataFrame({
      flamebearer: {
        names: ['root', 'left', 'right', 'boundary'],
        levels: [
          [0, 100, 10, 0],
          [0, 50, 10, 1, 0, 50, 10, 2],
          [50, 0, 0, 3],
        ],
      },
    });
    assert.equal(frame, undefined);
  });

  it('links a zero-width node that touches the end of its parent', () => {
    const frame = flamebearerToDataFrame({
      flamebearer: {
        names: ['root', 'parent', 'tail'],
        levels: [
          [0, 10, 0, 0],
          [0, 10, 0, 1],
          [10, 0, 0, 2],
        ],
      },
    });
    assert.equal(frame?.length, 3);
    assert.deepEqual(frame?.fields[1].values, ['root', 'parent', 'tail']);
  });

  it('links a zero-width child to a zero-width parent at the same start', () => {
    const frame = flamebearerToDataFrame({
      flamebearer: {
        names: ['root', 'pin', 'pin child'],
        levels: [
          [0, 10, 0, 0],
          [5, 0, 0, 1],
          [5, 0, 0, 2],
        ],
      },
    });
    assert.equal(frame?.length, 3);
    assert.deepEqual(frame?.fields[1].values, ['root', 'pin', 'pin child']);
  });

  it('accepts one nanosecond of end drift in a later parent and rejects more', () => {
    const profile = (childTotal: number): FlamebearerProfile => ({
      flamebearer: {
        names: ['root', 'left', 'right', 'drifted'],
        levels: [
          [0, 40, 0, 0],
          [0, 5, 0, 1, 15, 20, 5, 2],
          [20, childTotal, 0, 3],
        ],
      },
    });

    const frame = flamebearerToDataFrame(profile(21));
    assert.equal(frame?.length, 4);
    assert.deepEqual(frame?.fields[1].values, [
      'root',
      'left',
      'right',
      'drifted',
    ]);
    assert.deepEqual(frame?.fields[3].values, [40, 5, 20, 21]);
    assert.equal(flamebearerToDataFrame(profile(22)), undefined);
  });

  it('links a child through parents that overlap from an accepted -1 offset', () => {
    const frame = flamebearerToDataFrame({
      flamebearer: {
        names: ['root', 'first', 'overlapping', 'child'],
        levels: [
          [0, 20, 0, 0],
          [0, 10, 0, 1, -1, 5, 0, 2],
          [10, 2, 0, 3],
        ],
      },
    });
    assert.equal(frame?.length, 4);
    assert.deepEqual(frame?.fields[1].values, [
      'root',
      'first',
      'overlapping',
      'child',
    ]);
    assert.deepEqual(frame?.fields[3].values, [20, 10, 5, 2]);
  });

  it('links a child when -1 offsets make parent starts descend', () => {
    const profile: FlamebearerProfile = {
      flamebearer: {
        names: ['root', 'first', 'second', 'third', 'child'],
        levels: [
          [0, 20, 0, 0],
          [0, 2, 0, 1, 1, 0, 0, 2, -1, 2, 0, 3],
          [2, 1, 0, 4],
        ],
      },
    };
    const original = structuredClone(profile);

    const frame = flamebearerToDataFrame(profile);

    assert.deepEqual(profile, original);
    assert.equal(frame?.length, 5);
    assert.deepEqual(frame?.fields[0].values, [0, 1, 1, 1, 2]);
    assert.deepEqual(frame?.fields[1].values, [
      'root',
      'first',
      'second',
      'third',
      'child',
    ]);
    assert.deepEqual(frame?.fields[3].values, [20, 2, 0, 2, 1]);
  });

  it('emits depth-first preorder with siblings in level order', () => {
    const frame = flamebearerToDataFrame({
      flamebearer: {
        names: ['root', 'a', 'b', 'a1', 'a2', 'b1'],
        levels: [
          [0, 25, 0, 0],
          [0, 15, 5, 1, 0, 10, 5, 2],
          [0, 5, 1, 3, 0, 8, 2, 4, 2, 5, 3, 5],
        ],
      },
    });

    assert.equal(frame?.length, 6);
    assert.deepEqual(frame?.fields[0].values, [0, 1, 2, 2, 1, 2]);
    assert.deepEqual(frame?.fields[1].values, [
      'root',
      'a',
      'a1',
      'a2',
      'b',
      'b1',
    ]);
    assert.deepEqual(frame?.fields[2].values, [0, 5, 1, 2, 5, 3]);
    assert.deepEqual(frame?.fields[3].values, [25, 15, 5, 8, 10, 5]);
  });

  it('keeps explicit samples and sources aligned on a broad tree', () => {
    const frame = flamebearerToDataFrame({
      flamebearer: {
        names: ['root', 'c1', 'c2', 'c3', 'n4', 'n5', 'n6', 'n7'],
        levels: [
          [0, 30, 5, 0],
          [0, 10, 5, 1, 0, 10, 5, 2, 0, 10, 5, 3],
          [0, 4, 1, 4, 0, 6, 1, 5, 0, 10, 1, 6, 0, 10, 1, 7],
        ],
        numSamples: 30,
        sampleLevels: [
          [30, 5],
          [10, 5, 10, 5, 10, 5],
          [4, 1, 6, 1, 10, 1, 10, 1],
        ],
      },
      sourceByNameIndex: [
        null,
        { file: 'c1.ts' },
        { file: 'c2.ts' },
        { file: 'c3.ts' },
        { file: 'n4.ts', lineNumber: 4 },
        { file: 'n5.ts' },
        { file: 'n6.ts' },
        { file: 'n7.ts' },
      ],
      metadata: { units: 'nanoseconds' },
    });

    assert.equal(frame?.length, 8);
    assert.equal(frame?.numSamples, 30);
    assert.deepEqual(frame?.fields[0].values, [0, 1, 2, 2, 1, 2, 1, 2]);
    assert.deepEqual(frame?.fields[1].values, [
      'root',
      'c1',
      'n4',
      'n5',
      'c2',
      'n6',
      'c3',
      'n7',
    ]);
    assert.deepEqual(
      frame?.fields.find((f) => f.name === 'samples')?.values,
      [30, 10, 4, 6, 10, 10, 10, 10],
    );
    assert.deepEqual(
      frame?.fields.find((f) => f.name === 'selfSamples')?.values,
      [5, 5, 1, 1, 5, 1, 5, 1],
    );
    assert.deepEqual(frame?.fields.find((f) => f.name === 'source')?.values, [
      '',
      'c1.ts',
      'n4.ts:4',
      'n5.ts',
      'c2.ts',
      'n6.ts',
      'c3.ts',
      'n7.ts',
    ]);
  });

  it('keeps derived sample counts aligned with depth-first preorder', () => {
    const frame = flamebearerToDataFrame({
      flamebearer: {
        names: ['root', 'left', 'right', 'a1', 'a2', 'b1'],
        levels: [
          [0, 2922000000, 300000000, 0],
          [0, 1753000000, 900000000, 1, 0, 1169000000, 900000000, 2],
          [
            0, 1000000000, 400000000, 3, 0, 753000000, 300000000, 4, 0,
            1169000000, 900000000, 5,
          ],
        ],
      },
      metadata: { units: 'nanoseconds', sampleRate: 1000 },
    });

    assert.equal(frame?.length, 6);
    assert.equal(frame?.numSamples, 2922);
    assert.deepEqual(frame?.fields[1].values, [
      'root',
      'left',
      'a1',
      'a2',
      'right',
      'b1',
    ]);
    assert.deepEqual(
      frame?.fields.find((f) => f.name === 'samples')?.values,
      [2922, 1753, 1000, 753, 1169, 1169],
    );
    assert.deepEqual(
      frame?.fields.find((f) => f.name === 'selfSamples')?.values,
      [300, 900, 400, 300, 900, 900],
    );
  });

  it('decodes a deep chain in preorder', () => {
    const depth = 64;
    const names = Array.from({ length: depth + 1 }, (_, index) => `n${index}`);
    const levels: number[][] = [[0, depth, 0, 0]];
    for (let levelIndex = 1; levelIndex <= depth; levelIndex++) {
      levels.push([0, depth - levelIndex, 0, levelIndex]);
    }

    const frame = flamebearerToDataFrame({
      flamebearer: { names, levels },
    });

    assert.equal(frame?.length, depth + 1);
    assert.deepEqual(
      frame?.fields[0].values,
      Array.from({ length: depth + 1 }, (_, index) => index),
    );
    assert.equal(frame?.fields[1].values[0], 'n0');
    assert.equal(frame?.fields[1].values[depth], `n${depth}`);
  });

  it('decodes a wide fan-out in level order', () => {
    const width = 500;
    const names = [
      'root',
      ...Array.from({ length: width }, (_, index) => `c${index}`),
    ];
    const level: number[] = [];
    for (let index = 0; index < width; index++) {
      level.push(0, 1, 0, index + 1);
    }

    const frame = flamebearerToDataFrame({
      flamebearer: { names, levels: [[0, width, 0, 0], level] },
    });

    assert.equal(frame?.length, width + 1);
    assert.equal(frame?.fields[1].values[0], 'root');
    assert.equal(frame?.fields[1].values[1], 'c0');
    assert.equal(frame?.fields[1].values[width], `c${width - 1}`);
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

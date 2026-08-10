import type { FlamebearerProfile } from './types.ts';

// Contract fixture: the exact shape Console emits after P1 lands — top-level
// SourceLocation object entries (never pre-formatted strings), aligned to
// `flamebearer.names`. Row order (BFS preorder) is total, main, helper, main,
// with nameIndexes 0, 1, 3, 2; the two 'main' rows share a label but carry
// distinct sources, and one path contains HTML special chars (`<`, `>`, `&`)
// so the embed can prove it keeps them raw until React escapes them.
export const consoleShapeProfile: FlamebearerProfile = {
  version: 1,
  flamebearer: {
    format: 'single',
    names: ['total', 'main', 'main', 'helper'],
    levels: [
      [0, 100, 10, 0],
      [0, 60, 20, 1, 0, 40, 30, 2],
      [10, 20, 5, 3],
    ],
  },
  sourceByNameIndex: [
    null,
    {
      url: 'https://console.example.com/<app>/main.js?a=1&b=2>',
      lineNumber: 11,
      columnNumber: 2,
    },
    { file: '/src/<src>/overloaded.js', lineNumber: 7 },
    { url: 'file:///helper.ts', lineNumber: 1 },
  ],
  metadata: { units: 'nanoseconds' },
};

// Expected `source` field values in dataframe row order (total, main, helper,
// main — nameIndexes 0, 1, 3, 2).
export const consoleShapeSources = [
  '',
  'https://console.example.com/<app>/main.js?a=1&b=2>:11:2',
  'file:///helper.ts:1',
  '/src/<src>/overloaded.js:7',
];

// Console omits invalid fields rather than sending null, so `SourceLocation`
// keeps optional, non-nullable properties. Row order (BFS) is total, noLine,
// noCol, bareFile — nameIndexes 0, 1, 2, 3.
export const consoleOmittedFieldsProfile: FlamebearerProfile = {
  version: 1,
  flamebearer: {
    format: 'single',
    names: ['total', 'noLine', 'noCol', 'bareFile'],
    levels: [
      [0, 120, 12, 0],
      [0, 40, 10, 1, 0, 40, 10, 2, 0, 40, 10, 3],
    ],
  },
  sourceByNameIndex: [
    null,
    { file: '/app/a.js' },
    { file: '/app/b.js', lineNumber: 21 },
    { file: '/app/c.js', lineNumber: 3, columnNumber: 9 },
  ],
  metadata: { units: 'nanoseconds' },
};

export const consoleOmittedFieldsSources = [
  '',
  '/app/a.js',
  '/app/b.js:21',
  '/app/c.js:3:9',
];

// Console keeps the normalized path in `file` and the absolute original URL in
// `url`; the tooltip must show the clean `file` so node_modules paths arrive
// visible. Row: total, dep (nameIndex 1).
export const nodeModulesProfile: FlamebearerProfile = {
  version: 1,
  flamebearer: {
    format: 'single',
    names: ['total', 'dep'],
    levels: [
      [0, 10, 1, 0],
      [0, 9, 2, 1],
    ],
  },
  sourceByNameIndex: [
    null,
    {
      file: 'node_modules/lodash/index.js',
      url: '/home/user/app/node_modules/lodash/index.js',
      lineNumber: 3,
      columnNumber: 1,
    },
  ],
  metadata: { units: 'nanoseconds' },
};

export const nodeModulesSources = ['', 'node_modules/lodash/index.js:3:1'];
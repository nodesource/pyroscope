import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import type { LevelItem } from '../../../src/lib/flamegraph/FlameGraph/dataTransform.ts';
import type { ClickedItemData } from '../../../src/lib/flamegraph/types.ts';

import { flamebearerToDataFrame } from './adapter.ts';
import {
  createFrameDetailsMenu,
  getFrameDetailsSelection,
} from './frameDetails.ts';
import type { FlamebearerProfile, PyroscopeProps } from './types.ts';

// Deliberately shuffled name indexes, two distinct names normalized to
// "worker", recursion, and a real function named "total" below the root.
const profile: FlamebearerProfile = {
  flamebearer: {
    names: ['worker', 'total', 'entry A', 'entry B', 'worker', 'total'],
    levels: [
      [0, 1000, 0, 1],
      [0, 400, 100, 2, 0, 600, 100, 3],
      [0, 300, 100, 0, 100, 500, 100, 4],
      [0, 200, 200, 0, 200, 400, 400, 5],
    ],
  },
};

function item(...itemIndexes: number[]): LevelItem {
  // A focused/merged display node need not carry its original ancestors or
  // level. Selection must use the original DataFrame row instead.
  return { itemIndexes, start: 0, value: 1000, level: 0, children: [] };
}

function frame(data = profile) {
  const result = flamebearerToDataFrame(data);
  assert.ok(result);
  return result;
}

describe('Function details selection', () => {
  it('keeps the producer name indexes aligned after preorder conversion', () => {
    assert.deepEqual(
      frame().fields.find((field) => field.name === 'nameIndex')?.values,
      [1, 2, 0, 0, 3, 4, 5],
    );
  });

  it('distinguishes equal display names in different branches after zoom', () => {
    const data = frame();
    assert.deepEqual(getFrameDetailsSelection(item(2), data), {
      name: 'worker',
      callSite: [
        { name: 'entry A', nameIndex: 2 },
        { name: 'worker', nameIndex: 0 },
      ],
    });
    assert.deepEqual(getFrameDetailsSelection(item(5), data), {
      name: 'worker',
      callSite: [
        { name: 'entry B', nameIndex: 3 },
        { name: 'worker', nameIndex: 4 },
      ],
    });
  });

  it('includes every recursive occurrence in root-to-frame order', () => {
    assert.deepEqual(getFrameDetailsSelection(item(3), frame()), {
      name: 'worker',
      callSite: [
        { name: 'entry A', nameIndex: 2 },
        { name: 'worker', nameIndex: 0 },
        { name: 'worker', nameIndex: 0 },
      ],
    });
  });

  it('omits only the synthetic root, preserving real functions named total', () => {
    assert.equal(getFrameDetailsSelection(item(0), frame()), undefined);
    assert.deepEqual(getFrameDetailsSelection(item(6), frame()), {
      name: 'total',
      callSite: [
        { name: 'entry B', nameIndex: 3 },
        { name: 'worker', nameIndex: 4 },
        { name: 'total', nameIndex: 5 },
      ],
    });
  });

  it('retains the exact supplied names and a non-synthetic root', () => {
    const data = frame({
      flamebearer: {
        ...profile.flamebearer,
        names: [
          ' worker<T>::run ',
          'process root',
          'entry A',
          'entry B',
          'worker',
          'total',
        ],
      },
    });
    assert.deepEqual(getFrameDetailsSelection(item(2), data), {
      name: ' worker<T>::run ',
      callSite: [
        { name: 'process root', nameIndex: 1 },
        { name: 'entry A', nameIndex: 2 },
        { name: ' worker<T>::run ', nameIndex: 0 },
      ],
    });
  });

  it('rejects merged occurrences with different caller paths', () => {
    assert.equal(getFrameDetailsSelection(item(2, 5), frame()), undefined);
  });

  it('accepts a merged node when its occurrences share one selector', () => {
    const data = frame({
      flamebearer: {
        names: ['total', 'entry', 'worker'],
        levels: [
          [0, 100, 0, 0],
          [0, 40, 0, 1, 0, 60, 0, 1],
          [0, 40, 40, 2, 0, 60, 60, 2],
        ],
      },
    });
    assert.deepEqual(getFrameDetailsSelection(item(2, 4), data), {
      name: 'worker',
      callSite: [
        { name: 'entry', nameIndex: 1 },
        { name: 'worker', nameIndex: 2 },
      ],
    });
  });
});

describe('Function details menu', () => {
  const clicked: ClickedItemData = {
    posX: 0,
    posY: 0,
    label: 'display label is not used to locate the frame',
    item: item(5),
  };

  it('does not enable the action without a host callback', () => {
    assert.equal(createFrameDetailsMenu(undefined), undefined);
  });

  it('calls the host only when the menu action is selected', () => {
    const selections: Array<
      Parameters<NonNullable<PyroscopeProps['onFrameDetails']>>[0]
    > = [];
    const menu = createFrameDetailsMenu((selection) =>
      selections.push(selection),
    );
    assert.ok(menu);
    const buttons = menu(clicked, frame(), { search: '' });
    assert.equal(buttons.length, 1);
    assert.equal(buttons[0].label, 'Function details');
    assert.deepEqual(selections, []);
    buttons[0].onClick();
    assert.deepEqual(selections, [
      {
        name: 'worker',
        callSite: [
          { name: 'entry B', nameIndex: 3 },
          { name: 'worker', nameIndex: 4 },
        ],
      },
    ]);
    assert.deepEqual(
      menu({ ...clicked, item: item(2, 5) }, frame(), { search: '' }),
      [],
    );
  });
});

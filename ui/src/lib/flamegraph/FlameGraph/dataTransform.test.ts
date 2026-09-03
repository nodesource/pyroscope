import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  CollapsedMap,
  type CollapseConfig,
  type LevelItem,
} from './dataTransform.ts';

// CollapsedMap only relies on key identity for LevelItem entries and reads
// CollapseConfig values, so minimal fixtures are enough here.
function item(): LevelItem {
  return { start: 0, value: 10, itemIndexes: [0], children: [], level: 0 };
}

function groupConfig(collapsed: boolean, items: LevelItem[]): CollapseConfig {
  return { items, collapsed };
}

function mapOf(...configs: CollapseConfig[]): CollapsedMap {
  const map = new Map<LevelItem, CollapseConfig>();
  for (const config of configs) {
    // Mirror how CollapsedMapBuilder indexes groups: every item in the group
    // is a key pointing at the shared config.
    for (const it of config.items) {
      map.set(it, config);
    }
  }
  return new CollapsedMap(map);
}

describe('CollapsedMap.isAllExpanded', () => {
  it('returns false for an empty map', () => {
    assert.equal(new CollapsedMap().isAllExpanded(), false);
  });

  it('returns false when every group is collapsed', () => {
    const map = mapOf(groupConfig(true, [item()]), groupConfig(true, [item()]));
    assert.equal(map.isAllExpanded(), false);
  });

  it('returns true after setAllCollapsedStatus(false)', () => {
    const map = mapOf(groupConfig(true, [item()]), groupConfig(true, [item()]));
    assert.equal(map.setAllCollapsedStatus(false).isAllExpanded(), true);
  });

  it('returns false for mixed collapsed and expanded groups', () => {
    const map = mapOf(groupConfig(false, [item()]), groupConfig(true, [item()]));
    assert.equal(map.isAllExpanded(), false);
  });

  it('returns false again after collapsing all on an expanded map', () => {
    const map = mapOf(groupConfig(false, [item()]));
    assert.equal(map.setAllCollapsedStatus(true).isAllExpanded(), false);
  });
});

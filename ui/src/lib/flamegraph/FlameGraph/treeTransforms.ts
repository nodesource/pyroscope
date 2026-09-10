function groupBy<T>(
  items: T[],
  keyFn: (item: T) => string,
): Record<string, T[]> {
  const groups: Record<string, T[]> = {};
  for (const item of items) {
    const key = keyFn(item);
    (groups[key] = groups[key] || []).push(item);
  }
  return groups;
}

import { type LevelItem } from './dataTransform.ts';

type DataInterface = {
  getLabel: (index: number) => string;
};

// Internal queue entry for mergeSubtrees. The sibling offset accumulator is kept here instead of on the public
// LevelItem output: every group enqueued from one output parent shares the same object.
type MergeWork = {
  previous: undefined | LevelItem;
  items: LevelItem[];
  level: number;
  // Running sum of the values of this output parent's already-processed sibling groups. It reproduces the previous
  // per-group reduce over previous[direction] without rescanning the processed siblings, and preserves the same
  // sequential addition order.
  siblingOffset: undefined | { value: number };
};

// One original node on a first-parent chain. The contribution stays the selected root's value, mirroring the old
// getParentSubtrees behavior where every copied ancestor was resized to the root value instead of its own data-frame
// total; walking originals avoids materializing those copied chains.
type CallerCursor = {
  node: LevelItem;
  contribution: number;
};

// Internal queue entry for the direct callers traversal in mergeParentSubtrees. It uses the same head-index queue and
// shared sibling accumulator mechanics as mergeSubtrees, but its input is a list of original-node cursors.
type CallerWork = {
  cursors: CallerCursor[];
  previous: undefined | LevelItem;
  level: number;
  siblingOffset: undefined | { value: number };
};

// Merge parent subtree of the roots for the callers tree in the sandwich view of the flame graph. Walks the original
// first-parent chains directly: no copied ancestor LevelItems and no generic mergeSubtrees pass. Contributions, cursor
// order (including duplicate occurrences), grouping, output shape and level reversal mirror the previous
// getParentSubtrees + mergeSubtrees('parents') composition.
export function mergeParentSubtrees(
  roots: LevelItem[],
  data: DataInterface,
): LevelItem[][] {
  const levels: LevelItem[][] = [];
  const queue: Array<CallerWork | undefined> = [
    {
      // One cursor per occurrence, in the original root order. Contributions
      // travel alongside references so the input nodes are never copied or mutated.
      cursors: roots.map((node) => ({ node, contribution: node.value })),
      previous: undefined,
      level: 0,
      siblingOffset: undefined,
    },
  ];
  let head = 0;

  while (head < queue.length) {
    const args = queue[head]!;
    queue[head] = undefined;
    head++;

    const itemIndexes: number[] = [];
    let value = 0;
    for (const cursor of args.cursors) {
      value += cursor.contribution;
      for (const index of cursor.node.itemIndexes) {
        itemIndexes.push(index);
      }
    }

    const newItem: LevelItem = {
      value,
      itemIndexes,
      children: [],
      parents: [],
      start: 0,
      level: args.level,
    };

    levels[args.level] = levels[args.level] || [];
    levels[args.level].push(newItem);

    if (args.previous) {
      // Same linkage and start fallback as mergeSubtrees('parents').
      newItem.children = [args.previous];
      args.previous.parents!.push(newItem);
      newItem.start = args.previous.start + (args.siblingOffset!.value || 0);
      args.siblingOffset!.value += newItem.value;
    }

    const nextCursors: CallerCursor[] = [];
    for (const cursor of args.cursors) {
      // First parent entry only, exactly like getParentSubtrees did.
      const parent = cursor.node.parents?.[0];
      if (parent) {
        nextCursors.push({
          node: parent,
          contribution: cursor.contribution,
        });
      }
    }
    // Group by label with the same groupBy/Object.values key ordering as mergeSubtrees.
    const nextGroups = groupBy(nextCursors, (cursor) =>
      data.getLabel(cursor.node.itemIndexes[0]),
    );
    // One accumulator for every sibling group of this output parent.
    const siblingOffset = { value: 0 };
    for (const group of Object.values(nextGroups)) {
      queue.push({
        cursors: group,
        previous: newItem,
        level: args.level + 1,
        siblingOffset,
      });
    }
  }

  // The callers tree is built bottom-up, so reverse levels and renumber exactly
  // like mergeSubtrees(direction='parents').
  levels.reverse();
  levels.forEach((level, index) => {
    level.forEach((item) => {
      item.level = index;
    });
  });

  return levels;
}

// Merge subtrees into a single tree. Returns an array of levels for easy rendering. It assumes roots are mergeable,
// meaning they represent the same unit of work (same label). Then we walk the tree in a specified direction,
// merging nodes with the same label and same parent/child into single bigger node. This copies the tree (and all nodes)
// as we are creating new merged nodes and modifying the parents/children.
export function mergeSubtrees(
  roots: LevelItem[],
  data: DataInterface,
  direction: 'parents' | 'children' = 'children',
): LevelItem[][] {
  const oppositeDirection = direction === 'parents' ? 'children' : 'parents';
  const levels: LevelItem[][] = [];

  // Loop instead of recursion to be sure we don't blow stack size limit and save some memory. Each queue item is
  // basically a list of arrays you would pass to each level of recursion. Draining with a head index (instead of
  // shift) and clearing the consumed slot releases the processed item arrays as soon as they are merged.
  const queue: Array<MergeWork | undefined> = [
    { previous: undefined, items: roots, level: 0, siblingOffset: undefined },
  ];
  let head = 0;

  while (head < queue.length) {
    const args = queue[head]!;
    queue[head] = undefined;
    head++;
    const indexes = args.items.flatMap((i) => i.itemIndexes);
    const newItem: LevelItem = {
      // We use the items value instead of value from the data frame, cause we could have changed it in the process
      value: args.items.reduce((acc, i) => acc + i.value, 0),
      itemIndexes: indexes,
      // these will change later
      children: [],
      parents: [],
      start: 0,
      level: args.level,
    };

    levels[args.level] = levels[args.level] || [];
    levels[args.level].push(newItem);

    if (args.previous) {
      // Not the first level, so we need to make sure we update previous items to keep the child/parent relationships
      // and compute correct new start offset for the item. The shared accumulator already holds the sum of the sibling
      // groups processed before this one, in the same sequential addition order the previous per-group reduce used.
      newItem[oppositeDirection] = [args.previous];
      newItem.start = args.previous.start + (args.siblingOffset!.value || 0);
      args.siblingOffset!.value += newItem.value;
      args.previous[direction]!.push(newItem);
    }

    const nextItems = args.items.flatMap((i) => i[direction] || []);
    // Group by label which for now is the only identifier by which we decide if node represents the same unit of work.
    const nextGroups = groupBy(nextItems, (c) =>
      data.getLabel(c.itemIndexes[0]),
    );
    // One accumulator for every sibling group of this output parent; each group adds its value exactly once when it
    // is processed, so sibling starts keep the original ordering and floating point addition order.
    const siblingOffset = { value: 0 };
    for (const g of Object.values(nextGroups)) {
      queue.push({
        previous: newItem,
        items: g,
        level: args.level + 1,
        siblingOffset,
      });
    }
  }

  // Reverse the levels if we are doing callers tree, so we return levels in the correct order.
  if (direction === 'parents') {
    levels.reverse();
    levels.forEach((level, index) => {
      level.forEach((item) => {
        item.level = index;
      });
    });
  }

  return levels;
}

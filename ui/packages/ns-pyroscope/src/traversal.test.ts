import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, describe, it } from 'node:test';
import { fileURLToPath, pathToFileURL } from 'node:url';

import {
  CollapsedMap,
  CollapsedMapBuilder,
  FlameGraphDataContainer,
  type CollapseConfig,
  type LevelItem,
} from '../../../src/lib/flamegraph/FlameGraph/dataTransform.ts';

// walkTree lives in rendering.ts, which imports FlameGraphEnvironment.tsx
// (JSX). Plain Node cannot load that graph, so the actual module is loaded
// through Vite's middleware-mode SSR transform (no port, no watcher, temp
// cache) exactly like the source is loaded in the app build.
type RenderFuncWrap = (
  item: LevelItem,
  x: number,
  y: number,
  width: number,
  height: number,
  label: string,
  muted: boolean,
) => void;

type WalkTree = (
  root: LevelItem,
  direction: 'children' | 'parents',
  data: FlameGraphDataContainer,
  totalViewTicks: number,
  rangeMin: number,
  rangeMax: number,
  wrapperWidth: number,
  collapsedMap: CollapsedMap,
  renderFunc: RenderFuncWrap,
) => void;

type CallbackEntry = [
  label: string,
  x: number,
  y: number,
  width: number,
  height: number,
  muted: boolean,
];

const uiRoot = fileURLToPath(new URL('../../..', import.meta.url));

let viteCleanup: (() => Promise<void>) | undefined;
let walkTreePromise: Promise<WalkTree> | undefined;

function loadWalkTree(): Promise<WalkTree> {
  if (!walkTreePromise) {
    walkTreePromise = (async () => {
      (globalThis as { window?: { devicePixelRatio: number } }).window = {
        devicePixelRatio: 1,
      };
      const requireFromTest = createRequire(import.meta.url);
      const viteEntry = requireFromTest.resolve('vite');
      const { createServer } = (await import(
        pathToFileURL(viteEntry).href
      )) as {
        createServer: (options: Record<string, unknown>) => Promise<{
          ssrLoadModule: (url: string) => Promise<{ walkTree: WalkTree }>;
          close: () => Promise<void>;
        }>;
      };
      const cacheDir = mkdtempSync(join(tmpdir(), 'ns-pyroscope-vite-'));
      const server = await createServer({
        root: uiRoot,
        configFile: false,
        appType: 'custom',
        logLevel: 'silent',
        server: { middlewareMode: true, hmr: false, watch: null },
        optimizeDeps: { noDiscovery: true },
        cacheDir,
      });
      viteCleanup = async () => {
        await server.close();
        rmSync(cacheDir, { recursive: true, force: true });
      };
      const mod = await server.ssrLoadModule(
        '/src/lib/flamegraph/FlameGraph/rendering.ts',
      );
      return mod.walkTree;
    })();
  }
  return walkTreePromise;
}

after(async () => {
  await viteCleanup?.();
});

function makeContainer(
  labels: string[],
  values: number[],
): FlameGraphDataContainer {
  const fields = [
    {
      name: 'level',
      type: 'number',
      values: labels.map((_, i) => i),
      config: {},
    },
    { name: 'label', type: 'string', values: labels, config: {} },
    { name: 'self', type: 'number', values: values.map(() => 0), config: {} },
    { name: 'value', type: 'number', values, config: {} },
  ];
  return new FlameGraphDataContainer(
    { fields, length: labels.length } as never,
    { collapsing: false },
  );
}

function node(
  index: number,
  level: number,
  value: number,
  start = 0,
): LevelItem {
  return { start, value, itemIndexes: [index], children: [], level };
}

function link(parent: LevelItem, child: LevelItem): void {
  child.parents = [parent];
  parent.children.push(child);
}

function trace(
  walkTree: WalkTree,
  root: LevelItem,
  data: FlameGraphDataContainer,
  map: CollapsedMap,
  direction: 'children' | 'parents' = 'children',
  options: {
    totalViewTicks?: number;
    rangeMin?: number;
    rangeMax?: number;
    wrapperWidth?: number;
  } = {},
): CallbackEntry[] {
  const calls: CallbackEntry[] = [];
  walkTree(
    root,
    direction,
    data,
    options.totalViewTicks ?? 1,
    options.rangeMin ?? 0,
    options.rangeMax ?? 1,
    options.wrapperWidth ?? 1000,
    map,
    (item, x, y, width, height, label, muted) => {
      calls.push([label, x, y, width, height, muted]);
    },
  );
  return calls;
}

type LinkSnapshot = Array<{
  node: LevelItem;
  childrenRef: LevelItem[];
  children: LevelItem[];
  parentsRef: LevelItem[] | undefined;
  parents: LevelItem[] | undefined;
  indexesRef: number[];
  indexes: number[];
}>;

function snapshotLinks(root: LevelItem): LinkSnapshot {
  const entries: LinkSnapshot = [];
  const visit = (n: LevelItem) => {
    entries.push({
      node: n,
      childrenRef: n.children,
      children: [...n.children],
      parentsRef: n.parents,
      parents: n.parents ? [...n.parents] : n.parents,
      indexesRef: n.itemIndexes,
      indexes: [...n.itemIndexes],
    });
    n.children.forEach(visit);
  };
  visit(root);
  return entries;
}

function assertLinksUnchanged(snapshot: LinkSnapshot): void {
  for (const entry of snapshot) {
    assert.equal(entry.node.children, entry.childrenRef);
    assert.deepEqual([...entry.node.children], entry.children);
    assert.equal(entry.node.parents, entry.parentsRef);
    assert.deepEqual(
      entry.node.parents ? [...entry.node.parents] : entry.node.parents,
      entry.parents,
    );
    assert.equal(entry.node.itemIndexes, entry.indexesRef);
    assert.deepEqual([...entry.node.itemIndexes], entry.indexes);
  }
}

describe('walkTree child traversal', () => {
  it('visits branching children in preorder with exact geometry, labels and muted flags', async () => {
    const walkTree = await loadWalkTree();
    const r = node(0, 0, 1);
    const a = node(1, 1, 0.4);
    const b = node(2, 1, 0.6, 400);
    const c = node(3, 2, 0.4);
    const d = node(4, 2, 0.3, 400);
    const e = node(5, 2, 0.3, 700);
    link(r, a);
    link(a, c);
    link(r, b);
    link(b, d);
    link(b, e);
    const data = makeContainer(
      ['r', 'a', 'b', 'c', 'd', 'e'],
      [1, 0.4, 0.6, 0.4, 0.3, 0.3],
    );

    assert.deepEqual(trace(walkTree, r, data, new CollapsedMap()), [
      ['r', 0, 0, 999, 22, false],
      ['a', 0, 22, 399, 22, false],
      ['c', 0, 44, 399, 22, false],
      ['b', 400000, 22, 599, 22, false],
      ['d', 400000, 44, 299, 22, false],
      ['e', 700000, 44, 299, 22, false],
    ]);
  });

  it('reports muted nodes and prunes hidden branches without descending', async () => {
    const walkTree = await loadWalkTree();
    const root = node(0, 0, 1);
    const tiny = node(1, 1, 0.005);
    const hidden = node(2, 1, 0.0004);
    const hiddenChild = node(3, 2, 1);
    link(root, tiny);
    link(root, hidden);
    link(hidden, hiddenChild);
    const data = makeContainer(
      ['root', 'tiny', 'hidden', 'hiddenChild'],
      [1, 0.005, 0.0004, 1],
    );

    assert.deepEqual(trace(walkTree, root, data, new CollapsedMap()), [
      ['root', 0, 0, 999, 22, false],
      ['tiny', 0, 22, 5, 22, true],
    ]);
  });

  it('skips callbacks for collapsed group members but still descends and accumulates levelOffset', async () => {
    const walkTree = await loadWalkTree();
    const r = node(0, 0, 1);
    const a = node(1, 1, 1);
    const b = node(2, 2, 1);
    const c = node(3, 3, 1);
    link(r, a);
    link(a, b);
    link(b, c);
    const data = makeContainer(['r', 'a', 'b', 'c'], [1, 1, 1, 1]);

    const expanded = trace(walkTree, r, data, new CollapsedMap());
    assert.deepEqual(expanded, [
      ['r', 0, 0, 999, 22, false],
      ['a', 0, 22, 999, 22, false],
      ['b', 0, 44, 999, 22, false],
      ['c', 0, 66, 999, 22, false],
    ]);

    const config: CollapseConfig = { items: [r, a], collapsed: true };
    const collapsedMap = new CollapsedMap(
      new Map<LevelItem, CollapseConfig>([
        [r, config],
        [a, config],
      ]),
    );
    assert.deepEqual(trace(walkTree, r, data, collapsedMap), [
      ['r', 0, 0, 999, 22, false],
      ['b', 0, 22, 999, 22, false],
      ['c', 0, 44, 999, 22, false],
    ]);
  });

  it('observes callback mutations of children before enqueueing them', async () => {
    const walkTree = await loadWalkTree();
    const r = node(0, 0, 1);
    const a = node(1, 1, 1);
    const b = node(2, 1, 1);
    r.children.push(a);
    a.parents = [r];
    const data = makeContainer(['r', 'a', 'b'], [1, 1, 1]);
    const calls: string[] = [];
    walkTree(
      r,
      'children',
      data,
      1,
      0,
      1,
      1000,
      new CollapsedMap(),
      (item, _x, _y, _w, _h, label) => {
        calls.push(label);
        if (item === r) {
          r.children.length = 0;
          r.children.push(b);
          b.parents = [r];
        }
      },
    );

    assert.deepEqual(calls, ['r', 'b']);
  });

  it('leaves the input tree arrays unchanged', async () => {
    const walkTree = await loadWalkTree();
    const r = node(0, 0, 1);
    const a = node(1, 1, 0.5);
    const b = node(2, 1, 0.5);
    link(r, a);
    link(r, b);
    const data = makeContainer(['r', 'a', 'b'], [1, 0.5, 0.5]);
    const snapshot = snapshotLinks(r);

    trace(walkTree, r, data, new CollapsedMap());

    assertLinksUnchanged(snapshot);
  });

  it('scales coordinates with rangeMin/rangeMax and the live devicePixelRatio', async () => {
    const walkTree = await loadWalkTree();
    const r = node(0, 0, 1, 2);
    const data = makeContainer(['r'], [1]);

    assert.deepEqual(
      trace(walkTree, r, data, new CollapsedMap(), 'children', {
        totalViewTicks: 4,
        rangeMin: 1,
        rangeMax: 3,
      }),
      [['r', -250, 0, 124, 22, false]],
    );

    const w = globalThis as { window: { devicePixelRatio: number } };
    const previous = w.window.devicePixelRatio;
    try {
      w.window.devicePixelRatio = 2;
      assert.deepEqual(
        trace(walkTree, r, data, new CollapsedMap(), 'children', {
          totalViewTicks: 4,
          rangeMin: 1,
          rangeMax: 3,
        }),
        [['r', -500, 0, 249, 22, false]],
      );
    } finally {
      w.window.devicePixelRatio = previous;
    }
  });
});

describe('walkTree parents traversal', () => {
  it('follows parents in order and visits a shared ancestor once per parent path', async () => {
    const walkTree = await loadWalkTree();
    const n = node(0, 2, 1);
    const p1 = node(1, 1, 1);
    const p2 = node(2, 1, 1);
    const q = node(3, 0, 1);
    n.parents = [p1, p2];
    p1.parents = [q];
    p2.parents = [q];
    q.parents = [];
    const data = makeContainer(['n', 'p1', 'p2', 'q'], [1, 1, 1, 1]);

    assert.deepEqual(trace(walkTree, n, data, new CollapsedMap(), 'parents'), [
      ['n', 0, 44, 999, 22, false],
      ['p1', 0, 22, 999, 22, false],
      ['q', 0, 0, 999, 22, false],
      ['p2', 0, 22, 999, 22, false],
      ['q', 0, 0, 999, 22, false],
    ]);
  });
});

describe('CollapsedMapBuilder.addTree', () => {
  function collapseMapOf(root: LevelItem, threshold?: number) {
    const builder = new CollapsedMapBuilder(threshold);
    builder.addTree(root);
    return builder.getCollapsedMap();
  }

  it('collapses a single-child chain into one shared config in items order', () => {
    const r = node(0, 0, 100);
    const a = node(1, 1, 100);
    const b = node(2, 2, 100);
    const c = node(3, 3, 100);
    link(r, a);
    link(a, b);
    link(b, c);
    const map = collapseMapOf(r);
    const config = map.get(r)!;

    assert.deepEqual(config, { items: [r, a, b, c], collapsed: true });
    assert.equal(map.get(a), config);
    assert.equal(map.get(b), config);
    assert.equal(map.get(c), config);
    assert.equal(map.size(), 4);
  });

  it('requires a strictly larger child value and exactly one child', () => {
    const atThreshold = node(0, 0, 100);
    const equal = node(1, 1, 50);
    link(atThreshold, equal);
    assert.equal(collapseMapOf(atThreshold, 0.5).size(), 0);

    const aboveThreshold = node(0, 0, 100);
    const above = node(1, 1, 50.5);
    link(aboveThreshold, above);
    assert.equal(collapseMapOf(aboveThreshold, 0.5).size(), 2);

    const withSibling = node(0, 0, 100);
    const first = node(1, 1, 100);
    const second = node(2, 1, 100);
    link(withSibling, first);
    link(withSibling, second);
    assert.equal(collapseMapOf(withSibling).size(), 0);
  });

  it('uses the existing parent of the passed root when present', () => {
    const parent = node(0, 0, 100);
    const root = node(1, 1, 100);
    link(parent, root);
    const map = collapseMapOf(root);
    const config = map.get(parent)!;

    assert.deepEqual(config, { items: [parent, root], collapsed: true });
    assert.equal(map.get(root), config);
  });

  it('does not collapse a wide root but collapses a deep chain', () => {
    const wide = node(0, 0, 100);
    for (let i = 1; i <= 3; i++) {
      link(wide, node(i, 1, 100));
    }
    assert.equal(collapseMapOf(wide).size(), 0);

    let deep = node(0, 0, 100);
    let tip = deep;
    for (let i = 1; i <= 4; i++) {
      const child = node(i, i, 100);
      link(tip, child);
      tip = child;
    }
    const map = collapseMapOf(deep);
    assert.equal(map.size(), 5);
    assert.equal(map.get(deep)!.items.length, 5);
  });

  it('leaves the input children arrays unchanged', () => {
    const r = node(0, 0, 100);
    const a = node(1, 1, 100);
    const b = node(2, 1, 100);
    link(r, a);
    link(r, b);
    const snapshot = snapshotLinks(r);

    collapseMapOf(r);

    assertLinksUnchanged(snapshot);
  });
});

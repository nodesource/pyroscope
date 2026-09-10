// Embedder scroll regression for the ns-pyroscope package.
//
// Why this spec exists and why it lives here: the package's embedder overrides
// (src/style.css) turn the fixed-height .fg-body into a clip container and add
// internal scrollers per view. The upstream app e2e suite (ui/e2e) renders
// FlameGraphContainer without these overrides, so it cannot catch a missing
// embedder rule. This spec drives the real embedder component (rendered by
// e2e/harness/main.tsx, which imports src/style.css via src/index.tsx) in a
// real browser, so it fails if the Flame Graph-only rule is absent again.
//
// The Flame Graph-only regression: .fg-body > .fg-graph must be height-capped
// and scrollable; without the rule the graph grows to its content height
// (depth * 22px) and is clipped by .fg-body's overflow: hidden with no
// scrollable ancestor — deep frames become unreachable and wheel does nothing.
import { expect, test, type Page } from '@playwright/test';

test.beforeEach(async ({ page }) => {
  await page.goto('/');
  await expect(page.getByTestId('ns-pyroscope')).toBeVisible();
  // The harness canvas (~90 levels x 22px) must exceed the .fg-body height so
  // the scroll assertions below are meaningful in any viewport.
  await expect
    .poll(
      async () =>
        page.evaluate(() => {
          const canvas = document.querySelector('.fg-canvas-wrapper');
          const body = document.querySelector('.fg-body');
          if (!canvas || !body) return 0;
          return canvas.scrollHeight - body.clientHeight;
        }),
      { timeout: 10_000 },
    )
    .toBeGreaterThan(400);
});

async function switchView(page: Page, label: string) {
  // The view toggle is the library's own header radio group. The invisible
  // input (fg-header-radio-input, absolutely positioned over the label)
  // intercepts pointer events, so click it; data-checked is set on the label.
  await page.getByRole('radio', { name: label }).click();
  await expect(
    page.locator('.fg-header-radio-label', { hasText: label }),
  ).toHaveAttribute('data-checked', 'true');
  // Switching views remounts the body branch; the canvas reappears after a
  // resize-observer tick, so wait for the view's real content before
  // asserting scroll geometry (this does not mask the regression: pre-fix the
  // canvas renders and overflows, it just cannot scroll).
  if (label === 'Flame Graph') {
    await expect(
      page.locator('.fg-body > .fg-graph .fg-canvas-wrapper'),
    ).toBeVisible();
  } else if (label === 'Both') {
    await expect(
      page.locator('.fg-horizontal-graph .fg-canvas-wrapper'),
    ).toBeVisible();
  } else {
    await expect(page.locator('.fg-tt-scroll .fg-tt-table').first()).toBeVisible();
  }
}

type ScrollSnapshot = {
  clientHeight: number;
  scrollHeight: number;
  scrollTop: number;
  overflowY: string;
};

async function snapshot(page: Page, selector: string): Promise<ScrollSnapshot> {
  return page.evaluate((sel) => {
    const el = document.querySelector(sel);
    if (!el) throw new Error(`missing element: ${sel}`);
    return {
      clientHeight: el.clientHeight,
      scrollHeight: el.scrollHeight,
      scrollTop: el.scrollTop,
      overflowY: getComputedStyle(el).overflowY,
    };
  }, selector);
}

// Real wheel scrolling over the given scrollable element (CDP-backed, not a
// synthetic WheelEvent), until scrollTop stops changing.
async function wheelToBottom(page: Page, selector: string) {
  const box = await page.evaluate((sel) => {
    const el = document.querySelector(sel)!;
    const r = el.getBoundingClientRect();
    return {
      x: r.left + r.width / 2,
      y: Math.min(r.top + r.height / 2, window.innerHeight - 10),
    };
  }, selector);
  await page.mouse.move(box.x, box.y);
  let previous = -1;
  for (let i = 0; i < 12; i++) {
    await page.mouse.wheel(0, 300);
    await page.waitForTimeout(50);
    const { scrollTop } = await snapshot(page, selector);
    if (scrollTop === previous) break;
    previous = scrollTop;
  }
  return snapshot(page, selector);
}

// After scrolling a container to its maximum, the deepest canvas frame must be
// fully inside the fixed-height .fg-body clip box.
async function assertDeepestFramesReachable(page: Page, selector: string) {
  await page.evaluate((sel) => {
    const el = document.querySelector(sel)!;
    el.scrollTop = el.scrollHeight;
  }, selector);
  await page.waitForTimeout(100);
  const reach = await page.evaluate((sel) => {
    const el = document.querySelector(sel)!;
    const body = document.querySelector('.fg-body')!;
    const canvas = document.querySelector('.fg-canvas-wrapper')!;
    return {
      maxScroll: el.scrollHeight - el.clientHeight,
      scrollTop: el.scrollTop,
      bodyBottom: body.getBoundingClientRect().bottom,
      canvasBottom: canvas.getBoundingClientRect().bottom,
      canvasTop: canvas.getBoundingClientRect().top,
    };
  }, selector);
  expect(reach.scrollTop).toBeCloseTo(reach.maxScroll, 0);
  expect(reach.canvasBottom).toBeLessThanOrEqual(reach.bodyBottom + 1);
  expect(reach.canvasTop).toBeLessThan(reach.bodyBottom);
}

test.describe('ns-pyroscope embedder scroll behavior', () => {
  test('Both view: graph pane scrolls internally and reaches deepest frames', async ({
    page,
  }) => {
    // Default view is Both.
    await expect(
      page.locator('.fg-header-radio-label', { hasText: 'Both' }),
    ).toHaveAttribute('data-checked', 'true');
    const graph = await snapshot(page, '.fg-horizontal-graph');
    expect(graph.overflowY).toBe('auto');
    expect(graph.scrollHeight).toBeGreaterThan(graph.clientHeight);
    const after = await wheelToBottom(page, '.fg-horizontal-graph');
    expect(after.scrollTop).toBeGreaterThan(0);
    await assertDeepestFramesReachable(page, '.fg-horizontal-graph');
  });

  test('Flame Graph-only view: bare .fg-graph scrolls and reaches deepest frames', async ({
    page,
  }) => {
    await switchView(page, 'Flame Graph');
    // The Flame Graph-only branch renders .fg-graph as a direct child of
    // .fg-body (no .fg-horizontal-graph wrapper) — the exact structure the
    // embedder height-cap rule targets.
    const graph = await snapshot(page, '.fg-body > .fg-graph');
    expect(graph.overflowY).toBe('auto');
    expect(graph.clientHeight).toBeLessThan(graph.scrollHeight);
    // Real wheel must move the graph itself (pre-fix: stays at 0, nothing
    // inside .ns-pyroscope scrolls).
    const after = await wheelToBottom(page, '.fg-body > .fg-graph');
    expect(after.scrollTop).toBeGreaterThan(0);
    expect(after.scrollTop).toBeCloseTo(
      after.scrollHeight - after.clientHeight,
      0,
    );
    await assertDeepestFramesReachable(page, '.fg-body > .fg-graph');
  });

  test('Top Table view: table scrolls internally', async ({ page }) => {
    await switchView(page, 'Top Table');
    const table = await snapshot(page, '.fg-tt-scroll');
    expect(table.overflowY).toBe('auto');
    expect(table.scrollHeight).toBeGreaterThan(table.clientHeight);
  });

  test('mode transitions preserve scrollability in every view', async ({
    page,
  }) => {
    for (const mode of [
      'Flame Graph',
      'Both',
      'Flame Graph',
      'Top Table',
      'Flame Graph',
    ]) {
      await switchView(page, mode);
      if (mode === 'Flame Graph') {
        const graph = await snapshot(page, '.fg-body > .fg-graph');
        expect(graph.overflowY).toBe('auto');
        expect(graph.clientHeight).toBeLessThan(graph.scrollHeight);
        expect(graph.scrollHeight - graph.clientHeight).toBeGreaterThan(0);
      } else if (mode === 'Both') {
        const graph = await snapshot(page, '.fg-horizontal-graph');
        expect(graph.overflowY).toBe('auto');
        expect(graph.scrollHeight).toBeGreaterThan(graph.clientHeight);
      } else {
        const table = await snapshot(page, '.fg-tt-scroll');
        expect(table.overflowY).toBe('auto');
        expect(table.scrollHeight).toBeGreaterThan(table.clientHeight);
      }
    }
  });

  test('smaller viewport: Flame Graph-only view still scrolls to deepest frames', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1280, height: 720 });
    await switchView(page, 'Flame Graph');
    const graph = await snapshot(page, '.fg-body > .fg-graph');
    expect(graph.overflowY).toBe('auto');
    expect(graph.clientHeight).toBeLessThan(graph.scrollHeight);
    const after = await wheelToBottom(page, '.fg-body > .fg-graph');
    expect(after.scrollTop).toBeGreaterThan(0);
    await assertDeepestFramesReachable(page, '.fg-body > .fg-graph');
  });
});

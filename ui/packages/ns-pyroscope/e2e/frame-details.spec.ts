import { test, expect, type Page } from '@playwright/test';

async function openFrame(page: Page, level: number, fraction: number) {
  const canvas = page.locator('.fg-canvas-wrapper canvas').first();
  const bounds = await canvas.boundingBox();
  if (!bounds) throw new Error('Missing flamegraph canvas bounds');
  await page.mouse.click(
    bounds.x + bounds.width * fraction,
    bounds.y + level * 22 + 11,
  );
  await expect(page.getByRole('menu')).toBeVisible();
}

test.beforeEach(async ({ page }) => {
  await page.goto('/?detailsProfile&details');
  await page.getByRole('radio', { name: 'Flame Graph', exact: true }).click();
  await expect(page.locator('.fg-canvas-wrapper canvas').first()).toBeVisible();
});

test('the details action follows callback presence and closes the menu', async ({
  page,
}) => {
  await openFrame(page, 2, 0.5);
  await page
    .getByRole('menuitem', { name: 'Function details', exact: true })
    .click();
  await expect(page.getByRole('menu')).toHaveCount(0);
  await expect(page.getByTestId('frame-details')).toHaveText(
    JSON.stringify({
      name: 'worker',
      callSite: [
        { name: 'entry B', nameIndex: 3 },
        { name: 'worker', nameIndex: 4 },
      ],
    }),
  );

  await page.getByRole('button', { name: 'Toggle details callback' }).click();
  await openFrame(page, 2, 0.5);
  await expect(
    page.getByRole('menuitem', { name: 'Function details', exact: true }),
  ).toHaveCount(0);
  await expect(
    page.getByRole('menuitem', { name: 'Focus block' }),
  ).toBeVisible();
});

test('a repeated function keeps its complete stack after focusing its parent', async ({
  page,
}) => {
  await openFrame(page, 1, 0.5);
  await page.getByRole('menuitem', { name: 'Focus block' }).click();
  await expect(
    page.getByRole('button', { name: 'Remove focus' }),
  ).toBeVisible();
  await openFrame(page, 2, 0.2);
  await page
    .getByRole('menuitem', { name: 'Function details', exact: true })
    .click();
  await expect(page.getByTestId('frame-details')).toHaveText(
    JSON.stringify({
      name: 'worker',
      callSite: [
        { name: 'entry B', nameIndex: 3 },
        { name: 'worker', nameIndex: 4 },
      ],
    }),
  );
});

test('recursion and a real total function remain in the selector', async ({
  page,
}) => {
  await openFrame(page, 3, 0.1);
  await page
    .getByRole('menuitem', { name: 'Function details', exact: true })
    .click();
  await expect(page.getByTestId('frame-details')).toHaveText(
    JSON.stringify({
      name: 'worker',
      callSite: [
        { name: 'entry A', nameIndex: 2 },
        { name: 'worker', nameIndex: 0 },
        { name: 'worker', nameIndex: 0 },
      ],
    }),
  );
  await openFrame(page, 3, 0.5);
  await page
    .getByRole('menuitem', { name: 'Function details', exact: true })
    .click();
  await expect(page.getByTestId('frame-details')).toHaveText(
    JSON.stringify({
      name: 'total',
      callSite: [
        { name: 'entry B', nameIndex: 3 },
        { name: 'worker', nameIndex: 4 },
        { name: 'total', nameIndex: 5 },
      ],
    }),
  );
});

test('frames below a collapsed group retain their hidden ancestors', async ({
  page,
}) => {
  await page.goto('/?detailsProfile&details&groupedDetails');
  await page.getByRole('radio', { name: 'Flame Graph', exact: true }).click();
  await expect(page.locator('.fg-canvas-wrapper canvas').first()).toBeVisible();
  // total, entry and bridge are collapsed into the leading total bar.
  await openFrame(page, 0, 0.2);
  await expect(
    page.getByRole('menuitem', { name: 'Expand group', exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole('menuitem', { name: 'Function details', exact: true }),
  ).toHaveCount(0);
  await page.keyboard.press('Escape');
  // Worker is displayed on row 1, but its original stack is still complete.
  await openFrame(page, 1, 0.2);
  await page
    .getByRole('menuitem', { name: 'Function details', exact: true })
    .click();
  await expect(page.getByTestId('frame-details')).toHaveText(
    JSON.stringify({
      name: 'worker',
      callSite: [
        { name: 'entry', nameIndex: 2 },
        { name: 'bridge', nameIndex: 3 },
        { name: 'worker', nameIndex: 0 },
      ],
    }),
  );
});

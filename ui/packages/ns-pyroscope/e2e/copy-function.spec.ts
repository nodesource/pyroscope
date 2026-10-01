import { test, expect } from '@playwright/test';

for (const detailsEnabled of [false, true]) {
  for (const hideCopy of [false, true]) {
    test(`copy ${hideCopy ? 'hidden' : 'shown by default'} with details ${detailsEnabled ? 'enabled' : 'disabled'}`, async ({
      page,
      context,
    }) => {
      const params = new URLSearchParams({ detailsProfile: '' });
      if (detailsEnabled) params.set('details', '');
      if (hideCopy) params.set('hideCopy', '');
      await page.goto(`/?${params}`);

      // The default case exercises a normal CPU profile. Hidden copy also
      // exercises eBPF with no callback, as during details loading/disablement.
      const cpuProfile = !hideCopy && !detailsEnabled;
      if (cpuProfile) {
        await page
          .getByRole('button', { name: 'Switch profile', exact: true })
          .click();
      }
      await page
        .getByRole('radio', { name: 'Flame Graph', exact: true })
        .click();
      if (cpuProfile) {
        await page
          .getByRole('button', { name: 'Expand all groups', exact: true })
          .click();
      }
      const canvas = page.locator('.fg-canvas-wrapper canvas').first();
      await expect(canvas).toBeVisible();
      await expect
        .poll(() =>
          canvas.evaluate((element) => {
            const width = element.parentElement?.clientWidth ?? 0;
            return width > 0 && element.clientWidth === width;
          }),
        )
        .toBe(true);
      const bounds = await canvas.boundingBox();
      if (!bounds) throw new Error('Missing flamegraph canvas bounds');
      await page.mouse.click(
        bounds.x + bounds.width * (cpuProfile ? 0.2 : 0.5),
        bounds.y + (cpuProfile ? 1 : 2) * 22 + 11,
      );
      await expect(page.getByRole('menu')).toBeVisible();
      await expect(
        page.getByRole('menuitem', { name: 'Focus block', exact: true }),
      ).toBeVisible();
      await expect(
        page.getByRole('menuitem', { name: 'Function details', exact: true }),
      ).toHaveCount(detailsEnabled ? 1 : 0);

      const copy = page.getByRole('menuitem', {
        name: /^Copy function(?: name| and location)$/,
      });
      if (hideCopy) {
        await expect(copy).toHaveCount(0);
      } else {
        await expect(copy).toBeVisible();
        await context.grantPermissions(['clipboard-read', 'clipboard-write']);
        await copy.click();
        await expect(page.getByRole('menu')).toHaveCount(0);
        await expect
          .poll(() => page.evaluate(() => navigator.clipboard.readText()))
          .toBe(cpuProfile ? 'other_work' : 'worker');
      }
    });
  }
}

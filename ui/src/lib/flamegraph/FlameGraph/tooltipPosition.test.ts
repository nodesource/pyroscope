import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { getTooltipPosition } from './tooltipPosition.ts';

describe('getTooltipPosition', () => {
  const bounds = {
    left: 100,
    right: 900,
    top: 50,
    bottom: 700,
  };

  it('places the tooltip after the pointer when it fits', () => {
    assert.deepEqual(
      getTooltipPosition(
        { x: 200, y: 120 },
        { width: 240, height: 140 },
        bounds,
        { width: 1000, height: 800 },
      ),
      { left: 215, top: 120 },
    );
  });

  it('moves the tooltip before the pointer at the right boundary', () => {
    assert.deepEqual(
      getTooltipPosition(
        { x: 850, y: 120 },
        { width: 240, height: 140 },
        bounds,
        { width: 1000, height: 800 },
      ),
      { right: 165, top: 120 },
    );
  });

  it('keeps a wide tooltip inside the left boundary after flipping', () => {
    assert.deepEqual(
      getTooltipPosition(
        { x: 490, y: 120 },
        { width: 400, height: 140 },
        bounds,
        { width: 1000, height: 800 },
      ),
      { left: 100, top: 120 },
    );
  });

  it('moves the tooltip above the pointer at the bottom boundary', () => {
    assert.deepEqual(
      getTooltipPosition(
        { x: 200, y: 650 },
        { width: 240, height: 140 },
        bounds,
        { width: 1000, height: 800 },
      ),
      { left: 215, top: 510 },
    );
  });
});

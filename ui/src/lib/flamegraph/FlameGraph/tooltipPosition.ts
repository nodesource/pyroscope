const TOOLTIP_POINTER_GAP = 15;

type Point = {
  x: number;
  y: number;
};

type TooltipSize = {
  width: number;
  height: number;
};

type Bounds = {
  left: number;
  right: number;
  top: number;
  bottom: number;
};

type ViewportSize = {
  width: number;
  height: number;
};

type TooltipPosition = {
  left?: number;
  right?: number;
  top: number;
};

export function getTooltipPosition(
  pointer: Point,
  tooltip: TooltipSize,
  bounds: Bounds,
  viewport: ViewportSize,
): TooltipPosition {
  const top =
    pointer.y + tooltip.height <= bounds.bottom
      ? pointer.y
      : Math.max(bounds.top, pointer.y - tooltip.height);

  const preferredLeft = pointer.x + TOOLTIP_POINTER_GAP;
  if (preferredLeft + tooltip.width <= bounds.right) {
    return { left: preferredLeft, top };
  }

  const flippedLeft = pointer.x - TOOLTIP_POINTER_GAP - tooltip.width;
  if (flippedLeft < bounds.left) {
    return { left: bounds.left, top };
  }

  return {
    right: viewport.width - pointer.x + TOOLTIP_POINTER_GAP,
    top,
  };
}

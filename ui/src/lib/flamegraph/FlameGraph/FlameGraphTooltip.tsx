import { useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

import { useFlameGraphPortalRoot } from '../FlameGraphEnvironment';

import {
  type CollapseConfig,
  type FlameGraphDataContainer,
  type LevelItem,
} from './dataTransform';
import { getTooltipPosition } from './tooltipPosition';
import { getTooltipData } from './tooltipData';

import './FlameGraphTooltip.css';

type Props = {
  data: FlameGraphDataContainer;
  totalTicks: number;
  position?: { x: number; y: number };
  item?: LevelItem;
  collapseConfig?: CollapseConfig;
};

const FlameGraphTooltip = ({
  data,
  item,
  totalTicks,
  position,
  collapseConfig,
}: Props) => {
  const portalRoot = useFlameGraphPortalRoot();
  const tooltipRef = useRef<HTMLDivElement>(null);
  const [tooltipSize, setTooltipSize] = useState<{
    width: number;
    height: number;
  }>();

  useLayoutEffect(() => {
    const rect = tooltipRef.current?.getBoundingClientRect();
    if (
      rect &&
      (rect.width !== tooltipSize?.width || rect.height !== tooltipSize.height)
    ) {
      setTooltipSize({ width: rect.width, height: rect.height });
    }
  }, [item, tooltipSize]);

  if (!(item && position && portalRoot)) {
    return null;
  }

  const tooltipData = getTooltipData(data, item, totalTicks);
  const portalBounds = portalRoot.getBoundingClientRect();
  const view = portalRoot.ownerDocument.defaultView;
  const viewport = {
    width: view?.innerWidth ?? portalBounds.right,
    height: view?.innerHeight ?? portalBounds.bottom,
  };
  const bounds = {
    left: Math.max(0, portalBounds.left),
    right: Math.min(viewport.width, portalBounds.right),
    top: Math.max(0, portalBounds.top),
    bottom: Math.min(viewport.height, portalBounds.bottom),
  };
  const tooltipPosition = tooltipSize
    ? getTooltipPosition(position, tooltipSize, bounds, viewport)
    : { left: position.x + 15, top: position.y };

  return createPortal(
    <div
      ref={tooltipRef}
      className="fg-tooltip"
      style={{
        ...tooltipPosition,
        visibility: tooltipSize ? 'visible' : 'hidden',
      }}
      role="tooltip"
      aria-live="polite"
    >
      <div className="fg-tooltip-content">
        <p className="fg-tooltip-name">
          {data.getLabel(item.itemIndexes[0])}
          {collapseConfig && collapseConfig.collapsed ? (
            <span>
              <br />
              and {collapseConfig.items.length} similar items
            </span>
          ) : (
            ''
          )}
        </p>
        <p className="fg-tooltip-last">
          {tooltipData.unitTitle}
          <br />
          Total: <b>{tooltipData.unitValue}</b> ({tooltipData.percentValue}%)
          <br />
          Self: <b>{tooltipData.unitSelf}</b> ({tooltipData.percentSelf}%){tooltipData.samples != null && (
            <>
              <br />
              Samples: <b>{tooltipData.samples}</b>
            </>
          )}
        </p>
      </div>
    </div>,
    portalRoot,
  );
};

export default FlameGraphTooltip;

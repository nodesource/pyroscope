import type { DataFrame } from '../../../src/lib/flamegraph/FlameGraph/dataTransform.ts';
import type { GetExtraContextMenuButtonsFunction } from '../../../src/lib/flamegraph/FlameGraph/FlameGraphContextMenu.tsx';
import type { ClickedItemData } from '../../../src/lib/flamegraph/types.ts';

import type { PyroscopeProps } from './types.ts';

type OnFrameDetails = NonNullable<PyroscopeProps['onFrameDetails']>;
type FrameDetailsSelection = Parameters<OnFrameDetails>[0];

export function getFrameDetailsSelection(
  item: ClickedItemData['item'],
  data: DataFrame,
): FrameDetailsSelection | undefined {
  const levels = data.fields.find((field) => field.name === 'level')?.values;
  const names = data.fields.find((field) => field.name === 'label')?.values;
  const nameIndexes = data.fields.find(
    (field) => field.name === 'nameIndex',
  )?.values;
  if (!levels || !names || !nameIndexes) return undefined;

  const stackForRow = (row: number): FrameDetailsSelection['callSite'] => {
    const callSite: FrameDetailsSelection['callSite'] = [];
    let level = Number(levels[row]);
    // DataFrame rows are in preorder. The original row index survives focus,
    // zoom and grouping; displayed levels and labels do not identify a frame.
    for (let index = row; index >= 0 && level >= 0; index--) {
      if (Number(levels[index]) !== level) continue;
      const name = names[index];
      const nameIndex = nameIndexes[index];
      if (
        typeof name !== 'string' ||
        typeof nameIndex !== 'number' ||
        !Number.isSafeInteger(nameIndex) ||
        nameIndex < 0
      ) {
        return [];
      }
      if (level !== 0 || name !== 'total') {
        callSite.push({ name, nameIndex });
      }
      level--;
    }
    return level < 0 ? callSite.reverse() : [];
  };

  const row = item.itemIndexes[0];
  if (row === undefined) return undefined;
  const callSite = stackForRow(row);
  if (callSite.length === 0) return undefined;

  // Sandwich view can merge occurrences with different caller paths. There
  // is no single stack selector for those frames; require an unambiguous path
  // rather than opening details for an arbitrary occurrence.
  for (const index of item.itemIndexes.slice(1)) {
    const other = stackForRow(index);
    if (
      other.length !== callSite.length ||
      other.some(
        (entry, depth) => entry.nameIndex !== callSite[depth].nameIndex,
      )
    ) {
      return undefined;
    }
  }

  return { name: callSite[callSite.length - 1].name, callSite };
}

export function createFrameDetailsMenu(
  onFrameDetails: PyroscopeProps['onFrameDetails'],
): GetExtraContextMenuButtonsFunction | undefined {
  if (!onFrameDetails) return undefined;
  return ({ item }, data) => {
    const selection = getFrameDetailsSelection(item, data);
    return selection
      ? [
          {
            label: 'Function details',
            icon: 'eye',
            onClick: () => onFrameDetails(selection),
          },
        ]
      : [];
  };
}

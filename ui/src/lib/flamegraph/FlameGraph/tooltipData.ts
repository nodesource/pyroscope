import type { FlameGraphDataContainer, LevelItem } from './dataTransform.ts';

export type TooltipData = {
  percentValue: number;
  percentSelf: number;
  unitTitle: string;
  unitValue: string;
  unitSelf: string;
  samples: string | undefined;
};

export function getTooltipData(
  data: FlameGraphDataContainer,
  item: LevelItem,
  totalTicks: number,
): TooltipData {
  const displayValue = data.valueDisplayProcessor(item.value);
  const displaySelf = data.getSelfDisplay(item.itemIndexes);

  const percentValue =
    Math.round(10000 * (displayValue.numeric / totalTicks)) / 100;
  const percentSelf =
    Math.round(10000 * (displaySelf.numeric / totalTicks)) / 100;
  let unitValue = displayValue.text + displayValue.suffix;
  let unitSelf = displaySelf.text + displaySelf.suffix;

  const unitTitle = data.getUnitTitle();
  if (unitTitle === 'Count') {
    if (!displayValue.suffix) {
      // Makes sure we don't show 123undefined or something like that if suffix isn't defined
      unitValue = displayValue.text;
    }
    if (!displaySelf.suffix) {
      unitSelf = displaySelf.text;
    }
  }

  let samples: string | undefined;
  if (unitTitle === 'Count') {
    // Count profiles have no separate ns geometry; the value is the count.
    samples = displayValue.numeric.toLocaleString();
  } else if (data.sampleField) {
    // Sum the sample counts of every merged index, scaling proportionally
    // (and rounding) when the sandwich view trimmed the value to the part it
    // contributes, so a trimmed node never reports the full sample total.
    const rawValue = data.getValue(item.itemIndexes);
    let sampleTotal = data.getSamples(item.itemIndexes);
    if (item.value !== rawValue && rawValue > 0) {
      sampleTotal = Math.round(sampleTotal * (item.value / rawValue));
    }
    samples = sampleTotal.toLocaleString();
  }
  // Temporal profiles without producer-provided counts show only duration and
  // never label nanoseconds as samples.

  return {
    percentValue,
    percentSelf,
    unitTitle,
    unitValue,
    unitSelf,
    samples,
  };
}

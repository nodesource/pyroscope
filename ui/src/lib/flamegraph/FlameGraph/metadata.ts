import { formatShort } from '../format.ts';
import type { FlameGraphDataContainer } from './dataTransform.ts';

/**
 * Computes the primary metadata pill text. Temporal (or byte) profiles derive
 * the duration from `totalTicks` and the sample count from the
 * producer-declared counts (numSamples); nanosecond geometry is never labelled
 * as samples, and Count profiles keep their previous count-only rendering.
 */
export function getPrimaryPillText(
  data: FlameGraphDataContainer,
  totalTicks: number,
  sandwichedLabel?: string,
): string {
  const displayValue = data.valueDisplayProcessor(totalTicks);
  let unitValue = displayValue.text + displayValue.suffix;
  const unitTitle = data.getUnitTitle();

  if (unitTitle === 'Count') {
    if (!displayValue.suffix) {
      // Makes sure we don't show 123undefined or something like that if
      // suffix isn't defined.
      unitValue = displayValue.text;
    }
    const ticksVal = formatShort(totalTicks);
    return `${unitValue} | ${ticksVal.text}${ticksVal.suffix} samples (${unitTitle})`;
  }

  const sampleCount = data.getSampleCount();
  const sampleDisplay = sampleCount != null ? formatShort(sampleCount) : null;
  if (sampleDisplay && !sandwichedLabel) {
    return `${unitValue} | ${sampleDisplay.text}${sampleDisplay.suffix} samples (${unitTitle})`;
  }
  return `${unitValue} (${unitTitle})`;
}

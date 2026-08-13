// Build the clipboard payload for the flamegraph "Copy function and location"
// context-menu action. `name` is the function label; `source` is the resolved
// location string (file/url:line[:column]) from data.getSource(). When a
// source is present it is joined on a single line as "<name> at <source>".
// Missing or empty sources keep the legacy name-only payload so eBPF and other
// source-less profiles copy exactly as before.
export function formatClipboardText(
  name: string,
  source: string | undefined,
): string {
  if (source && source.length > 0) {
    return `${name} at ${source}`;
  }
  return name;
}

/** Inserts `field: url` after the first of `after` present at the top level (with its indented block). */
export function insertField(source: string, field: string, url: string, after: readonly string[]): string {
  const lines = source.split('\n');
  const end = lines.indexOf('---', 1);
  for (const key of after) {
    const start = lines.findIndex((line, i) => i > 0 && i < end && line.startsWith(`${key}:`));
    if (start < 0) continue;
    let next = start + 1;
    while (next < end && /^\s+\S/.test(lines[next]!)) next += 1;
    lines.splice(next, 0, `${field}: ${url}`);
    return lines.join('\n');
  }
  lines.splice(end, 0, `${field}: ${url}`);
  return lines.join('\n');
}

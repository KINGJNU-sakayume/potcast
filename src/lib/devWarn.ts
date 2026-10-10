/** A console warning in development builds only (curated translations that were skipped, mismatched lyrics). */
export function devWarn(message: string): void {
  if (import.meta.env.DEV) console.warn(`[ARC] ${message}`);
}

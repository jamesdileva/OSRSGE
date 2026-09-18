/**
 * Single-source metadata strictness (serve/display parity).
 *
 * The serve path (`electron/services/rankEntries.ts`), the cache store
 * (`electron/services/mappingCache.ts`), and the display path
 * (`src/components/dashboard/ItemDetailsPanel.tsx`) must agree on what
 * counts as a real metadata value — otherwise a serve change can silently
 * re-open a display nit (or vice versa). All three import these predicates
 * so there is exactly one definition of each bound:
 * - members: `=== true` else `false` (truthy `1` stays Free-to-play)
 * - buyLimit: integer AND `> 0` else `null` (`0` is the miss neutral)
 * - value: integer AND `>= 0` else `null` (`0` is a real GE value, kept)
 * - examine: string trimmed else `''` (whitespace-only is the miss neutral)
 *
 * Pure, zero deps, frozen-input safe (reads only, fresh outputs).
 */

export interface NormalizedItemMetadata {
  members: boolean;
  buyLimit: number | null;
  examine: string;
  value: number | null;
}

/** Members flag is strict: only `true` is Members, everything else is Free-to-play. */
export function isMembersFlag(value: unknown): value is true {
  return value === true;
}

/** Buy limit is displayable only when it is an integer > 0, else the null miss neutral. */
export function normalizeBuyLimit(value: unknown): number | null {
  return typeof value === 'number' && Number.isInteger(value) && value > 0 ? value : null;
}

/** GE value is real (including 0) only when it is an integer >= 0, else the null miss neutral. */
export function normalizeItemValue(value: unknown): number | null {
  return typeof value === 'number' && Number.isInteger(value) && value >= 0 ? value : null;
}

/** Examine text is canonical trimmed form, or `''` when absent/non-string. */
export function normalizeExamine(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

/**
 * Normalize a possibly-partial resolver/cache shape per field (never throws,
 * never fetches). Non-object input degrades to the full fail-open neutrals.
 */
export function normalizeCachedMetadata(raw: unknown): NormalizedItemMetadata {
  const record =
    typeof raw === 'object' && raw !== null ? (raw as Record<string, unknown>) : undefined;
  return {
    members: isMembersFlag(record?.['members']),
    buyLimit: normalizeBuyLimit(record?.['buyLimit']),
    examine: normalizeExamine(record?.['examine']),
    value: normalizeItemValue(record?.['value']),
  };
}

/**
 * Canonical display label for a VPN node row (`nodes.country` / `nodes.city`).
 * Matches client-side `ServerLocationStatsLabel` shape: "Country · City" when both differ.
 */
export function formatNodeServerLocationDisplay(
  country: string | null | undefined,
  city: string | null | undefined,
): string {
  const c = country?.trim() ?? '';
  const ct = city?.trim() ?? '';
  if (c && ct) {
    if (c.localeCompare(ct, undefined, { sensitivity: 'base' }) === 0) {
      return c;
    }
    return `${c} · ${ct}`;
  }
  if (c) {
    return c;
  }
  if (ct) {
    return ct;
  }
  return '';
}

/**
 * Normalize a single geographic label (country or legacy free-text location) for stats buckets.
 */
function normalizeCountrySegmentForStats(t: string): string {
  const trimmed = t.trim();
  if (!trimmed) {
    return '';
  }
  const lower = trimmed.toLowerCase();

  if (lower.includes('new england')) {
    return trimmed;
  }
  if (lower === 'republic of ireland' || lower === 'ireland') {
    return trimmed;
  }

  const ukExact = new Set([
    'england',
    'scotland',
    'wales',
    'northern ireland',
    'united kingdom',
    'uk',
    'u.k.',
    'u.k',
    'gb',
    'great britain',
    'britain',
  ]);
  if (ukExact.has(lower)) {
    return 'United Kingdom';
  }
  if (lower.includes('united kingdom') || lower.includes('n.ireland')) {
    return 'United Kingdom';
  }
  if (lower.includes(', england') || lower.includes(' england,')) {
    return 'United Kingdom';
  }
  if (lower.includes(', scotland') || lower.includes(' scotland,')) {
    return 'United Kingdom';
  }
  if (lower.includes(', wales') || lower.includes(' wales,')) {
    return 'United Kingdom';
  }
  if (lower.endsWith('england') && !lower.startsWith('new ')) {
    return 'United Kingdom';
  }
  if (lower.includes(' scotland') && lower !== 'scotland') {
    return 'United Kingdom';
  }

  return trimmed;
}

/**
 * Map legacy / alternate labels to one display bucket so "England", "UK", "United Kingdom"
 * are not shown as separate rows in top server locations.
 *
 * For "Country · City" strings (from `formatNodeServerLocationDisplay`), only the country
 * segment is UK-normalized so city detail is preserved (e.g. "United Kingdom · London").
 */
export function normalizeServerLocationForStats(
  raw: string | null | undefined,
): string {
  if (raw == null) {
    return '';
  }
  const t = raw.trim();
  if (!t) {
    return '';
  }
  const parts = t
    .split(/\s*·\s*/)
    .map((s) => s.trim())
    .filter(Boolean);
  if (parts.length >= 2) {
    const countryNorm = normalizeCountrySegmentForStats(parts[0]);
    const rest = parts.slice(1).join(' · ');
    if (!countryNorm) {
      return rest;
    }
    return rest ? `${countryNorm} · ${rest}` : countryNorm;
  }
  return normalizeCountrySegmentForStats(t);
}

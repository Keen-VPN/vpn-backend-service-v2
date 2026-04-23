/**
 * Map legacy / alternate labels to one display bucket so "England", "UK", "United Kingdom"
 * are not shown as separate rows in top server locations.
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
  const lower = t.toLowerCase();

  if (lower.includes('new england')) {
    return t;
  }
  if (lower === 'republic of ireland' || lower === 'ireland') {
    return t;
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
  // City/region, England; … , Scotland; etc.
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

  return t;
}

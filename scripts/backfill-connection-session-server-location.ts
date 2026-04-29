/**
 * Analyze / backfill connection_sessions.server_location.
 *
 * DATABASE_URL="postgresql://macbook@localhost/vpnkeen2" npx tsx scripts/backfill-connection-session-server-location.ts
 * DATABASE_URL="..." npx tsx scripts/backfill-connection-session-server-location.ts --apply
 * DATABASE_URL="..." npx tsx scripts/backfill-connection-session-server-location.ts --apply --infer-country-only
 */

import { PrismaClient } from '@prisma/client';
import { formatNodeServerLocationDisplay } from '../src/connection/server-location-display.util';
import { normalizeServerLocationForStats } from '../src/connection/server-location-stats.util';

const prisma = new PrismaClient();

function normKey(s: string): string {
  return s.trim().replace(/\s+/g, ' ').toLowerCase();
}

function legacySeparatorsToMiddleDot(s: string): string {
  return s
    .trim()
    .replace(/\s*-\s*/g, ' · ')
    .replace(/\s*[–—]\s*/g, ' · ');
}

function canonicalFromNode(
  country: string | null,
  city: string | null,
): string {
  const raw = formatNodeServerLocationDisplay(country, city);
  return normalizeServerLocationForStats(raw);
}

type NodeRow = { id: string; country: string | null; city: string | null };

function aliasesForNode(n: NodeRow): string[] {
  const raw = formatNodeServerLocationDisplay(n.country, n.city);
  const canon = canonicalFromNode(n.country, n.city);
  const set = new Set<string>();
  for (const x of [raw, canon, legacySeparatorsToMiddleDot(raw)]) {
    if (x) {
      set.add(normKey(x));
      set.add(normKey(legacySeparatorsToMiddleDot(x)));
    }
  }
  return [...set].filter(Boolean);
}

function dedupeNodes(rows: NodeRow[]): NodeRow[] {
  const m = new Map<string, NodeRow>();
  for (const r of rows) m.set(r.id, r);
  return [...m.values()];
}

function buildAliasMap(nodes: NodeRow[]): Map<string, NodeRow[]> {
  const map = new Map<string, NodeRow[]>();
  for (const n of nodes) {
    for (const a of aliasesForNode(n)) {
      const list = map.get(a) ?? [];
      list.push(n);
      map.set(a, list);
    }
  }
  return map;
}

function nodesMatchingLocation(
  loc: string,
  aliasMap: Map<string, NodeRow[]>,
): NodeRow[] {
  const k = normKey(legacySeparatorsToMiddleDot(loc));
  if (!k) return [];
  const a = aliasMap.get(k);
  if (a?.length) return dedupeNodes(a);
  const b = aliasMap.get(normKey(loc));
  if (b?.length) return dedupeNodes(b);
  return [];
}

/** Single token matching country; only if exactly one node has that country. */
function nodesForCountryOnly(loc: string, nodes: NodeRow[]): NodeRow[] | null {
  const t = loc.trim();
  if (!t) return null;
  if (/[·\-–—]/.test(t)) return null;
  const k = normKey(t);
  const matches = nodes.filter(
    (n) => n.country && normKey(n.country) === k && n.country.trim().length > 0,
  );
  return matches.length === 1 ? matches : null;
}

function normalizeLegacyFreeText(loc: string): string {
  return normalizeServerLocationForStats(legacySeparatorsToMiddleDot(loc));
}

async function main() {
  const args = process.argv.slice(2);
  const apply = args.includes('--apply');
  const inferCountryOnly = args.includes('--infer-country-only');

  if (!process.env.DATABASE_URL) {
    console.error('Set DATABASE_URL');
    process.exit(1);
  }

  const nodes = await prisma.node.findMany({
    select: { id: true, country: true, city: true },
  });
  const aliasMap = buildAliasMap(nodes);

  const distinct = await prisma.$queryRaw<
    { server_location: string | null; c: bigint }[]
  >`
    SELECT server_location, COUNT(*)::bigint AS c
    FROM connection_sessions
    WHERE server_location IS NOT NULL AND TRIM(BOTH FROM server_location) <> ''
    GROUP BY server_location
    ORDER BY c DESC
  `;

  console.log('=== Distinct server_location (top 40) ===');
  for (const row of distinct.slice(0, 40)) {
    console.log(
      `${String(row.c).padStart(6)}  ${JSON.stringify(row.server_location)}`,
    );
  }
  console.log(
    `distinct=${distinct.length} nodes=${nodes.length} ${apply ? 'APPLY' : 'DRY-RUN'}${inferCountryOnly ? ' +infer-country-only' : ''}\n`,
  );

  type Reason = 'node_match' | 'normalize_only' | 'infer_country_unique';
  type Proposal = { id: string; old: string; new: string; reason: Reason };
  const proposals: Proposal[] = [];

  const sessions = await prisma.connectionSession.findMany({
    where: { serverLocation: { not: null } },
    select: { id: true, serverLocation: true },
  });

  for (const s of sessions) {
    const loc = s.serverLocation?.trim() ?? '';
    if (!loc) continue;

    let matched = nodesMatchingLocation(loc, aliasMap);
    let reason: Reason = 'node_match';

    if (matched.length === 0 && inferCountryOnly) {
      const one = nodesForCountryOnly(loc, nodes);
      if (one) {
        matched = one;
        reason = 'infer_country_unique';
      }
    }

    let next: string | null = null;
    if (matched.length === 1) {
      next = canonicalFromNode(matched[0].country, matched[0].city);
    } else {
      const normOnly = normalizeLegacyFreeText(loc);
      if (normOnly && normOnly !== loc) {
        next = normOnly;
        reason = 'normalize_only';
      }
    }

    if (next && next !== loc) {
      proposals.push({ id: s.id, old: loc, new: next, reason });
    }
  }

  const by = (r: Reason) => proposals.filter((p) => p.reason === r).length;
  console.log(
    `rows_to_update=${proposals.length} node_match=${by('node_match')} normalize_only=${by('normalize_only')} infer_country_unique=${by('infer_country_unique')}`,
  );
  for (const p of proposals.slice(0, 30)) {
    console.log(
      `[${p.reason}] ${JSON.stringify(p.old)} -> ${JSON.stringify(p.new)}`,
    );
  }

  if (!apply) {
    console.log('\nDry-run only. Re-run with --apply to persist.');
    await prisma.$disconnect();
    return;
  }

  const chunk = 200;
  for (let i = 0; i < proposals.length; i += chunk) {
    const slice = proposals.slice(i, i + chunk);
    await prisma.$transaction(
      slice.map((p) =>
        prisma.connectionSession.update({
          where: { id: p.id },
          data: { serverLocation: p.new },
        }),
      ),
    );
    console.log(
      `updated ${Math.min(i + chunk, proposals.length)}/${proposals.length}`,
    );
  }

  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

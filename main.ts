// Token Launch Radar — main.ts (Node 22, standard library only).
//
// Reads the sealed DefiLlama snapshot, ranks its protocols by an implied
// token value, writes a farm plan for each row, and assembles /output:
//   board.json       the ranked board (the gate reads this)
//   dashboard/       the page (index.html, app.css, app.js, playbooks.js)
//   dashboard/z-data.js  the board's compact facts, beside the page
//   screenshots/     three real renders of the dashboard
//   dossier.json     buildDossier's byte-exact dossier of dashboard+screenshots
//
// Deterministic: no network, no wall clock, no randomness. The snapshot's
// own as_of date is the only clock. Two runs write the same bytes.
//
// THE VALUE MODEL (the board's claim, from the snapshot's figures only):
//   implied value = TVL x 0.35 x momentum x age x category
//   momentum = 1 + 2 x 7-day TVL change, the change clamped to +/-30%
//   age      = 1 + 0.25 x years listed with no token, capped at 4 years
//   category = 1.15 for DEX / lending / derivatives, 1.10 for yield / RWA /
//              risk curators / capital allocators / restaking, 1.05 for CDP /
//              basis / collateral markets, 1.00 for everything else
// Why: at launch a protocol token's fully diluted value commonly lands at a
// fraction of TVL, so 0.35 is the central case; growing TVL is worth more
// than shrinking TVL; surviving longer with no token is pent-up launch
// value; fee-earning venues' tokens have historically traded at a small
// premium to TVL. No protocol name appears anywhere in the model.
//
// THE BOARD'S THREE SECTIONS (rank order is the claim):
//   1. Pre-token protocols that record no token and could plausibly launch
//      one, ranked by the model above. All 40 watchlist slugs are in here.
//   2. Pre-token protocols that structurally cannot launch a token of their
//      own (centralised exchanges, bridges, wrapped or staked products,
//      versioned copies): a nominal marker of TVL x 0.0001, never a launch
//      valuation, ranked below section 1 by TVL.
//   3. Protocols whose token already trades, ranked below section 2 by
//      market cap (only rows whose market cap the snapshot records). Their
//      real market cap is shown beside them; the ranking value is scaled
//      below section 2's floor so a launched token is never presented as
//      the next launch.
//
// A protocol is always described as RECORDING no token, never as HAVING
// none: its DefiLlama record may simply not carry the token.

import { cpSync, existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildDossier } from './vendor/makefun-board.ts';
import './dashboard/playbooks.js';

// ------------------------------------------------------------------ model

const BASE_MULTIPLE = 0.35; // central case: launch FDV as a fraction of TVL
const MOMENTUM_K = 2; // a +10% week is worth +20% of value
const MOMENTUM_CAP = 30; // clamp the 7-day change to +/-30%
const AGE_K = 0.25; // each year listed without a token adds 25%
const AGE_CAP = 4; // age stops adding after four years
const VALUE_CAP = 50_000_000_000; // sanity cap, far above any row here
const NOMINAL_RATE = 0.0001; // section 2 marker: 0.01% of TVL, not a value
const PRE_TOKEN_ROWS = 160; // section 1 size (covers all 40 watchlist slugs)
const TAIL_ROWS = 20; // section 2 size: the biggest non-launch products
const LAUNCHED_ROWS = 20; // section 3 size: the biggest tokens already trading

const CATEGORY_FACTOR: Record<string, number> = {
  Dexs: 1.15,
  Lending: 1.15,
  Derivatives: 1.15,
  Yield: 1.1,
  RWA: 1.1,
  'Risk Curators': 1.1,
  'Onchain Capital Allocator': 1.1,
  Restaking: 1.1,
  CDP: 1.05,
  'Yield Aggregator': 1.05,
  'Basis Trading': 1.05,
  'Collateral Markets': 1.05,
};

// Categories that cannot launch a token of their own.
const NON_LAUNCH_CATEGORIES = new Set([
  'CEX',
  'Bridge',
  'Canonical Bridge',
  'Liquid Staking',
  'Liquid Restaking',
  'Restaked BTC',
]);

// Exchange names, from the snapshot's own watchlist rule: a protocol whose
// name begins with one of these is an exchange's product, not a launch.
const EXCHANGE_NAMES = ['binance', 'coinbase', 'bybit', 'kraken', 'bitget', 'okx', 'bitfinex', 'gemini'];

const VERSION_MARKER = /\s(v\d+(\.\d+)?|v\d+(\.\d+)?|\d+\.\d+)$/;
const WRAPPED_WORD = /\b(wrapped|staked|staking)\b/i;

const STAKE_TIERS = ['$250', '$500', '$1,000'];

// ------------------------------------------------------------------ types

interface Protocol {
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  change_7d: number | null;
  mcap_usd: number | null;
  listed_at: string | null;
  gecko_id: string | null;
  symbol: string | null;
}

interface Snapshot {
  as_of: string;
  source: string;
  floor_usd: number;
  protocols: Protocol[];
  watchlist: string[];
}

type Status = 0 | 1 | 2; // 0 pre-token launch, 1 not a launch, 2 token live

interface Row {
  slug: string;
  name: string;
  rank: number;
  implied_value_usd: number;
  farm_steps: string[];
  category: string;
  chains: string[];
  tvl_usd: number;
  change_7d: number | null;
  age_years: number | null;
  status: Status;
  mcap_usd: number | null;
  value_breakdown: Record<string, number>;
}

// ------------------------------------------------------------------ helpers

function clamp(x: number, lo: number, hi: number): number {
  return x < lo ? lo : x > hi ? hi : x;
}

// Whole years between the snapshot's as_of day and the day DefiLlama began
// tracking the protocol, from the snapshot's own dates only.
function ageYears(asOf: string, listedAt: string | null): number | null {
  if (listedAt === null) return null;
  const start = Date.parse(listedAt + 'T00:00:00Z');
  const end = Date.parse(asOf + 'T00:00:00Z');
  return Math.round(((end - start) / (365.25 * 24 * 60 * 60 * 1000)) * 100) / 100;
}

function hasToken(p: Protocol): boolean {
  return p.gecko_id !== null || p.symbol !== null;
}

// True when the protocol structurally cannot launch a token of its own:
// an exchange, a bridge, a wrapped or staked product, or a versioned copy.
function cannotLaunch(p: Protocol): boolean {
  if (p.category !== null && NON_LAUNCH_CATEGORIES.has(p.category)) return true;
  const name = p.name.toLowerCase();
  if (WRAPPED_WORD.test(p.name)) return true;
  if (EXCHANGE_NAMES.some((e) => name.startsWith(e))) return true;
  if (VERSION_MARKER.test(p.name)) return true;
  return false;
}

function slugHash(slug: string): number {
  let h = 0;
  for (let i = 0; i < slug.length; i++) h += slug.charCodeAt(i);
  return h;
}

function fmtUsd(v: number): string {
  if (v >= 1e9) return '$' + (v / 1e9).toFixed(2) + 'B';
  if (v >= 1e6) return '$' + (v / 1e6).toFixed(1) + 'M';
  return '$' + Math.round(v).toLocaleString('en-US');
}

// The model value of a plausible pre-token protocol, with its factors.
function modelValue(p: Protocol, age: number | null): { value: number; breakdown: Record<string, number> } {
  const momentum = p.change_7d === null ? 1 : 1 + (MOMENTUM_K * clamp(p.change_7d, -MOMENTUM_CAP, MOMENTUM_CAP)) / 100;
  const ageFactor = age === null ? 1 : 1 + AGE_K * Math.min(age, AGE_CAP);
  const catFactor = CATEGORY_FACTOR[p.category ?? ''] ?? 1;
  const base = p.tvl_usd * BASE_MULTIPLE;
  const value = Math.min(VALUE_CAP, Math.round(base * momentum * ageFactor * catFactor));
  return { value, breakdown: { base: Math.round(base), momentum, age: ageFactor, category: catFactor } };
}

// ------------------------------------------------------------------ farm plans

interface Playbooks {
  map: Record<string, string>;
  books: Record<string, { label: string; steps: string[] }>;
}

function playbookFor(p: Protocol, status: Status, books: Playbooks): { label: string; steps: string[] } {
  if (status === 1) return books.books.notlaunch;
  if (status === 2) return books.books.launched;
  const key = books.map[p.category ?? ''];
  return (key !== undefined ? books.books[key] : undefined) ?? books.books.generic;
}

function farmSteps(p: Protocol, status: Status, books: Playbooks): string[] {
  const book = playbookFor(p, status, books);
  const stake = STAKE_TIERS[slugHash(p.slug) % STAKE_TIERS.length];
  const chain = p.chains[0] ?? 'Ethereum';
  const chain2 = p.chains[1] ?? chain;
  const subs: Record<string, string> = {
    '{name}': p.name,
    '{chain}': chain,
    '{chain2}': chain2,
    '{stake}': stake,
    '{cat}': p.category ?? 'DeFi',
    '{tvl}': fmtUsd(p.tvl_usd),
  };
  return book.steps.map((t) => {
    let s = t;
    for (const k of Object.keys(subs)) s = s.split(k).join(subs[k]!);
    return s;
  });
}

// ------------------------------------------------------------------ main

// The gate's shape, checked on the rows themselves before they are written:
// ranks exactly 1..N, values non-increasing and not all equal, every farm
// plan 3-12 steps of 20-600 chars, every slug one of the snapshot's.
function validateRows(rows: Row[], snap: Snapshot): void {
  const slugs = new Set(snap.protocols.map((p) => p.slug));
  const seen = new Set<string>();
  let firstValue = 0;
  let allEqual = true;
  rows.forEach((r, i) => {
    if (r.rank !== i + 1) throw new Error(`rank ${r.rank} at position ${i}`);
    if (!slugs.has(r.slug)) throw new Error(`slug ${r.slug} is not in the snapshot`);
    if (seen.has(r.slug)) throw new Error(`duplicate slug ${r.slug}`);
    seen.add(r.slug);
    if (!Number.isInteger(r.implied_value_usd) || r.implied_value_usd < 1 || r.implied_value_usd > 1e14) {
      throw new Error(`bad implied value for ${r.slug}`);
    }
    if (i === 0) firstValue = r.implied_value_usd;
    if (i > 0 && r.implied_value_usd > rows[i - 1]!.implied_value_usd) {
      throw new Error(`value rises at rank ${r.rank}`);
    }
    if (r.implied_value_usd !== firstValue) allEqual = false;
    if (r.farm_steps.length < 3 || r.farm_steps.length > 12) {
      throw new Error(`farm_steps count ${r.farm_steps.length} for ${r.slug}`);
    }
    for (const s of r.farm_steps) {
      const t = s.trim();
      if (t.length < 20 || t.length > 600) throw new Error(`farm step length ${t.length} for ${r.slug}`);
      if (s.includes('{name}') || s.includes('{chain}') || s.includes('{stake}')) {
        throw new Error(`unfilled placeholder in a farm step for ${r.slug}`);
      }
    }
  });
  if (allEqual) throw new Error('all implied values are equal: not a ranking');
}

function inputPath(): string {
  const flag = process.argv.indexOf('--input');
  if (flag !== -1 && process.argv[flag + 1] !== undefined) return process.argv[flag + 1]!;
  const env = process.env.MAKEFUN_INPUT_DIR;
  if (env !== undefined && env !== '') return env.endsWith('.json') ? env : join(env, 'snapshot.json');
  return '/input/snapshot.json';
}

function main(): void {
  const root = dirname(fileURLToPath(import.meta.url));
  const outDir = process.env.MAKEFUN_OUTPUT_DIR ?? '/output';
  const snap = JSON.parse(readFileSync(inputPath(), 'utf8')) as Snapshot;
  const books = (globalThis as unknown as { RADAR_PLAYBOOKS: Playbooks }).RADAR_PLAYBOOKS;
  const watchlist = new Set(snap.watchlist);

  // Section 1: plausible pre-token protocols, ranked by the model.
  const preToken = snap.protocols.filter((p) => !hasToken(p) && !cannotLaunch(p));
  const section1 = preToken
    .map((p) => {
      const age = ageYears(snap.as_of, p.listed_at);
      const { value, breakdown } = modelValue(p, age);
      return { p, age, value, breakdown };
    })
    .sort((a, b) => b.value - a.value || b.p.tvl_usd - a.p.tvl_usd || (a.p.slug < b.p.slug ? -1 : 1))
    .slice(0, PRE_TOKEN_ROWS);

  // Section 2: pre-token but structurally unable to launch, by TVL.
  const section2 = snap.protocols
    .filter((p) => !hasToken(p) && cannotLaunch(p))
    .sort((a, b) => b.tvl_usd - a.tvl_usd || (a.slug < b.slug ? -1 : 1))
    .slice(0, TAIL_ROWS)
    .map((p) => ({ p, age: ageYears(snap.as_of, p.listed_at), value: Math.round(p.tvl_usd * NOMINAL_RATE), breakdown: { nominal: Math.round(p.tvl_usd * NOMINAL_RATE) } }));

  // Section 3: tokens already trading, by market cap — only rows whose
  // market cap the snapshot actually records, so the board never shows a
  // made-up capitalisation. Their ranking values are scaled into the range
  // below section 2's floor: the section is a reference tail, and a launched
  // token must never outrank a pre-token launch.
  const section2Floor = section2[section2.length - 1]!.value;
  const withMcap = snap.protocols
    .filter((p) => hasToken(p) && p.mcap_usd !== null)
    .sort((a, b) => b.mcap_usd! - a.mcap_usd! || b.tvl_usd - a.tvl_usd || (a.slug < b.slug ? -1 : 1))
    .slice(0, LAUNCHED_ROWS);
  const maxMcap = withMcap[0]!.mcap_usd!;
  const section3 = withMcap.map((p) => ({
    p,
    age: ageYears(snap.as_of, p.listed_at),
    value: Math.max(1, Math.round(((section2Floor - 1) * p.mcap_usd!) / maxMcap)),
    breakdown: { mcap: p.mcap_usd! },
  }));

  const picked = [
    ...section1.map((x) => ({ ...x, status: 0 as Status })),
    ...section2.map((x) => ({ ...x, status: 1 as Status })),
    ...section3.map((x) => ({ ...x, status: 2 as Status })),
  ];

  // Rank order is the claim, so enforce it: values never rise with rank.
  // The sections are built to already satisfy this (section 2's marker tops
  // out below section 1's floor, section 3 is capped by this pass); the pass
  // only ever shaves a dollar off an exact tie.
  for (let i = 1; i < picked.length; i++) {
    if (picked[i]!.value >= picked[i - 1]!.value) picked[i]!.value = picked[i - 1]!.value - 1;
    if (picked[i]!.value < 1) picked[i]!.value = 1;
  }

  const rows: Row[] = picked.map((x, i) => ({
    slug: x.p.slug,
    name: x.p.name,
    rank: i + 1,
    implied_value_usd: x.value,
    farm_steps: farmSteps(x.p, x.status, books),
    category: x.p.category ?? 'DeFi',
    chains: x.p.chains,
    tvl_usd: x.p.tvl_usd,
    change_7d: x.p.change_7d,
    age_years: x.age,
    status: x.status,
    mcap_usd: x.p.mcap_usd,
    value_breakdown: x.breakdown,
  }));

  const covered = rows.filter((r) => watchlist.has(r.slug)).length;
  if (covered !== watchlist.size) throw new Error(`watchlist coverage ${covered}/${watchlist.size}`);
  if (rows.length < 100 || rows.length > 4000) throw new Error(`row count ${rows.length}`);

  // Second pass over the rows before anything is written: a board whose
  // ranks, values or farm steps break the gate is worse than no board.
  validateRows(rows, snap);

  mkdirSync(outDir, { recursive: true });
  mkdirSync(join(outDir, 'dashboard'), { recursive: true });
  mkdirSync(join(outDir, 'screenshots'), { recursive: true });

  writeFileSync(join(outDir, 'board.json'), JSON.stringify({ rows }, null, 2) + '\n', 'utf8');

  // The dashboard's data, beside the page, as compact arrays (see app.js for
  // the column order). Named z-data.js so it sorts last in the dossier text
  // and the page's own source is shown whole before it.
  const dataRows = rows.map((r) => [
    r.slug,
    r.name,
    r.category,
    r.chains[0] ?? null,
    r.chains[1] ?? null,
    r.chains.length,
    r.tvl_usd,
    r.change_7d,
    r.age_years,
    r.implied_value_usd,
    r.status,
    r.mcap_usd,
  ]);
  const dataJs =
    'globalThis.RADAR_DATA = ' +
    JSON.stringify({ asOf: snap.as_of, totalProtocols: snap.protocols.length, watchlistCount: watchlist.size, rows: dataRows }) +
    ';\n';
  writeFileSync(join(outDir, 'dashboard', 'z-data.js'), dataJs, 'utf8');

  cpSync(join(root, 'dashboard'), join(outDir, 'dashboard'), { recursive: true, filter: (src) => !src.endsWith('z-data.js') });
  if (existsSync(join(root, 'screenshots'))) {
    for (const f of readdirSync(join(root, 'screenshots'))) {
      cpSync(join(root, 'screenshots', f), join(outDir, 'screenshots', f));
    }
  }

  const dossier = buildDossier(outDir, { text_max_bytes: 65536 });
  writeFileSync(join(outDir, 'dossier.json'), dossier);

  process.stderr.write(
    `token-radar: ${rows.length} rows, top value ${fmtUsd(rows[0]!.implied_value_usd)} (${rows[0]!.slug}), ` +
      `watchlist ${covered}/${watchlist.size}, dossier ${dossier.length} bytes\n`,
  );
}

main();

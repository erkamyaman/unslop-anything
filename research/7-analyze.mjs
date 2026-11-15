// Step 7: turn labels into estimates with uncertainty.
// For every theme, two numbers per platform:
//   - review share: the share of low-rated reviews that state the theme,
//     weighting each sampled review by its app's population over its sample.
//   - app share: the average, over apps, of each app's share. Every app counts
//     once, so the biggest apps cannot drive the result.
// 95% intervals come from a cluster bootstrap that resamples apps, because
// reviews of the same app are not independent.
// Output: results/summary.json, results/summary.md

import path from "node:path";
import fs from "node:fs";
import { SEED, MODEL, EFFORT, MAX_STARS, MIN_WORDS, WINDOW_MONTHS, SAMPLE_PER_APP } from "./config.mjs";
import { THEME_IDS, DESIGN_THEMES } from "./lib/taxonomy.mjs";
import { DATA, RESULTS, dataPath, readJson, readJsonlGz, listFiles, writeJson, rng, log } from "./lib/util.mjs";

const B = 1000;
const MIN_APP_REVIEWS = 5;

// Derived groups reported next to the single themes.
export const GROUPS = {
  any_complaint: (l) => l.complaint,
  stability: (l) => l.themes.some((t) => ["crash", "performance", "bug"].includes(t)),
  design_addressable: (l) => l.themes.some((t) => DESIGN_THEMES.includes(t)),
};

export function indicators(label) {
  const out = {};
  for (const t of THEME_IDS) out[t] = label.themes.includes(t) ? 1 : 0;
  for (const [g, f] of Object.entries(GROUPS)) out[g] = f(label) ? 1 : 0;
  return out;
}

// apps: [{ rows: [{ w, y: {key: 0|1} }] }]
export function reviewShare(apps, key) {
  let num = 0;
  let den = 0;
  for (const a of apps) for (const r of a.rows) {
    num += r.w * r.y[key];
    den += r.w;
  }
  return den ? num / den : NaN;
}

export function appShare(apps, key) {
  const eligible = apps.filter((a) => a.rows.length >= MIN_APP_REVIEWS);
  if (!eligible.length) return NaN;
  let sum = 0;
  for (const a of eligible) sum += a.rows.reduce((s, r) => s + r.y[key], 0) / a.rows.length;
  return sum / eligible.length;
}

export function bootstrap(apps, stat, random, b = B) {
  const values = [];
  for (let i = 0; i < b; i++) {
    const resampled = Array.from({ length: apps.length }, () => apps[Math.floor(random() * apps.length)]);
    values.push(stat(resampled));
  }
  values.sort((x, y) => x - y);
  return [values[Math.floor(0.025 * (b - 1))], values[Math.ceil(0.975 * (b - 1))]];
}

function estimate(apps, key, random) {
  return {
    review: reviewShare(apps, key),
    reviewCI: bootstrap(apps, (s) => reviewShare(s, key), random),
    app: appShare(apps, key),
    appCI: bootstrap(apps, (s) => appShare(s, key), random),
  };
}

const pct = (x) => (Number.isFinite(x) ? `${(100 * x).toFixed(1)}%` : "n/a");
const ci = ([lo, hi]) => `${pct(lo)} to ${pct(hi)}`;

function groupApps(rows) {
  const byApp = new Map();
  for (const r of rows) {
    const k = `${r.platform}:${r.app}`;
    if (!byApp.has(k)) byApp.set(k, { platform: r.platform, category: r.category, band: r.band, rows: [] });
    byApp.get(k).rows.push(r);
  }
  return [...byApp.values()];
}

function corpusStats() {
  const pop = readJson(dataPath("population.json"));
  const out = { totals: pop.totals, sampled: pop.sampled, platforms: {} };
  for (const platform of ["apple", "play"]) {
    const metas = [...listFiles(path.join(DATA, "raw", platform), ".meta.json")].map((f) => readJson(f));
    const spans = metas
      .filter((m) => m.oldest && m.newest)
      .map((m) => (new Date(m.newest) - new Date(m.oldest)) / 864e5)
      .sort((a, b) => a - b);
    const per = pop.perApp.filter((a) => a.platform === platform);
    out.platforms[platform] = {
      apps: metas.length,
      appsWithReviews: metas.filter((m) => m.kept > 0).length,
      collected: per.reduce((s, a) => s + a.collected, 0),
      lowRated: per.reduce((s, a) => s + a.lowRated, 0),
      population: per.reduce((s, a) => s + a.population, 0),
      requests: metas.reduce((s, m) => s + m.requests, 0),
      medianWindowDays: spans.length ? Math.round(spans[Math.floor(spans.length / 2)]) : null,
    };
  }
  return out;
}

async function main() {
  const sample = readJsonlGz(dataPath("sample.jsonl.gz"));
  const labels = new Map(readJsonlGz(dataPath("labels.jsonl.gz")).map((l) => [l.key, l]));
  const random = rng(SEED ^ 0xb007);

  const rows = [];
  let nonEnglish = 0;
  for (const s of sample) {
    const label = labels.get(s.key);
    if (!label) continue;
    if (!label.english) {
      nonEnglish++;
      continue;
    }
    rows.push({ platform: s.platform, app: s.app, category: s.category, band: s.band, stars: s.review.rating, w: s.weight, y: indicators(label) });
  }

  const keys = ["any_complaint", ...THEME_IDS, "stability", "design_addressable"];
  const result = {
    generatedAt: new Date().toISOString(),
    method: { model: MODEL, effort: EFFORT, maxStars: MAX_STARS, minWords: MIN_WORDS, windowMonths: WINDOW_MONTHS, samplePerApp: SAMPLE_PER_APP, bootstrap: B, minAppReviews: MIN_APP_REVIEWS },
    corpus: corpusStats(),
    labelled: labels.size,
    english: rows.length,
    nonEnglish,
    platforms: {},
    byCategory: {},
    byBand: {},
    byStars: {},
  };

  for (const platform of ["apple", "play"]) {
    const apps = groupApps(rows.filter((r) => r.platform === platform));
    result.platforms[platform] = { apps: apps.length, reviews: apps.reduce((s, a) => s + a.rows.length, 0), estimates: {} };
    for (const k of keys) result.platforms[platform].estimates[k] = estimate(apps, k, random);
  }

  // Breakdowns use the app share across both platforms, without intervals for brevity.
  const both = groupApps(rows);
  for (const [field, target] of [["category", result.byCategory], ["band", result.byBand]]) {
    const values = [...new Set(both.map((a) => a[field]))].sort();
    for (const v of values) {
      const subset = both.filter((a) => a[field] === v);
      target[v] = { apps: subset.length };
      for (const k of keys) target[v][k] = appShare(subset, k);
    }
  }
  for (const stars of [1, 2, 3]) {
    const subset = groupApps(rows.filter((r) => r.stars === stars));
    result.byStars[stars] = { reviews: subset.reduce((s, a) => s + a.rows.length, 0) };
    for (const k of keys) result.byStars[stars][k] = reviewShare(subset, k);
  }

  fs.mkdirSync(RESULTS, { recursive: true });
  writeJson(path.join(RESULTS, "summary.json"), result);
  fs.writeFileSync(path.join(RESULTS, "summary.md"), markdown(result, keys));
  log(`wrote results/summary.json and results/summary.md from ${rows.length} English reviews`);
}

function markdown(r, keys) {
  const c = r.corpus;
  const lines = [];
  lines.push("# Results", "", `Generated ${r.generatedAt.slice(0, 10)}. Method: see [../README.md](../README.md).`, "");
  lines.push("## Corpus", "");
  lines.push("| | App Store | Google Play | Total |", "|---|---|---|---|");
  const row = (label, f) => lines.push(`| ${label} | ${f(c.platforms.apple)} | ${f(c.platforms.play)} | ${f({ apps: c.platforms.apple.apps + c.platforms.play.apps, appsWithReviews: c.platforms.apple.appsWithReviews + c.platforms.play.appsWithReviews, collected: c.totals.collected, lowRated: c.totals.lowRated, population: c.totals.population, requests: c.platforms.apple.requests + c.platforms.play.requests })} |`);
  const n = (x) => (x == null ? "" : x.toLocaleString("en-US"));
  row("Apps", (p) => n(p.apps));
  row("Apps with reviews", (p) => n(p.appsWithReviews));
  row("Reviews collected", (p) => n(p.collected));
  row(`Rated ${r.method.maxStars} stars or lower`, (p) => n(p.lowRated));
  row(`Of those, ${r.method.minWords}+ words, deduplicated`, (p) => n(p.population));
  lines.push(`| Median days covered per app | ${n(c.platforms.apple.medianWindowDays)} | ${n(c.platforms.play.medianWindowDays)} | |`);
  lines.push("", `Classified: ${n(r.labelled)} sampled reviews (${n(r.english)} in English, ${n(r.nonEnglish)} not, set aside).`, "");
  lines.push("## What low-rated reviews complain about", "");
  lines.push("Share of low-rated English reviews that state each theme. A review can state several. Review share weights reviews; app share counts every app once. 95% intervals from a bootstrap over apps.", "");
  for (const platform of ["apple", "play"]) {
    const p = r.platforms[platform];
    lines.push(`### ${platform === "apple" ? "App Store" : "Google Play"} (${p.apps} apps, ${n(p.reviews)} reviews)`, "");
    lines.push("| Theme | Review share | 95% interval | App share | 95% interval |", "|---|---|---|---|---|");
    const sorted = keys.slice().sort((a, b) => (p.estimates[b].app || 0) - (p.estimates[a].app || 0));
    for (const k of sorted) {
      const e = p.estimates[k];
      lines.push(`| ${k} | ${pct(e.review)} | ${ci(e.reviewCI)} | ${pct(e.app)} | ${ci(e.appCI)} |`);
    }
    lines.push("");
  }
  const table = (title, obj, first) => {
    lines.push(`## ${title}`, "", `| ${first} | ${keys.join(" | ")} |`, `|${"---|".repeat(keys.length + 1)}`);
    for (const [v, e] of Object.entries(obj)) lines.push(`| ${v} | ${keys.map((k) => pct(e[k])).join(" | ")} |`);
    lines.push("");
  };
  table("By category (app share, both stores)", r.byCategory, "Category");
  table("By chart rank band (app share, both stores)", r.byBand, "Band");
  table("By star rating (review share, both stores)", r.byStars, "Stars");
  return lines.join("\n") + "\n";
}

if (import.meta.url === `file://${process.argv[1]}`) await main();

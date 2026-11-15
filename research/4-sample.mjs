// Step 4: define the population and draw the classification sample.
// Population: collected reviews with MAX_STARS stars or fewer and at least
// MIN_WORDS words, after removing duplicate texts within an app.
// Sample: up to SAMPLE_PER_APP reviews per app, drawn at random. Each sampled
// review carries a weight (the app's population over its sample size) so
// estimates can be made per review as well as per app.
// Output: data/sample.jsonl.gz, data/population.json

import path from "node:path";
import { MAX_STARS, MIN_WORDS, SAMPLE_PER_APP, SEED } from "./config.mjs";
import { DATA, dataPath, readJson, readJsonlGz, listFiles, writeJsonlGz, writeJson, rng, shuffle, hash, log } from "./lib/util.mjs";

export const words = (s) => (s.match(/[\p{L}\p{N}']+/gu) || []).length;
export const normalize = (s) => s.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").trim();

export function population(rows) {
  const seen = new Set();
  const out = [];
  for (const r of rows) {
    if (!(r.rating >= 1 && r.rating <= MAX_STARS)) continue;
    if (words(r.text) < MIN_WORDS) continue;
    const key = normalize(`${r.title} ${r.text}`);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(r);
  }
  return out;
}

async function main() {
  const { apps } = readJson(dataPath("apps.json"));
  const appInfo = new Map(apps.map((a) => [`${a.platform}:${a.id}`, a]));
  const sample = [];
  const perApp = [];
  const totals = { collected: 0, lowRated: 0, population: 0 };
  for (const platform of ["apple", "play"]) {
    for (const file of listFiles(path.join(DATA, "raw", platform), ".jsonl.gz")) {
      const rows = readJsonlGz(file);
      const appId = path.basename(file, ".jsonl.gz");
      const info = appInfo.get(`${platform}:${appId}`);
      if (!info) continue;
      const pop = population(rows);
      const take = shuffle(pop, rng(SEED ^ hash(`sample:${platform}:${appId}`))).slice(0, SAMPLE_PER_APP);
      const weight = take.length ? pop.length / take.length : 0;
      for (const r of take) {
        sample.push({
          key: `s${sample.length}`,
          review: { id: r.id, platform, rating: r.rating, title: r.title, text: r.text, date: r.date, country: r.country, sort: r.sort },
          app: appId,
          platform,
          category: info.category,
          band: info.band,
          weight,
        });
      }
      const low = rows.filter((r) => r.rating <= MAX_STARS).length;
      totals.collected += rows.length;
      totals.lowRated += low;
      totals.population += pop.length;
      perApp.push({ platform, app: appId, category: info.category, band: info.band, collected: rows.length, lowRated: low, population: pop.length, sampled: take.length });
    }
  }
  writeJsonlGz(dataPath("sample.jsonl.gz"), sample);
  writeJson(dataPath("population.json"), { totals, sampled: sample.length, perApp });
  log(`collected ${totals.collected}, low-rated ${totals.lowRated}, population ${totals.population}, sample ${sample.length}`);
}

if (import.meta.url === `file://${process.argv[1]}`) await main();

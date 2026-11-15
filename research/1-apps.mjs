// Step 1: choose the apps. For each shared category and platform, take the US
// top-free chart and draw apps from three rank bands with a fixed seed.
// Output: data/apps.json

import gplay from "google-play-scraper";
import { CATEGORIES, APPS_PER_CATEGORY, RANK_BANDS, CHART_COUNTRY, SEED } from "./config.mjs";
import { dataPath, getJson, rng, shuffle, hash, writeJson, log, sleep } from "./lib/util.mjs";

async function appleChart(genre) {
  const url = `https://itunes.apple.com/${CHART_COUNTRY}/rss/topfreeapplications/limit=200/genre=${genre}/json`;
  const feed = await getJson(url);
  return (feed?.feed?.entry || []).map((e, i) => ({
    id: e.id.attributes["im:id"],
    name: e["im:name"].label,
    developer: e["im:artist"]?.label ?? null,
    rank: i + 1,
  }));
}

async function playChart(category) {
  for (let attempt = 0; attempt < 4; attempt++) {
    try {
      const list = await gplay.list({ collection: gplay.collection.TOP_FREE, category, num: 200, country: CHART_COUNTRY, lang: "en" });
      return list.map((a, i) => ({ id: a.appId, name: a.title, developer: a.developer ?? null, rank: i + 1 }));
    } catch (err) {
      log(`play chart ${category} failed (${err.message}), retrying`);
      await sleep(2000 * 2 ** attempt);
    }
  }
  throw new Error(`play chart ${category} failed`);
}

// Split a quota across rank bands, then draw at random inside each band,
// skipping apps another category already took.
export function drawFromChart(chart, quota, random, taken = () => false) {
  const counts = RANK_BANDS.map((b) => Math.round(quota * b.share));
  counts[0] += quota - counts.reduce((a, b) => a + b, 0);
  const picked = [];
  RANK_BANDS.forEach((band, i) => {
    const pool = chart.filter((a) => a.rank >= band.from && a.rank <= band.to && !taken(a));
    for (const app of shuffle(pool, random).slice(0, counts[i])) picked.push({ ...app, band: band.name });
  });
  return picked;
}

async function main() {
  const apps = [];
  const seen = new Set();
  for (const [category, stores] of Object.entries(CATEGORIES)) {
    for (const platform of ["apple", "play"]) {
      const storeCats = stores[platform];
      const quota = Math.round(APPS_PER_CATEGORY / storeCats.length);
      for (const storeCat of storeCats) {
        const chart = platform === "apple" ? await appleChart(storeCat) : await playChart(storeCat);
        const random = rng(SEED ^ hash(`${platform}:${storeCat}`));
        const picked = drawFromChart(chart, quota, random, (a) => seen.has(`${platform}:${a.id}`));
        for (const app of picked) {
          seen.add(`${platform}:${app.id}`);
          apps.push({ platform, category, storeCategory: String(storeCat), chartSize: chart.length, ...app });
        }
        const added = picked.length;
        log(`${platform} ${category}/${storeCat}: chart ${chart.length}, took ${added}`);
      }
    }
  }
  writeJson(dataPath("apps.json"), { collectedAt: new Date().toISOString(), chartCountry: CHART_COUNTRY, seed: SEED, apps });
  const by = (p) => apps.filter((a) => a.platform === p).length;
  log(`apps: ${apps.length} (apple ${by("apple")}, play ${by("play")})`);
}

if (import.meta.url === `file://${process.argv[1]}`) await main();

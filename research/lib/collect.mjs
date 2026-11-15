// The collection loop both platforms share: walk an app's storefront-and-sort
// passes in a seeded order, take at most CAP_PER_PASS from each, stop at
// CAP_PER_APP, dedupe by review id, and write one file per app.

import fs from "node:fs";
import { CAP_PER_APP, CAP_PER_PASS, CONCURRENCY, SEED, WINDOW_MONTHS } from "../config.mjs";
import { dataPath, readJson, writeJsonlGz, writeJson, rng, shuffle, hash, pool, log } from "./util.mjs";

// Countries in a per-app random order, each with every sort order, so a big
// app that hits its cap early still gets a random mix of storefronts and
// alternates between newest and most-helpful reviews.
export function passesFor(appId, countries, sorts) {
  const order = shuffle(countries, rng(SEED ^ hash(appId)));
  return order.flatMap((country) => sorts.map((sort) => ({ country, sort })));
}

export function windowStart(now = new Date()) {
  const d = new Date(now);
  d.setUTCMonth(d.getUTCMonth() - WINDOW_MONTHS);
  return d.toISOString();
}

// Sort orders that return newest first: once a page is older than the window,
// later pages are too.
const NEWEST_FIRST = new Set(["mostrecent", "NEWEST"]);

export async function collectPlatform(platform, { countries, sorts, fetchPass, limit, concurrency }) {
  const since = windowStart();
  const { apps } = readJson(dataPath("apps.json"));
  const mine = apps.filter((a) => a.platform === platform).slice(0, limit ? Number(limit) : undefined);
  let done = 0;
  let total = 0;
  await pool(mine, Number(concurrency) || CONCURRENCY, async (app) => {
    const out = dataPath("raw", platform, `${app.id}.jsonl.gz`);
    const metaFile = dataPath("raw", platform, `${app.id}.meta.json`);
    if (fs.existsSync(out) && fs.existsSync(metaFile)) {
      // Done, unless it filled a smaller cap than today's: then there may be
      // more to collect, and the same seeded pass order gives the same result
      // as collecting at today's cap from the start.
      // An app with a failed pass (throttling, a dropped connection) is
      // collected again so a temporary error does not leave a hole.
      const meta = readJson(metaFile);
      const oldCap = meta.cap ?? 1600;
      const failed = meta.passes.some((p) => p.error);
      if (!failed && (meta.kept < oldCap || oldCap >= CAP_PER_APP)) {
        total += meta.kept;
        done++;
        return;
      }
    }
    const byId = new Map();
    const passes = [];
    let requests = 0;
    for (const pass of passesFor(app.id, countries, sorts)) {
      if (byId.size >= CAP_PER_APP) break;
      let added = 0;
      let seenInPass = 0;
      let outside = 0;
      const room = () => Math.min(CAP_PER_PASS - added, CAP_PER_APP - byId.size);
      try {
        for await (const page of fetchPass(app, pass)) {
          requests++;
          let pageInWindow = 0;
          for (const review of page) {
            seenInPass++;
            if (room() <= 0) break;
            if (!review.date || review.date < since) {
              outside++;
              continue;
            }
            pageInWindow++;
            if (byId.has(review.id)) continue;
            byId.set(review.id, { ...review, app: app.id, platform, country: pass.country, sort: pass.sort });
            added++;
          }
          if (room() <= 0) break;
          if (NEWEST_FIRST.has(pass.sort) && pageInWindow === 0) break;
        }
      } catch (err) {
        passes.push({ ...pass, error: String(err.message || err) });
        continue;
      }
      passes.push({ ...pass, seen: seenInPass, outsideWindow: outside, added });
    }
    const rows = [...byId.values()];
    writeJsonlGz(out, rows);
    const dates = rows.map((r) => r.date).filter(Boolean).sort();
    writeJson(metaFile, {
      app: app.id,
      platform,
      requests,
      since,
      cap: CAP_PER_APP,
      collectedAt: new Date().toISOString(),
      kept: rows.length,
      oldest: dates[0] ?? null,
      newest: dates.at(-1) ?? null,
      passes,
    });
    total += rows.length;
    done++;
    log(`${platform} ${done}/${mine.length} ${app.name.slice(0, 40)}: ${rows.length} reviews, ${requests} requests (total ${total})`);
  });
  log(`${platform} finished: ${done} apps, ${total} reviews`);
}

// Step 5: label every review in the population with the rule classifier.
// Output: data/rules.jsonl.gz (one row per review: store, app, category,
// band, stars, English or not, themes). No text is copied.

import path from "node:path";
import { population } from "./4-sample.mjs";
import { classifyByRules } from "./lib/rules.mjs";
import { DATA, dataPath, readJson, readJsonlGz, listFiles, writeJsonlGz, log } from "./lib/util.mjs";
import { corpusIds } from "./lib/corpus.mjs";

async function main() {
  const { apps } = readJson(dataPath("apps.json"));
  const appInfo = new Map(apps.map((a) => [`${a.platform}:${a.id}`, a]));
  const inCorpus = corpusIds();
  const out = [];
  for (const platform of ["apple", "play"]) {
    for (const file of listFiles(path.join(DATA, "raw", platform), ".jsonl.gz")) {
      const appId = path.basename(file, ".jsonl.gz");
      const info = appInfo.get(`${platform}:${appId}`);
      if (!info) continue;
      for (const r of population(readJsonlGz(file).filter((x) => inCorpus[platform].has(x.id)))) {
        const label = classifyByRules(r);
        out.push({ id: r.id, platform, app: appId, category: info.category, band: info.band, stars: r.rating, english: label.english, themes: label.themes });
      }
    }
  }
  writeJsonlGz(dataPath("rules.jsonl.gz"), out);
  log(`labelled ${out.length} reviews by rules (${out.filter((r) => r.english).length} English)`);
}

if (import.meta.url === `file://${process.argv[1]}`) await main();

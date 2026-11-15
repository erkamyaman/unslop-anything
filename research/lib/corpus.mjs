// The study corpus: a fixed number of reviews per store (CORPUS_TARGET), drawn
// uniformly at random from everything collected for that store. A uniform
// draw keeps the corpus representative of what was collected; reviews left
// out are not used anywhere. A store that collected fewer keeps them all.

import path from "node:path";
import { CORPUS_TARGET, SEED } from "../config.mjs";
import { DATA, readJsonlGz, listFiles, hash } from "./util.mjs";

export function selectIds(ids, target, seed = SEED) {
  if (ids.length <= target) return new Set(ids);
  const ranked = ids.map((id) => [hash(`${seed}:${id}`), id]).sort((a, b) => a[0] - b[0] || (a[1] < b[1] ? -1 : 1));
  return new Set(ranked.slice(0, target).map(([, id]) => id));
}

// Map of store -> Set of review ids in the corpus.
export function corpusIds() {
  const out = {};
  for (const platform of Object.keys(CORPUS_TARGET)) {
    const ids = [];
    for (const file of listFiles(path.join(DATA, "raw", platform), ".jsonl.gz")) for (const r of readJsonlGz(file)) ids.push(r.id);
    out[platform] = selectIds(ids, CORPUS_TARGET[platform]);
  }
  return out;
}

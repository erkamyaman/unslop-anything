// The study corpus. Every Google Play review collected is in it, and makes up
// CORPUS_SPLIT.play of the total; the App Store makes up the rest. If the App
// Store did not collect enough for its share, Google Play is drawn down
// instead, so the split holds either way. Draws are uniform and seeded, so
// the corpus stays representative of what was collected.

import path from "node:path";
import { CORPUS_SPLIT, SEED } from "../config.mjs";
import { DATA, readJsonlGz, listFiles, hash } from "./util.mjs";

export function selectIds(ids, target, seed = SEED) {
  if (ids.length <= target) return new Set(ids);
  const ranked = ids.map((id) => [hash(`${seed}:${id}`), id]).sort((a, b) => a[0] - b[0] || (a[1] < b[1] ? -1 : 1));
  return new Set(ranked.slice(0, target).map(([, id]) => id));
}

// How many reviews each store contributes, given what each collected.
export function targets(collected, split = CORPUS_SPLIT) {
  const appleFromPlay = Math.round((collected.play * split.apple) / split.play);
  if (collected.apple >= appleFromPlay) return { apple: appleFromPlay, play: collected.play };
  return { apple: collected.apple, play: Math.round((collected.apple * split.play) / split.apple) };
}

// Map of store -> Set of review ids in the corpus.
export function corpusIds() {
  const ids = { apple: [], play: [] };
  for (const platform of Object.keys(ids)) {
    for (const file of listFiles(path.join(DATA, "raw", platform), ".jsonl.gz")) for (const r of readJsonlGz(file)) ids[platform].push(r.id);
  }
  const want = targets({ apple: ids.apple.length, play: ids.play.length });
  return { apple: selectIds(ids.apple, want.apple), play: selectIds(ids.play, want.play) };
}

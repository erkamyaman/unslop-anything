// The study corpus: every review from the collection rounds that finished.
//
// - App Store: the apps of every complete round (CORPUS.appleRounds). A round
//   is collected in category order, so a round stopped part way would give
//   its early categories more apps than its late ones; it is left out.
// - Google Play: each app's first full pass (the first ten storefronts and at
//   most the first 2,400 reviews collected). A later top-up was stopped part
//   way and is left out for the same reason.

import path from "node:path";
import { CORPUS, ENGLISH_STOREFRONTS } from "../config.mjs";
import { DATA, dataPath, readJson, readJsonlGz } from "./util.mjs";

export function inCorpusApp(app) {
  return app.platform === "play" || CORPUS.appleRounds.includes(app.round || 1);
}

// Google Play rows from the first full pass, in collection order: rows from
// the top-up were appended after them.
export function playFirstPass(rows) {
  const storefronts = new Set(ENGLISH_STOREFRONTS.slice(0, CORPUS.playFirstPass.storefronts));
  return rows.filter((r) => storefronts.has(r.country)).slice(0, CORPUS.playFirstPass.capPerApp);
}

// The corpus rows of one app, or none if the app is not in the corpus.
export function corpusRows(app) {
  if (!inCorpusApp(app)) return [];
  const rows = readJsonlGz(path.join(DATA, "raw", app.platform, `${app.id}.jsonl.gz`));
  return app.platform === "play" ? playFirstPass(rows) : rows;
}

export function corpusApps() {
  return readJson(dataPath("apps.json")).apps.filter(inCorpusApp);
}

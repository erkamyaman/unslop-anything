// Every design decision of the study, in one place. Change a value here and
// the methodology in README.md must change with it.

export const SEED = 20261115;

// Shared categories, each mapped to the store categories that hold those apps.
// Apple ids are App Store genre ids; Play ids are google-play-scraper categories.
export const CATEGORIES = {
  business: { apple: [6000], play: ["BUSINESS"] },
  weather: { apple: [6001], play: ["WEATHER"] },
  utilities: { apple: [6002], play: ["TOOLS"] },
  travel: { apple: [6003], play: ["TRAVEL_AND_LOCAL"] },
  sports: { apple: [6004], play: ["SPORTS"] },
  social: { apple: [6005], play: ["SOCIAL", "COMMUNICATION", "DATING"] },
  books_reference: { apple: [6006, 6018], play: ["BOOKS_AND_REFERENCE"] },
  productivity: { apple: [6007], play: ["PRODUCTIVITY"] },
  photo_video: { apple: [6008], play: ["PHOTOGRAPHY", "VIDEO_PLAYERS"] },
  news: { apple: [6009], play: ["NEWS_AND_MAGAZINES"] },
  navigation: { apple: [6010], play: ["MAPS_AND_NAVIGATION"] },
  music: { apple: [6011], play: ["MUSIC_AND_AUDIO"] },
  lifestyle: { apple: [6012], play: ["LIFESTYLE"] },
  health_fitness: { apple: [6013], play: ["HEALTH_AND_FITNESS"] },
  games: { apple: [6014], play: ["GAME"] },
  finance: { apple: [6015], play: ["FINANCE"] },
  entertainment: { apple: [6016], play: ["ENTERTAINMENT"] },
  education: { apple: [6017], play: ["EDUCATION"] },
  medical: { apple: [6020], play: ["MEDICAL"] },
  food_drink: { apple: [6023], play: ["FOOD_AND_DRINK"] },
  shopping: { apple: [6024], play: ["SHOPPING"] },
};

// Apps per shared category per platform, split across rank bands of the
// US top-free chart so the sample is not only the biggest apps. Apple's chart
// feed stops at 100, so both platforms use ranks 1 to 100.
export const APPS_PER_CATEGORY = 22;
export const RANK_BANDS = [
  { name: "head", from: 1, to: 10, share: 0.45 },
  { name: "middle", from: 11, to: 50, share: 0.3 },
  { name: "tail", from: 51, to: 100, share: 0.25 },
];
export const CHART_COUNTRY = "us";

// English-language storefronts. Reviews are collected per storefront and
// deduplicated by review id.
export const ENGLISH_STOREFRONTS = ["us", "gb", "ca", "au", "nz", "ie", "in", "sg", "za", "ph", "my", "ng", "ke", "gh", "pk", "ae", "hk", "jm", "mt", "lk"];
export const APPLE_COUNTRIES = ENGLISH_STOREFRONTS;
export const PLAY_COUNTRIES = ENGLISH_STOREFRONTS;

// Apple's feed returns at most 10 pages of 50 per storefront and sort order.
// Newest-first alone covers only days for a big app, so both orders are used.
export const APPLE_SORTS = ["mostrecent", "mosthelpful"];
export const PLAY_SORTS = ["NEWEST", "HELPFULNESS"];

// Reviews kept per app, and the most any one storefront-and-sort pass may
// add, so a big app's reviews come from several storefronts and both orders.
export const CAP_PER_APP = { apple: 2400, play: 2800 };
export const CAP_PER_PASS = 150;

// Politeness: concurrent apps, and the pause before each request.
export const CONCURRENCY = 3;
export const REQUEST_DELAY_MS = 350;

// The corpus: the collection rounds that finished (see lib/corpus.mjs).
// App Store: rounds 1 and 2 (701 apps); rounds 3 and 4 were stopped part way.
// Google Play: each app's first full pass; its top-up was stopped part way.
export const CORPUS = { appleRounds: [1, 2], playFirstPass: { storefronts: 10, capPerApp: 2400 } };

// Only reviews from the last WINDOW_MONTHS before collection are kept, so an
// old most-helpful review about a long-gone design does not take a slot.
// Analysis population: reviews of 3 stars or fewer, with at least 4 words.
export const MAX_STARS = 3;
export const WINDOW_MONTHS = 24;
export const MIN_WORDS = 4;

// Classification sample: up to this many reviews per app, drawn at random.
export const SAMPLE_PER_APP = 30;

// Reference sample for hand labelling, per store, and the size of each
// labelling batch.
export const GOLD_PER_PLATFORM = 600;
export const GOLD_BATCH = 100;

// Optional: classify the per-app sample with Claude through the Batch API
// (needs ANTHROPIC_API_KEY). Validation re-labels a subset at higher effort.
export const MODEL = "claude-opus-5-5";
export const EFFORT = "low";
export const VALIDATION_SIZE = 500;
export const VALIDATION_EFFORT = "high";

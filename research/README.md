# What users complain about: the review study

The skill puts user friction ahead of looks because of what people write in low-rated app reviews. This folder is the study behind that claim: the code that collects the reviews, the method, and the results. Raw review text is not published; anyone can re-run the pipeline.

The first version (105,027 App Store reviews from 299 apps) matched keywords against each app's newest reviews. That had three problems this version fixes:

1. **One week of complaints.** Apple's feed returns at most the 500 newest reviews per app and storefront. For a big app, 500 reviews cover a few days, so the old numbers were mostly about each app's latest release.
2. **Keywords count words, not complaints.** "Crash" in "I crashed my car" counted as a crash, and lag, crashes, and bugs shared one bucket.
3. **Big apps dominated.** Every review counted once, so the busiest apps set the result.

## Method

All parameters live in [config.mjs](config.mjs).

**Apps.** For each of 21 categories, on each store, 22 apps from the US top-free chart, drawn at random from three rank bands: 1 to 10, 11 to 50, and 51 to 100 (Apple's chart feed stops at 100). Seeded, so the same draw comes out every time. About 460 apps per store.

**Reviews.** English-language storefronts: US, UK, Canada, Australia, New Zealand, Ireland, India, Singapore, South Africa, the Philippines.

- App Store: Apple's public customer-reviews feed, both newest-first and most-helpful order.
- Google Play: the open-source [google-play-scraper](https://github.com/facundoolano/google-play-scraper), newest-first and most-helpful order, at a polite rate.
- Each app's storefronts are visited in a seeded random order, alternating sort orders, with at most 150 reviews from any one storefront-and-order pass and 1,600 per app. A big app's reviews therefore come from several storefronts and both orders instead of one week in one country.
- Only reviews from the 24 months before collection are kept.
- Review ids, star ratings, titles, texts, dates, app versions, and helpful-vote counts are stored. Reviewer names are not.

**Population.** Reviews of 3 stars or fewer with at least 4 words, after removing duplicate texts within an app.

**Sample.** Up to 30 reviews per app, drawn at random from its population. Each sampled review carries a weight: the app's population divided by its sample size.

**Classification.** Claude (`claude-opus-5-5`, low effort, structured output) labels each sampled review through the Message Batches API: whether it is in English, whether it complains, every theme it states, and its main theme. The themes and their boundaries are in [lib/taxonomy.mjs](lib/taxonomy.mjs). Crashes, slowness, and bugs are separate themes. Labels describe what the reviewer says, not a guess at the cause. Non-English reviews are set aside.

**Validation.** 500 labelled reviews, drawn at random, are labelled again at high effort, and agreement is measured per theme with Cohen's kappa. The same 500 are exported as a sheet for a person to label by hand; `node 6-validate.mjs --score` then measures both model runs against the person.

**Estimates.** For each theme and store, two numbers:

- **Review share:** the weighted share of low-rated reviews that state the theme.
- **App share:** the average over apps of each app's share, so every app counts once.

95% intervals come from a bootstrap that resamples apps, because reviews of the same app are not independent. The stores are reported separately because their review samples cover different time spans.

## Limits

- **Low-rated reviews are not all users.** People who leave a 1-star review are not a random sample of users, and many unhappy users never write one.
- **Play reaches less far back.** Google Play has no date filter. For busy apps, newest-first reviews cover hours, so Play leans on most-helpful order and its windows are shorter than Apple's. The results report the median span covered per app.
- **Top charts only.** Apps outside the top 100 of their category are not in the study.
- **Labels are a model's.** The validation results say how far to trust each theme. Themes with low agreement are reported as such.
- **What reviews cannot show.** A review says an app feels slow; it does not measure it.

## Running it

```bash
npm install
node 1-apps.mjs              # choose apps            -> data/apps.json
node 2-collect-apple.mjs     # App Store reviews      -> data/raw/apple/
node 3-collect-play.mjs      # Google Play reviews    -> data/raw/play/
node 4-sample.mjs            # population and sample  -> data/sample.jsonl.gz
node 5-classify.mjs --try 5  # check the setup on 5 reviews
node 5-classify.mjs          # label the sample       -> data/labels.jsonl.gz
node 6-validate.mjs          # agreement check        -> results/validation.json
node 7-analyze.mjs           # estimates              -> results/summary.md
```

Collection and classification resume where they stopped. Classification needs an `ANTHROPIC_API_KEY`. Charts and reviews change daily, so a re-run gives a fresh sample, not the same reviews; the method and seed stay fixed.

`data/` is not committed. `results/` is.

"use strict";

const test = require("node:test");
const assert = require("node:assert");
const path = require("path");
const { scan, scanSource, rules, isSlopHue, main } = require("../scripts/detect.js");

const fixtures = path.join(__dirname, "fixtures");
const rulesIn = (file) => new Set(scan([path.join(fixtures, "slop", file)]).findings.map((f) => f.rule));

test("clean fixtures produce no findings", () => {
  const { findings, filesScanned } = scan([path.join(fixtures, "clean")]);
  assert.strictEqual(filesScanned, 4);
  assert.deepStrictEqual(findings, []);
});

test("React Native slop is caught", () => {
  const found = rulesIn("HomeScreen.tsx");
  for (const id of [
    "slop-gradient", "gradient-text", "nested-cards", "status-dot", "unvirtualized-list",
    "fixed-text-size", "emoji-icon", "sparkle-icon", "oops-error", "buzzword-copy",
    "welcome-back", "vague-button", "invented-stat", "glow-shadow", "hover-only",
    "keyboard-cover", "back-gesture", "drawer-nav",
  ]) assert.ok(found.has(id), `missing ${id}`);
});

test("SwiftUI slop is caught", () => {
  const found = rulesIn("Dashboard.swift");
  for (const id of ["unvirtualized-list", "status-dot", "fixed-text-size", "slop-gradient", "glow-shadow", "back-gesture", "drawer-nav", "safe-area-off"]) {
    assert.ok(found.has(id), `missing ${id}`);
  }
});

test("Compose slop is caught", () => {
  const found = rulesIn("MainScreen.kt");
  for (const id of ["template-theme", "unvirtualized-list", "nested-cards", "status-dot", "drawer-nav", "back-gesture"]) {
    assert.ok(found.has(id), `missing ${id}`);
  }
});

test("Flutter slop is caught", () => {
  const found = rulesIn("home.dart");
  for (const id of ["template-theme", "back-gesture", "unvirtualized-list", "nested-cards", "status-dot", "fixed-text-size"]) {
    assert.ok(found.has(id), `missing ${id}`);
  }
});

test("every rule has a fixture that triggers it", () => {
  const all = new Set(scan([path.join(fixtures, "slop")]).findings.map((f) => f.rule));
  for (const rule of rules) assert.ok(all.has(rule.id), `no fixture for ${rule.id}`);
});

test("commented-out code is ignored", () => {
  const src = '// <LinearGradient colors={["#7C3AED", "#EC4899"]} />\n/* Oops! Something went wrong */\n';
  assert.deepStrictEqual(scanSource(src, "a.tsx"), []);
});

test("URLs in strings do not start a comment", () => {
  const src = 'const a = "https://x.dev"; const b = "Oops";\n';
  assert.deepStrictEqual(scanSource(src, "a.ts").map((f) => f.rule), ["oops-error"]);
});

test("inline ignore comments silence a line", () => {
  const src = '// unslopovich-ignore oops-error\nconst a = "Oops";\nconst b = "Oops"; // unslopovich-ignore\nconst c = "Oops";\n';
  assert.deepStrictEqual(scanSource(src, "a.ts").map((f) => f.line), [4]);
});

test("ignored rules are skipped", () => {
  assert.deepStrictEqual(scanSource('const a = "Oops";', "a.ts", { ignoreRules: ["oops-error"] }), []);
});

test("style percentages and scale multipliers are not findings", () => {
  const src = [
    "<View style={{ width: '80%', maxWidth: '100%' }} />",
    "<Text maxFontSizeMultiplier={1.5}>Hi</Text>",
    "<ScrollView horizontal>{chips.map((c) => <Chip key={c} />)}</ScrollView>",
    "const ref = useAnimatedRef<ScrollView>()",
  ].join("\n");
  assert.deepStrictEqual(scanSource(src, "a.tsx"), []);
});

test("emoji pickers are not icon findings, labeled emoji are", () => {
  assert.deepStrictEqual(scanSource("const picks = ['😀', '😂', '🎉'];", "a.ts"), []);
  assert.deepStrictEqual(scanSource("<Text>🚀 Fast</Text>", "a.tsx").map((f) => f.rule), ["emoji-icon"]);
});

test("the slop hue band", () => {
  assert.ok(isSlopHue("7C3AED")); // violet
  assert.ok(isSlopHue("6366F1")); // indigo
  assert.ok(isSlopHue("EC4899")); // pink
  assert.ok(!isSlopHue("1B6E5A")); // green
  assert.ok(!isSlopHue("0A7EA4")); // teal blue
  assert.ok(!isSlopHue("777777")); // gray
});

test("exit codes and json shape", () => {
  const log = console.log;
  let out = "";
  console.log = (s) => (out += s);
  try {
    assert.strictEqual(main([path.join(fixtures, "slop"), "--json"]), 2);
    const parsed = JSON.parse(out);
    assert.strictEqual(parsed.version, 1);
    assert.ok(parsed.findings.every((f) => f.rule && f.severity && f.file && f.line && f.message && f.fix));
    out = "";
    assert.strictEqual(main([path.join(fixtures, "clean")]), 0);
  } finally {
    console.log = log;
  }
  const err = console.error;
  console.error = () => {};
  try {
    assert.strictEqual(main(["--ignore", "not-a-rule"]), 1);
    assert.strictEqual(main(["--nope"]), 1);
  } finally {
    console.error = err;
  }
});

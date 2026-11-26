"use strict";

const test = require("node:test");
const assert = require("node:assert");
const path = require("path");
const { scan, scanSource, rules, isSlopHue, main, blankComments } = require("../skills/unslop-anything/scripts/detect.js");

const fixtures = path.join(__dirname, "fixtures");

test("the README rule count matches the detector", () => {
  const readme = require("node:fs").readFileSync(path.join(__dirname, "..", "README.md"), "utf8");
  const stated = readme.match(/(\d+) detector rules/);
  assert.ok(stated, "README no longer states 'N detector rules'");
  assert.strictEqual(Number(stated[1]), rules.length);
});
const rulesIn = (file) => new Set(scan([path.join(fixtures, "slop", file)]).findings.map((f) => f.rule));

test("clean fixtures produce no findings", () => {
  const { findings, filesScanned } = scan([path.join(fixtures, "clean")]);
  assert.strictEqual(filesScanned, 5);
  assert.deepStrictEqual(findings, []);
});

test("React Native slop is caught", () => {
  const found = rulesIn("HomeScreen.tsx");
  for (const id of [
    "slop-gradient", "gradient-text", "template-theme", "nested-cards", "status-dot", "unvirtualized-list",
    "fixed-text-size", "emoji-icon", "sparkle-icon", "oops-error", "buzzword-copy",
    "welcome-back", "vague-button", "invented-stat", "glow-shadow", "hover-only",
    "keyboard-cover", "back-gesture", "drawer-nav",
  ]) assert.ok(found.has(id), `missing ${id}`);
});

test("SwiftUI slop is caught", () => {
  const found = rulesIn("Dashboard.swift");
  for (const id of ["unvirtualized-list", "status-dot", "fixed-text-size", "slop-gradient", "gradient-text", "glow-shadow", "back-gesture", "drawer-nav", "safe-area-off", "tracked-caps-label", "vague-button"]) {
    assert.ok(found.has(id), `missing ${id}`);
  }
});

test("UIKit slop is caught", () => {
  const found = rulesIn("ViewController.swift");
  for (const id of ["fixed-text-size", "back-gesture"]) {
    assert.ok(found.has(id), `missing ${id}`);
  }
});

test("Compose slop is caught", () => {
  const found = rulesIn("MainScreen.kt");
  for (const id of ["template-theme", "unvirtualized-list", "nested-cards", "status-dot", "drawer-nav", "back-gesture", "vague-button", "gradient-text", "glow-shadow"]) {
    assert.ok(found.has(id), `missing ${id}`);
  }
});

test("Flutter slop is caught", () => {
  const found = rulesIn("home.dart");
  for (const id of ["template-theme", "back-gesture", "unvirtualized-list", "nested-cards", "status-dot", "fixed-text-size", "vague-button", "gradient-text", "glow-shadow"]) {
    assert.ok(found.has(id), `missing ${id}`);
  }
});

test("Android XML slop is caught", () => {
  const found = new Set(scan([path.join(fixtures, "slop", "android")]).findings.map((f) => f.rule));
  for (const id of ["fixed-text-size", "back-gesture", "emoji-icon"]) {
    assert.ok(found.has(id), `missing ${id}`);
  }
});

test("every rule has a fixture that triggers it", () => {
  const all = new Set(scan([path.join(fixtures, "slop")], { platform: "mobile" }).findings.map((f) => f.rule));
  for (const rule of rules) assert.ok(all.has(rule.id), `no fixture for ${rule.id}`);
});

test("safe-area-off flags .ignoresSafeArea(.all) forms, not backgrounds", () => {
  const flagged = [
    "VStack { }.ignoresSafeArea(.all)",
    "VStack { }.ignoresSafeArea(.container, edges: .all)",
    "VStack { }.ignoresSafeArea(edges: .all)",
  ];
  for (const src of flagged) {
    assert.deepStrictEqual(scanSource(src, "a.swift").map((f) => f.rule), ["safe-area-off"]);
  }
  // .container with no edges means all edges, the same as (.container, edges: .all).
  assert.deepStrictEqual(scanSource("VStack { }.ignoresSafeArea(.container)", "a.swift").map((f) => f.rule), ["safe-area-off"]);
  assert.deepStrictEqual(scanSource("Color.red.ignoresSafeArea(.all)", "a.swift"), []);
  // Keyboard-only and single-edge uses are legitimate.
  assert.deepStrictEqual(scanSource("VStack { }.ignoresSafeArea(.keyboard, edges: .all)", "a.swift"), []);
  assert.deepStrictEqual(scanSource("VStack { }.ignoresSafeArea(.keyboard)", "a.swift"), []);
  assert.deepStrictEqual(scanSource("VStack { }.ignoresSafeArea(.all, edges: .bottom)", "a.swift"), []);
  assert.deepStrictEqual(scanSource("VStack { }.ignoresSafeArea(edges: .top)", "a.swift"), []);
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
  const src = '// unslop-anything-ignore oops-error\nconst a = "Oops";\nconst b = "Oops"; // unslop-anything-ignore\nconst c = "Oops";\n';
  assert.deepStrictEqual(scanSource(src, "a.ts").map((f) => f.line), [4]);
});

test("a CSS block comment silences a line, since // is not a CSS comment", () => {
  const css = ".a:focus { outline: none; }\n";
  assert.deepStrictEqual(scanSource(css, "a.css").map((f) => f.rule), ["focus-removed"]);
  assert.deepStrictEqual(scanSource(`/* unslop-anything-ignore focus-removed */\n${css}`, "a.css"), []);
  assert.deepStrictEqual(scanSource(`.a:focus { outline: none; } /* unslop-anything-ignore focus-removed */\n`, "a.css"), []);
});

test("a JSX ignore comment on its own line silences the next line", () => {
  const src = "<View>\n  {/* unslop-anything-ignore clickable-div */}\n  <div onClick={go}>x</div>\n  <div onClick={go}>y</div>\n</View>\n";
  assert.deepStrictEqual(scanSource(src, "a.tsx").map((f) => `${f.rule}:${f.line}`), ["clickable-div:4"]);
  const spaced = "<View>\n  { /* unslop-anything-ignore */ }\n  <div onClick={go}>x</div>\n</View>\n";
  assert.deepStrictEqual(scanSource(spaced, "a.tsx"), []);
});

test("oops-error ignores log calls and thrown errors", () => {
  // Issue #70: none of these strings reach the user.
  assert.deepStrictEqual(scanSource('console.error("Something went wrong", err);\nthrow new Error("Oops");\n', "a.ts"), []);
  assert.deepStrictEqual(scanSource('Log.e(TAG, "Something went wrong")\n', "a.kt"), []);
  assert.deepStrictEqual(scanSource('logger.warn("Something went wrong");\n', "a.ts"), []);
  assert.deepStrictEqual(scanSource('print("Oops")\n', "a.swift"), []);
  assert.deepStrictEqual(scanSource('debugPrint("Oops")\n', "a.dart"), []);
  assert.deepStrictEqual(scanSource('NSLog(@"Oops");\n', "a.m"), []);
  // Real UI text still flags.
  assert.deepStrictEqual(scanSource('const msg = "Oops, something went wrong";\n', "a.ts").map((f) => f.rule), ["oops-error"]);
});

test("oops-error flags Whoops but not loops or hoops", () => {
  // Issue #129: the issue's repro, both lines reported.
  const src = 'export function A() {\n  return <p>Oops! We could not load your orders.</p>;\n}\nexport function B() {\n  return <p>Whoops! We could not load your orders.</p>;\n}\n';
  assert.deepStrictEqual(
    scanSource(src, "ErrorState.tsx").filter((f) => f.rule === "oops-error").map((f) => f.line),
    [2, 5],
  );
  // Words that only contain the letters stay quiet.
  assert.deepStrictEqual(scanSource('const a = "loops"; const b = "hoops";\n', "a.ts"), []);
  assert.deepStrictEqual(scanSource('const a = "whoopsie";\n', "a.ts"), []);
});

test("oops-error flags visible copy after a log call on the same line", () => {
  // CodeRabbit on #131: the old guard skipped every match after a log call
  // earlier on the line, so visible copy after the call went unflagged.
  assert.deepStrictEqual(
    scanSource('console.error(err); return <p>Whoops!</p>;\n', "a.tsx").map((f) => f.line),
    [1],
  );
  assert.deepStrictEqual(
    scanSource('console.error("Something went wrong"); return <p>Oops!</p>;\n', "a.tsx").map((f) => f.line),
    [1],
  );
  assert.deepStrictEqual(
    scanSource('throw new Error("x"); return <p>Oops</p>;\n', "a.tsx").map((f) => f.line),
    [1],
  );
  // A match still inside the call stays quiet, even with a paren in the message.
  assert.deepStrictEqual(scanSource('console.error("a)b", "Oops");\n', "a.ts"), []);
  assert.deepStrictEqual(scanSource('console.log("a"); console.error("Oops");\n', "a.ts"), []);
});

test("buzzword-copy skips package names and identifiers, not copy", () => {
  // Issue #140: the Unleash feature-flag SDK is a package, not marketing filler.
  const buzz = (src, file) => scanSource(src, file).filter((f) => f.rule === "buzzword-copy").map((f) => f.line);
  const checkout = 'import { useFlag } from "@unleash/proxy-client-react";\n\nexport function Checkout() {\n  const enabled = useFlag("new-checkout");\n  return <p>{enabled ? "New" : "Old"}</p>;\n}\n';
  assert.deepStrictEqual(buzz(checkout, "Checkout.tsx"), []);
  // Imports, export ... from and require
  assert.deepStrictEqual(buzz('export { useFlag } from "@unleash/proxy-client-react";\n', "flags.ts"), []);
  assert.deepStrictEqual(buzz('const { UnleashClient } = require("unleash-client");\n', "flags.js"), []);
  assert.deepStrictEqual(buzz('import Unleash from "unleash-client";\n', "flags.ts"), []);
  assert.deepStrictEqual(buzz('import {\n  Unleash,\n  useFlag,\n} from "@unleash/proxy-client-react";\n', "flags.ts"), []);
  assert.deepStrictEqual(buzz('import { useFlag } from\n  "@unleash/proxy-client-react";\n', "flags.ts"), []);
  assert.deepStrictEqual(buzz('const sdk = require(\n  "unleash-client");\n<h1>Unleash your team</h1>\n', "flags.ts"), [3]);
  assert.deepStrictEqual(buzz('const m = await import(\n  "@unleash/proxy-client-react");\n<h1>Unleash your team</h1>\n', "flags.ts"), [3]);
  assert.deepStrictEqual(buzz('import "unleash-client";\n<h1>Unleash your team</h1>\n', "flags.ts"), [2]);
  assert.deepStrictEqual(buzz('import "unleash-client"; const title = "Unleash your team";\n', "flags.ts"), [1]);
  // Identifiers
  assert.deepStrictEqual(buzz('const unleash = new UnleashClient({ url });\nif (unleash.isEnabled("x")) start();\n', "flags.ts"), []);
  assert.deepStrictEqual(buzz("const client = new Unleash({ url });\n", "flags.ts"), []);
  assert.deepStrictEqual(buzz("const { unleash } = useApp();\nconst cfg = { unleash: { url }, other: 1 };\n", "flags.ts"), []);
  assert.deepStrictEqual(buzz("const { client, unleash } = useApp();\n", "flags.ts"), []);
  assert.deepStrictEqual(buzz("const { client, unleash, other } = useApp();\n", "flags.ts"), []);
  // Copy is still flagged, also next to an import or after a multi-line import clause.
  assert.deepStrictEqual(buzz("<h1>Unleash your creativity</h1>\n", "Hero.tsx"), [1]);
  assert.deepStrictEqual(buzz('const title = "Unleash your team";\n', "copy.ts"), [1]);
  assert.deepStrictEqual(buzz("<p>Time to unleash. Start now.</p>\n", "Cta.tsx"), [1]);
  assert.deepStrictEqual(buzz('import { useFlag } from "sdk"; const title = "Unleash your team";\n', "copy.ts"), [1]);
  assert.deepStrictEqual(buzz('import type {\n  Unleash,\n} from "unleash-client";\n<h1>Unleash your team</h1>\n', "Hero.tsx"), [4]);
  assert.deepStrictEqual(buzz("<h2>Fast.Secure.Seamless.Simple.</h2>\n", "Hero.tsx"), [1]);
  assert.deepStrictEqual(buzz("<h1>Dream, unleash, create.</h1>\n", "Hero.tsx"), [1]);
  // `from` in copy is not an import.
  assert.deepStrictEqual(buzz('<p>Choose from "seamless integrations"</p>\n', "Cta.tsx"), [1]);
  assert.deepStrictEqual(buzz('<p>Choose from\n"seamless integrations"</p>\n', "Cta.tsx"), [2]);
  assert.deepStrictEqual(buzz('import x from "y";\n<h1>Unleash your team</h1>\n', "Hero.tsx"), [2]);
});

test("ignore comments from before the rename still work", () => {
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
  let errOut = "";
  console.error = (s) => (errOut += s);
  try {
    assert.strictEqual(main(["--ignore", "not-a-rule"]), 1);
    assert.strictEqual(main(["--nope"]), 1);
    errOut = "";
    assert.strictEqual(main(["--platform", "desktop"]), 1);
    assert.strictEqual(errOut, "Unknown platform: desktop. Choose from mobile, web, universal.");
    errOut = "";
    assert.strictEqual(main(["--platform"]), 1);
    assert.strictEqual(errOut, "Missing value for --platform. Choose from mobile, web, universal.");
  } finally {
    console.error = err;
  }
});

test("--fail-on chooses which severity fails the scan", () => {
  const log = console.log;
  let out = "";
  console.log = (s) => (out += s);
  try {
    // The slop fixture has only noticeable and minor findings today
    // (no rule is critical yet), so --fail-on critical passes the scan
    // while still printing every finding.
    assert.strictEqual(main([path.join(fixtures, "slop"), "--fail-on", "critical"]), 0);
    assert.match(out, /\d+ findings/);
    out = "";
    assert.strictEqual(main([path.join(fixtures, "slop"), "--fail-on", "noticeable"]), 2);
    out = "";
    assert.strictEqual(main([path.join(fixtures, "slop"), "--fail-on", "minor"]), 2);
  } finally {
    console.log = log;
  }
  const err = console.error;
  let errOut = "";
  console.error = (s) => (errOut += s);
  try {
    assert.strictEqual(main([path.join(fixtures, "slop"), "--fail-on", "bogus"]), 1);
    assert.strictEqual(errOut, "Unknown severity: bogus. Choose from critical, noticeable, minor.");
    errOut = "";
    assert.strictEqual(main([path.join(fixtures, "slop"), "--fail-on"]), 1);
    assert.strictEqual(errOut, "Missing value for --fail-on. Choose from critical, noticeable, minor.");
  } finally {
    console.error = err;
  }
});

test("--ignore errors cleanly when value is missing or followed by another flag", () => {
  const err = console.error;
  let errOut = "";
  console.error = (m) => {
    errOut += m;
  };
  try {
    assert.strictEqual(main([path.join(fixtures, "slop"), "--ignore"]), 1);
    assert.strictEqual(
      errOut,
      "Missing value for --ignore. Pass rule ids separated by commas; see --list-rules."
    );
    errOut = "";
    assert.strictEqual(main([path.join(fixtures, "slop"), "--ignore", "--json"]), 1);
    assert.strictEqual(
      errOut,
      "Missing value for --ignore. Pass rule ids separated by commas; see --list-rules."
    );
  } finally {
    console.error = err;
  }
});

test("--list-rules shows stacks and platforms, and --json includes them", () => {
  const log = console.log;
  let out = "";
  console.log = (s) => (out += s);
  try {
    assert.strictEqual(main(["--list-rules"]), 0);
    assert.strictEqual(out.split("Stacks: ").length - 1, rules.length);
    assert.ok(out.includes("Stacks: all | Platforms: all")); // slop-gradient: no restriction
    assert.ok(out.includes("Stacks: all | Platforms: mobile, universal")); // drawer-nav
    assert.ok(out.includes("Stacks: js, web, css | Platforms: mobile")); // hover-only
    out = "";
    assert.strictEqual(main(["--list-rules", "--json"]), 0);
    const listed = JSON.parse(out);
    assert.strictEqual(listed.length, rules.length);
    const byId = new Map(listed.map((r) => [r.id, r]));
    for (const r of listed) {
      assert.ok(r.id && r.severity && r.family && r.message && r.fix);
      assert.ok("stacks" in r && "platforms" in r);
    }
    assert.deepStrictEqual(byId.get("slop-gradient").stacks, "all");
    assert.deepStrictEqual(byId.get("slop-gradient").platforms, "all");
    assert.deepStrictEqual(byId.get("nested-cards").stacks, ["js", "kotlin", "dart", "web"]);
    assert.deepStrictEqual(byId.get("nested-cards").platforms, "all");
    assert.deepStrictEqual(byId.get("drawer-nav").stacks, "all");
    assert.deepStrictEqual(byId.get("drawer-nav").platforms, ["mobile", "universal"]);
    assert.deepStrictEqual(byId.get("hover-only").stacks, ["js", "web", "css"]);
    assert.deepStrictEqual(byId.get("hover-only").platforms, ["mobile"]);
  } finally {
    console.log = log;
  }
});

test("a quote inside a regex literal does not hide a real comment", () => {
  assert.deepStrictEqual(scanSource('const quote = /"/g; // Oops\n', "a.ts"), []);
  assert.deepStrictEqual(scanSource("<Text>Hi</Text> // Oops\n", "a.tsx"), []);
  assert.deepStrictEqual(scanSource('const r = a / b; const s = "Oops";\n', "a.ts").map((f) => f.rule), ["oops-error"]);
});

test("horizontal={false} is still a vertical list", () => {
  const src = "<ScrollView horizontal={false}>{items.map((i) => <Row key={i} />)}</ScrollView>";
  assert.deepStrictEqual(scanSource(src, "a.tsx").map((f) => f.rule), ["unvirtualized-list"]);
});

test("Android color resources reach template-theme", () => {
  const src = '<resources>\n  <color name="purple_500">#6200EE</color>\n</resources>\n';
  assert.deepStrictEqual(scanSource(src, "colors.xml").map((f) => f.rule), ["template-theme"]);
  // Android Studio writes template colors with an alpha byte (#AARRGGBB).
  const alpha = '<resources>\n  <color name="purple_500">#FF6200EE</color>\n  <color name="purple_700">#FF3700B3</color>\n</resources>\n';
  assert.deepStrictEqual(scanSource(alpha, "colors.xml").map((f) => f.rule), ["template-theme"]);
  assert.deepStrictEqual(scanSource(".a { color: #FF6200EE; }\n", "a.css"), []);
});

test("template-theme catches Expo starter leftovers", () => {
  // Issue #74 repro: the default tint plus starter-screen imports.
  const src = 'const tintColorLight = "#0a7ea4";\nimport { HelloWave } from "@/components/HelloWave";\nimport ParallaxScrollView from "@/components/ParallaxScrollView";\n';
  assert.deepStrictEqual(scanSource(src, "Colors.ts", { kind: "mobile" }).map((f) => f.rule), ["template-theme"]);
  // Imports alone stay quiet so the components can be kept on purpose.
  const importsOnly = 'import { HelloWave } from "@/components/HelloWave";\nimport ParallaxScrollView from "@/components/ParallaxScrollView";\n';
  assert.deepStrictEqual(scanSource(importsOnly, "HomeScreen.tsx", { kind: "mobile" }), []);
  // JSX use in a screen is flagged, once per file.
  const used = 'import { HelloWave } from "@/components/HelloWave";\nimport ParallaxScrollView from "@/components/ParallaxScrollView";\n\nexport function HomeScreen() {\n  return (\n    <ParallaxScrollView>\n      <HelloWave />\n      <HelloWave />\n    </ParallaxScrollView>\n  );\n}\n';
  assert.deepStrictEqual(scanSource(used, "HomeScreen.tsx", { kind: "mobile" }).map((f) => f.rule), ["template-theme"]);
});

test("transition-all flags `all` anywhere in a transition list", () => {
  const flagged = ".x { transition: color .2s, all .3s; }\n";
  assert.deepStrictEqual(scanSource(flagged, "a.css").map((f) => f.rule), ["transition-all"]);
  const property = ".y { transition-property: all; }\n";
  assert.deepStrictEqual(scanSource(property, "a.css").map((f) => f.rule), ["transition-all"]);
  // A property name that merely starts with `all` is not `all`.
  const allInOne = ".a { transition: all-in-one .2s; }\n";
  assert.deepStrictEqual(scanSource(allInOne, "a.css"), []);
  const named = ".b { transition: color .2s; }\n";
  assert.deepStrictEqual(scanSource(named, "a.css"), []);
});

test("Less stylesheets are scanned like CSS", () => {
  // Issue #125: the issue's repro, saved as .less.
  const less = ".card {\n  transition: all 0.3s;\n}\n.card:hover { transform: scale(1.05); }\n";
  assert.deepStrictEqual(scanSource(less, "styles.less").map((f) => f.rule), ["hover-only", "transition-all", "hover-scale"]);
  assert.deepStrictEqual(scanSource(less, "styles.scss").map((f) => f.rule), ["hover-only", "transition-all", "hover-scale"]);
});

test("vague-button catches Swift, Compose and Flutter buttons", () => {
  assert.deepStrictEqual(scanSource('Button("Submit") { save() }', "a.swift").map((f) => f.rule), ["vague-button"]);
  assert.deepStrictEqual(scanSource('Button(onClick = {}) { Text("Submit") }', "a.kt").map((f) => f.rule), ["vague-button"]);
  assert.deepStrictEqual(scanSource('ElevatedButton(onPressed: save, child: Text("Submit"))', "a.dart").map((f) => f.rule), ["vague-button"]);
  // A vague string in the action code is not the label.
  assert.deepStrictEqual(scanSource('Button("Save") { analytics.track("Submit") }', "a.swift"), []);
  assert.deepStrictEqual(scanSource('Button(onClick = { log("Submit") }) { Text("Send order") }', "a.kt"), []);
  assert.deepStrictEqual(scanSource('ElevatedButton(onPressed: () => submitForm("Submit"), child: Text("Send"))', "a.dart"), []);
  assert.deepStrictEqual(scanSource('Button("submit") { save() }', "a.swift").map((f) => f.rule), ["vague-button"]);
  // A bare Text("Submit") outside a button call stays quiet.
  assert.deepStrictEqual(scanSource('Text("Submit")', "a.kt"), []);
  assert.deepStrictEqual(scanSource("Text('Submit')", "a.dart"), []);
  // Specific labels stay quiet.
  assert.deepStrictEqual(scanSource('Button("Save address")', "a.swift"), []);
  assert.deepStrictEqual(scanSource('Text("Save address")', "a.kt"), []);
});

test("vague-button reads the value of a submit or button input (issue #145)", () => {
  const lines = (src, file = "form.html") => scanSource(src, file).filter((f) => f.rule === "vague-button").map((f) => f.line);
  assert.deepStrictEqual(lines('<form>\n  <input type="submit" value="Submit">\n</form>\n'), [2]);
  assert.deepStrictEqual(lines('<input value="Click here" type="button" />\n'), [1]);
  assert.deepStrictEqual(lines("<input type=submit value='Tap here'>\n"), [1]);
  assert.deepStrictEqual(lines('<input type="submit" value="Submit" />\n', "Form.tsx"), [1]);
  // Other inputs and options keep their value; a specific label is fine.
  assert.deepStrictEqual(lines('<input type="text" value="Submit">\n'), []);
  assert.deepStrictEqual(lines('<input value="Submit">\n'), []);
  assert.deepStrictEqual(lines('<select><option value="Submit">Send it</option></select>\n'), []);
  assert.deepStrictEqual(lines('<input type="submit" value="Save address">\n'), []);
  // An arrow-function prop before value does not end the tag.
  assert.deepStrictEqual(lines('<input type="submit" onClick={() => go()} value="Submit" />\n', "Form.tsx"), [1]);
  // data-value and data-type are not the label or the type.
  assert.deepStrictEqual(lines('<input type="submit" data-value="Submit" value="Send order">\n'), []);
  assert.deepStrictEqual(lines('<input data-type="submit" value="Submit">\n'), []);
  // A comparison in a JSX prop does not end the tag; the type must be exact.
  assert.deepStrictEqual(lines('<input type="submit" disabled={count > 0} value="Submit" />\n', "Form.tsx"), [1]);
  assert.deepStrictEqual(lines('<input type="button-group" value="Submit">\n'), []);
  assert.deepStrictEqual(lines('<input type="text" title="type=submit" value="Submit">\n'), []);
  assert.deepStrictEqual(lines("<input type=submit value=Submit>\n"), [1]);
  assert.deepStrictEqual(lines('<input type="submit" value={"Submit"} />\n', "Form.tsx"), [1]);
  // Only the whole value counts.
  assert.deepStrictEqual(lines('<input type="submit" value={"Submit" + " order"} />\n', "Form.tsx"), []);
  assert.deepStrictEqual(lines("<input type=submit value=Submit&nbsp;order>\n"), []);
  assert.deepStrictEqual(lines("<input type=submit value=Submit/order>\n"), []);
  assert.deepStrictEqual(lines("<input type=submit value=Submit/>\n"), [1]);
});

test("transition-all stops at the quote that ends a CSS-in-JS value", () => {
  // `all` in a later property of a style object is not part of the transition.
  const pointerEvents = 'const s = { transition: "opacity .2s", pointerEvents: "all" };\n';
  assert.deepStrictEqual(scanSource(pointerEvents, "a.tsx").map((f) => f.rule), []);
  const userSelect = 'const t = { transition: "opacity .2s", userSelect: "all" };\n';
  assert.deepStrictEqual(scanSource(userSelect, "a.tsx").map((f) => f.rule), []);
  // `all` inside the quoted transition value still counts.
  const quotedList = 'const u = { transition: "color .2s, all .3s" };\n';
  assert.deepStrictEqual(scanSource(quotedList, "a.tsx").map((f) => f.rule), ["transition-all"]);
  const singleQuoted = "const v = { transition: 'all .2s' };\n";
  assert.deepStrictEqual(scanSource(singleQuoted, "a.tsx").map((f) => f.rule), ["transition-all"]);
});

test("transition-all flags a shorthand that names no property, since it defaults to all", () => {
  const rulesFor = (src, file = "a.css") => scanSource(src, file).map((f) => f.rule);
  assert.deepStrictEqual(rulesFor(".card {\n  transition: 0.3s ease;\n}\n"), ["transition-all"]);
  assert.deepStrictEqual(rulesFor(".card { transition: .2s; }\n"), ["transition-all"]);
  assert.deepStrictEqual(rulesFor(".card { transition: 200ms; }\n"), ["transition-all"]);
  assert.deepStrictEqual(rulesFor(".card { transition: ease-in-out 200ms; }\n"), ["transition-all"]);
  assert.deepStrictEqual(rulesFor(".card { transition: cubic-bezier(0.4, 0, 0.2, 1) .3s; }\n"), ["transition-all"]);
  assert.deepStrictEqual(rulesFor('const s = { transition: "0.3s ease" };\n', "a.tsx"), ["transition-all"]);
  // A named property, `none`, or a list of named properties stays quiet.
  assert.deepStrictEqual(rulesFor(".card { transition: opacity .2s ease; }\n"), []);
  assert.deepStrictEqual(rulesFor(".card { transition: none; }\n"), []);
  assert.deepStrictEqual(rulesFor(".card { transition: transform 200ms, opacity 200ms; }\n"), []);
  assert.deepStrictEqual(rulesFor(".card { transition-duration: .3s; }\n"), []);
  assert.deepStrictEqual(rulesFor('const s = { transition: "opacity .2s", pointerEvents: "all" };\n', "a.tsx"), []);
  // A property may come after the duration or timing function, still naming it.
  assert.deepStrictEqual(rulesFor(".card { transition: .2s opacity; }\n"), []);
  assert.deepStrictEqual(rulesFor(".card { transition: ease-in 200ms transform; }\n"), []);
  assert.deepStrictEqual(rulesFor(".card { transition: 200ms ease-out 50ms color, 1s opacity; }\n"), []);
  // Duration plus delay with no property is still every property.
  assert.deepStrictEqual(rulesFor(".card { transition: .2s ease 0.1s; }\n"), ["transition-all"]);
});

test("reduced-motion flags animations with no prefers-reduced-motion fallback (issue #72)", () => {
  // The issue's exact repro: a @keyframes animation with no fallback.
  const repro = ".badge { animation: bounce 1s infinite; }\n@keyframes bounce { 50% { transform: translateY(-4px); } }\n";
  assert.deepStrictEqual(scanSource(repro, "a.css").map((f) => f.rule), ["reduced-motion"]);
  // Reported once per file: the @keyframes block is not a second finding.
  assert.strictEqual(scanSource(repro, "a.css").length, 1);
  // A @keyframes block on its own counts too.
  assert.deepStrictEqual(scanSource("@keyframes fade { from { opacity: 0; } }\n", "a.css").map((f) => f.rule), ["reduced-motion"]);
  // A prefers-reduced-motion fallback anywhere in the file silences it.
  const guarded = "@media (prefers-reduced-motion: reduce) { .badge { animation: none; } }\n" + repro;
  assert.deepStrictEqual(scanSource(guarded, "a.css"), []);
  // Tailwind: an unguarded animate-* class counts.
  assert.deepStrictEqual(scanSource('<div className="animate-bounce" />', "a.tsx").map((f) => f.rule), ["reduced-motion"]);
  assert.deepStrictEqual(scanSource('<div className="animate-ping" />', "a.tsx").map((f) => f.rule), ["decorative-pulse", "reduced-motion"]);
  // A motion-reduce: variant on the same element silences it.
  assert.deepStrictEqual(scanSource('<div className="motion-reduce:animate-none animate-bounce" />', "a.tsx"), []);
  // animate-spin is a spinner, and skeleton pulses are loading states.
  assert.deepStrictEqual(scanSource('<div className="animate-spin" />', "a.tsx"), []);
  assert.deepStrictEqual(scanSource('<div className="h-4 w-32 animate-pulse rounded bg-zinc-200" />', "a.tsx"), []);
  // A non-skeleton pulse still counts (and still trips decorative-pulse).
  assert.deepStrictEqual(scanSource('<span className="animate-pulse bg-emerald-400" />', "a.tsx").map((f) => f.rule), ["decorative-pulse", "reduced-motion"]);
  // A plain transition is not an animation.
  assert.deepStrictEqual(scanSource(".b { transition: color .2s; }\n", "a.css"), []);
  assert.deepStrictEqual(scanSource(".modal { animation: none; }\n", "a.css"), []);
  assert.deepStrictEqual(scanSource('<Stack.Screen options={{ animation: "slide_from_right" }} />\n', "a.tsx"), []);
  assert.deepStrictEqual(scanSource("const options = { animation: false };\n", "a.ts"), []);
  assert.deepStrictEqual(scanSource('const Badge = styled.span`animation: ${bounce} 1s infinite;`;\n', "a.tsx").map((f) => f.rule), ["reduced-motion"]);
  // JS reduced-motion guards (framer-motion, Reanimated, React Native) silence it.
  assert.deepStrictEqual(
    scanSource('import { useReducedMotion } from "framer-motion";\nexport function Hero() { const r = useReducedMotion(); return <div className={r ? "" : "animate-bounce"} />; }\n', "Hero.tsx"),
    [],
  );
  assert.deepStrictEqual(
    scanSource('import { useReducedMotionConfig, ReduceMotion } from "react-native-reanimated";\nexport function Card() { const r = useReducedMotionConfig(); return <div className="animate-bounce" />; }\n', "Card.tsx"),
    [],
  );
  assert.deepStrictEqual(
    scanSource('const mode = ReduceMotion.System;\nexport const X = () => <div className="animate-bounce" />;\n', "Card.tsx"),
    [],
  );
  assert.deepStrictEqual(
    scanSource('AccessibilityInfo.isReduceMotionEnabled().then(setReduce);\nexport const X = () => <div className="animate-bounce" />;\n', "Card.tsx"),
    [],
  );
  assert.deepStrictEqual(
    scanSource('AccessibilityInfo.addEventListener("reduceMotionChanged", setReduce);\nexport const X = () => <div className="animate-bounce" />;\n', "Card.tsx"),
    [],
  );
  // Comments or strings mentioning useReducedMotion do not count as a fallback.
  assert.deepStrictEqual(
    scanSource('// useReducedMotion()\nconst label = "useReducedMotion()";\nexport const X = () => <div className="animate-bounce" />;\n', "Hero.tsx").map((f) => f.rule),
    ["reduced-motion"],
  );
});

test("slop-gradient reads Android #AARRGGBB colors", () => {
  const src = '<gradient android:startColor="#FF7C3AED" android:endColor="#FFEC4899"/>\n';
  assert.deepStrictEqual(scanSource(src, "bg.xml").map((f) => f.rule), ["slop-gradient"]);
  const rgb = '<gradient android:startColor="#7C3AED" android:endColor="#EC4899"/>\n';
  assert.deepStrictEqual(scanSource(rgb, "bg.xml").map((f) => f.rule), ["slop-gradient"]);
  const scrim = ".hero { background: linear-gradient(to bottom, transparent, #000000CC); }\n";
  assert.deepStrictEqual(scanSource(scrim, "a.css"), []);
});

test("slop-gradient reads Tailwind arbitrary hex stops (issue #143)", () => {
  const lines = (src, file) => scanSource(src, file).filter((f) => f.rule === "slop-gradient").map((f) => f.line);
  assert.deepStrictEqual(lines('<div class="bg-gradient-to-r from-[#7c3aed] to-[#db2777] p-8">Hello</div>\n', "Hero.html"), [1]);
  assert.deepStrictEqual(lines('<div className="bg-linear-to-r from-[#8b5cf6] via-[#a855f7] to-[#ec4899]" />\n', "Hero.tsx"), [1]);
  // One purple stop is enough, as with named stops.
  assert.deepStrictEqual(lines('<div className="bg-gradient-to-b from-[#0ea5e9] to-[#7c3aed]" />\n', "Hero.tsx"), [1]);
  // A gradient with no purple or pink stop stays quiet.
  assert.deepStrictEqual(lines('<div class="bg-gradient-to-r from-[#0ea5e9] to-[#22c55e] p-8">Hello</div>\n', "Hero.html"), []);
  // Stops in another string of the same cn(...) call count; another call's do not.
  assert.deepStrictEqual(lines('<div className={cn("bg-gradient-to-r", "from-[#7c3aed] to-[#db2777]")} />\n', "Hero.tsx"), [1]);
  assert.deepStrictEqual(lines('<div className={clsx("bg-gradient-to-r", active && "from-violet-600", "to-pink-500")} />\n', "Hero.tsx"), [1]);
  assert.deepStrictEqual(lines('<div className={cn("bg-gradient-to-r", "from-sky-500 to-cyan-500")} />\n', "Hero.tsx"), []);
  assert.deepStrictEqual(lines('const a = cn("bg-gradient-to-r from-sky-500 to-cyan-500");\nconst b = cn("from-violet-600");\n', "Hero.tsx"), []);
  // A nested class call does not hide the outer call's stops.
  assert.deepStrictEqual(lines('<div className={cn("from-violet-600", clsx("bg-gradient-to-r", "to-cyan-500"))} />\n', "Hero.tsx"), [1]);
  // A parenthesis inside a quoted class is not part of the call's own brackets.
  assert.deepStrictEqual(lines('const a = cn("before:content-[\'(\']", "bg-gradient-to-r from-sky-500 to-cyan-500");\nconst b = cn("from-violet-600");\n', "Hero.tsx"), []);
  assert.deepStrictEqual(lines('<div className={cn("after:content-[\')\']", "bg-gradient-to-r", "from-[#7c3aed]")} />\n', "Hero.tsx"), [1]);
  // A purple outside a gradient class string is not a stop.
  assert.deepStrictEqual(lines('<div class="bg-[#7c3aed] text-white">Hello</div>\n', "Hero.html"), []);
});

test("slop-gradient reads CSS named colors in the slop band (issue #163)", () => {
  const rulesFor = (src) => scanSource(src, "a.css").map((f) => f.rule).filter((r) => r === "slop-gradient");
  for (const name of ["rebeccapurple", "mediumpurple", "blueviolet", "darkviolet", "darkorchid", "mediumorchid", "hotpink", "deeppink", "mediumvioletred", "RebeccaPurple"]) {
    assert.deepStrictEqual(rulesFor(`.a { background: linear-gradient(${name}, white); }\n`), ["slop-gradient"], name);
  }
  assert.deepStrictEqual(rulesFor(".a { background: linear-gradient(skyblue, seagreen); }\n"), []);
});

test("slop-gradient reads only the gradient's own colors (issue #67)", () => {
  const gradientLines = (src, file) =>
    scanSource(src, file).filter((f) => f.rule === "slop-gradient").map((f) => f.line);
  // A purple that is not one of the stops: the next rule, a child's style, the
  // next statement, another prop. None of these gradients is purple.
  const notStops = [
    [".hero { background: linear-gradient(#ffffff, #f4f4f5); }\n.btn { color: #7c3aed; }\n", "a.css"],
    ['<LinearGradient colors={["#ffffff", "#f4f4f5"]}>\n  <Text style={{ color: "#7c3aed" }}>Hi</Text>\n</LinearGradient>\n', "a.tsx"],
    ['<div style={{ background: "linear-gradient(#fff, #f4f4f5)", color: "#7c3aed" }} />\n', "a.tsx"],
    ["Rectangle().fill(LinearGradient(colors: [.white, .gray], startPoint: .top, endPoint: .bottom))\n  .foregroundStyle(.purple)\n", "a.swift"],
    ["val bg = Brush.verticalGradient(listOf(Color.White, Color.LightGray))\nval accent = Color(0xFF7C3AED)\n", "a.kt"],
    ['const g = ctx.createLinearGradient(0, 0, 200, 0);\ng.addColorStop(0, "#ffffff");\ng.addColorStop(1, "#f4f4f5");\nctx.strokeStyle = "#7c3aed";\n', "a.js"],
  ];
  for (const [src, file] of notStops) assert.deepStrictEqual(gradientLines(src, file), [], src);
  // Purple stops wherever a gradient keeps them stay flagged: in the call, the
  // element's props, SVG <stop> children, or the canvas and Android calls that
  // follow a constructor taking no colors.
  const stops = [
    ['<svg><linearGradient id="g"><stop offset="0" stop-color="#7c3aed"/><stop offset="1" stop-color="#ec4899"/></linearGradient></svg>\n', "a.html"],
    ['<LinearGradient id="g" x1="0" y1="0" x2="1" y2="0">\n  <Stop offset="0" stopColor="#7c3aed" />\n</LinearGradient>\n', "a.tsx"],
    ['const g = ctx.createLinearGradient(0, 0, 200, 0);\ng.addColorStop(0, "#7c3aed");\ng.addColorStop(1, "#ec4899");\n', "a.js"],
    ["val d = GradientDrawable(GradientDrawable.Orientation.TOP_BOTTOM, intArrayOf(0xFF7C3AED.toInt(), 0xFFEC4899.toInt()))\n", "a.kt"],
    ["val d = GradientDrawable().apply {\n  colors = intArrayOf(0xFF7C3AED.toInt(), 0xFFEC4899.toInt())\n}\n", "a.kt"],
    ["decoration: BoxDecoration(gradient: LinearGradient(colors: [Colors.deepPurple, Colors.pink])),\n", "a.dart"],
    ['<div className="bg-[linear-gradient(90deg,#7c3aed,#ec4899)]" />\n', "a.tsx"],
  ];
  for (const [src, file] of stops) assert.deepStrictEqual(gradientLines(src, file), [1], src);
  // Stops that need the whole expression or the variable's whole lifetime.
  const spread = [
    // A ">" inside a JSX expression does not end the <Stop> tag.
    ['<LinearGradient id="g">\n  <Stop offset={i > 0 ? "0" : "1"} stopColor="#7c3aed" />\n</LinearGradient>\n', "a.tsx", [1]],
    // The assignment and the constructor on different lines.
    ['const g =\n  ctx.createLinearGradient(0, 0, 1, 0);\ng.addColorStop(0, "#7c3aed");\n', "a.js", [2]],
    // Another gradient built before this one's stops are added.
    ['const a = ctx.createLinearGradient(0, 0, 1, 0);\nconst b = ctx.createLinearGradient(0, 0, 1, 0);\na.addColorStop(0, "#7c3aed");\nb.addColorStop(0, "#ffffff");\n', "a.js", [1]],
    // A colors assignment that spans lines.
    ["val d = GradientDrawable()\nd.colors = intArrayOf(\n  0xFF7C3AED.toInt()\n)\n", "a.kt", [1]],
    // A reassigned variable: each gradient keeps only its own stops.
    ['let g = ctx.createLinearGradient(0, 0, 1, 0);\ng.addColorStop(0, "#ffffff");\ng = ctx.createLinearGradient(0, 0, 1, 0);\ng.addColorStop(0, "#7c3aed");\n', "a.js", [3]],
    // A declaration of the same name in a nested block shadows the variable;
    // it does not end it.
    ['const g = ctx.createLinearGradient(0, 0, 1, 0);\nfunction helper() {\n  const g = null;\n}\ng.addColorStop(0, "#7c3aed");\n', "a.js", [1]],
    // The variable ends with its block: a sibling function's own g is another gradient.
    ['function a() {\n  const g = ctx.createLinearGradient(0, 0, 1, 0);\n  g.addColorStop(0, "#ffffff");\n}\nfunction b() {\n  const g = ctx.createLinearGradient(0, 0, 1, 0);\n  g.addColorStop(0, "#7c3aed");\n}\n', "a.js", [6]],
    // A "$" identifier, and a member of another object that shares the name.
    ['const $g = ctx.createLinearGradient(0, 0, 1, 0);\n$g.addColorStop(0, "#7c3aed");\n', "a.js", [1]],
    ['const g = ctx.createLinearGradient(0, 0, 1, 0);\ng.addColorStop(0, "#ffffff");\nother.g.addColorStop(0, "#7c3aed");\n', "a.js", []],
  ];
  for (const [src, file, lines] of spread) assert.deepStrictEqual(gradientLines(src, file), lines, src);
});

test("gradient-text flags text brushes only, not gradient backgrounds (issue #66)", () => {
  // Issue #66: a neutral gradient background has no text in it.
  const background = "Box(Modifier.background(brush = Brush.verticalGradient(listOf(Color.White, Color.LightGray))))\n";
  assert.deepStrictEqual(scanSource(background, "a.kt"), []);
  const border = "Box(Modifier.border(2.dp, brush = Brush.linearGradient(listOf(Color.White, Color.LightGray))))\n";
  assert.deepStrictEqual(scanSource(border, "a.kt"), []);
  // A brush passed to text still flags.
  const textStyle = "Text(\"Hello\", style = TextStyle(brush = Brush.linearGradient(listOf(Color.Red, Color.Blue))))\n";
  assert.deepStrictEqual(scanSource(textStyle, "a.kt").map((f) => f.rule), ["gradient-text"]);
  const spanStyle = "buildAnnotatedString { withStyle(SpanStyle(brush = Brush.linearGradient(listOf(Color.Red, Color.Blue)))) { append(\"Hi\") } }\n";
  assert.deepStrictEqual(scanSource(spanStyle, "a.kt").map((f) => f.rule), ["gradient-text"]);
  const copied = "Text(\"Hi\", style = MaterialTheme.typography.headlineLarge.copy(brush = Brush.linearGradient(listOf(Color.Red, Color.Blue))))\n";
  assert.deepStrictEqual(scanSource(copied, "a.kt").map((f) => f.rule), ["gradient-text"]);
});

test("gradient-text flags Flutter text painted with a gradient shader (issue #147)", () => {
  const lines = (src) => scanSource(src, "title.dart").filter((f) => f.rule === "gradient-text").map((f) => f.line);
  const title = "Text('Welcome', style: TextStyle(foreground: Paint()..shader = const LinearGradient(colors: [Color(0xFF0EA5E9), Color(0xFF22C55E)]).createShader(bounds)))\n";
  assert.deepStrictEqual(lines(title), [1]);
  assert.deepStrictEqual(lines("TextStyle(foreground: Paint()..shader = RadialGradient(colors: c).createShader(r))\n"), [1]);
  assert.deepStrictEqual(lines("TextStyle(foreground: Paint()..shader=SweepGradient(colors: c).createShader(r))\n"), [1]);
  assert.deepStrictEqual(lines("TextStyle(foreground: Paint()..shader = ui.Gradient.linear(a, b, colors))\n"), [1]);
  // An import prefix other than ui, and spaces inside Paint( ).
  assert.deepStrictEqual(lines("TextStyle(foreground: Paint()..shader = dart_ui.Gradient.linear(a, b, colors))\n"), [1]);
  assert.deepStrictEqual(lines("TextStyle(foreground: Paint()..shader = material.LinearGradient(colors: c).createShader(r))\n"), [1]);
  assert.deepStrictEqual(lines("TextStyle(foreground: Paint( )..shader = LinearGradient(colors: c).createShader(r))\n"), [1]);
  // Other cascades may come first, also on their own lines as dart format writes them.
  assert.deepStrictEqual(lines("TextStyle(foreground: Paint()..style = PaintingStyle.fill..shader = LinearGradient(colors: c).createShader(r))\n"), [1]);
  assert.deepStrictEqual(lines("TextStyle(\n  foreground: Paint()\n    ..color = Colors.red.withOpacity(0.5)\n    ..shader = const LinearGradient(colors: c).createShader(r),\n)\n"), [2]);
  // dart format moves a long value to the line after the =.
  assert.deepStrictEqual(lines("TextStyle(\n  foreground: Paint()\n    ..color =\n        Colors.black\n    ..shader = LinearGradient(colors: c).createShader(r),\n)\n"), [2]);
  assert.deepStrictEqual(lines("TextStyle(\n  foreground: Paint()\n    ..color =\n        Colors.black,\n  background: Paint()..shader = LinearGradient(colors: c).createShader(r),\n)\n"), []);
  // A solid paint is not gradient text, even with a gradient later on the line.
  assert.deepStrictEqual(lines("Text('Hi', style: TextStyle(foreground: Paint()..color = Colors.black))\n"), []);
  assert.deepStrictEqual(lines("Text('a', style: TextStyle(foreground: Paint()..color = c)); final p = Paint()..shader = LinearGradient(colors: c).createShader(r);\n"), []);
  assert.deepStrictEqual(lines("TextStyle(foreground: (Paint()..shader = LinearGradient(colors: c).createShader(r)))\n"), [1]);
  assert.deepStrictEqual(lines("TextStyle(foreground: Paint()..shader = (LinearGradient(colors: c)).createShader(r))\n"), [1]);
  // The next argument is not part of the foreground paint.
  assert.deepStrictEqual(lines("TextStyle(foreground: Paint()..color = c, background: Paint()..shader = LinearGradient(colors: c).createShader(r))\n"), []);
  // Nested and multi-line calls in an earlier cascade.
  assert.deepStrictEqual(lines("TextStyle(foreground: Paint()..color = Colors.red.withAlpha(alpha.round())..shader = LinearGradient(colors: c).createShader(r))\n"), [1]);
  assert.deepStrictEqual(lines("TextStyle(\n  foreground: Paint()\n    ..color = Color.fromARGB(\n      255, 0, 0, 0)\n    ..shader = LinearGradient(colors: c).createShader(r),\n)\n"), [2]);
  assert.deepStrictEqual(lines("final p = Paint()..shader = ui.Gradient.linear(a, b, colors);\n"), []);
  // A long cascade on one line stays fast: a value cannot run on into the next .. operator.
  const chain = Array.from({ length: 24 }, (_, i) => `..p${i} = Colors.red.withAlpha(${i})`).join("");
  const started = Date.now();
  assert.deepStrictEqual(lines(`TextStyle(foreground: Paint()${chain}..blendMode = BlendMode.src)\n`), []);
  assert.ok(Date.now() - started < 500, `took ${Date.now() - started} ms`);
  assert.deepStrictEqual(lines(`TextStyle(foreground: Paint()${chain}..shader = LinearGradient(colors: c).createShader(r))\n`), [1]);
  const spaced = Array.from({ length: 24 }, (_, i) => ` ..p${i} = x${i}`).join("");
  const spacedStart = Date.now();
  assert.deepStrictEqual(lines(`TextStyle(foreground: Paint()${spaced} ..blendMode = b)\n`), []);
  assert.ok(Date.now() - spacedStart < 500, `took ${Date.now() - spacedStart} ms`);
  assert.deepStrictEqual(lines(`TextStyle(foreground: Paint()${spaced} ..shader = LinearGradient(colors: c).createShader(r))\n`), [1]);
  // A long run of spaces inside a value is read once, not once per space.
  const wide = `TextStyle(foreground: Paint()..p0 = a${" ".repeat(20000)}b..blendMode = c)\n`;
  const wideStart = Date.now();
  assert.deepStrictEqual(lines(wide), []);
  assert.ok(Date.now() - wideStart < 200, `took ${Date.now() - wideStart} ms`);
});

test("0xRRGGBB colors are read alongside 0xFFRRGGBB", () => {
  // Issue #42: the common Swift form Color(hex: 0x7C3AED) was missed.
  const shadow = 'Text("x").shadow(color: Color(hex: 0x7C3AED), radius: 20)\n';
  assert.deepStrictEqual(scanSource(shadow, "a.swift").map((f) => f.rule), ["glow-shadow"]);
  const shadowFF = 'Text("x").shadow(color: Color(hex: 0xFF7C3AED), radius: 20)\n';
  assert.deepStrictEqual(scanSource(shadowFF, "a.swift").map((f) => f.rule), ["glow-shadow"]);
  const gradient = "LinearGradient(gradient: Gradient(colors: [Color(hex: 0x7C3AED), Color(hex: 0xEC4899)]), startPoint: .top, endPoint: .bottom)\n";
  assert.deepStrictEqual(scanSource(gradient, "a.swift").map((f) => f.rule), ["slop-gradient"]);
  // Neutral 6-digit colors stay quiet, and an 8-digit gray is not misread as pink.
  const gray = 'Text("x").shadow(color: Color(hex: 0x9CA3AF), radius: 20)\n';
  assert.deepStrictEqual(scanSource(gray, "a.swift"), []);
  const grayFF = 'Text("x").shadow(color: Color(hex: 0xFF808080), radius: 20)\n';
  assert.deepStrictEqual(scanSource(grayFF, "a.swift"), []);
});

test("hexColors reads #RRGGBBAA, #RGB and #RGBA (issue #41)", () => {
  const shadow = ".card { box-shadow: 0 0 24px #7c3aed80; }\n";
  assert.deepStrictEqual(scanSource(shadow, "a.css").map((f) => f.rule), ["glow-shadow"]);
  const gradient = ".hero { background: linear-gradient(135deg, #7c3aedcc, #a855f7cc); }\n";
  assert.deepStrictEqual(scanSource(gradient, "a.css").map((f) => f.rule), ["slop-gradient"]);
  // Short forms expand to the same colors (#73e -> #7733EE, #73e8 -> #7733EE).
  const shortShadow = ".card { box-shadow: 0 0 24px #73e8; }\n";
  assert.deepStrictEqual(scanSource(shortShadow, "a.css").map((f) => f.rule), ["glow-shadow"]);
  const shortGradient = ".hero { background: linear-gradient(135deg, #73e, #a5f); }\n";
  assert.deepStrictEqual(scanSource(shortGradient, "a.css").map((f) => f.rule), ["slop-gradient"]);
  // A black shadow with alpha stays unflagged by glow-shadow.
  const black = ".card { box-shadow: 0 0 24px #000000cc; }\n";
  assert.deepStrictEqual(scanSource(black, "a.css"), []);
  const blackShort = ".card { box-shadow: 0 0 24px #000c; }\n";
  assert.deepStrictEqual(scanSource(blackShort, "a.css"), []);
});

test("welcome-back fires with or without '!'", () => {
  const withName = "export const A = () => <h1>Welcome back, {name}</h1>;\n";
  const bare = "export const B = () => <h1>Welcome back</h1>;\n";
  assert.deepStrictEqual(scanSource(withName, "a.tsx").map((f) => f.rule), ["welcome-back"]);
  assert.deepStrictEqual(scanSource(bare, "a.tsx").map((f) => f.rule), ["welcome-back"]);
  assert.deepStrictEqual(scanSource("<Text>Welcome back!</Text>\n", "a.tsx").map((f) => f.rule), ["welcome-back"]);
  assert.deepStrictEqual(scanSource("<Text>Welcome back, Sarah</Text>\n", "a.tsx").map((f) => f.rule), ["welcome-back"]);
  // Prose that only contains the words stays quiet.
  assert.deepStrictEqual(scanSource("<p>Welcome back to the team page</p>\n", "a.tsx"), []);
  // A sentence after the comma is prose, not a name.
  assert.deepStrictEqual(scanSource("<p>Welcome back, we have updated the team page.</p>\n", "a.tsx"), []);
  // A closing backtick ends the greeting.
  assert.deepStrictEqual(scanSource("const title = `Welcome back`;\n", "a.ts").map((f) => f.rule), ["welcome-back"]);
  // A template literal with the name interpolated still counts.
  assert.deepStrictEqual(scanSource("const title = `Welcome back, ${name}`;\n", "a.ts").map((f) => f.rule), ["welcome-back"]);
  // A two-word name after the comma still counts.
  assert.deepStrictEqual(scanSource("<Text>Welcome back, Mary Jane</Text>\n", "a.tsx").map((f) => f.rule), ["welcome-back"]);
});

test("XML ignore comments work", () => {
  const src = '<resources>\n  <!-- unslop-anything-ignore template-theme -->\n  <color name="purple_500">#6200EE</color>\n</resources>\n';
  assert.deepStrictEqual(scanSource(src, "colors.xml"), []);
});

test("project config is found above the scan target", () => {
  const fs = require("fs");
  const os = require("os");
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "unslop-"));
  fs.mkdirSync(path.join(root, ".unslop-anything"));
  fs.writeFileSync(path.join(root, ".unslop-anything", "config.json"), JSON.stringify({ ignoreRules: ["oops-error"] }));
  fs.mkdirSync(path.join(root, "src", "screens"), { recursive: true });
  fs.writeFileSync(path.join(root, "src", "screens", "A.ts"), 'const a = "Oops";\n');
  try {
    assert.deepStrictEqual(scan([path.join(root, "src", "screens")]).findings, []);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

function detectWithConfig(config) {
  const fs = require("fs");
  const os = require("os");
  const { spawnSync } = require("child_process");
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "unslop-"));
  const target = path.join(root, "src");
  const file = path.join(target, ".unslop-anything", "config.json");
  try {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, config);
    // A valid ancestor config must not mask errors in the nearer config.
    fs.mkdirSync(path.join(root, ".unslop-anything"));
    fs.writeFileSync(path.join(root, ".unslop-anything", "config.json"), "{}");
    fs.writeFileSync(path.join(target, "styles.css"), ".card { transition: all 0.3s; }\n");
    const run = spawnSync(process.execPath,
      [path.join(__dirname, "..", "bin", "install.js"), "detect", "--json", target],
      { cwd: root, encoding: "utf8" });
    assert.ifError(run.error);
    return { ...run, file };
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
}

test("project config syntax errors stop the detector", () => {
  const run = detectWithConfig('{ "ignoreRules": ["transition-all"], }');
  assert.strictEqual(run.status, 1);
  assert.ok(run.stderr.includes(run.file));
  assert.match(run.stderr, /Could not parse config/);
  assert.strictEqual(run.stdout, "");
});

test("project config rejects unknown rule IDs", () => {
  const run = detectWithConfig('{ "ignoreRules": ["transition-al"] }');
  assert.strictEqual(run.status, 1);
  assert.ok(run.stderr.includes(run.file));
  assert.match(run.stderr, /Unknown rule: transition-al\. See --list-rules\./);
  assert.strictEqual(run.stdout, "");
});

test("a config from before the rename is still read", () => {
  const fs = require("fs");
  const os = require("os");
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "unslop-"));
  fs.mkdirSync(path.join(root, ".unslopovich"));
  fs.writeFileSync(path.join(root, ".unslopovich", "config.json"), JSON.stringify({ ignoreRules: ["oops-error"] }));
  fs.mkdirSync(path.join(root, "src", "screens"), { recursive: true });
  fs.writeFileSync(path.join(root, "src", "screens", "A.ts"), 'const a = "Oops";\n');
  try {
    assert.deepStrictEqual(scan([path.join(root, "src", "screens")]).findings, []);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("an unreadable file makes the scan fail, not pass", () => {
  const fs = require("fs");
  const os = require("os");
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "unslop-"));
  const file = path.join(root, "A.ts");
  fs.writeFileSync(file, "const a = 1;\n");
  const read = fs.readFileSync;
  fs.readFileSync = (f, ...rest) => {
    if (f === file) throw Object.assign(new Error("EACCES"), { code: "EACCES" });
    return read(f, ...rest);
  };
  const err = console.error;
  const log = console.log;
  console.error = () => {};
  console.log = () => {};
  try {
    assert.strictEqual(main([file]), 1);
  } finally {
    fs.readFileSync = read;
    console.error = err;
    console.log = log;
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("a scan that reads zero files fails instead of passing", () => {
  const fs = require("fs");
  const os = require("os");
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "unslop-"));
  // Objective-C / Java only: no supported source files under this folder.
  fs.writeFileSync(path.join(root, "main.m"), "#import <Foundation/Foundation.h>\nint main() { return 0; }\n");
  fs.writeFileSync(path.join(root, "App.java"), "public class App {}\n");
  const err = console.error;
  const log = console.log;
  let errOut = "";
  let out = "";
  console.error = (s) => (errOut += s);
  console.log = (s) => (out += s);
  try {
    const result = scan([root]);
    assert.strictEqual(result.filesScanned, 0);
    assert.match(result.message, /No supported source files under/);
    assert.ok(result.message.includes(root));
    assert.strictEqual(main([root]), 1);
    assert.match(errOut, /No supported source files under/);
    errOut = "";
    out = "";
    assert.strictEqual(main([root, "--json"]), 1);
    const parsed = JSON.parse(out);
    assert.strictEqual(parsed.filesScanned, 0);
    assert.match(parsed.message, /No supported source files under/);
    assert.ok(parsed.message.includes(".swift"));
  } finally {
    console.error = err;
    console.log = log;
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("web slop is caught", () => {
  const found = new Set(scan([path.join(fixtures, "slop", "web")]).findings.map((f) => f.rule));
  for (const id of [
    "slop-gradient", "gradient-text", "tracked-caps-label", "unverified-claim", "img-no-alt", "decorative-pulse",
    "clickable-div", "transition-all", "hover-scale", "icon-tile", "focus-removed", "zoom-disabled", "reduced-motion",
    "placeholder-label", "nested-cards",
  ]) assert.ok(found.has(id), `missing ${id}`);
});

test("Vue, Svelte and Astro slop is caught", () => {
  for (const file of ["Pricing.vue", "Card.svelte", "Hero.astro"]) {
    const found = rulesIn(path.join("web", file));
    for (const id of ["clickable-div", "img-no-alt", "transition-all"]) {
      assert.ok(found.has(id), `${file} missing ${id}`);
    }
  }
});

test("JS comments inside Vue, Svelte and Astro script blocks are ignored", () => {
  for (const file of ["Pricing.vue", "Card.svelte", "Hero.astro"]) {
    const found = rulesIn(path.join("web", file));
    assert.ok(!found.has("oops-error"), `${file} flagged oops-error`);
  }
});

test("Ionic drawer-nav fires on a universal scan", () => {
  const found = new Set(
    scan([path.join(fixtures, "slop", "web", "Ionic.html")], { platform: "universal" }).findings.map((f) => f.rule),
  );
  assert.ok(found.has("drawer-nav"), "missing drawer-nav");
  assert.ok(found.has("nested-cards"), "missing nested-cards");
});

test("clean web fixtures produce no findings", () => {
  const { findings, filesScanned } = scan([path.join(fixtures, "clean-web")]);
  assert.strictEqual(filesScanned, 6);
  assert.deepStrictEqual(findings, []);
});

test("mobile-only rules stay quiet on web projects", () => {
  const found = new Set(scan([path.join(fixtures, "slop", "web")]).findings.map((f) => f.rule));
  assert.ok(!found.has("hover-only"));
  const src = '<a onMouseEnter={x}>Docs</a>\nconst Nav = createDrawerNavigator();\n';
  assert.deepStrictEqual(scanSource(src, "a.tsx", { kind: "web" }).map((f) => f.rule), []);
  assert.deepStrictEqual(scanSource(src, "a.tsx", { kind: "mobile" }).map((f) => f.rule).sort(), ["drawer-nav", "hover-only"]);
  assert.deepStrictEqual(scanSource(src, "a.tsx", { kind: "universal" }).map((f) => f.rule), ["drawer-nav"]);
});

test("--platform overrides the detected project kind", () => {
  const found = new Set(scan([path.join(fixtures, "slop", "web")], { platform: "mobile" }).findings.map((f) => f.rule));
  assert.ok(found.has("hover-only"));
});

test("the installer replaces a skill folder from before the rename", () => {
  const fs = require("fs");
  const os = require("os");
  const { execFileSync } = require("child_process");
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "unslop-install-"));
  fs.mkdirSync(path.join(dir, "unslopovich"));
  fs.writeFileSync(path.join(dir, "unslopovich", "SKILL.md"), "---\nname: unslopovich\n---\n");
  fs.mkdirSync(path.join(dir, "other"));
  try {
    execFileSync(process.execPath, [path.join(__dirname, "..", "bin", "install.js"), "--dir", dir]);
    assert.ok(fs.existsSync(path.join(dir, "unslop-anything", "SKILL.md")));
    assert.ok(!fs.existsSync(path.join(dir, "unslopovich")));
    assert.ok(fs.existsSync(path.join(dir, "other")));
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("the installer refuses to install into the folder it installs from", () => {
  const fs = require("fs");
  const os = require("os");
  const { spawnSync } = require("child_process");
  // A copy of the package, so a failure cannot delete files from this checkout.
  const pkg = fs.mkdtempSync(path.join(os.tmpdir(), "unslop-pkg-"));
  fs.cpSync(path.join(__dirname, "..", "bin"), path.join(pkg, "bin"), { recursive: true });
  fs.cpSync(path.join(__dirname, "..", "skills"), path.join(pkg, "skills"), { recursive: true });
  const before = fs.readdirSync(path.join(pkg, "skills", "unslop-anything")).sort();
  fs.symlinkSync(path.join(pkg, "skills"), path.join(pkg, "link"), "junction");
  const dirs = ["skills", "./skills/../skills", "link"];
  // On a case-insensitive file system, another spelling is the same folder.
  if (fs.existsSync(path.join(pkg, "SKILLS"))) dirs.push("SKILLS");
  try {
    for (const dir of dirs) {
      const run = spawnSync(process.execPath, [path.join("bin", "install.js"), "--dir", dir], { cwd: pkg, encoding: "utf8" });
      assert.strictEqual(run.status, 1);
      assert.match(run.stderr, /nothing to install/);
      assert.deepStrictEqual(fs.readdirSync(path.join(pkg, "skills", "unslop-anything")).sort(), before);
      assert.ok(fs.existsSync(path.join(pkg, "skills", "unslop-anything", "SKILL.md")));
    }
  } finally {
    fs.rmSync(pkg, { recursive: true, force: true });
  }
});

test("an arrow function in an attribute does not end the tag for clickable-div and img-no-alt", () => {
  const rulesFor = (src) => scanSource(src, "a.tsx").map((f) => f.rule);
  assert.deepStrictEqual(rulesFor('<div onClick={() => go()} role="button" tabIndex={0}>x</div>\n'), []);
  assert.deepStrictEqual(rulesFor('<img src={src} onError={() => setBroken(true)} alt="Avatar" />\n'), []);
  // Still reported when the attribute really is missing.
  assert.deepStrictEqual(rulesFor("<div onClick={() => go()}>x</div>\n"), ["clickable-div"]);
  assert.deepStrictEqual(rulesFor("<img src={src} onError={() => setBroken(true)} />\n"), ["img-no-alt"]);
});

test("img-no-alt flags Next.js <Image> without alt, and ignores <ImageGallery>", () => {
  const rulesFor = (src) => scanSource(src, "a.tsx").map((f) => f.rule);
  // Flagged: the exact line from the issue.
  assert.deepStrictEqual(rulesFor('<Image src="/a.png" width={10} height={10} />\n'), ["img-no-alt"]);
  // Unflagged: alt present, and the existing spread exception carries over.
  assert.deepStrictEqual(rulesFor('<Image src="/a.png" alt="Team photo" />\n'), []);
  assert.deepStrictEqual(rulesFor('<Image src="/a.png" {...props} />\n'), []);
  // A component that merely starts with the letters must not match.
  assert.deepStrictEqual(rulesFor("<ImageGallery items={items} />\n"), []);
  assert.deepStrictEqual(rulesFor("<Image source={logo} accessibilityLabel=\"Logo\" />\n"), []);
});

test("clickable-div flags a href-less anchor with onClick", () => {
  const findingsFor = (src) => scanSource(src, "a.tsx");
  const src = [
    "<a onClick={go}>Go</a>",
    "<span onClick={go}>Go</span>",
    '<a href="/docs" onClick={track}>Docs</a>',
    "",
  ].join("\n");
  const flagged = findingsFor(src).filter((f) => f.rule === "clickable-div").map((f) => f.line);
  assert.deepStrictEqual(flagged, [1, 2]);
  assert.deepStrictEqual(scanSource('<a :href="url" @click="track">Docs</a>\n', "a.vue"), []);
  // A button role with a tabIndex is the one escape hatch for anchors...
  assert.deepStrictEqual(findingsFor('<a onClick={go} role="button" tabIndex={0}>Go</a>\n'), []);
  // ...but role alone or tabIndex alone does not excuse it.
  assert.deepStrictEqual(findingsFor('<a onClick={go} role="button">Go</a>\n').map((f) => f.rule), ["clickable-div"]);
  assert.deepStrictEqual(findingsFor('<a onClick={go} tabIndex={0}>Go</a>\n').map((f) => f.rule), ["clickable-div"]);
});

test("clickable-div requires both an interactive role and tabIndex on div/span/li/td/img", () => {
  const rulesFor = (src, file = "a.tsx") =>
    scanSource(src, file)
      .filter((f) => f.rule === "clickable-div")
      .map((f) => f.rule);
  assert.deepStrictEqual(rulesFor('<div role="button" onClick={open}>Open</div>\n'), ["clickable-div"]);
  assert.deepStrictEqual(rulesFor('<div tabIndex={0} onClick={open}>Open</div>\n'), ["clickable-div"]);
  assert.deepStrictEqual(rulesFor('<div role="presentation" tabIndex={0} onClick={open}>Open</div>\n'), ["clickable-div"]);
  assert.deepStrictEqual(rulesFor('<div role="none" tabIndex={0} onClick={open}>Open</div>\n'), ["clickable-div"]);
  assert.deepStrictEqual(rulesFor('<li role="listitem" tabIndex={0} onClick={open}>Open</li>\n'), ["clickable-div"]);
  assert.deepStrictEqual(rulesFor('<img role="img" tabIndex={0} onClick={open} alt="Open" />\n'), ["clickable-div"]);
  // Interactive role + tabIndex stays quiet across JSX, Vue, and Svelte.
  assert.deepStrictEqual(rulesFor('<div role="button" tabIndex={0} onClick={open}>Open</div>\n'), []);
  assert.deepStrictEqual(rulesFor('<div role="button" :tabindex="0" @click="open">Open</div>\n', "A.vue"), []);
  assert.deepStrictEqual(rulesFor('<div role="button" tabindex="0" on:click={open}>Open</div>\n', "A.svelte"), []);
});

test("tagEnd skips strings inside an attribute expression", () => {
  const imgs = (code) => scanSource(code, "A.tsx").filter((f) => f.rule === "img-no-alt");
  assert.deepStrictEqual(imgs('<img onLoad={() => loaded("}")} alt="Photo" src={src} />\n').length, 0);
  // nor does a quote inside a regex literal in an expression
  assert.deepStrictEqual(imgs('<img onLoad={() => /"/.test(value)} alt="Photo" src={src} />\n').length, 0);
});

test("clickable-div catches lowercase onclick in Svelte 5 and plain HTML (issue #141)", () => {
  const lines = (src, file) => scanSource(src, file).filter((f) => f.rule === "clickable-div").map((f) => f.line);
  const svelte = '<script>\n  let open = $state(false);\n</script>\n\n<div class="card" onclick={() => (open = true)}>Details</div>\n';
  assert.deepStrictEqual(lines(svelte, "Card.svelte"), [5]);
  assert.deepStrictEqual(lines('<div class="card" onclick="openCard()">Details</div>\n', "page.html"), [1]);
  assert.deepStrictEqual(lines('<span onclick="toggle()">More</span>\n', "page.html"), [1]);
  // The exemptions still apply: an anchor with href, or an interactive role and tabindex.
  assert.deepStrictEqual(lines('<a href="/details" onclick="track()">Details</a>\n', "page.html"), []);
  assert.deepStrictEqual(lines('<a href={url} onclick={track}>Details</a>\n', "Card.svelte"), []);
  assert.deepStrictEqual(lines('<div role="button" tabindex="0" onclick={open}>Open</div>\n', "Card.svelte"), []);
  // Event modifiers: Vue @click.stop, Svelte 4 on:click|preventDefault.
  assert.deepStrictEqual(lines('<div @click.stop="open">x</div>\n', "A.vue"), [1]);
  assert.deepStrictEqual(lines('<div v-on:click.prevent.self="open">x</div>\n', "A.vue"), [1]);
  assert.deepStrictEqual(lines("<div on:click|preventDefault={open}>x</div>\n", "A.svelte"), [1]);
  assert.deepStrictEqual(lines('<div role="button" tabindex="0" @click.stop="open">x</div>\n', "A.vue"), []);
  // An arrow function or a quoted > in an earlier attribute does not hide the handler.
  assert.deepStrictEqual(lines("<div onKeyDown={(e) => handleKey(e)} onClick={open}>Open</div>\n", "A.tsx"), [1]);
  assert.deepStrictEqual(lines("<div on:keydown={(e) => handleKey(e)} onclick={open}>Open</div>\n", "A.svelte"), [1]);
  assert.deepStrictEqual(lines('<div title="a > b" onclick="go()">x</div>\n', "page.html"), [1]);
  assert.deepStrictEqual(lines('<a title="a > b" href="/x" onclick="go()">x</a>\n', "page.html"), []);
  // A handler of a nested element inside an attribute belongs to that element.
  assert.deepStrictEqual(lines('<div render={<span role="button" tabIndex={0} onClick={x}>Open</span>} />\n', "A.tsx"), []);
  assert.deepStrictEqual(lines('<div render={\n  <span onClick={x}>Open</span>\n} />\n', "A.tsx"), [2]);
  // A brace inside a quoted value is text, not an expression.
  assert.deepStrictEqual(lines('<div title="{" onClick={x}>Open</div>\n', "A.tsx"), [1]);
  // A real button with onclick is fine.
  assert.deepStrictEqual(lines('<button onclick="openCard()">Details</button>\n', "page.html"), []);
});

test("focus-removed flags a bare focus:outline-none, not one with a ring replacement", () => {
  const rulesFor = (src) => scanSource(src, "a.tsx").map((f) => f.rule);
  assert.deepStrictEqual(rulesFor('<input className="focus:outline-none" />\n'), ["focus-removed"]);
  assert.deepStrictEqual(rulesFor('<input className="outline-none" />\n'), ["focus-removed"]);
  // A replacement focus style in the same string (or nearby) keeps it quiet.
  assert.deepStrictEqual(rulesFor('<input className="focus:outline-none focus:ring-2" />\n'), []);
  assert.deepStrictEqual(rulesFor('<input className="focus:outline-none focus-visible:ring-2" />\n'), []);
});

test("focus-removed treats Tailwind v4 outline-hidden like outline-none", () => {
  const rulesFor = (src, file = "a.tsx") => scanSource(src, file).map((f) => f.rule);
  assert.deepStrictEqual(rulesFor('<input className="rounded border px-3 focus:outline-hidden" />\n'), ["focus-removed"]);
  assert.deepStrictEqual(rulesFor('<input className="outline-hidden" />\n'), ["focus-removed"]);
  assert.deepStrictEqual(rulesFor('<input class="rounded border px-3 focus:outline-hidden" />\n', "Input.html"), ["focus-removed"]);
  // A replacement focus style keeps it quiet; focus:outline-hidden itself is not one.
  assert.deepStrictEqual(rulesFor('<input className="focus:outline-hidden focus-visible:ring-2" />\n'), []);
  assert.deepStrictEqual(rulesFor('<input className="focus:outline-hidden focus:ring-2" />\n'), []);
  // A variant on the removal itself is not a replacement focus style.
  assert.deepStrictEqual(rulesFor('<input className="focus-visible:outline-hidden" />\n'), ["focus-removed"]);
  assert.deepStrictEqual(rulesFor('<input className="focus-visible:outline-none" />\n'), ["focus-removed"]);
  assert.deepStrictEqual(rulesFor('<input className="focus-visible:outline-hidden focus-visible:ring-2" />\n'), []);
});

test("nested-cards ignores dotted subcomponents and ion-card parts, still flags a real nested card", () => {
  const rulesFor = (src, file = "a.tsx") => scanSource(src, file).map((f) => f.rule);
  // Issue #65: dotted subcomponents of a single card are not nested cards.
  assert.deepStrictEqual(rulesFor("<Card>\n  <Card.Title title=\"Hi\" />\n  <Card.Content><Text>x</Text></Card.Content>\n</Card>\n"), []);
  // Same for Ionic: hyphenated subcomponents are parts of one card.
  assert.deepStrictEqual(rulesFor("<ion-card><ion-card-header><ion-card-title>x</ion-card-title></ion-card-header></ion-card>", "a.html"), []);
  // A compound tag name starting with Card is not a nested card either.
  assert.deepStrictEqual(rulesFor("<Card><CardHeader>x</CardHeader></Card>"), []);
  // A genuine nested card is still flagged.
  assert.deepStrictEqual(rulesFor("<Card><Card><Text>x</Text></Card></Card>"), ["nested-cards"]);
  assert.deepStrictEqual(rulesFor("<Card className=\"x\"><Card className=\"y\">z</Card></Card>"), ["nested-cards"]);
  assert.deepStrictEqual(rulesFor("<ion-card><ion-card></ion-card></ion-card>", "a.html"), ["nested-cards"]);
});

test("img-no-alt accepts Angular [alt] bindings and Svelte {alt} shorthand", () => {
  const rulesFor = (src, file) => scanSource(src, file).map((f) => f.rule);
  assert.deepStrictEqual(rulesFor('<img [src]="u.avatar" [alt]="u.name">\n', "a.component.html"), []);
  assert.deepStrictEqual(rulesFor('<img [src]="u.avatar" [attr.alt]="u.name">\n', "a.component.html"), []);
  assert.deepStrictEqual(rulesFor("<img {src} {alt} />\n", "A.svelte"), []);
  // Plain alt and Vue :alt keep working, and a missing alt is still reported.
  assert.deepStrictEqual(rulesFor('<img src="x.png" alt="hi">\n', "a.html"), []);
  assert.deepStrictEqual(rulesFor('<img :src="u" :alt="n">\n', "a.vue"), []);
  // HTML-style bare alt attributes count as an empty alt value across web templates.
  assert.deepStrictEqual(rulesFor('<img src="divider.png" alt>\n', "a.html"), []);
  assert.deepStrictEqual(rulesFor('<img src="divider.png" alt />\n', "a.vue"), []);
  assert.deepStrictEqual(rulesFor('<img src="divider.png" alt/>\n', "A.svelte"), []);
  assert.deepStrictEqual(rulesFor('<img src="divider.png" alt>\n', "a.astro"), []);
  assert.deepStrictEqual(rulesFor('<img alt src="divider.png">\n', "index.html"), []);
  assert.deepStrictEqual(rulesFor('<img src="divider.png" alt />\n', "index.html"), []);
  assert.deepStrictEqual(rulesFor('<img src="photo.png">\n', "index.html"), ["img-no-alt"]);
  // JSX treats a bare alt as true rather than useful alternative text.
  assert.deepStrictEqual(rulesFor('<img src="divider.png" alt />\n', "a.jsx"), ["img-no-alt"]);
  assert.deepStrictEqual(rulesFor('<img [src]="u.avatar">\n', "a.component.html"), ["img-no-alt"]);
  assert.deepStrictEqual(rulesFor("<img {src} />\n", "A.svelte"), ["img-no-alt"]);
});

test("placeholder-label flags inputs that use a placeholder as their only label", () => {
  const rulesFor = (src) => scanSource(src, "a.tsx").map((f) => f.rule);
  // The issue's repro.
  assert.deepStrictEqual(rulesFor('<input type="email" placeholder="Email" />\n'), ["placeholder-label"]);
  assert.deepStrictEqual(rulesFor('<textarea placeholder="Tell us more" />\n'), ["placeholder-label"]);
  // A real label quiets it: aria-label, aria-labelledby, <label for>, wrapping <label>.
  assert.deepStrictEqual(rulesFor('<input type="email" placeholder="Email" aria-label="Email" />\n'), []);
  assert.deepStrictEqual(rulesFor('<input placeholder="Email" aria-labelledby="email-label" />\n'), []);
  assert.deepStrictEqual(rulesFor('<label htmlFor="email">Email</label>\n<input id="email" placeholder="Email" />\n'), []);
  assert.deepStrictEqual(rulesFor('<label htmlFor={id}>Email</label>\n<input id={id} placeholder="Email" />\n'), []);
  assert.deepStrictEqual(scanSource('<label :for="fieldId">Email</label>\n<input :id="fieldId" placeholder="Email">\n', "a.vue"), []);
  assert.deepStrictEqual(rulesFor('<label>Email <input placeholder="Email" /></label>\n'), []);
  // A label pointing at a different id does not save the field.
  assert.deepStrictEqual(rulesFor('<label htmlFor="name">Name</label>\n<input id="email" placeholder="Email" />\n'), ["placeholder-label"]);
  // No placeholder, no finding; hidden and submit inputs need no label.
  assert.deepStrictEqual(rulesFor('<input type="email" />\n'), []);
  assert.deepStrictEqual(rulesFor('<input type="hidden" placeholder="token" />\n'), []);
  assert.deepStrictEqual(rulesFor('<input type="submit" placeholder="Send" />\n'), []);
  assert.deepStrictEqual(rulesFor('<input type="search" placeholder="Search" aria-label="Search" />\n'), []);
  // An arrow function in an attribute does not end the tag early.
  assert.deepStrictEqual(rulesFor('<input placeholder="Email" onChange={() => setEmail(v)} />\n'), ["placeholder-label"]);
});

test("unverified-claim allows one adjective between the number and the noun", () => {
  const rulesFor = (src) => scanSource(src, "a.tsx").map((f) => f.rule);
  assert.deepStrictEqual(rulesFor("<p>Join 10,000+ customers</p>\n"), ["unverified-claim"]);
  assert.deepStrictEqual(rulesFor("<p>Join 10,000+ happy customers</p>\n"), ["unverified-claim"]);
  assert.deepStrictEqual(rulesFor("<p>Trusted by 5,000 growing teams</p>\n"), ["unverified-claim"]);
  assert.deepStrictEqual(rulesFor("<p>Join 10,000 growing businesses</p>\n"), ["unverified-claim"]);
  // A time phrase is not a social-proof claim.
  assert.deepStrictEqual(rulesFor("<p>Join 10 minutes early</p>\n"), []);
});

test("the installer --help flag prints usage and installs nothing", () => {
  const fs = require("fs");
  const os = require("os");
  const { spawnSync } = require("child_process");
  const home = fs.mkdtempSync(path.join(os.tmpdir(), "unslop-home-"));
  const cwd = fs.mkdtempSync(path.join(os.tmpdir(), "unslop-cwd-"));
  try {
    const run = spawnSync(process.execPath, [path.join(__dirname, "..", "bin", "install.js"), "--help"], {
      env: { ...process.env, HOME: home, USERPROFILE: home },
      cwd,
      encoding: "utf8",
    });
    assert.strictEqual(run.status, 0);
    assert.match(run.stdout, /Usage:/);
    assert.match(run.stdout, /--agent codex,cursor/);
    assert.match(run.stdout, /--project/);
    assert.deepStrictEqual(fs.readdirSync(home), []);
    assert.deepStrictEqual(fs.readdirSync(cwd), []);
  } finally {
    fs.rmSync(home, { recursive: true, force: true });
    fs.rmSync(cwd, { recursive: true, force: true });
  }
});

test("the installer rejects an unknown agent before it copies anything", () => {
  const fs = require("fs");
  const os = require("os");
  const { spawnSync } = require("child_process");
  const home = fs.mkdtempSync(path.join(os.tmpdir(), "unslop-home-"));
  const cwd = fs.mkdtempSync(path.join(os.tmpdir(), "unslop-cwd-"));
  try {
    const run = spawnSync(process.execPath, [path.join(__dirname, "..", "bin", "install.js"), "--agent", "nope"], {
      env: { ...process.env, HOME: home, USERPROFILE: home },
      cwd,
      encoding: "utf8",
    });
    assert.strictEqual(run.status, 1);
    assert.match(run.stderr, /Unknown agent: nope/);
    assert.match(run.stderr, /Choose from claude, codex, cursor, opencode, gemini, copilot/);
    assert.deepStrictEqual(fs.readdirSync(home), []);
    assert.deepStrictEqual(fs.readdirSync(cwd), []);
  } finally {
    fs.rmSync(home, { recursive: true, force: true });
    fs.rmSync(cwd, { recursive: true, force: true });
  }
});

test("the installer installs --agent codex,cursor once into the shared .agents folder", () => {
  const fs = require("fs");
  const os = require("os");
  const { spawnSync } = require("child_process");
  const home = fs.mkdtempSync(path.join(os.tmpdir(), "unslop-home-"));
  const cwd = fs.mkdtempSync(path.join(os.tmpdir(), "unslop-cwd-"));
  try {
    const run = spawnSync(process.execPath, [path.join(__dirname, "..", "bin", "install.js"), "--agent", "codex,cursor"], {
      env: { ...process.env, HOME: home, USERPROFILE: home },
      cwd,
      encoding: "utf8",
    });
    assert.strictEqual(run.status, 0);
    const dest = path.join(home, ".agents", "skills", "unslop-anything");
    assert.ok(fs.existsSync(path.join(dest, "SKILL.md")));
    assert.strictEqual(
      fs.readFileSync(path.join(dest, "SKILL.md"), "utf8"),
      fs.readFileSync(path.join(__dirname, "..", "skills", "unslop-anything", "SKILL.md"), "utf8")
    );
    // One shared destination, not one install per agent.
    assert.strictEqual((run.stdout.match(/installed to/g) || []).length, 1);
    assert.match(run.stdout, /Codex, Cursor/);
    assert.ok(run.stdout.includes(dest));
    // No per-agent folders were created.
    assert.ok(!fs.existsSync(path.join(home, ".codex")));
    assert.ok(!fs.existsSync(path.join(home, ".cursor")));
    assert.deepStrictEqual(fs.readdirSync(cwd), []);
  } finally {
    fs.rmSync(home, { recursive: true, force: true });
    fs.rmSync(cwd, { recursive: true, force: true });
  }
});

test("the installer --project --agent gemini installs into the current folder", () => {
  const fs = require("fs");
  const os = require("os");
  const { spawnSync } = require("child_process");
  const home = fs.mkdtempSync(path.join(os.tmpdir(), "unslop-home-"));
  const cwd = fs.mkdtempSync(path.join(os.tmpdir(), "unslop-cwd-"));
  try {
    const run = spawnSync(process.execPath, [path.join(__dirname, "..", "bin", "install.js"), "--project", "--agent", "gemini"], {
      env: { ...process.env, HOME: home, USERPROFILE: home },
      cwd,
      encoding: "utf8",
    });
    assert.strictEqual(run.status, 0);
    const dest = path.join(cwd, ".gemini", "skills", "unslop-anything");
    assert.ok(fs.existsSync(path.join(dest, "SKILL.md")));
    assert.strictEqual(
      fs.readFileSync(path.join(dest, "SKILL.md"), "utf8"),
      fs.readFileSync(path.join(__dirname, "..", "skills", "unslop-anything", "SKILL.md"), "utf8")
    );
    assert.ok(run.stdout.includes(dest));
    // A project install touches the project, not the home folder.
    assert.deepStrictEqual(fs.readdirSync(home), []);
  } finally {
    fs.rmSync(home, { recursive: true, force: true });
    fs.rmSync(cwd, { recursive: true, force: true });
  }
});

test("the installer rejects an unknown flag before it copies anything", () => {
  const fs = require("fs");
  const os = require("os");
  const { spawnSync } = require("child_process");
  const home = fs.mkdtempSync(path.join(os.tmpdir(), "unslop-home-"));
  try {
    const run = (...flags) =>
      spawnSync(process.execPath, [path.join(__dirname, "..", "bin", "install.js"), ...flags], {
        env: { ...process.env, HOME: home, USERPROFILE: home },
        encoding: "utf8",
      });
    const typo = run("--projet");
    assert.strictEqual(typo.status, 1);
    assert.match(typo.stderr, /Unknown option --projet/);
    assert.match(typo.stderr, /Usage:/);
    assert.deepStrictEqual(fs.readdirSync(home), []);
    const short = run("-x");
    assert.strictEqual(short.status, 1);
    assert.match(short.stderr, /Unknown option -x/);
    assert.strictEqual(run("--help").status, 0);
    assert.strictEqual(run("--agent", "nope").status, 1);
  } finally {
    fs.rmSync(home, { recursive: true, force: true });
  }
});

test("glow-shadow catches Tailwind colored and arbitrary shadows while ignoring neutral shadows", () => {
  const flagged = [
    '<div className="shadow-2xl shadow-purple-500/50">x</div>',
    '<div className="shadow-[0_0_40px_rgba(124,58,237,0.5)]">x</div>',
  ].join("\n");
  assert.deepStrictEqual(scanSource(flagged, "a.tsx").map((f) => f.rule), ["glow-shadow", "glow-shadow"]);

  for (const color of ["purple", "violet", "indigo", "pink", "fuchsia", "blue", "cyan", "teal"]) {
    assert.deepStrictEqual(
      scanSource(`<div className="shadow-${color}-500/40">x</div>`, "a.tsx").map((f) => f.rule),
      ["glow-shadow"],
    );
  }

  const neutral = [
    '<div className="shadow-lg">x</div>',
    '<div className="shadow-black/20">x</div>',
    '<div className="shadow-gray-900/10">x</div>',
    '<div className="shadow-[0_2px_8px_rgba(0,0,0,0.2)]">x</div>',
  ].join("\n");
  assert.deepStrictEqual(scanSource(neutral, "a.tsx"), []);
});

test("glow-shadow skips inset accent bars with no blur (#111)", () => {
  const bars = [
    ".line.highlighted {",
    "  box-shadow: inset 2px 0 0 rgb(226 86 15 / 0.6);",
    "}",
    ".tab.active {",
    "  box-shadow: inset 0 -2px 0 #e0763f;",
    "}",
    ".edge {",
    "  box-shadow: inset 0 1px #7c3aed;",
    "}",
  ].join("\n");
  assert.deepStrictEqual(scanSource(bars, "a.css"), []);
  assert.deepStrictEqual(scanSource('<div className="shadow-[inset_2px_0_0_#e0763f]">x</div>', "a.tsx"), []);

  const glows = [
    ".btn {",
    "  box-shadow: 0 0 24px rgb(224 118 63 / 0.7);",
    "}",
    ".ring {",
    "  box-shadow: inset 0 0 12px #7c3aed;",
    "}",
    ".mixed {",
    "  box-shadow: inset 2px 0 0 #e0763f, 0 0 30px #7c3aed;",
    "}",
  ].join("\n");
  assert.deepStrictEqual(scanSource(glows, "a.css").map((f) => [f.rule, f.line]), [
    ["glow-shadow", 2],
    ["glow-shadow", 5],
    ["glow-shadow", 8],
  ]);
  assert.deepStrictEqual(
    scanSource('<div className="shadow-[0_0_40px_#7c3aed]">x</div>', "a.tsx").map((f) => f.rule),
    ["glow-shadow"],
  );
});

test("hover-scale flags Tailwind arbitrary scale values of 1.02 and above", () => {
  const rulesFor = (src) => scanSource(src, "a.tsx").map((f) => f.rule);
  // The issue's example line, plus the group- prefix variant.
  assert.deepStrictEqual(rulesFor('<div className="hover:scale-[1.03]">x</div>\n'), ["hover-scale"]);
  assert.deepStrictEqual(rulesFor('<div className="group-hover:scale-[1.02]">x</div>\n'), ["hover-scale"]);
  assert.deepStrictEqual(rulesFor('<div className="hover:scale-[1.25]">x</div>\n'), ["hover-scale"]);
  // At or below 1.01 the grow is too small to flag.
  assert.deepStrictEqual(rulesFor('<div className="hover:scale-[1.01]">x</div>\n'), []);
  assert.deepStrictEqual(rulesFor('<div className="hover:scale-[0.98]">x</div>\n'), []);
  // The named steps still work.
  assert.deepStrictEqual(rulesFor('<div className="hover:scale-105">x</div>\n'), ["hover-scale"]);
});

test("hover-scale flags standalone CSS scale at 1.02 and above, not neutral, shrinking, or similarly named properties", () => {
  const rulesFor = (src) => scanSource(src, "a.css", { kind: "web" }).map((f) => f.rule);
  assert.deepStrictEqual(rulesFor(".card:hover { scale: 1.02; }\n"), ["hover-scale"]);
  assert.deepStrictEqual(rulesFor(".card:hover { scale: 1.1 1; }\n"), ["hover-scale"]);
  assert.deepStrictEqual(rulesFor(".card:hover { scale: 1; }\n"), []);
  assert.deepStrictEqual(rulesFor(".button:hover { scale: 0.98; }\n"), []);
  assert.deepStrictEqual(rulesFor(".card:hover { scaleX: 1.1; }\n"), []);
  assert.deepStrictEqual(rulesFor(".card:hover { custom-scale: 1.1; }\n"), []);
});

test("glow-shadow catches Android shadowColor on one line or with alpha", () => {
  const oneLine = '<TextView android:shadowColor="#7C3AED" android:shadowRadius="20" />';
  const multiLine = '<TextView\n    android:shadowColor="#807C3AED"\n    android:shadowRadius="20" />';
  assert.deepStrictEqual(scanSource(oneLine, "a.xml").map((f) => f.rule), ["glow-shadow"]);
  assert.deepStrictEqual(scanSource(multiLine, "a.xml").map((f) => f.rule), ["glow-shadow"]);

  // Semi-transparent black is a neutral shadow, not a colored glow.
  const neutral = '<TextView android:shadowColor="#80000000" android:shadowRadius="20" />';
  assert.deepStrictEqual(scanSource(neutral, "a.xml"), []);
});

test("sparkle-icon flags the singular and combined icon names", () => {
  const rulesFor = (src) => scanSource(src, "a.tsx").map((f) => f.rule);
  // Issue #45: these gave no finding before the fix.
  assert.deepStrictEqual(rulesFor("<Sparkle />\n"), ["sparkle-icon"]);
  assert.deepStrictEqual(rulesFor("<SparkleIcon />\n"), ["sparkle-icon"]);
  assert.deepStrictEqual(rulesFor("<WandSparkles />\n"), ["sparkle-icon"]);
  assert.deepStrictEqual(rulesFor("<WandSparklesIcon />\n"), ["sparkle-icon"]);
  // Still flagged, as before.
  assert.deepStrictEqual(rulesFor("<Sparkles />\n"), ["sparkle-icon"]);
  // A word that only contains the letters is a different component, not a
  // sparkle icon: word boundaries keep SparkleCounter unflagged.
  assert.deepStrictEqual(rulesFor("<SparkleCounter />\n"), []);
});

test("sparkle-icon flags sparkle-derived SF Symbols but not words containing sparkles", () => {
  const src = [
    "import SwiftUI",
    "struct A: View {",
    "  var body: some View {",
    "    VStack {",
    '      Image(systemName: "wand.and.sparkles")',
    '      Label("Summarize", systemImage: "sparkles.rectangle.stack")',
    '      Image(systemName: "sparkle")',
    '      Image(systemName: "sparkles")',
    '      Image(systemName: "wand.and.stars")',
    '      Image(systemName: "wand.and.stars.inverse")',
    '      Image(systemName: "wand.and.sparkles.inverse")',
    '      Text("sparkles.rectangle.stack\'s label")',
    '      Text("\'sparkles\'")',
    '      Text("not \\"sparkles\\" here")',
    "    }",
    "  }",
    "}",
    'let quietSymbols = ["sparkles_count", "no sparkles here"]',
  ].join("\n");

  const findings = scanSource(src, "a.swift").filter((f) => f.rule === "sparkle-icon");
  assert.deepStrictEqual(findings.map((f) => f.line), [5, 6, 7, 8, 9, 10, 11]);
});

test("sparkle-icon ignores prose apostrophes but still scans later literals", () => {
  const doubleQuote = 'const view = <><p>Don\'t forget</p><Icon name="sparkles" /></>;';
  const singleQuote = "const view = <><p>Don't forget</p><Icon name='sparkles' /></>;";
  for (const src of [doubleQuote, singleQuote]) {
    assert.deepStrictEqual(scanSource(src, "a.tsx").map((f) => f.rule), ["sparkle-icon"]);
  }
});

test("sparkle-icon scans nested Swift interpolation and raw strings", () => {
  const interpolation = "let label = \"Icon: \\(Image(systemName: \"sparkles\"))\"";
  assert.deepStrictEqual(scanSource(interpolation, "a.swift").map((f) => f.rule), ["sparkle-icon"]);

  assert.deepStrictEqual(scanSource('let icon = #"sparkles"#', "a.swift").map((f) => f.rule), ["sparkle-icon"]);

  const prose = "let label = #\"Use \"'sparkles'\" as text\"#";
  assert.deepStrictEqual(scanSource(prose, "a.swift"), []);
});

test("blankComments keeps slashes inside Swift raw strings and still finds later symbols", () => {
  const src = [
    'let label = #"A "// B"#',
    'let icon = Image(systemName: "sparkles")',
  ].join("\n");

  assert.ok(blankComments(src, "swift").includes("// B"));
  assert.deepStrictEqual(scanSource(src, "a.swift").map((f) => f.rule), ["sparkle-icon"]);
});

test("glow-shadow flags #0000ff and a saturated second color in a shadow list, but not whole-black or neutral-only lists", () => {
  const flagged = [
    '<div className="shadow-[0_0_40px_#0000ff]">x</div>',
    '<div className="shadow-[0_1px_2px_rgba(128,128,128,0.2),0_0_40px_rgba(124,58,237,0.5)]">x</div>',
  ].join("\n");
  assert.deepStrictEqual(scanSource(flagged, "a.tsx").map((f) => f.rule), ["glow-shadow", "glow-shadow"]);

  const notFlagged = [
    '<div className="shadow-[0_0_40px_#000]">x</div>',
    '<div className="shadow-[0_0_40px_#000000]">x</div>',
    '<div className="shadow-[0_0_40px_#00000080]">x</div>',
    '<div className="shadow-[0_2px_8px_rgba(0,0,0,0.2)]">x</div>',
    '<div className="shadow-[0_1px_2px_rgba(0,0,0,0.2),0_2px_8px_rgba(128,128,128,0.3)]">x</div>',
  ].join("\n");
  assert.deepStrictEqual(scanSource(notFlagged, "a.tsx"), []);
});

test("glass-everywhere counts Tailwind backdrop-blur classes", () => {
  // The three lines from issue #50.
  const flagged = [
    '<div className="backdrop-blur-xl bg-white/10">a</div>',
    '<div className="backdrop-blur-md bg-black/20">b</div>',
    '<div className="backdrop-blur-lg bg-white/5">c</div>',
  ].join("\n");
  assert.deepStrictEqual(scanSource(flagged, "a.tsx").map((f) => f.rule), ["glass-everywhere"]);

  // Two blur surfaces are not enough.
  const two = flagged.split("\n").slice(0, 2).join("\n");
  assert.deepStrictEqual(scanSource(two, "a.tsx"), []);

  // Bare and arbitrary-value classes count too.
  const mixed = [
    '<div className="backdrop-blur">a</div>',
    '<div className="backdrop-blur-[8px]">b</div>',
    '<div className="backdrop-blur-sm">c</div>',
  ].join("\n");
  assert.deepStrictEqual(scanSource(mixed, "a.tsx").map((f) => f.rule), ["glass-everywhere"]);

  // backdrop-blur-none removes the blur, so it does not count toward the three.
  const withNone = [
    '<div className="backdrop-blur-none">a</div>',
    '<div className="backdrop-blur-md">b</div>',
    '<div className="backdrop-blur-lg">c</div>',
  ].join("\n");
  assert.deepStrictEqual(scanSource(withNone, "a.tsx"), []);
});

test("tracked-caps-label catches leading-dot Tailwind tracking and rem letter-spacing", () => {
  assert.deepStrictEqual(
    scanSource('<p className="uppercase tracking-[.2em]">Features</p>', "Eyebrow.tsx").map((f) => f.rule),
    ["tracked-caps-label"],
  );
  assert.deepStrictEqual(
    scanSource('<p className="uppercase tracking-[0.2em]">Features</p>', "Eyebrow.tsx").map((f) => f.rule),
    ["tracked-caps-label"],
  );

  assert.deepStrictEqual(
    scanSource(".eyebrow { text-transform: uppercase; letter-spacing: 0.12rem; }", "eyebrow.css").map((f) => f.rule),
    ["tracked-caps-label"],
  );
  assert.deepStrictEqual(
    scanSource(".eyebrow { text-transform: uppercase; letter-spacing: 0.05rem; }", "eyebrow.css").map((f) => f.rule),
    ["tracked-caps-label"],
  );
  assert.deepStrictEqual(
    scanSource(".eyebrow { text-transform: uppercase; letter-spacing: 0.01rem; }", "eyebrow.css"),
    [],
  );
});

test("drawer-nav catches both line.3.horizontal and older line.horizontal.3 SF Symbols", () => {
  assert.deepStrictEqual(
    scanSource('Image(systemName: "line.3.horizontal")', "Menu.swift").map((f) => f.rule),
    ["drawer-nav"],
  );
  assert.deepStrictEqual(
    scanSource('Image(systemName: "line.horizontal.3")', "Menu.swift").map((f) => f.rule),
    ["drawer-nav"],
  );
  assert.deepStrictEqual(
    scanSource("// Use line.horizontal.3 in prose without quotes", "Menu.swift"),
    [],
  );
});

test("drawer-nav catches every style of the hamburger icon (issue #146)", () => {
  const lines = (src, file) => scanSource(src, file).filter((f) => f.rule === "drawer-nav").map((f) => f.line);
  for (const icon of ["menu_rounded", "menu_outlined", "menu_sharp"]) {
    assert.deepStrictEqual(lines(`IconButton(icon: const Icon(Icons.${icon}), onPressed: openDrawer)\n`, "header.dart"), [1], icon);
  }
  assert.deepStrictEqual(lines('<Ionicons name="menu-sharp" size={24} />\n', "Header.tsx"), [1]);
  // menu_book is a different icon.
  assert.deepStrictEqual(lines("Icon(Icons.menu_book)\n", "header.dart"), []);
  assert.deepStrictEqual(lines('<Ionicons name="menu-sharp-outline" />\n', "Header.tsx"), []);
});

test("clickable-div flags Angular (click) and Alpine x-on:click handlers", () => {
  const rulesFor = (src) => scanSource(src, "a.html").map((f) => f.rule);
  assert.deepStrictEqual(rulesFor('<div class="card" (click)="open()">Details</div>\n'), ["clickable-div"]);
  assert.deepStrictEqual(rulesFor('<span (click) = "open()">x</span>\n'), ["clickable-div"]);
  assert.deepStrictEqual(rulesFor('<div class="card" x-on:click="open = true">Details</div>\n'), ["clickable-div"]);
  assert.deepStrictEqual(rulesFor('<div x-on:click.prevent="open = true">x</div>\n'), ["clickable-div"]);
  assert.deepStrictEqual(rulesFor('<div role="button" tabindex="0" (click)="open()">Details</div>\n'), []);
  assert.deepStrictEqual(rulesFor('<div role="button" tabindex="0" x-on:click="open = true">x</div>\n'), []);
  assert.deepStrictEqual(rulesFor('<a href="/x" (click)="track()">x</a>\n'), []);
  assert.deepStrictEqual(rulesFor('<button (click)="open()">x</button>\n'), []);
  assert.deepStrictEqual(rulesFor('<button x-on:click="open = true">x</button>\n'), []);
});

test("template-theme flags create-vite's #646cff and #535bf2", () => {
  const rulesFor = (src) => scanSource(src, "index.css").map((f) => f.rule).filter((r) => r === "template-theme");
  assert.deepStrictEqual(rulesFor("a {\n  font-weight: 500;\n  color: #646cff;\n}\na:hover {\n  color: #535bf2;\n}\n"), ["template-theme"]);
  assert.deepStrictEqual(rulesFor("a:hover { color: #535BF2; }\n"), ["template-theme"]);
  assert.deepStrictEqual(rulesFor("a { color: #646CFF; }\n"), ["template-theme"]);
  assert.deepStrictEqual(rulesFor("a { color: #646cf0; }\n"), []);
  assert.deepStrictEqual(rulesFor("a { color: #646cffaa; }\n"), []);
});

test("slop-gradient reads rgb() and hsl() stops", () => {
  const rulesFor = (src) => scanSource(src, "a.css").map((f) => f.rule).filter((r) => r === "slop-gradient");
  const flagged = [
    ".a { background: linear-gradient(rgb(124, 58, 237), rgb(219, 39, 119)); }\n",
    ".a { background: linear-gradient(to right, rgba(124, 58, 237, 0.8), #0ea5e9); }\n",
    ".a { background: linear-gradient(rgb(124 58 237 / 50%), white); }\n",
    ".a { background: linear-gradient(rgb(48.6% 22.7% 92.9%), white); }\n",
    ".a { background: linear-gradient(hsl(262, 83%, 58%), white); }\n",
    ".a { background: radial-gradient(hsla(262deg 83% 58% / 0.5), white); }\n",
  ];
  for (const src of flagged) assert.deepStrictEqual(rulesFor(src), ["slop-gradient"], src);
  const quiet = [
    ".a { background: linear-gradient(rgb(14, 165, 233), rgb(34, 197, 94)); }\n",
    ".a { background: linear-gradient(hsl(199 89% 48%), hsl(142 71% 45%)); }\n",
    ".a { background: linear-gradient(rgb(0, 0, 0), rgb(255, 255, 255)); }\n",
  ];
  for (const src of quiet) assert.deepStrictEqual(rulesFor(src), [], src);
});

test("slop-gradient reads Flutter Color.fromARGB and Color.fromRGBO stops (issue #161)", () => {
  const rulesFor = (src) => scanSource(src, "hero.dart").map((f) => f.rule).filter((r) => r === "slop-gradient");
  const gradient = (stops) => `Container(decoration: BoxDecoration(gradient: LinearGradient(colors: [${stops}])))\n`;
  const flagged = [
    "Color.fromARGB(255, 124, 58, 237), Color.fromARGB(255, 219, 39, 119)",
    "Color.fromRGBO(124, 58, 237, 1), Color.fromRGBO(219, 39, 119, 1)",
    "const Color.fromRGBO(124, 58, 237, 0.8), Colors.white",
    // Hex literals for the channels, and a trailing comma.
    "Color.fromARGB(0xFF, 0x7C, 0x3A, 0xED,), Colors.white",
    "Color.fromARGB(\n      255,\n      124,\n      58,\n      237,\n    ), Colors.white",
    // The alpha or opacity can be any expression; only the channels are read.
    "Color.fromRGBO(124, 58, 237, animation.value.clamp(0.0, 1.0)), Colors.white",
    "Color.fromARGB((255 * t).round(), 124, 58, 237), Colors.white",
  ];
  for (const stops of flagged) assert.deepStrictEqual(rulesFor(gradient(stops)), ["slop-gradient"], stops);
  const quiet = [
    "Color.fromARGB(255, 14, 165, 233), Color.fromARGB(255, 34, 197, 94)",
    "Color.fromRGBO(14, 165, 233, 1), Color.fromRGBO(34, 197, 94, 1)",
    // 255 here is the alpha, not a channel: (0, 0, 0) is black.
    "Color.fromARGB(255, 0, 0, 0), Color.fromARGB(255, 255, 255, 255)",
    // A channel that is not a literal cannot be read.
    "Color.fromARGB(255, r, g, b), Color.fromRGBO(red, 58, 237, 1)",
    "Color.fromRGBO(shade(124), 58, 237, 1), Colors.white",
    // Flutter keeps the low eight bits of a channel: 256 is 0, so this is (0, 58, 237), a blue.
    "Color.fromARGB(255, 256, 58, 237), Colors.white",
  ];
  for (const stops of quiet) assert.deepStrictEqual(rulesFor(gradient(stops)), [], stops);
});

test("slop-gradient reads SwiftUI Color(red:green:blue:) stops (issue #162)", () => {
  const rulesFor = (src) => scanSource(src, "Hero.swift").map((f) => f.rule).filter((r) => r === "slop-gradient");
  const gradient = (stops) => `LinearGradient(colors: [${stops}], startPoint: .leading, endPoint: .trailing)\n`;
  const flagged = [
    "Color(red: 0.49, green: 0.23, blue: 0.93), Color(red: 0.86, green: 0.15, blue: 0.47)",
    "Color(red: 0.49, green: 0.23, blue: 0.93, opacity: 0.8), .white",
    "Color(.sRGB, red: 0.49, green: 0.23, blue: 0.93, opacity: 1), .white",
    // Components written as a fraction of 255.
    "Color(red: 124 / 255, green: 58 / 255, blue: 237 / 255), .white",
    "Color(red: 124.0/255.0, green: 58.0/255.0, blue: 237.0/255.0), .white",
    // Swift also accepts an exponent.
    "Color(red: 4.9e-1, green: 2.3e-1, blue: 9.3e-1), .white",
    "Color(\n      red: 0.49,\n      green: 0.23,\n      blue: 0.93\n    ), .white",
  ];
  for (const stops of flagged) assert.deepStrictEqual(rulesFor(gradient(stops)), ["slop-gradient"], stops);
  const quiet = [
    "Color(red: 0.05, green: 0.65, blue: 0.91), Color(red: 0.13, green: 0.77, blue: 0.37)",
    "Color(red: 14 / 255, green: 165 / 255, blue: 233 / 255), Color(red: 34 / 255, green: 197 / 255, blue: 94 / 255)",
    "Color(red: 0, green: 0, blue: 0), Color(red: 1, green: 1, blue: 1)",
    // A component that is not a number cannot be read.
    "Color(red: r, green: g, blue: b), Color(red: tint.r, green: 0.23, blue: 0.93)",
  ];
  for (const stops of quiet) assert.deepStrictEqual(rulesFor(gradient(stops)), [], stops);
});

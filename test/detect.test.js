"use strict";

const test = require("node:test");
const assert = require("node:assert");
const path = require("path");
const { scan, scanSource, rules, isSlopHue, main } = require("../skills/unslop-anything/scripts/detect.js");

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
  for (const id of ["unvirtualized-list", "status-dot", "fixed-text-size", "slop-gradient", "glow-shadow", "back-gesture", "drawer-nav", "safe-area-off", "tracked-caps-label", "vague-button"]) {
    assert.ok(found.has(id), `missing ${id}`);
  }
});

test("Compose slop is caught", () => {
  const found = rulesIn("MainScreen.kt");
  for (const id of ["template-theme", "unvirtualized-list", "nested-cards", "status-dot", "drawer-nav", "back-gesture", "vague-button"]) {
    assert.ok(found.has(id), `missing ${id}`);
  }
});

test("Flutter slop is caught", () => {
  const found = rulesIn("home.dart");
  for (const id of ["template-theme", "back-gesture", "unvirtualized-list", "nested-cards", "status-dot", "fixed-text-size", "vague-button"]) {
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

test("a JSX ignore comment on its own line silences the next line", () => {
  const src = "<View>\n  {/* unslop-anything-ignore clickable-div */}\n  <div onClick={go}>x</div>\n  <div onClick={go}>y</div>\n</View>\n";
  assert.deepStrictEqual(scanSource(src, "a.tsx").map((f) => `${f.rule}:${f.line}`), ["clickable-div:4"]);
  const spaced = "<View>\n  { /* unslop-anything-ignore */ }\n  <div onClick={go}>x</div>\n</View>\n";
  assert.deepStrictEqual(scanSource(spaced, "a.tsx"), []);
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

test("slop-gradient reads Android #AARRGGBB colors", () => {
  const src = '<gradient android:startColor="#FF7C3AED" android:endColor="#FFEC4899"/>\n';
  assert.deepStrictEqual(scanSource(src, "bg.xml").map((f) => f.rule), ["slop-gradient"]);
  const rgb = '<gradient android:startColor="#7C3AED" android:endColor="#EC4899"/>\n';
  assert.deepStrictEqual(scanSource(rgb, "bg.xml").map((f) => f.rule), ["slop-gradient"]);
  const scrim = ".hero { background: linear-gradient(to bottom, transparent, #000000CC); }\n";
  assert.deepStrictEqual(scanSource(scrim, "a.css"), []);
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

test("web slop is caught", () => {
  const found = new Set(scan([path.join(fixtures, "slop", "web")]).findings.map((f) => f.rule));
  for (const id of [
    "slop-gradient", "gradient-text", "tracked-caps-label", "unverified-claim", "img-no-alt", "decorative-pulse",
    "clickable-div", "transition-all", "hover-scale", "icon-tile", "focus-removed", "zoom-disabled",
  ]) assert.ok(found.has(id), `missing ${id}`);
});

test("clean web fixtures produce no findings", () => {
  const { findings, filesScanned } = scan([path.join(fixtures, "clean-web")]);
  assert.strictEqual(filesScanned, 2);
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

test("an arrow function in an attribute does not end the tag for clickable-div and img-no-alt", () => {
  const rulesFor = (src) => scanSource(src, "a.tsx").map((f) => f.rule);
  assert.deepStrictEqual(rulesFor('<div onClick={() => go()} role="button" tabIndex={0}>x</div>\n'), []);
  assert.deepStrictEqual(rulesFor('<img src={src} onError={() => setBroken(true)} alt="Avatar" />\n'), []);
  // Still reported when the attribute really is missing.
  assert.deepStrictEqual(rulesFor("<div onClick={() => go()}>x</div>\n"), ["clickable-div"]);
  assert.deepStrictEqual(rulesFor("<img src={src} onError={() => setBroken(true)} />\n"), ["img-no-alt"]);
});

test("unverified-claim allows one adjective between the number and the noun", () => {
  const rulesFor = (src) => scanSource(src, "a.tsx").map((f) => f.rule);
  assert.deepStrictEqual(rulesFor("<p>Join 10,000+ customers</p>\n"), ["unverified-claim"]);
  assert.deepStrictEqual(rulesFor("<p>Join 10,000+ happy customers</p>\n"), ["unverified-claim"]);
  assert.deepStrictEqual(rulesFor("<p>Trusted by 5,000 growing teams</p>\n"), ["unverified-claim"]);
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

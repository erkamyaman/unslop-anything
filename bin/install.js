#!/usr/bin/env node
const fs = require("fs");
const os = require("os");
const path = require("path");

const args = process.argv.slice(2);

if (args[0] === "detect") {
  process.exitCode = require("../scripts/detect.js").main(args.slice(1));
  return;
}

const usage = "Usage:\n  npx unslopovich [--dir <skills folder>]   install the skill\n  npx unslopovich detect [paths...]         scan mobile and web source for slop";

if (args.includes("--help") || args.includes("-h")) {
  console.log(usage);
  return;
}

const flag = args.indexOf("--dir");

if (flag !== -1 && !args[flag + 1]) {
  console.error(usage);
  process.exit(1);
}

const base =
  flag !== -1
    ? path.resolve(args[flag + 1].replace(/^~(?=$|\/)/, os.homedir()))
    : path.join(os.homedir(), ".claude", "skills");
const dest = path.join(base, "unslopovich");
const root = path.join(__dirname, "..");

fs.mkdirSync(dest, { recursive: true });
fs.copyFileSync(path.join(root, "SKILL.md"), path.join(dest, "SKILL.md"));
for (const dir of ["reference", "scripts"]) {
  fs.rmSync(path.join(dest, dir), { recursive: true, force: true });
  fs.cpSync(path.join(root, dir), path.join(dest, dir), { recursive: true });
}

console.log(`Dr. Unslopovich will see you now.\nInstalled to ${dest}\nNext, ask your agent: /unslopovich review my app`);

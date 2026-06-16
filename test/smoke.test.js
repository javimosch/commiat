const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..");
const SRC = path.join(ROOT, "src");

const ALL_SOURCE_FILES = [
  "cli.js",
  "config.js",
  "variables.js",
  "commands/mainAction.js",
  "commands/modelSelect.js",
  "commands/multiCommit.js",
  "commands/ollamaConfig.js",
  "commands/testLlm.js",
  "core/apiKey.js",
  "core/commitMessage.js",
  "core/constants.js",
  "core/editor.js",
  "core/gitHelpers.js",
  "core/globalStore.js",
  "core/leadPrompt.js",
  "core/llm.js",
  "core/promptSizing.js",
  "core/providerConfig.js",
  "core/userPrompts.js",
  "utils/git.js",
  "utils/multiCommit.js",
];

test("package.json has valid structure", () => {
  const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, "package.json"), "utf-8"));
  assert.ok(pkg.name, "missing name");
  assert.ok(pkg.version, "missing version");
  assert.ok(pkg.main, "missing main");
  assert.ok(pkg.bin, "missing bin");
  assert.ok(Object.keys(pkg.bin).length > 0, "bin must have entries");
});

test("package.json bin entries point to existing files", () => {
  const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, "package.json"), "utf-8"));
  for (const [name, binPath] of Object.entries(pkg.bin)) {
    assert.ok(name, `bin entry missing name`);
    const fullPath = path.join(ROOT, binPath);
    assert.ok(fs.existsSync(fullPath), `bin entry "${name}" -> "${binPath}" not found`);
  }
});

test("package.json main entry is defined", () => {
  const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, "package.json"), "utf-8"));
  assert.ok(pkg.main, "main entry missing");
  assert.equal(typeof pkg.main, "string");
});

test("cli.js has correct shebang", () => {
  const cliPath = path.join(SRC, "cli.js");
  const content = fs.readFileSync(cliPath, "utf-8");
  assert.ok(content.startsWith("#!/usr/bin/env node"), "shebang line missing or incorrect");
});

test("all source files exist", () => {
  for (const rel of ALL_SOURCE_FILES) {
    const fullPath = path.join(SRC, rel);
    assert.ok(fs.existsSync(fullPath), `missing source file: src/${rel}`);
  }
});

test("source directory structure matches expectations", () => {
  const dirs = ["commands", "core", "utils"].map(d => path.join(SRC, d));
  for (const d of dirs) {
    const stat = fs.statSync(d);
    assert.ok(stat.isDirectory(), `expected directory: ${d}`);
  }
});

test("no .js file in src is empty", () => {
  for (const rel of ALL_SOURCE_FILES) {
    if (rel === "cli.js") continue;
    const fullPath = path.join(SRC, rel);
    const content = fs.readFileSync(fullPath, "utf-8");
    assert.ok(content.trim().length > 0, `file is empty: src/${rel}`);
    assert.ok(content.includes("module.exports"), `file missing module.exports: src/${rel}`);
  }
});

test("all source modules can be required without error", () => {
  for (const rel of ALL_SOURCE_FILES) {
    if (rel === "cli.js") continue;
    const absPath = path.resolve(SRC, rel);
    assert.doesNotThrow(() => {
      require(absPath);
    }, `module failed to load: src/${rel}`);
  }
});

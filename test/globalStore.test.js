const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const os = require("os");
const path = require("path");

const { loadGlobalConfig, updateGlobalConfig, fsLogError } = require("../src/core/globalStore");

function withTempDir(fn) {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "commiat-test-"));
  try {
    return fn(tmp);
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
}

test("loadGlobalConfig creates empty file if missing", () => {
  withTempDir((tmp) => {
    const cfgPath = path.join(tmp, "config");
    delete process.env.GLOBAL_CONFIG_PATH;
    const originalEnv = process.env.GLOBAL_CONFIG_DIR;
    process.env.GLOBAL_CONFIG_DIR = tmp;
    const cfg = loadGlobalConfig();
    assert.deepEqual(cfg, {});
    assert.ok(fs.existsSync(cfgPath));
    process.env.GLOBAL_CONFIG_DIR = originalEnv;
  });
});

test("loadGlobalConfig parses dotenv-like file", () => {
  withTempDir((tmp) => {
    const cfgPath = path.join(tmp, "config");
    fs.writeFileSync(cfgPath, "KEY_A=value1\nKEY_B=\"quoted value\"\n");
    delete process.env.GLOBAL_CONFIG_PATH;
    const originalEnv = process.env.GLOBAL_CONFIG_DIR;
    process.env.GLOBAL_CONFIG_DIR = tmp;
    const cfg = loadGlobalConfig();
    assert.equal(cfg.KEY_A, "value1");
    assert.equal(cfg.KEY_B, "quoted value");
    process.env.GLOBAL_CONFIG_DIR = originalEnv;
  });
});

test("updateGlobalConfig updates and persists", () => {
  withTempDir((tmp) => {
    const cfgPath = path.join(tmp, "config");
    fs.writeFileSync(cfgPath, "OLD=old\n");
    delete process.env.GLOBAL_CONFIG_PATH;
    const originalEnv = process.env.GLOBAL_CONFIG_DIR;
    process.env.GLOBAL_CONFIG_DIR = tmp;
    updateGlobalConfig("NEW", "newval");
    const cfg = loadGlobalConfig();
    assert.equal(cfg.OLD, "old");
    assert.equal(cfg.NEW, "newval");
    process.env.GLOBAL_CONFIG_DIR = originalEnv;
  });
});

test("fsLogError appends structured log", () => {
  withTempDir((tmp) => {
    const logPath = path.join(tmp, "error.log");
    delete process.env.GLOBAL_CONFIG_DIR;
    process.env.GLOBAL_CONFIG_DIR = tmp;
    const err = new Error("boom");
    err.provider = "openrouter";
    err.responseStatus = 400;
    fsLogError(err);
    const log = fs.readFileSync(logPath, "utf-8");
    assert.ok(log.includes("boom"));
    assert.ok(log.includes("Provider: openrouter"));
    assert.ok(log.includes("Response Status: 400"));
    delete process.env.GLOBAL_CONFIG_DIR;
  });
});

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const os = require("os");
const path = require("path");

const MODULE_PATH = require.resolve("../src/core/globalStore");

function freshStore(homedir) {
  delete require.cache[MODULE_PATH];
  const origHome = process.env.HOME;
  process.env.HOME = homedir;
  const store = require("../src/core/globalStore");
  process.env.HOME = origHome;
  return store;
}

function withTempHomedir(fn) {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "commiat-test-"));
  const origHome = process.env.HOME;
  process.env.HOME = tmp;
  try {
    return fn(tmp);
  } finally {
    process.env.HOME = origHome;
    try { fs.rmSync(tmp, { recursive: true, force: true }); } catch { /* best-effort cleanup */ }
  }
}

function commiatDir(tmp) {
  return path.join(tmp, ".commiat");
}

function commiatConfig(tmp) {
  return path.join(commiatDir(tmp), "config");
}

test("loadGlobalConfig creates empty file if missing", () => {
  withTempHomedir((tmp) => {
    const { loadGlobalConfig } = freshStore(tmp);
    const cfg = loadGlobalConfig();
    assert.deepEqual(cfg, {});
    assert.ok(fs.existsSync(commiatConfig(tmp)));
  });
});

test("loadGlobalConfig parses dotenv-like file", () => {
  withTempHomedir((tmp) => {
    fs.mkdirSync(commiatDir(tmp), { recursive: true });
    fs.writeFileSync(commiatConfig(tmp), "KEY_A=value1\nKEY_B=\"quoted value\"\n");
    const { loadGlobalConfig } = freshStore(tmp);
    const cfg = loadGlobalConfig();
    assert.equal(cfg.KEY_A, "value1");
    assert.equal(cfg.KEY_B, "quoted value");
  });
});

test("loadGlobalConfig returns empty object for invalid content", () => {
  withTempHomedir((tmp) => {
    fs.mkdirSync(commiatDir(tmp), { recursive: true });
    fs.writeFileSync(commiatConfig(tmp), "\0invalid\x00bytes\x01here");
    const { loadGlobalConfig } = freshStore(tmp);
    const cfg = loadGlobalConfig();
    assert.deepEqual(cfg, {});
  });
});

test("loadGlobalConfig returns empty object on read failure", () => {
  withTempHomedir((tmp) => {
    fs.mkdirSync(commiatDir(tmp), { recursive: true });
    fs.writeFileSync(commiatConfig(tmp), "");
    fs.chmodSync(commiatConfig(tmp), 0o000);
    const { loadGlobalConfig } = freshStore(tmp);
    const cfg = loadGlobalConfig();
    assert.deepEqual(cfg, {});
    fs.chmodSync(commiatConfig(tmp), 0o644);
  });
});

test("updateGlobalConfig updates and persists", () => {
  withTempHomedir((tmp) => {
    fs.mkdirSync(commiatDir(tmp), { recursive: true });
    fs.writeFileSync(commiatConfig(tmp), "OLD=old\n");
    const store = freshStore(tmp);
    store.updateGlobalConfig("NEW", "newval");
    const store2 = freshStore(tmp);
    const cfg = store2.loadGlobalConfig();
    assert.equal(cfg.OLD, "old");
    assert.equal(cfg.NEW, "newval");
  });
});

test("updateGlobalConfig overwrites existing key", () => {
  withTempHomedir((tmp) => {
    fs.mkdirSync(commiatDir(tmp), { recursive: true });
    fs.writeFileSync(commiatConfig(tmp), "KEY=original\n");
    const store = freshStore(tmp);
    store.updateGlobalConfig("KEY", "overwritten");
    const store2 = freshStore(tmp);
    const cfg = store2.loadGlobalConfig();
    assert.equal(cfg.KEY, "overwritten");
  });
});

test("saveGlobalConfig handles empty object gracefully", () => {
  withTempHomedir((tmp) => {
    fs.mkdirSync(commiatDir(tmp), { recursive: true });
    const store1 = freshStore(tmp);
    store1.loadGlobalConfig();
    store1.saveGlobalConfig({});
    const store2 = freshStore(tmp);
    const cfg = store2.loadGlobalConfig();
    assert.deepEqual(cfg, {});
  });
});

test("saveGlobalConfig persists boolean and numeric values", () => {
  withTempHomedir((tmp) => {
    fs.mkdirSync(commiatDir(tmp), { recursive: true });
    const store = freshStore(tmp);
    store.saveGlobalConfig({ FLAG: true, COUNT: "42", EMPTY: "" });
    const store2 = freshStore(tmp);
    const cfg = store2.loadGlobalConfig();
    assert.equal(cfg.FLAG, "true");
    assert.equal(cfg.COUNT, "42");
    assert.equal(cfg.EMPTY, "");
  });
});

test("updateState and loadState round-trip", () => {
  withTempHomedir((tmp) => {
    fs.mkdirSync(commiatDir(tmp), { recursive: true });
    const store = freshStore(tmp);
    store.updateState("LAST_RUN", "2024-01-01");
    store.updateState("MODE", "interactive");
    const store2 = freshStore(tmp);
    const state = store2.loadState();
    assert.equal(state.LAST_RUN, "2024-01-01");
    assert.equal(state.MODE, "interactive");
  });
});

test("updateState overwrites existing state key", () => {
  withTempHomedir((tmp) => {
    fs.mkdirSync(commiatDir(tmp), { recursive: true });
    const store = freshStore(tmp);
    store.updateState("COUNTER", "1");
    store.updateState("COUNTER", "2");
    const store2 = freshStore(tmp);
    const state = store2.loadState();
    assert.equal(state.COUNTER, "2");
  });
});

test("saveState handles empty object", () => {
  withTempHomedir((tmp) => {
    fs.mkdirSync(commiatDir(tmp), { recursive: true });
    const store = freshStore(tmp);
    store.saveState({});
    const store2 = freshStore(tmp);
    const state = store2.loadState();
    assert.deepEqual(state, {});
  });
});

test("loadState returns empty object when state file missing", () => {
  withTempHomedir((tmp) => {
    fs.mkdirSync(commiatDir(tmp), { recursive: true });
    const store = freshStore(tmp);
    const state = store.loadState();
    assert.deepEqual(state, {});
  });
});

test("fsLogError appends structured log", () => {
  withTempHomedir((tmp) => {
    fs.mkdirSync(commiatDir(tmp), { recursive: true });
    const err = new Error("boom");
    err.provider = "openrouter";
    err.responseStatus = 400;
    freshStore(tmp).fsLogError(err);
    const logPath = path.join(commiatDir(tmp), "error.log");
    const log = fs.readFileSync(logPath, "utf-8");
    assert.ok(log.includes("boom"));
    assert.ok(log.includes("Provider: openrouter"));
    assert.ok(log.includes("Response Status: 400"));
  });
});

test("fsLogError includes optional fields when present", () => {
  withTempHomedir((tmp) => {
    fs.mkdirSync(commiatDir(tmp), { recursive: true });
    const err = new Error("network failure");
    err.provider = "openai";
    err.requestUrl = "https://api.openai.com/v1/chat";
    err.responseStatus = 429;
    err.responseData = { error: { message: "Rate limited" } };
    freshStore(tmp).fsLogError(err);
    const logPath = path.join(commiatDir(tmp), "error.log");
    const log = fs.readFileSync(logPath, "utf-8");
    assert.ok(log.includes("network failure"));
    assert.ok(log.includes("Provider: openai"));
    assert.ok(log.includes("Request URL: https://api.openai.com/v1/chat"));
    assert.ok(log.includes("Response Status: 429"));
    assert.ok(log.includes("Rate limited"));
  });
});

test("fsLogError works with minimal error (no extra fields)", () => {
  withTempHomedir((tmp) => {
    fs.mkdirSync(commiatDir(tmp), { recursive: true });
    freshStore(tmp).fsLogError(new Error("minimal"));
    const logPath = path.join(commiatDir(tmp), "error.log");
    const log = fs.readFileSync(logPath, "utf-8");
    assert.ok(log.includes("minimal"));
  });
});

test("fsLogError never throws even when logging fails", async () => {
  const tmp = "/nonexistent-commiat-test-dir";
  fs.mkdirSync(tmp, { recursive: true });
  fs.rmSync(tmp, { recursive: true, force: true });
  const store = freshStore(tmp);
  const err = new Error("test error");
  err.responseData = {};
  await store.fsLogError(err);
  assert.ok(true, "fsLogError must not throw on failure");
});

test("ensureGlobalConfigDirExists creates directory", () => {
  withTempHomedir((tmp) => {
    const dir = commiatDir(tmp);
    assert.ok(!fs.existsSync(dir));
    freshStore(tmp).ensureGlobalConfigDirExists();
    assert.ok(fs.existsSync(dir));
  });
});

test("ensureGlobalConfigFileExists creates config file", () => {
  withTempHomedir((tmp) => {
    const cfgPath = commiatConfig(tmp);
    assert.ok(!fs.existsSync(cfgPath));
    freshStore(tmp).ensureGlobalConfigFileExists();
    assert.ok(fs.existsSync(cfgPath));
  });
});

test("saveGlobalConfig ignores invalid config object", () => {
  withTempHomedir((tmp) => {
    fs.mkdirSync(commiatDir(tmp), { recursive: true });
    fs.writeFileSync(commiatConfig(tmp), "KEEP=1\n");
    const store = freshStore(tmp);
    store.saveGlobalConfig(null);
    store.saveGlobalConfig([]);
    const cfg = freshStore(tmp).loadGlobalConfig();
    assert.equal(cfg.KEEP, "1");
  });
});

test("saveGlobalConfig throws on write failure", () => {
  withTempHomedir((tmp) => {
    fs.mkdirSync(commiatDir(tmp), { recursive: true });
    const store = freshStore(tmp);
    store.loadGlobalConfig();
    const origWrite = fs.writeFileSync;
    fs.writeFileSync = () => {
      throw new Error("disk full");
    };
    try {
      assert.throws(
        () => store.saveGlobalConfig({ KEY: "value" }),
        /Error writing global config file.*disk full/,
      );
    } finally {
      fs.writeFileSync = origWrite;
    }
  });
});

test("saveState throws on write failure", () => {
  withTempHomedir((tmp) => {
    fs.mkdirSync(commiatDir(tmp), { recursive: true });
    const store = freshStore(tmp);
    store.loadState();
    const origWrite = fs.writeFileSync;
    fs.writeFileSync = () => {
      throw new Error("disk full");
    };
    try {
      assert.throws(
        () => store.saveState({ KEY: "value" }),
        /Error writing global state file.*disk full/,
      );
    } finally {
      fs.writeFileSync = origWrite;
    }
  });
});

test("saveState ignores invalid state object", () => {
  withTempHomedir((tmp) => {
    fs.mkdirSync(commiatDir(tmp), { recursive: true });
    const store = freshStore(tmp);
    store.updateState("KEY", "value");
    store.saveState(null);
    store.saveState("not-an-object");
    const state = freshStore(tmp).loadState();
    assert.equal(state.KEY, "value");
  });
});

test("fsLogError logs string errors", () => {
  withTempHomedir((tmp) => {
    fs.mkdirSync(commiatDir(tmp), { recursive: true });
    freshStore(tmp).fsLogError("plain string failure");
    const logPath = path.join(commiatDir(tmp), "error.log");
    const log = fs.readFileSync(logPath, "utf-8");
    assert.ok(log.includes("plain string failure"));
  });
});

test("module exports all expected members", () => {
  const store = freshStore(os.tmpdir());
  const expected = [
    "GLOBAL_CONFIG_DIR",
    "GLOBAL_CONFIG_PATH",
    "GLOBAL_STATE_PATH",
    "ensureGlobalConfigDirExists",
    "ensureGlobalConfigFileExists",
    "loadGlobalConfig",
    "saveGlobalConfig",
    "updateGlobalConfig",
    "loadState",
    "saveState",
    "updateState",
    "fsLogError",
  ];
  for (const key of expected) {
    assert.ok(key in store, `Missing export: ${key}`);
  }
});

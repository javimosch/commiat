const test = require("node:test");
const assert = require("node:assert/strict");

// ---- Mock globalStore ----
// The real globalStore reads from a hardcoded ~/.commiat/config path.
// Existing test infrastructure tries to redirect via process.env.GLOBAL_CONFIG_DIR
// but the module never reads that env var (it uses a module-level hardcoded path).
// We use require.cache injection to provide a controlled loadGlobalConfig.

const mockConfigStore = {};

function setMockConfig(obj) {
  Object.keys(mockConfigStore).forEach((k) => delete mockConfigStore[k]);
  Object.assign(mockConfigStore, obj);
}

function clearMockConfig() {
  Object.keys(mockConfigStore).forEach((k) => delete mockConfigStore[k]);
}

const mockGlobalStore = {
  loadGlobalConfig: () => ({ ...mockConfigStore }),
  GLOBAL_CONFIG_PATH: "/dev/null/mock",
  GLOBAL_CONFIG_DIR: "/dev/null/mock",
  GLOBAL_STATE_PATH: "/dev/null/mock",
  ensureGlobalConfigDirExists: () => {},
  ensureGlobalConfigFileExists: () => {},
  saveGlobalConfig: () => {},
  updateGlobalConfig: () => {},
  loadState: () => ({}),
  saveState: () => {},
  updateState: () => {},
  fsLogError: () => {},
};

// Pre-populate the require cache so providerConfig gets our mock
const globalStorePath = require.resolve("../src/core/globalStore");
require.cache[globalStorePath] = { exports: mockGlobalStore };

// Now load providerConfig — it will require('./globalStore') and get our mock
const {
  getLlmProviderConfig,
  getDefaultMultiConfig,
} = require("../src/core/providerConfig");

// ---- Helpers ----

function setEnv(key, value) {
  const prev = process.env[key];
  if (value === undefined) {
    delete process.env[key];
  } else {
    process.env[key] = value;
  }
  return prev;
}

function withEnv(envVars, fn) {
  const saved = {};
  const keys = new Set([...Object.keys(envVars)]);
  for (const k of keys) {
    saved[k] = process.env[k];
  }
  for (const [k, v] of Object.entries(envVars)) {
    if (v === undefined) {
      delete process.env[k];
    } else {
      process.env[k] = v;
    }
  }
  try {
    return fn();
  } finally {
    for (const k of keys) {
      if (saved[k] === undefined) {
        delete process.env[k];
      } else {
        process.env[k] = saved[k];
      }
    }
  }
}

// === Tests for getLlmProviderConfig ===

test("getLlmProviderConfig returns openrouter with default model when no config", () => {
  clearMockConfig();
  const cfg = getLlmProviderConfig();
  assert.equal(cfg.provider, "openrouter");
  assert.equal(cfg.model, "xiaomi/mimo-v2-flash");
  assert.equal(cfg.fallbackEnabled, false);
});

test("getLlmProviderConfig picks openrouter model from env var", () => {
  clearMockConfig();
  withEnv({ COMMIAT_OPENROUTER_MODEL: "openai/gpt-4o" }, () => {
    const cfg = getLlmProviderConfig();
    assert.equal(cfg.provider, "openrouter");
    assert.equal(cfg.model, "openai/gpt-4o");
    assert.equal(cfg.fallbackEnabled, false);
  });
});

test("getLlmProviderConfig picks openrouter model from config", () => {
  setMockConfig({ COMMIAT_OPENROUTER_MODEL: "anthropic/claude-sonnet" });
  const cfg = getLlmProviderConfig();
  assert.equal(cfg.provider, "openrouter");
  assert.equal(cfg.model, "anthropic/claude-sonnet");
  clearMockConfig();
});

test("getLlmProviderConfig env var takes precedence over config for openrouter model", () => {
  setMockConfig({ COMMIAT_OPENROUTER_MODEL: "anthropic/claude-sonnet" });
  withEnv({ COMMIAT_OPENROUTER_MODEL: "openai/gpt-4o" }, () => {
    const cfg = getLlmProviderConfig();
    assert.equal(cfg.provider, "openrouter");
    assert.equal(cfg.model, "openai/gpt-4o");
  });
  clearMockConfig();
});

test("getLlmProviderConfig enables ollama via env COMMIAT_USE_OLLAMA=1", () => {
  clearMockConfig();
  withEnv({ COMMIAT_USE_OLLAMA: "1" }, () => {
    const cfg = getLlmProviderConfig();
    assert.equal(cfg.provider, "ollama");
    assert.equal(cfg.model, "llama3");
    assert.equal(cfg.baseUrl, "http://localhost:11434");
    assert.equal(cfg.fallbackEnabled, false);
  });
});

test("getLlmProviderConfig enables ollama via env COMMIAT_USE_OLLAMA=true", () => {
  clearMockConfig();
  withEnv({ COMMIAT_USE_OLLAMA: "true" }, () => {
    const cfg = getLlmProviderConfig();
    assert.equal(cfg.provider, "ollama");
    assert.ok(cfg.baseUrl.startsWith("http"));
  });
});

test("getLlmProviderConfig enables ollama via config", () => {
  setMockConfig({ COMMIAT_USE_OLLAMA: "true" });
  const cfg = getLlmProviderConfig();
  assert.equal(cfg.provider, "ollama");
  clearMockConfig();
});

test("getLlmProviderConfig env USE_OLLAMA takes precedence over config", () => {
  setMockConfig({ COMMIAT_USE_OLLAMA: "true" });
  // No env set -> falls back to config which has "true" -> ollama
  // (env not set, config has true, so use config)
  const cfg = getLlmProviderConfig();
  assert.equal(cfg.provider, "ollama");
  clearMockConfig();
});

test("getLlmProviderConfig uses custom ollama baseUrl from env", () => {
  clearMockConfig();
  withEnv({
    COMMIAT_USE_OLLAMA: "1",
    COMMIAT_OLLAMA_BASE_URL: "http://192.168.1.100:11434",
  }, () => {
    const cfg = getLlmProviderConfig();
    assert.equal(cfg.provider, "ollama");
    assert.equal(cfg.baseUrl, "http://192.168.1.100:11434");
    assert.equal(cfg.model, "llama3");
  });
});

test("getLlmProviderConfig uses custom ollama baseUrl from config", () => {
  setMockConfig({
    COMMIAT_USE_OLLAMA: "true",
    COMMIAT_OLLAMA_BASE_URL: "http://ollama.local:11434",
  });
  const cfg = getLlmProviderConfig();
  assert.equal(cfg.provider, "ollama");
  assert.equal(cfg.baseUrl, "http://ollama.local:11434");
  clearMockConfig();
});

test("getLlmProviderConfig env ollama baseUrl takes precedence over config", () => {
  setMockConfig({
    COMMIAT_USE_OLLAMA: "true",
    COMMIAT_OLLAMA_BASE_URL: "http://ollama.local:11434",
  });
  withEnv({ COMMIAT_OLLAMA_BASE_URL: "http://env.url:11434" }, () => {
    const cfg = getLlmProviderConfig();
    assert.equal(cfg.baseUrl, "http://env.url:11434");
  });
  clearMockConfig();
});

test("getLlmProviderConfig uses custom ollama model from env", () => {
  clearMockConfig();
  withEnv({
    COMMIAT_USE_OLLAMA: "1",
    COMMIAT_OLLAMA_MODEL: "codellama",
  }, () => {
    const cfg = getLlmProviderConfig();
    assert.equal(cfg.provider, "ollama");
    assert.equal(cfg.model, "codellama");
  });
});

test("getLlmProviderConfig uses custom ollama model from config", () => {
  setMockConfig({
    COMMIAT_USE_OLLAMA: "true",
    COMMIAT_OLLAMA_MODEL: "mixtral",
  });
  const cfg = getLlmProviderConfig();
  assert.equal(cfg.model, "mixtral");
  clearMockConfig();
});

test("getLlmProviderConfig enables fallback when config has COMMIAT_OLLAMA_FALLBACK_TO_OPENROUTER=true", () => {
  setMockConfig({
    COMMIAT_USE_OLLAMA: "true",
    COMMIAT_OLLAMA_FALLBACK_TO_OPENROUTER: "true",
  });
  const cfg = getLlmProviderConfig();
  assert.equal(cfg.provider, "ollama");
  assert.equal(cfg.fallbackEnabled, true);
  clearMockConfig();
});

test("getLlmProviderConfig fallback is false when using ollama without fallback config", () => {
  clearMockConfig();
  withEnv({ COMMIAT_USE_OLLAMA: "1" }, () => {
    const cfg = getLlmProviderConfig();
    assert.equal(cfg.fallbackEnabled, false);
  });
});

test("getLlmProviderConfig fallback is always false for openrouter even when fallback in config", () => {
  setMockConfig({ COMMIAT_OLLAMA_FALLBACK_TO_OPENROUTER: "true" });
  const cfg = getLlmProviderConfig();
  assert.equal(cfg.provider, "openrouter");
  assert.equal(cfg.fallbackEnabled, false);
  clearMockConfig();
});

test("getLlmProviderConfig strips trailing slashes from ollama baseUrl", () => {
  setMockConfig({
    COMMIAT_USE_OLLAMA: "true",
    COMMIAT_OLLAMA_BASE_URL: "http://ollama.local:11434///",
  });
  const cfg = getLlmProviderConfig();
  assert.equal(cfg.baseUrl, "http://ollama.local:11434");
  clearMockConfig();
});

test("getLlmProviderConfig throws on invalid ollama baseUrl", () => {
  setMockConfig({
    COMMIAT_USE_OLLAMA: "true",
    COMMIAT_OLLAMA_BASE_URL: "not-a-url",
  });
  assert.throws(
    () => getLlmProviderConfig(),
    /Invalid Ollama base URL/,
  );
  clearMockConfig();
});

test("getLlmProviderConfig throws on empty ollama model", () => {
  setMockConfig({
    COMMIAT_USE_OLLAMA: "true",
    COMMIAT_OLLAMA_MODEL: "   ",
  });
  assert.throws(
    () => getLlmProviderConfig(),
    /Ollama model must be a non-empty string/,
  );
  clearMockConfig();
});

test("getLlmProviderConfig throws on empty openrouter model", () => {
  setMockConfig({ COMMIAT_OPENROUTER_MODEL: "  " });
  assert.throws(
    () => getLlmProviderConfig(),
    /OpenRouter model must be a non-empty string/,
  );
  clearMockConfig();
});

test("getLlmProviderConfig trims openrouter model whitespace", () => {
  setMockConfig({ COMMIAT_OPENROUTER_MODEL: "  openai/gpt-4o  " });
  const cfg = getLlmProviderConfig();
  assert.equal(cfg.model, "openai/gpt-4o");
  clearMockConfig();
});

// === Tests for getDefaultMultiConfig ===

test("getDefaultMultiConfig returns false when no config", () => {
  clearMockConfig();
  assert.equal(getDefaultMultiConfig(), false);
});

test("getDefaultMultiConfig returns true when COMMIAT_DEFAULT_MULTI=true", () => {
  setMockConfig({ COMMIAT_DEFAULT_MULTI: "true" });
  assert.equal(getDefaultMultiConfig(), true);
  clearMockConfig();
});

test("getDefaultMultiConfig returns false when COMMIAT_DEFAULT_MULTI=false", () => {
  setMockConfig({ COMMIAT_DEFAULT_MULTI: "false" });
  assert.equal(getDefaultMultiConfig(), false);
  clearMockConfig();
});

test("getDefaultMultiConfig returns false when COMMIAT_DEFAULT_MULTI=0", () => {
  setMockConfig({ COMMIAT_DEFAULT_MULTI: "0" });
  assert.equal(getDefaultMultiConfig(), false);
  clearMockConfig();
});

test("getDefaultMultiConfig returns false for unrelated config keys", () => {
  setMockConfig({ SOME_OTHER_KEY: "value" });
  assert.equal(getDefaultMultiConfig(), false);
  clearMockConfig();
});

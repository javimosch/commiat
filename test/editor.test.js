const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const os = require("os");
const path = require("path");
const childProcess = require("child_process");

const GLOBAL_STORE_PATH = require.resolve("../src/core/globalStore");
const EDITOR_PATH = require.resolve("../src/core/editor");

function freshEditor(tmpDir) {
  delete require.cache[GLOBAL_STORE_PATH];
  delete require.cache[EDITOR_PATH];
  process.env.GLOBAL_CONFIG_DIR = tmpDir;
  return require("../src/core/editor");
}

test("parseEditorCommand splits command and args", () => {
  const { parseEditorCommand } = require("../src/core/editor");
  assert.deepEqual(parseEditorCommand("code --wait"), {
    command: "code",
    args: ["--wait"],
  });
  assert.deepEqual(parseEditorCommand("  nano  "), { command: "nano", args: [] });
  assert.equal(parseEditorCommand(""), null);
  assert.equal(parseEditorCommand(null), null);
});

test("openConfigInEditor exits cleanly when spawn fails", () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "commiat-editor-"));
  fs.mkdirSync(tmpDir, { recursive: true });

  const spawnStub = childProcess.spawn;
  const exitStub = process.exit;
  let errorHandler;

  childProcess.spawn = () => ({
    on(event, cb) {
      if (event === "error") errorHandler = cb;
    },
  });

  const originalLog = console.log;
  const originalError = console.error;
  console.log = () => {};
  console.error = () => {};

  let exitCode;
  process.exit = (code) => {
    exitCode = code;
    throw new Error(`process.exit:${code}`);
  };

  try {
    const { openConfigInEditor } = freshEditor(tmpDir);
    openConfigInEditor();
    assert.equal(typeof errorHandler, "function");
    assert.throws(
      () => errorHandler(new Error("editor not found")),
      /process\.exit:1/,
    );
    assert.equal(exitCode, 1);
  } finally {
    childProcess.spawn = spawnStub;
    process.exit = exitStub;
    console.log = originalLog;
    console.error = originalError;
    delete require.cache[GLOBAL_STORE_PATH];
    delete require.cache[EDITOR_PATH];
    delete process.env.GLOBAL_CONFIG_DIR;
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

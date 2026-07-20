const test = require("node:test");
const assert = require("node:assert/strict");

const {
  getGitBranch,
  getGitBranchNumber,
  getStagedFiles,
  getRelevantFiles,
  getUntrackedFiles,
  stageFiles,
  extractNumberFromString,
} = require("../src/utils/git");

test("extractNumberFromString extracts leading number", () => {
  assert.equal(extractNumberFromString("123-feature"), "123");
  assert.equal(extractNumberFromString("456abc"), "456");
  assert.equal(extractNumberFromString("no-number"), "");
  assert.equal(extractNumberFromString(""), "");
  assert.equal(extractNumberFromString(null), "");
  assert.equal(extractNumberFromString(undefined), "");
});

test("getGitBranch parses simple branch name", async () => {
  const mockGit = {
    status: async () => ({ current: "main" }),
  };
  const branch = await getGitBranch(mockGit);
  assert.equal(branch, "main");
});

test("getGitBranchNumber returns number when branch starts with digits", async () => {
  const mockGit = {
    status: async () => ({ current: "123-feature" }),
    getGitBranch: async () => "123-feature",
  };
  // Stub console.log to avoid real git fallback logs
  const originalLog = console.log;
  console.log = () => {};
  try {
    const num = await getGitBranchNumber(mockGit);
    assert.equal(num, "123");
  } finally {
    console.log = originalLog;
  }
});

test("getGitBranch returns empty string when status.current is empty", async () => {
  const mockGit = {
    status: async () => ({ current: "" }),
  };
  const branch = await getGitBranch(mockGit);
  assert.equal(branch, "");
});

test("getGitBranchNumber returns empty string when no leading digits", async () => {
  const mockGit = {
    status: async () => ({ current: "no-number-here" }),
  };
  const originalLog = console.log;
  console.log = () => {};
  try {
    const num = await getGitBranchNumber(mockGit);
    assert.equal(num, "");
  } finally {
    console.log = originalLog;
  }
});

test("getStagedFiles returns files from diffSummary", async () => {
  const mockGit = {
    diffSummary: async () => ({ files: [{ file: "a.js" }, { file: "b.js" }] }),
  };
  const files = await getStagedFiles(mockGit);
  assert.deepEqual(files, ["a.js", "b.js"]);
});

test("getStagedFiles throws on git error", async () => {
  const mockGit = {
    diffSummary: async () => { throw new Error("git error"); },
  };
  await assert.rejects(
    () => getStagedFiles(mockGit),
    { message: /Failed to list staged files: git error/ },
  );
});

test("stageFiles does not throw on null files", async () => {
  await stageFiles(null);
});

test("stageFiles does not throw on undefined files", async () => {
  await stageFiles(undefined);
});

test("stageFiles does not throw on empty array", async () => {
  await stageFiles([]);
});

test("stageFiles adds files via mock git", async () => {
  let added = null;
  const mockGit = {
    add: async (files) => { added = files; },
  };
  await stageFiles(["a.js", "b.js"], mockGit);
  assert.deepEqual(added, ["a.js", "b.js"]);
});

test("stageFiles throws on git add failure", async () => {
  const mockGit = {
    add: async () => { throw new Error("permission denied"); },
  };
  await assert.rejects(
    () => stageFiles(["a.js"], mockGit),
    { message: /Failed to stage files: permission denied/ },
  );
});

test("stageFiles filters out non-string entries", async () => {
  let added = null;
  const mockGit = {
    add: async (files) => { added = files; },
  };
  await stageFiles(["a.js", null, "", 42], mockGit);
  assert.deepEqual(added, ["a.js"]);
});

test("getRelevantFiles works with null options", async () => {
  const files = await getRelevantFiles(null);
  assert.deepEqual(files, []);
});

test("getRelevantFiles works with undefined options", async () => {
  const files = await getRelevantFiles(undefined);
  assert.deepEqual(files, []);
});

test("getRelevantFiles throws for non-object options", async () => {
  await assert.rejects(
    () => getRelevantFiles("invalid"),
    { message: /options must be an object/ },
  );
  await assert.rejects(
    () => getRelevantFiles([]),
    { message: /options must be an object/ },
  );
});

test("getRelevantFiles includes untracked files when requested", async () => {
  const mockGit = {
    diffSummary: async () => ({ files: [{ file: "staged.js" }] }),
    raw: async () => "untracked.js\n",
  };
  const files = await getRelevantFiles({ untracked: true }, mockGit);
  assert.deepEqual(files.sort(), ["staged.js", "untracked.js"].sort());
});

test("getUntrackedFiles throws on git error", async () => {
  const mockGit = {
    raw: async () => { throw new Error("git error"); },
  };
  await assert.rejects(
    () => getUntrackedFiles(mockGit),
    { message: /Failed to list untracked files: git error/ },
  );
});

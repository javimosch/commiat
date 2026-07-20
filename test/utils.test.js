const test = require("node:test");
const assert = require("node:assert/strict");

const {
  getGitBranch,
  getGitBranchNumber,
  getStagedFiles,
  getRelevantFiles,
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

test("getStagedFiles returns empty array on git error", async () => {
  const mockGit = {
    diffSummary: async () => { throw new Error("git error"); },
  };
  const files = await getStagedFiles(mockGit);
  assert.deepEqual(files, []);
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

test("getRelevantFiles works with null options", async () => {
  const files = await getRelevantFiles(null);
  assert.deepEqual(files, []);
});

test("getRelevantFiles works with undefined options", async () => {
  const files = await getRelevantFiles(undefined);
  assert.deepEqual(files, []);
});

const test = require("node:test");
const assert = require("node:assert/strict");

const {
  getGitBranch,
  getGitBranchNumber,
  extractNumberFromString,
} = require("../src/utils/git");

test("extractNumberFromString extracts leading number", () => {
  assert.equal(extractNumberFromString("123-feature"), "123");
  assert.equal(extractNumberFromString("456abc"), "456");
  assert.equal(extractNumberFromString("no-number"), "");
  assert.equal(extractNumberFromString(""), "");
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

test("getGitBranchNumber returns empty string when no leading digits", async () => {
  const mockGit = {
    status: async () => ({ current: "feature-123" }),
    getGitBranch: async () => "feature-123",
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

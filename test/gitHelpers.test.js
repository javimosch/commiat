const test = require("node:test");
const assert = require("node:assert/strict");

const { ensureStagedFiles, runGitOperation } = require("../src/core/gitHelpers");

test("ensureStagedFiles returns diff when staged files exist", async () => {
  const mockGit = {
    diffSummary: async () => ({ files: [{ file: "a.js" }] }),
    diff: async () => "diff content",
  };
  const diff = await ensureStagedFiles(mockGit);
  assert.equal(diff, "diff content");
});

test("ensureStagedFiles throws when no staged files", async () => {
  const mockGit = {
    diffSummary: async () => ({ files: [] }),
    diff: async () => "should not be called",
  };
  await assert.rejects(
    () => ensureStagedFiles(mockGit),
    /No staged changes found to commit/,
  );
});

test("ensureStagedFiles throws when files field is missing", async () => {
  const mockGit = {
    diffSummary: async () => ({}),
    diff: async () => "should not be called",
  };
  await assert.rejects(
    () => ensureStagedFiles(mockGit),
    /No staged changes found to commit/,
  );
});

test("ensureStagedFiles throws when diff is not a string", async () => {
  const mockGit = {
    diffSummary: async () => ({ files: [{ file: "a.js" }] }),
    diff: async () => null,
  };
  await assert.rejects(
    () => ensureStagedFiles(mockGit),
    /unexpected response from git/,
  );
});

test("ensureStagedFiles wraps git errors", async () => {
  const mockGit = {
    diffSummary: async () => {
      throw new Error("git not found");
    },
  };
  await assert.rejects(
    () => ensureStagedFiles(mockGit),
    /Failed to get staged diff: git not found/,
  );
});

test("runGitOperation wraps errors with description", async () => {
  await assert.rejects(
    () =>
      runGitOperation("Failed to commit", async () => {
        throw new Error("hook failed");
      }),
    { message: "Failed to commit: hook failed" },
  );
});

test("runGitOperation returns operation result", async () => {
  const result = await runGitOperation("noop", async () => "ok");
  assert.equal(result, "ok");
});

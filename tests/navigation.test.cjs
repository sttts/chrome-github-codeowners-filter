const test = require("node:test");
const assert = require("node:assert/strict");
const {
  pullRequestKey,
  pullRequestRoute
} = require("../src/navigation.js");

test("diff-anchor navigation remains in the same pull request", () => {
  const firstFile = "https://github.com/example/project/pull/42/files#diff-first";
  const secondFile = "https://github.com/example/project/pull/42/files#diff-second";

  assert.equal(pullRequestKey(firstFile), pullRequestKey(secondFile));
  assert.notEqual(
    pullRequestKey(firstFile),
    pullRequestKey("https://github.com/example/project/pull/43/files")
  );
  assert.deepEqual(pullRequestRoute(firstFile), {
    owner: "example",
    name: "project",
    number: "42"
  });
});

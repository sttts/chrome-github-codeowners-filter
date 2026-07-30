const test = require("node:test");
const assert = require("node:assert/strict");
const {
  matchesOwnerFilter,
  mergeFileOwnership,
  ownersForPath,
  ownersFromLabel,
  ownersOwnedByCurrentUser,
  ownersFromTreeValue,
  parse,
  ruleForPath,
  tokenize
} = require("../src/codeowners.js");

test("tokenize supports escaped spaces", () => {
  assert.deepEqual(tokenize("docs/my\\ file.md @org/docs"), ["docs/my file.md", "@org/docs"]);
});

test("last matching CODEOWNERS rule wins", () => {
  const rules = parse(`
* @org/all
*.js @org/javascript
/src/security/ @org/security @alice
`);

  assert.deepEqual(ownersForPath("README.md", rules), ["@org/all"]);
  assert.deepEqual(ownersForPath("src/app.js", rules), ["@org/javascript"]);
  assert.deepEqual(ownersForPath("src/security/token.js", rules), ["@org/security", "@alice"]);
});

test("matching rule preserves its verbatim source and line", () => {
  const rules = parse("* @org/all\n  /src/security/   @org/security @alice");

  assert.deepEqual(
    {
      line: ruleForPath("src/security/token.js", rules).line,
      raw: ruleForPath("src/security/token.js", rules).raw
    },
    {
      line: 2,
      raw: "  /src/security/   @org/security @alice"
    }
  );
});

test("root patterns do not match nested paths", () => {
  const rules = parse("/docs/ @org/docs");

  assert.deepEqual(ownersForPath("docs/guide.md", rules), ["@org/docs"]);
  assert.deepEqual(ownersForPath("packages/docs/guide.md", rules), []);
});

test("double star matches zero or more directories", () => {
  const rules = parse("apps/**/test/*.ts @org/tests");

  assert.deepEqual(ownersForPath("apps/test/example.ts", rules), ["@org/tests"]);
  assert.deepEqual(ownersForPath("apps/web/test/example.ts", rules), ["@org/tests"]);
  assert.deepEqual(ownersForPath("apps/web/src/example.ts", rules), []);
});

test("inline comments and invalid negation are ignored", () => {
  const rules = parse(`
*.go @org/go # Go maintainers
!vendor/ @org/vendor
`);

  assert.equal(rules.length, 1);
  assert.deepEqual(ownersForPath("cmd/main.go", rules), ["@org/go"]);
});

test("invalid bracket patterns and ownerless rules are skipped", () => {
  const rules = parse(`
src/[ab].js @org/javascript
vendor/
\\#literal @org/literal
*.rs rust@example.com
`);

  assert.equal(rules.length, 1);
  assert.deepEqual(ownersForPath("src/main.rs", rules), ["rust@example.com"]);
});

test("GitHub badges with multiple owners are parsed", () => {
  const label = "Owned by @example/review-planner-codeowners and @example/review-operator-codeowners (from CODEOWNERS line 695)";

  assert.deepEqual(ownersFromLabel(label), [
    "@example/review-planner-codeowners",
    "@example/review-operator-codeowners"
  ]);
});

test("preview UI owner labels are parsed", () => {
  assert.deepEqual(ownersFromLabel("Code owners: @example/review-operator-codeowners"), [
    "@example/review-operator-codeowners"
  ]);
});

test("unambiguous groups owned by the current user are derived from GitHub labels", () => {
  assert.deepEqual(
    ownersOwnedByCurrentUser([
      "Owned by you along with @example/review-docs-codeowners (from CODEOWNERS line 700)"
    ]),
    ["@example/review-docs-codeowners"]
  );
  assert.deepEqual(
    ownersOwnedByCurrentUser([
      "Owned by you along with @example/review-backend-codeowners and @example/review-frontend-codeowners (from CODEOWNERS line 624)"
    ]),
    []
  );
  assert.deepEqual(
    ownersOwnedByCurrentUser([
      "Owned by you along with @example/review-backend-codeowners and @example/review-frontend-codeowners (from CODEOWNERS line 624)",
      "Owned by @example/review-frontend-codeowners (from CODEOWNERS line 630)"
    ]),
    ["@example/review-backend-codeowners"]
  );
});

test("file tree metadata supports multiple owners", () => {
  assert.deepEqual(
    ownersFromTreeValue("example/review-planner-codeowners,example/review-operator-codeowners"),
    [
      "@example/review-planner-codeowners",
      "@example/review-operator-codeowners"
    ]
  );
});

test("multi-select uses OR semantics for shared files", () => {
  const owners = ["@example/review-planner-codeowners", "@example/review-operator-codeowners"];

  assert.equal(matchesOwnerFilter(owners, new Set(["@example/review-planner-codeowners"])), true);
  assert.equal(matchesOwnerFilter(owners, new Set(["@example/review-operator-codeowners"])), true);
  assert.equal(matchesOwnerFilter(owners, new Set(["@example/review-runtime-codeowners"])), false);
});

test("tree-only files contribute owners while rendered diffs stay authoritative", () => {
  const treeFiles = [
    { path: "src/rendered.js", owners: ["@example/tree"] },
    { path: "src/tree-only.js", owners: ["@example/tree-only"] }
  ];
  const renderedFiles = [
    { path: "src/rendered.js", owners: ["@example/rendered"] }
  ];

  assert.deepEqual(mergeFileOwnership(treeFiles, renderedFiles), [
    { path: "src/rendered.js", owners: ["@example/rendered"] },
    { path: "src/tree-only.js", owners: ["@example/tree-only"] }
  ]);
});

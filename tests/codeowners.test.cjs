const test = require("node:test");
const assert = require("node:assert/strict");
const {
  matchesOwnerFilter,
  ownersForPath,
  ownersFromLabel,
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
  const label = "Owned by @ai-dynamo/dynamo-planner-codeowners and @ai-dynamo/dynamo-operator-codeowners (from CODEOWNERS line 695)";

  assert.deepEqual(ownersFromLabel(label), [
    "@ai-dynamo/dynamo-planner-codeowners",
    "@ai-dynamo/dynamo-operator-codeowners"
  ]);
});

test("preview UI owner labels are parsed", () => {
  assert.deepEqual(ownersFromLabel("Code owners: @ai-dynamo/dynamo-operator-codeowners"), [
    "@ai-dynamo/dynamo-operator-codeowners"
  ]);
});

test("file tree metadata supports multiple owners", () => {
  assert.deepEqual(
    ownersFromTreeValue("ai-dynamo/dynamo-planner-codeowners,ai-dynamo/dynamo-operator-codeowners"),
    [
      "@ai-dynamo/dynamo-planner-codeowners",
      "@ai-dynamo/dynamo-operator-codeowners"
    ]
  );
});

test("multi-select uses OR semantics for shared files", () => {
  const owners = ["@ai-dynamo/dynamo-planner-codeowners", "@ai-dynamo/dynamo-operator-codeowners"];

  assert.equal(matchesOwnerFilter(owners, new Set(["@ai-dynamo/dynamo-planner-codeowners"])), true);
  assert.equal(matchesOwnerFilter(owners, new Set(["@ai-dynamo/dynamo-operator-codeowners"])), true);
  assert.equal(matchesOwnerFilter(owners, new Set(["@ai-dynamo/dynamo-runtime-codeowners"])), false);
});

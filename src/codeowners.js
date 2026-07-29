(function exposeCodeowners(root, factory) {
  const api = factory();

  if (typeof module === "object" && module.exports) {
    module.exports = api;
  }

  root.GitHubCodeowners = api;
})(typeof globalThis === "object" ? globalThis : this, function createCodeownersApi() {
  "use strict";

  function tokenize(line) {
    const tokens = [];
    let token = "";
    let escaped = false;

    for (const character of line.trim()) {
      if (escaped) {
        token += character;
        escaped = false;
      } else if (character === "\\") {
        escaped = true;
      } else if (/\s/.test(character)) {
        if (token) {
          tokens.push(token);
          token = "";
        }
      } else {
        token += character;
      }
    }

    if (escaped) {
      token += "\\";
    }

    if (token) {
      tokens.push(token);
    }

    return tokens;
  }

  function globToRegexSource(pattern) {
    let source = "";

    for (let index = 0; index < pattern.length; index += 1) {
      const character = pattern[index];
      const next = pattern[index + 1];

      if (character === "*" && next === "*") {
        const following = pattern[index + 2];

        if (following === "/") {
          source += "(?:.*/)?";
          index += 2;
        } else {
          source += ".*";
          index += 1;
        }
      } else if (character === "*") {
        source += "[^/]*";
      } else if (character === "?") {
        source += "[^/]";
      } else {
        source += character.replace(/[|\\{}()[\]^$+?.]/g, "\\$&");
      }
    }

    return source;
  }

  function compilePattern(input) {
    if (!input || input.startsWith("!")) {
      return null;
    }

    const rootAnchored = input.startsWith("/");
    let pattern = rootAnchored ? input.slice(1) : input;
    const directoryPattern = pattern.endsWith("/");

    if (directoryPattern) {
      pattern += "**";
    }

    const containsSlash = pattern.includes("/");
    const prefix = rootAnchored || containsSlash ? "^" : "(?:^|.*/)";
    const suffix = directoryPattern ? "$" : "(?:/.*)?$";

    return new RegExp(`${prefix}${globToRegexSource(pattern)}${suffix}`);
  }

  function parse(text) {
    const rules = [];

    for (const [index, rawLine] of String(text).split(/\r?\n/).entries()) {
      const line = rawLine.trim();

      if (!line || line.startsWith("#") || line.startsWith("\\#")) {
        continue;
      }

      const tokens = tokenize(rawLine);
      const pattern = tokens.shift();
      const commentIndex = tokens.findIndex((token) => token.startsWith("#"));
      const owners = (commentIndex === -1 ? tokens : tokens.slice(0, commentIndex)).filter((owner) => {
        return owner.startsWith("@") || /^[^\s@]+@[^\s@]+$/.test(owner);
      });
      const regex = compilePattern(pattern);

      if (regex && owners.length && !pattern.includes("[") && !pattern.includes("]")) {
        rules.push({ pattern, owners, regex, line: index + 1, raw: rawLine });
      }
    }

    return rules;
  }

  function ruleForPath(path, rules) {
    let match = null;

    for (const rule of rules) {
      if (rule.regex.test(path)) {
        match = rule;
      }
    }

    return match;
  }

  function ownersForPath(path, rules) {
    return ruleForPath(path, rules)?.owners || [];
  }

  function ownersFromLabel(label) {
    if (!/\b(?:owned by|code\s*owners?|approvers?)\b/i.test(String(label))) {
      return [];
    }

    return String(label).match(/@[A-Za-z0-9_.-]+(?:\/[A-Za-z0-9_.-]+)?/g) || [];
  }

  function ownersFromTreeValue(value) {
    return [...new Set(String(value || "").split(/[,\s]+/).filter(Boolean).map((owner) => {
      return owner.startsWith("@") || owner.includes("@") ? owner : `@${owner}`;
    }))];
  }

  function matchesOwnerFilter(owners, selectedOwners) {
    return selectedOwners.size === 0 || owners.some((owner) => selectedOwners.has(owner));
  }

  return {
    compilePattern,
    matchesOwnerFilter,
    ownersFromLabel,
    ownersFromTreeValue,
    ownersForPath,
    parse,
    ruleForPath,
    tokenize
  };
});

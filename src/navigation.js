(function exposeNavigation(root, factory) {
  const api = factory();

  if (typeof module === "object" && module.exports) {
    module.exports = api;
  }

  root.GitHubNavigation = api;
})(typeof globalThis === "object" ? globalThis : this, function createNavigationApi() {
  "use strict";

  function pullRequestRoute(url) {
    const pathname = new URL(String(url), "https://github.com").pathname;
    const match = pathname.match(/^\/([^/]+)\/([^/]+)\/pull\/(\d+)\/(?:files|changes)(?:\/|$)/);

    return match
      ? { owner: match[1], name: match[2], number: match[3] }
      : null;
  }

  function pullRequestKey(url) {
    const route = pullRequestRoute(url);

    return route ? `${route.owner}/${route.name}/pull/${route.number}` : null;
  }

  return {
    pullRequestKey,
    pullRequestRoute
  };
});

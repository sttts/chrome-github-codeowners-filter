(function initializeExtension() {
  "use strict";

  const {
    matchesOwnerFilter,
    mergeFileOwnership,
    ownersForPath,
    ownersFromLabel,
    ownersOwnedByCurrentUser,
    ownersFromTreeValue,
    parse,
    ruleForPath
  } = globalThis.GitHubCodeowners;
  const {
    pullRequestKey,
    pullRequestRoute
  } = globalThis.GitHubNavigation;
  const OWNERLESS = "__without_owner__";
  const OWNER_BADGE_SELECTOR = [
    '[aria-label^="Owned by "]',
    '[aria-label^="Code owner" i]',
    '[aria-label^="Approver" i]'
  ].join(",");
  const FILE_CONTAINER_SELECTOR = [
    ".file",
    "[data-testid='file-diff']",
    "[data-testid='file-diff-container']",
    "[data-testid='diff-file']",
    "copilot-diff-entry[data-file-path]",
    "[data-file-path][data-tagsearch-path]"
  ].join(",");
  const FILE_HEADER_SELECTOR = [
    ".file-header",
    "[data-testid='file-header']",
    "[data-testid='file-diff-header']",
    "[data-testid='diff-file-header']",
    "[data-diff-header-wrapper='true']",
    "header"
  ].join(",");
  const PREVIEW_DIFF_ENTRY_SELECTOR = [
    "[class*='PullRequestDiffsList-module__diffEntry']",
    "[class*='PullRequestDiffsList'][class*='diffEntry']"
  ].join(",");
  const UI_ID = "ghco-filter";
  const state = {
    repository: null,
    rules: [],
    files: [],
    selectedOwners: new Set(),
    derivedOwners: new Set(),
    ownershipLabels: new Set(),
    baseRef: "HEAD",
    codeownersSource: null,
    observer: null,
    refreshTimer: null,
    menuOpen: false,
    toolbarAnchor: null,
    toolbarRoot: null,
    toolbarRow: null,
    toolbarPositionListenersInstalled: false,
    activePullRequest: pullRequestKey(location.href),
    lastUrl: location.href
  };

  function repositoryFromLocation() {
    const route = pullRequestRoute(location.href);

    return route ? { owner: route.owner, name: route.name } : null;
  }

  function baseRef() {
    const link = document.querySelector(".base-ref a");
    const title = link?.getAttribute("title") || "";
    const repositoryPrefix = `${state.repository.owner}/${state.repository.name}:`;

    if (title.startsWith(repositoryPrefix)) {
      return title.slice(repositoryPrefix.length);
    }

    const treePrefix = `/${state.repository.owner}/${state.repository.name}/tree/`;
    const href = link?.getAttribute("href") || "";

    return href.startsWith(treePrefix) ? decodeURIComponent(href.slice(treePrefix.length)) : "HEAD";
  }

  function codeownersLinkSources() {
    const candidates = [".github/CODEOWNERS", "CODEOWNERS", "docs/CODEOWNERS"];
    const { owner, name } = state.repository;
    const blobPrefix = `/${owner}/${name}/blob/`;
    const sources = [];

    for (const link of document.querySelectorAll('a[href*="/CODEOWNERS" i]')) {
      const url = new URL(link.href, location.origin);
      const path = candidates.find((candidate) => url.pathname.endsWith(`/${candidate}`));

      if (!path || !url.pathname.startsWith(blobPrefix)) {
        continue;
      }

      const ref = decodeURIComponent(url.pathname.slice(blobPrefix.length, -(path.length + 1)));
      const encodedPath = path.split("/").map(encodeURIComponent).join("/");
      const rawUrl = `https://raw.githubusercontent.com/${encodeURIComponent(owner)}/${encodeURIComponent(name)}/${encodeURIComponent(ref)}/${encodedPath}`;
      sources.push({ path, ref, url: rawUrl });
    }

    return [...new Map(sources.map((source) => [source.url, source])).values()];
  }

  async function fetchCodeowners() {
    const candidates = [".github/CODEOWNERS", "CODEOWNERS", "docs/CODEOWNERS"];
    const { owner, name } = state.repository;
    const sources = [
      ...codeownersLinkSources(),
      ...candidates.map((path) => {
        const ref = state.baseRef;
        const encodedPath = path.split("/").map(encodeURIComponent).join("/");

        return {
          path,
          ref,
          url: `https://raw.githubusercontent.com/${encodeURIComponent(owner)}/${encodeURIComponent(name)}/${encodeURIComponent(ref)}/${encodedPath}`
        };
      })
    ];

    for (const source of sources) {
      try {
        const response = await fetch(source.url, {
          credentials: "include",
          headers: { Accept: "text/plain" }
        });
        const contentType = response.headers.get("content-type") || "";

        if (response.ok && !contentType.includes("text/html")) {
          return { path: source.path, ref: source.ref, text: await response.text() };
        }
      } catch {
        // Try the next standard CODEOWNERS location.
      }
    }

    return null;
  }

  function candidateFileElements() {
    const selectors = [
      "#files .file",
      "#files [data-testid='file-diff']",
      "#files copilot-diff-entry[data-file-path]",
      "#files [data-file-path][data-tagsearch-path]",
      ".js-diff-progressive-container .file",
      "[data-testid='file-diff']",
      "[data-testid='file-diff-container']",
      "[data-testid='diff-file']",
      "copilot-diff-entry[data-file-path]"
    ];
    selectors.push(PREVIEW_DIFF_ENTRY_SELECTOR);
    const candidates = [...document.querySelectorAll(selectors.join(","))];

    // The preview UI changes its wrapper names frequently, but keeps the
    // accessible CODEOWNERS label on every owned file.
    for (const badge of document.querySelectorAll(OWNER_BADGE_SELECTOR)) {
      const container = fileContainerForBadge(badge);

      if (container) {
        candidates.push(container);
      }
    }

    return [...new Set(candidates)].filter((element) => {
      // Prefer the innermost file node. React often nests a file-diff inside a
      // virtualized layout item; keeping the outer node here can merge files.
      return !candidates.some((other) => other !== element && element.contains(other));
    });
  }

  function fileContainerForBadge(badge) {
    const explicitContainer = badge.closest(FILE_CONTAINER_SELECTOR);

    if (explicitContainer) {
      return explicitContainer;
    }

    const header = badge.closest([
      "header",
      "[data-testid='file-header']",
      "[data-testid='file-diff-header']",
      "[data-testid='diff-file-header']",
      "[data-diff-header-wrapper='true']"
    ].join(","));

    if (header?.parentElement) {
      let headerContainer = header.parentElement;

      while (headerContainer && headerContainer !== document.body) {
        const ownerBadges = headerContainer.querySelectorAll(OWNER_BADGE_SELECTOR);
        const hasDiffContent = headerContainer.querySelector("table, [role='grid'], [data-testid*='diff-line']");

        if (ownerBadges.length === 1 && hasDiffContent) {
          return headerContainer;
        }

        if (ownerBadges.length > 1) {
          break;
        }

        headerContainer = headerContainer.parentElement;
      }
    }

    let candidate = badge.parentElement;

    while (candidate && candidate !== document.body) {
      const ownerBadges = candidate.querySelectorAll(OWNER_BADGE_SELECTOR);
      const hasDiffContent = candidate.querySelector("table, [role='grid'], [data-testid*='diff-line']");
      const controls = [...candidate.querySelectorAll("button, [role='checkbox'], label")];
      const hasViewedControl = controls.some((control) => {
        const text = `${control.getAttribute("aria-label") || ""} ${control.textContent || ""}`;

        return /\bViewed\b/i.test(text);
      });

      if (ownerBadges.length === 1 && hasDiffContent && hasViewedControl) {
        return candidate;
      }

      if (ownerBadges.length > 1) {
        break;
      }

      candidate = candidate.parentElement;
    }

    return null;
  }

  function fileLayoutContainer(element) {
    if (element.matches(".file, copilot-diff-entry[data-file-path]")) {
      return element;
    }

    // The React preview reserves virtualized height on this outer entry.
    // Hiding its inner region leaves the complete estimated height as a gap.
    const previewEntry = element.closest(PREVIEW_DIFF_ENTRY_SELECTOR);

    if (previewEntry) {
      return previewEntry;
    }

    const previewRegion = element.closest("[role='region'][data-estimated-height]");

    if (previewRegion?.parentElement?.matches("[data-sticky-enabled]")) {
      return previewRegion.parentElement;
    }

    const badgeCount = element.querySelectorAll(OWNER_BADGE_SELECTOR).length;
    const ownPaths = new Set([
      element.dataset.path,
      element.dataset.filePath,
      element.dataset.tagsearchPath
    ].filter(Boolean));
    let target = element;

    // React's preview puts the actual diff inside several sizing wrappers.
    // Hiding only the diff leaves the wrapper's height behind as a large gap.
    for (let level = 0; level < 12; level += 1) {
      const parent = target.parentElement;

      if (!parent || parent.matches([
        "main",
        "[role='main']",
        "#files",
        "#files_bucket",
        "diff-file-filter",
        ".repository-content",
        "[data-testid='files-changed']",
        "[data-testid='file-list']"
      ].join(","))) {
        break;
      }

      const otherFiles = [...parent.querySelectorAll(FILE_CONTAINER_SELECTOR)].filter((candidate) => {
        return candidate !== element && !element.contains(candidate);
      });
      const otherHeaders = [...parent.querySelectorAll(FILE_HEADER_SELECTOR)].filter((header) => {
        return !element.contains(header);
      });
      const parentBadgeCount = parent.querySelectorAll(OWNER_BADGE_SELECTOR).length;
      const parentPaths = new Set(
        [...parent.querySelectorAll("[data-file-path], [data-tagsearch-path]")]
          .flatMap((node) => [node.dataset.filePath, node.dataset.tagsearchPath])
          .filter(Boolean)
      );
      const containsAnotherPath = ownPaths.size > 0
        && [...parentPaths].some((path) => !ownPaths.has(path));

      if (
        otherFiles.length
        || otherHeaders.length
        || (badgeCount && parentBadgeCount !== badgeCount)
        || containsAnotherPath
      ) {
        break;
      }

      target = parent;

      if (target.matches([
        "[role='listitem']",
        "[data-testid*='file-list-item' i]",
        "[data-testid*='virtualized-file' i]"
      ].join(","))) {
        break;
      }
    }

    return target;
  }

  function cleanPath(value) {
    if (!value) {
      return null;
    }

    const path = value.trim().replace(/^\/+/, "");

    return path && !path.includes("\n") && path.length < 1000 ? path : null;
  }

  function fileHeader(element) {
    return element.querySelector(FILE_HEADER_SELECTOR) || element;
  }

  function filePath(element) {
    const header = fileHeader(element);
    const directValues = [
      element.dataset.path,
      element.dataset.filePath,
      element.dataset.tagsearchPath,
      header.querySelector("[data-path]")?.dataset.path,
      header.querySelector("[data-file-path]")?.dataset.filePath,
      header.querySelector("[data-tagsearch-path]")?.dataset.tagsearchPath,
      header.querySelector(".file-info a[title]")?.title,
      header.querySelector("a.Link--primary[title]")?.title,
      header.querySelector("[data-testid*='file-name']")?.textContent,
      header.querySelector("[class*='file-path-section']")?.textContent,
      header.querySelector("clipboard-copy[value]")?.getAttribute("value")
    ];

    for (const value of directValues) {
      const path = cleanPath(value);

      if (path) {
        return path;
      }
    }

    const text = header.querySelector(".file-info")?.textContent?.trim();

    return cleanPath(text);
  }

  function approversFromDom(element) {
    const header = fileHeader(element);
    const owners = new Set();

    // GitHub exposes the authoritative CODEOWNERS result on the shield icon.
    for (const badge of header.querySelectorAll(OWNER_BADGE_SELECTOR)) {
      for (const owner of ownersFromLabel(badge.getAttribute("aria-label"))) {
        owners.add(owner);
      }
    }

    for (const link of header.querySelectorAll('a[href*="/teams/"], [data-code-owner], [data-approver]')) {
      const value = link.dataset.codeOwner || link.dataset.approver || link.textContent;
      const owner = value?.trim().split(/\s+/)[0];

      if (owner) {
        owners.add(owner.startsWith("@") ? owner : `@${owner}`);
      }
    }

    const match = header.textContent?.match(/\b(?:approvers?|code\s*owners?|owners?)\s*:\s*([^\n]+)/i);

    if (match) {
      for (const token of match[1].match(/@[A-Za-z0-9_.-]+(?:\/[A-Za-z0-9_.-]+)?/g) || []) {
        owners.add(token);
      }
    }

    return [...owners];
  }

  function normalizedOwner(owner) {
    return owner.toLocaleLowerCase();
  }

  function deriveCurrentUserOwners() {
    for (const badge of document.querySelectorAll(OWNER_BADGE_SELECTOR)) {
      const label = badge.getAttribute("aria-label");

      if (label) {
        state.ownershipLabels.add(label);
      }
    }

    state.derivedOwners = new Set(
      ownersOwnedByCurrentUser(state.ownershipLabels).map(normalizedOwner)
    );
  }

  function displayOwner(owner) {
    if (owner === OWNERLESS) {
      return "Without approver";
    }

    const name = owner.replace(/^@/, "").split("/").at(-1);

    return name.replace(/-codeowners$/, "");
  }

  function scanFiles() {
    const previousElements = new Set(state.files.flatMap((file) => [file.element, file.hideElement]));
    const files = [];

    for (const [index, element] of candidateFileElements().entries()) {
      const domApprovers = approversFromDom(element);
      const path = filePath(element) || (domApprovers.length ? `__github_diff_${index}` : null);

      if (!path) {
        continue;
      }

      const codeowners = ownersForPath(path, state.rules);
      const authoritativeOwners = domApprovers.length ? domApprovers : codeowners;
      const owners = [...new Set(authoritativeOwners.map(normalizedOwner))];
      files.push({
        element,
        hideElement: fileLayoutContainer(element),
        path,
        owners: owners.length ? owners : [OWNERLESS]
      });
      previousElements.delete(element);
      previousElements.delete(files.at(-1).hideElement);
    }

    for (const staleElement of previousElements) {
      staleElement.classList.remove("ghco-hidden");
    }

    state.files = files;
    deriveCurrentUserOwners();
  }

  function allOwners() {
    const counts = new Map();

    for (const file of mergeFileOwnership(treeFileOwnership(), state.files)) {
      for (const owner of file.owners) {
        counts.set(owner, (counts.get(owner) || 0) + 1);
      }
    }

    return [...counts.entries()].sort(([left], [right]) => {
      if (left === OWNERLESS) return 1;
      if (right === OWNERLESS) return -1;
      return left.localeCompare(right);
    });
  }

  function visibleByFilter(file) {
    return matchesOwnerFilter(file.owners, state.selectedOwners);
  }

  function codeownersLineHref(line, githubLink) {
    if (githubLink) {
      const url = new URL(githubLink.href, location.origin);
      url.hash = line ? `L${line}` : "";

      return url.href;
    }

    if (!line || !state.codeownersSource) {
      return null;
    }

    const { owner, name } = state.repository;
    const ref = encodeURIComponent(state.baseRef);
    const source = state.codeownersSource.split("/").map(encodeURIComponent).join("/");

    return `/${encodeURIComponent(owner)}/${encodeURIComponent(name)}/blob/${ref}/${source}#L${line}`;
  }

  function codeownersLinkForBadge(header, badge) {
    const links = [...header.querySelectorAll('a[href*="/CODEOWNERS" i]')];
    const badgeId = badge.id;

    if (badgeId) {
      const linked = links.find((link) => {
        const ids = `${link.getAttribute("aria-labelledby") || ""} ${link.getAttribute("aria-describedby") || ""}`
          .split(/\s+/);

        return ids.includes(badgeId);
      });

      if (linked) {
        return linked;
      }
    }

    return badge.previousElementSibling?.matches?.('a[href*="/CODEOWNERS" i]')
      ? badge.previousElementSibling
      : links[0] || null;
  }

  function codeownersReasons(file, header) {
    const pathRule = ruleForPath(file.path, state.rules);
    const reasons = [];

    for (const badge of header.querySelectorAll(OWNER_BADGE_SELECTOR)) {
      const label = badge.getAttribute("aria-label") || "";
      const githubLink = codeownersLinkForBadge(header, badge);
      const linkedLine = Number(githubLink?.hash.match(/^#L(\d+)/i)?.[1]) || null;
      const githubLine = Number(label.match(/\bline\s+(\d+)\b/i)?.[1]) || linkedLine;
      const matchedRule = state.rules.find((rule) => rule.line === githubLine) || pathRule;
      const owners = ownersFromLabel(label).map(normalizedOwner);

      reasons.push({
        owners: owners.length ? owners : (matchedRule?.owners || []).map(normalizedOwner),
        line: matchedRule?.line || githubLine || null,
        raw: matchedRule?.raw || null,
        href: codeownersLineHref(matchedRule?.line || githubLine, githubLink)
      });
    }

    if (!reasons.length && pathRule) {
      reasons.push({
        owners: pathRule.owners.map(normalizedOwner),
        line: pathRule.line,
        raw: pathRule.raw,
        href: codeownersLineHref(pathRule.line, null)
      });
    }

    const fileOwners = file.owners.filter((owner) => owner !== OWNERLESS);

    if (reasons.length === 1) {
      reasons[0].owners = [...new Set([...reasons[0].owners, ...fileOwners])];
    }

    const mergedReasons = new Map();

    for (const reason of reasons) {
      const key = `${reason.line || ""}\n${reason.raw || ""}\n${reason.href || ""}`;
      const existing = mergedReasons.get(key);

      if (existing) {
        existing.owners = [...new Set([...existing.owners, ...reason.owners])];
      } else {
        mergedReasons.set(key, reason);
      }
    }

    return [...mergedReasons.values()];
  }

  function diffStatsElement(header) {
    const elements = [...header.querySelectorAll("span, div")].filter((element) => {
      return !element.closest(".ghco-file-owner");
    });
    const additions = elements.find((element) => {
      return /^\s*\+\s*\d+\s*$/.test(element.textContent || "")
        && ![...element.querySelectorAll("span, div")].some((child) => {
          return /^\s*\+\s*\d+\s*$/.test(child.textContent || "");
        });
    });

    // In the React preview the numeric stats and the colored diffstat are
    // separate siblings. Anchor to +N so the owner badge sits left of both.
    if (additions) {
      return additions;
    }

    const combinedStats = elements.find((element) => {
      return /^\s*\+\s*\d+\s*[−-]\s*\d+\s*$/.test(element.textContent || "")
        && !elements.some((other) => {
          return other !== element
            && element.contains(other)
            && /^\s*\+\s*\d+\s*[−-]\s*\d+\s*$/.test(other.textContent || "");
        });
    });

    if (combinedStats) {
      return combinedStats;
    }

    const explicit = header.querySelector([
      ".diffstat",
      "[data-testid='diff-stats']",
      "[data-testid*='diffstat' i]",
      "[data-testid*='diff-stats' i]",
      "[data-testid*='line-stats' i]",
      "[aria-label*='additions' i][aria-label*='deletions' i]"
    ].join(","));

    if (explicit) {
      return explicit;
    }

    return null;
  }

  function ownerPopup(file, header, tooltip) {
    const popup = document.createElement("span");
    popup.className = "ghco-file-owner-popup";
    popup.setAttribute("role", "tooltip");
    const heading = document.createElement("strong");
    heading.textContent = "Why this file is owned";
    popup.append(heading);

    const reasons = codeownersReasons(file, header);
    const fileOwners = file.owners.filter((owner) => owner !== OWNERLESS);

    if (!fileOwners.length) {
      const fallback = document.createElement("span");
      fallback.className = "ghco-file-owner-reason";
      fallback.textContent = "No matching CODEOWNERS rule found.";
      popup.append(fallback);
    } else {
      for (const owner of fileOwners) {
        const ownerSection = document.createElement("span");
        ownerSection.className = "ghco-file-owner-reasons";
        const ownerLabel = document.createElement("strong");
        ownerLabel.className = "ghco-file-owner-handle";
        ownerLabel.textContent = owner;
        ownerSection.append(ownerLabel);
        const ownerReasons = reasons.filter((reason) => reason.owners.includes(owner));

        for (const reason of ownerReasons) {
          const ruleLink = document.createElement(reason.href ? "a" : "span");
          ruleLink.className = "ghco-file-owner-rule";

          if (reason.href) {
            ruleLink.href = reason.href;
            ruleLink.target = "_blank";
            ruleLink.rel = "noopener noreferrer";
          }

          const rule = document.createElement("code");
          rule.textContent = reason.raw || "CODEOWNERS rule unavailable";
          const reference = document.createElement("span");
          reference.textContent = reason.line
            ? `${state.codeownersSource || "CODEOWNERS"} · line ${reason.line}`
            : "CODEOWNERS";
          ruleLink.append(rule, reference);
          ownerSection.append(ruleLink);
        }

        if (!ownerReasons.length) {
          const unavailable = document.createElement("span");
          unavailable.className = "ghco-file-owner-reason";
          unavailable.textContent = "No matching CODEOWNERS rule found.";
          ownerSection.append(unavailable);
        }

        popup.append(ownerSection);
      }
    }

    popup.setAttribute("aria-label", tooltip);

    return popup;
  }

  function renderFileOwnerBadges() {
    for (const file of state.files) {
      const header = fileHeader(file.element);
      const ownerNames = file.owners.filter((owner) => owner !== OWNERLESS).map(displayOwner);
      const label = ownerNames.length
        ? `Owner: ${ownerNames.join(", ")}`
        : "Owner: —";
      const tooltip = ownerNames.length
        ? `CODEOWNER:\n${file.owners.join("\n")}`
        : "No CODEOWNER or approver detected";
      const reasons = codeownersReasons(file, header);
      const signature = `${label}\n${tooltip}\n${JSON.stringify(reasons)}`;
      let badge = header.querySelector(".ghco-file-owner");

      if (!badge) {
        badge = document.createElement("span");
        badge.className = "ghco-file-owner";
        badge.tabIndex = 0;
        badge.addEventListener("click", (event) => event.stopPropagation());
      }

      if (badge.dataset.signature !== signature) {
        const labelElement = document.createElement("span");
        labelElement.className = "ghco-file-owner-label";
        labelElement.textContent = label;
        badge.dataset.signature = signature;
        badge.setAttribute("aria-label", tooltip.replace(/\n/g, " "));
        badge.replaceChildren(labelElement, ownerPopup(file, header, tooltip));
      }

      const diffStats = diffStatsElement(header);
      const actions = header.querySelector([
        ".file-actions",
        ".file-header-actions",
        "[data-testid='file-actions']",
        "[data-testid*='file-header-actions' i]"
      ].join(","));

      if (diffStats) {
        if (badge.nextElementSibling !== diffStats) {
          diffStats.insertAdjacentElement("beforebegin", badge);
        }
      } else if (actions) {
        if (badge.parentElement !== actions || badge !== actions.firstElementChild) {
          actions.prepend(badge);
        }
      } else if (!badge.isConnected) {
          header.append(badge);
      }
    }
  }

  function fileTreeRoots() {
    return [...new Set(document.querySelectorAll([
      "file-tree [role='tree']",
      "[role='tree'][aria-label*='file' i]",
      "[data-testid*='file-tree' i] [role='tree']",
      "[aria-label*='file tree' i] [role='tree']"
    ].join(",")))];
  }

  function treeItemPath(item) {
    const pathNode = item.querySelector([
      "[data-file-path]",
      "[data-path]",
      "[data-tagsearch-path]",
      "[data-filterable-item-text]"
    ].join(","));
    const directValues = [
      item.dataset.filePath,
      item.dataset.path,
      item.dataset.tagsearchPath,
      item.dataset.filterableItemText,
      pathNode?.dataset.filePath,
      pathNode?.dataset.path,
      pathNode?.dataset.tagsearchPath,
      pathNode?.dataset.filterableItemText
    ];

    for (const value of directValues) {
      const path = cleanPath(value);

      if (path) {
        return path;
      }
    }

    const payload = item.getAttribute("data-hydro-click-payload");

    if (payload) {
      try {
        const path = cleanPath(JSON.parse(payload)?.payload?.data?.path);

        if (path) {
          return path;
        }
      } catch {
        // Fall through to the diff-anchor mapping.
      }
    }

    const anchor = item.querySelector('a[href^="#"]');
    const diffId = anchor?.hash ? decodeURIComponent(anchor.hash.slice(1)) : null;
    const diffElement = diffId ? document.getElementById(diffId) : null;
    const file = diffElement && state.files.find((entry) => {
      return entry.element === diffElement
        || entry.element.contains(diffElement)
        || diffElement.contains(entry.element);
    });

    if (file?.path) {
      return file.path;
    }

    return cleanPath(
      pathNode?.getAttribute("aria-label")
      || pathNode?.getAttribute("title")
      || pathNode?.textContent
    );
  }

  function treeItemOwners(item, path) {
    const ownerNode = item.matches("[data-codeowners], [data-code-owners], [data-approvers]")
      ? item
      : item.querySelector("[data-codeowners], [data-code-owners], [data-approvers]");
    const ownerText = ownerNode?.dataset.codeowners
      || ownerNode?.dataset.codeOwners
      || ownerNode?.dataset.approvers;

    if (ownerText) {
      return ownersFromTreeValue(ownerText).map(normalizedOwner);
    }

    const scannedFile = path && state.files.find((file) => file.path === path);

    if (scannedFile) {
      return scannedFile.owners;
    }

    if (path && state.rules.length) {
      const owners = ownersForPath(path, state.rules).map(normalizedOwner);

      return owners.length ? owners : [OWNERLESS];
    }

    return null;
  }

  function treeItemContainer(item) {
    return item.tagName === "LI" ? item : item.closest("li") || item;
  }

  function isTreeDirectory(item, container) {
    return item.dataset.treeEntryType === "directory"
      || item.hasAttribute("aria-expanded")
      || Boolean(container.querySelector(":scope > [role='group'], :scope > ul[role='group']"));
  }

  function treeFileOwnership() {
    const files = [];

    for (const root of fileTreeRoots()) {
      for (const item of root.querySelectorAll("[role='treeitem']")) {
        const container = treeItemContainer(item);

        if (isTreeDirectory(item, container)) {
          continue;
        }

        const path = treeItemPath(item);
        const owners = treeItemOwners(item, path);

        if (path && owners) {
          files.push({ path, owners });
        }
      }
    }

    return files;
  }

  function clearTreeFilter() {
    for (const element of document.querySelectorAll(".ghco-tree-hidden")) {
      element.classList.remove("ghco-tree-hidden");
    }
  }

  function applyTreeFilter() {
    clearTreeFilter();

    if (state.selectedOwners.size === 0) {
      return;
    }

    for (const root of fileTreeRoots()) {
      const entries = [...root.querySelectorAll("[role='treeitem']")].map((item) => {
        const container = treeItemContainer(item);

        return {
          item,
          container,
          directory: isTreeDirectory(item, container)
        };
      });
      const files = entries.filter((entry) => !entry.directory);

      for (const entry of files) {
        const path = treeItemPath(entry.item);
        const owners = treeItemOwners(entry.item, path);
        const show = owners === null || matchesOwnerFilter(owners, state.selectedOwners);

        entry.container.classList.toggle("ghco-tree-hidden", !show);
      }

      // Work from the deepest directory upwards so empty parent directories
      // disappear after their filtered children.
      for (const entry of entries.filter((candidate) => candidate.directory).reverse()) {
        const descendants = files.filter((file) => {
          return file.container !== entry.container && entry.container.contains(file.item);
        });

        if (descendants.length) {
          const hasVisibleFile = descendants.some((file) => {
            return !file.container.classList.contains("ghco-tree-hidden");
          });
          entry.container.classList.toggle("ghco-tree-hidden", !hasVisibleFile);
        }
      }
    }
  }

  function applyFilter() {
    renderFileOwnerBadges();

    for (const file of state.files) {
      const show = visibleByFilter(file);
      file.hideElement.classList.toggle("ghco-hidden", !show);
      file.element.dataset.ghcoOwners = file.owners.join(",");
    }

    applyTreeFilter();
  }

  function button(label, className, onClick, attributes = {}) {
    const element = document.createElement("button");
    element.type = "button";
    element.className = className;
    element.textContent = label;
    Object.assign(element.dataset, attributes);
    element.addEventListener("click", onClick);

    return element;
  }

  function setSelectedOwners(owners) {
    state.selectedOwners = new Set(owners);
    render();
  }

  function selectOnlyMine() {
    const availableOwners = new Set(allOwners().map(([owner]) => owner));
    state.selectedOwners = new Set(
      [...state.derivedOwners].filter((owner) => availableOwners.has(owner))
    );
    document.querySelector(`#${UI_ID} .ghco-owner-filter`)?.removeAttribute("open");
    state.menuOpen = false;
    render();
  }

  function ownerChip(owner, count) {
    const selected = state.selectedOwners.has(owner);
    const chip = button(`${displayOwner(owner)} ${count}`, "ghco-chip", () => {
      if (selected) {
        state.selectedOwners.delete(owner);
      } else {
        state.selectedOwners.add(owner);
      }

      render();
    });
    chip.classList.toggle("ghco-chip-selected", selected);
    chip.setAttribute("aria-pressed", String(selected));
    chip.title = owner === OWNERLESS
      ? `${count} changed file${count === 1 ? "" : "s"} without a detected approver`
      : `${owner} · ${count} changed file${count === 1 ? "" : "s"}`;

    return chip;
  }

  function accessibleControlText(control) {
    const labelledBy = (control.getAttribute("aria-labelledby") || "")
      .split(/\s+/)
      .map((id) => document.getElementById(id)?.textContent || "")
      .join(" ");

    return [
      control.getAttribute("aria-label"),
      control.getAttribute("title"),
      control.dataset.testid,
      labelledBy,
      control.textContent
    ].filter(Boolean).join(" ");
  }

  function nativeFilesScope() {
    return document.querySelector([
      "[data-testid='files-changed']",
      "#files_bucket",
      "#files",
      ".repository-content"
    ].join(",")) || document;
  }

  function nativeFileSearchInput() {
    return [...nativeFilesScope().querySelectorAll("input")].find((input) => {
      const text = [
        input.getAttribute("aria-label"),
        input.getAttribute("placeholder"),
        input.getAttribute("name")
      ].filter(Boolean).join(" ");

      return /\b(?:filter|search)\b.*\bfiles?\b|\bfiles?\b.*\b(?:filter|search)\b/i.test(text);
    }) || null;
  }

  function nativeFileFilterButton() {
    const scope = nativeFilesScope();
    const buttons = [...scope.querySelectorAll("button, summary[role='button'], summary[aria-haspopup='true']")];
    const exact = buttons.find((control) => {
      const text = accessibleControlText(control);

      return /\b(?:filter files|file filter|files filter|dateien filtern)\b/i.test(text)
        || /(?:^|[-_])file[-_]?filter(?:$|[-_])/i.test(control.dataset.testid || "");
    });

    if (exact) {
      return exact;
    }

    const iconButton = buttons.find((control) => {
      return control.querySelector("svg.octicon-filter, svg[class*='filter' i]")
        && !control.closest(`#${UI_ID}`);
    });

    if (iconButton) {
      return iconButton;
    }

    const fileSearch = nativeFileSearchInput();

    return fileSearch?.parentElement?.parentElement?.querySelector("button") || null;
  }

  function clearToolbarReservation() {
    if (!state.toolbarRow) {
      return;
    }

    state.toolbarRow.classList.remove("ghco-toolbar-row");
    state.toolbarRow.style.removeProperty("--ghco-original-padding-right");
    state.toolbarRow.style.removeProperty("--ghco-approver-width");
    state.toolbarRow = null;
  }

  function reserveToolbarSpace(root, nativeFilter) {
    const fileSearch = nativeFileSearchInput();

    if (!fileSearch) {
      return;
    }

    let row = nativeFilter.parentElement;

    for (let level = 0; level < 6 && row && !row.contains(fileSearch); level += 1) {
      row = row.parentElement;
    }

    if (!row?.contains(fileSearch)) {
      return;
    }

    const originalPaddingRight = getComputedStyle(row).paddingRight;
    row.style.setProperty("--ghco-original-padding-right", originalPaddingRight);
    row.style.setProperty("--ghco-approver-width", `${Math.ceil(root.getBoundingClientRect().width + 8)}px`);
    row.classList.add("ghco-toolbar-row");
    state.toolbarRow = row;
  }

  function positionToolbar() {
    const anchor = state.toolbarAnchor;
    const root = state.toolbarRoot;

    if (!anchor?.isConnected || !root?.isConnected) {
      return;
    }

    const anchorRect = anchor.getBoundingClientRect();
    const rootRect = root.getBoundingClientRect();
    const visible = anchorRect.width > 0 && anchorRect.height > 0;
    root.style.visibility = visible ? "" : "hidden";

    if (!visible) {
      return;
    }

    root.style.left = `${Math.round(anchorRect.right + 8)}px`;
    root.style.top = `${Math.round(anchorRect.top + (anchorRect.height - rootRect.height) / 2)}px`;
    root.classList.toggle("ghco-align-right", anchorRect.right + 448 > window.innerWidth);
  }

  function ensureToolbarPositionListeners() {
    if (state.toolbarPositionListenersInstalled) {
      return;
    }

    state.toolbarPositionListenersInstalled = true;
    window.addEventListener("resize", positionToolbar);
    window.addEventListener("scroll", positionToolbar, true);
  }

  function mountToolbar(root) {
    const nativeFilter = nativeFileFilterButton();

    if (nativeFilter?.parentElement) {
      root.classList.add("ghco-anchored");
      document.body.append(root);
      state.toolbarAnchor = nativeFilter;
      state.toolbarRoot = root;
      reserveToolbarSpace(root, nativeFilter);
      ensureToolbarPositionListeners();
      positionToolbar();
      requestAnimationFrame(positionToolbar);
      return;
    }

    state.toolbarAnchor = null;
    state.toolbarRoot = root;
    root.classList.add("ghco-floating");
    document.body.append(root);
  }

  function render() {
    const existingRoot = document.getElementById(UI_ID);

    if (existingRoot) {
      state.menuOpen = existingRoot.querySelector(".ghco-owner-filter")?.open || false;
      clearToolbarReservation();
      existingRoot.remove();
      state.toolbarRoot = null;
    }

    const owners = allOwners();

    if (!state.files.length && !owners.length) {
      return;
    }

    const root = document.createElement("div");
    root.id = UI_ID;
    root.setAttribute("aria-label", "CODEOWNERS file filter");

    const details = document.createElement("details");
    details.className = "ghco-owner-filter";
    details.open = state.menuOpen;
    details.addEventListener("toggle", () => {
      state.menuOpen = details.open;
    });
    const summary = document.createElement("summary");
    summary.className = "ghco-filter-summary";
    summary.classList.toggle("ghco-filter-summary-active", state.selectedOwners.size > 0);
    summary.setAttribute("aria-label", "Filter by CODEOWNER or approver");
    const summaryLabel = document.createElement("span");
    summaryLabel.textContent = state.selectedOwners.size === 0
      ? "Approver"
      : `Approver · ${state.selectedOwners.size}`;
    summary.append(summaryLabel);

    const panel = document.createElement("div");
    panel.className = "ghco-owner-panel";
    const firstRow = document.createElement("div");
    firstRow.className = "ghco-filter-row";
    const title = document.createElement("strong");
    title.textContent = "Approver filter";
    const allButton = button("All", "ghco-action", () => setSelectedOwners([]));
    allButton.classList.toggle("ghco-action-selected", state.selectedOwners.size === 0);

    const availableOwners = new Set(owners.map(([owner]) => owner));
    const mine = [...state.derivedOwners].filter((owner) => availableOwners.has(owner));
    const mineButton = button("Only mine", "ghco-action", selectOnlyMine);
    mineButton.disabled = mine.length === 0;
    mineButton.title = mine.length
      ? `Select detected groups: ${mine.map(displayOwner).join(", ")}`
      : "GitHub does not unambiguously identify one of your groups in this pull request.";
    const source = document.createElement("span");
    source.className = "ghco-source";
    source.textContent = state.codeownersSource
      ? `from ${state.codeownersSource} @ ${state.baseRef}`
      : "from the pull request view";
    firstRow.append(title, allButton, mineButton, source);

    const chips = document.createElement("div");
    chips.className = "ghco-chips";

    for (const [owner, count] of owners) {
      chips.append(ownerChip(owner, count));
    }

    panel.append(firstRow, chips);
    details.append(summary, panel);
    root.append(details);
    mountToolbar(root);

    const summaryRect = summary.getBoundingClientRect();
    root.classList.toggle("ghco-align-right", summaryRect.left + 440 > window.innerWidth);

    applyFilter();
  }

  function closeFilterOnOutsideClick(event) {
    const root = document.getElementById(UI_ID);

    if (!root || root.contains(event.target)) {
      return;
    }

    const filter = root.querySelector(".ghco-owner-filter");

    if (!filter?.open) {
      return;
    }

    filter.open = false;
    state.menuOpen = false;
  }

  function scheduleRefresh() {
    clearTimeout(state.refreshTimer);
    state.refreshTimer = setTimeout(() => {
      if (location.href !== state.lastUrl) {
        state.lastUrl = location.href;

        if (pullRequestKey(location.href) !== state.activePullRequest) {
          restart();
          return;
        }
      }

      scanFiles();
      render();
    }, 250);
  }

  function observePage() {
    state.observer?.disconnect();
    state.observer = new MutationObserver((mutations) => {
      const onlyOurUi = mutations.every((mutation) => {
        return [...mutation.addedNodes, ...mutation.removedNodes].every((node) => {
          return node.nodeType !== Node.ELEMENT_NODE
            || node.id === UI_ID
            || node.closest?.(`#${UI_ID}`)
            || node.matches?.(".ghco-file-owner")
            || node.closest?.(".ghco-file-owner");
        });
      });

      if (!onlyOurUi) {
        scheduleRefresh();
      }
    });
    state.observer.observe(document.body, { childList: true, subtree: true });
  }

  async function restart() {
    state.observer?.disconnect();
    document.getElementById(UI_ID)?.remove();
    clearTreeFilter();

    for (const file of state.files) {
      file.element.classList.remove("ghco-hidden");
      file.hideElement.classList.remove("ghco-hidden");
    }

    state.activePullRequest = pullRequestKey(location.href);
    state.repository = repositoryFromLocation();
    state.rules = [];
    state.files = [];
    state.selectedOwners.clear();
    state.derivedOwners.clear();
    state.ownershipLabels.clear();
    state.menuOpen = false;
    state.toolbarAnchor = null;
    state.toolbarRoot = null;
    clearToolbarReservation();

    if (!state.repository) {
      observePage();
      return;
    }

    state.baseRef = baseRef();
    const codeowners = await fetchCodeowners();
    state.codeownersSource = codeowners?.path || null;
    state.baseRef = codeowners?.ref || state.baseRef;
    state.rules = codeowners ? parse(codeowners.text) : [];
    scanFiles();
    render();
    observePage();
  }

  document.addEventListener("click", closeFilterOnOutsideClick);
  restart();
})();

# GitHub CODEOWNERS Filter

A small Chrome extension that filters changed files on a GitHub pull request’s **Files changed** page by approver or CODEOWNER group.

## Features

- reads `.github/CODEOWNERS`, `CODEOWNERS`, or `docs/CODEOWNERS` from the pull request’s base branch
- assigns each changed file according to GitHub’s “last matching rule wins” behavior
- filters by one or more groups using OR semantics
- filters the file tree at the same time and hides empty directories
- adds a compact owner badge to every diff, including a hover popup with the matching rule and CODEOWNERS line link
- also detects approver and code-owner information rendered by GitHub in the file header
- automatically derives “Only mine” groups from GitHub’s “Owned by you” labels
- detects direct `@username` ownership automatically
- works with GitHub’s dynamic pull request navigation and lazily loaded diffs

## Install from GitHub

### Download the packaged extension

1. Open the [latest release](https://github.com/sttts/chrome-github-codeowners-filter/releases/latest).
2. Download `chrome-github-codeowners-filter-<version>.zip`.
3. Extract the ZIP archive.
4. Open `chrome://extensions` in Chrome.
5. Enable **Developer mode** in the top-right corner.
6. Choose **Load unpacked**.
7. Select the extracted directory containing `manifest.json`.
8. Open a pull request and switch to the **Files changed** tab.

### Clone the repository

```sh
git clone https://github.com/sttts/chrome-github-codeowners-filter.git
```

1. Open `chrome://extensions` in Chrome.
2. Enable **Developer mode** in the top-right corner.
3. Choose **Load unpacked**.
4. Select the cloned `chrome-github-codeowners-filter` directory.
5. Open a pull request and switch to the **Files changed** tab.

After changing the extension, press its reload button on `chrome://extensions`, then reload the pull request page.

## Package locally

```sh
npm run package
```

The archive is written to `dist/chrome-github-codeowners-filter-<version>.zip`. It contains only the extension manifest and runtime sources.

## Usage

- Click a group to activate it; multiple active groups are combined using OR semantics.
- **All** resets the filter.
- **Only mine** shows groups GitHub identifies as yours plus direct `@username` ownership.

## MVP limitations

- The manifest is currently limited to `github.com`. A GitHub Enterprise host must be added explicitly to `host_permissions` and `content_scripts.matches`.
- “Only mine” can derive only groups represented by files in the current pull request; complete organization-wide team discovery would require GitHub API authentication.
- For very large pull requests, the extension filters files already loaded into GitHub’s DOM. Newly loaded files are picked up automatically.

## Tests

```sh
npm test
```

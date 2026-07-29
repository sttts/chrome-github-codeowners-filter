# GitHub CODEOWNERS Filter

A small Chrome extension that filters changed files on a GitHub pull request’s **Files changed** page by approver or CODEOWNER group.

## Features

- reads `.github/CODEOWNERS`, `CODEOWNERS`, or `docs/CODEOWNERS` from the pull request’s base branch
- assigns each changed file according to GitHub’s “last matching rule wins” behavior
- filters by one or more groups using OR semantics
- filters the file tree at the same time and hides empty directories
- adds a compact owner badge to every diff, including a hover popup with the matching rule and CODEOWNERS line link
- also detects approver and code-owner information rendered by GitHub in the file header
- stores which teams belong to “Only mine” for each repository
- detects direct `@username` ownership automatically
- works with GitHub’s dynamic pull request navigation and lazily loaded diffs

## Local installation

1. Open `chrome://extensions` in Chrome.
2. Enable **Developer mode** in the top-right corner.
3. Choose **Load unpacked**.
4. Select this repository directory.
5. Open a pull request and switch to the **Files changed** tab.

After changing the extension, press its reload button on `chrome://extensions`, then reload the pull request page.

## Usage

- Click a group to activate it; multiple active groups are combined using OR semantics.
- **All** resets the filter.
- Select your GitHub teams under **My groups**. Changes apply immediately.
- **Only mine** shows direct personal ownership plus the saved teams.

## MVP limitations

- The manifest is currently limited to `github.com`. A GitHub Enterprise host must be added explicitly to `host_permissions` and `content_scripts.matches`.
- Team membership cannot be read reliably from a GitHub page without additional API permissions, so your teams are selected manually once.
- For very large pull requests, the extension filters files already loaded into GitHub’s DOM. Newly loaded files are picked up automatically.

## Tests

```sh
npm test
```

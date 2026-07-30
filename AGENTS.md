# Project instructions

## Product

- This is a vendor-neutral Manifest V3 Chrome extension for filtering GitHub pull-request files by CODEOWNER or approver groups.
- Keep all user-facing text in English.
- Do not introduce company-, organization-, repository-, employee-, or project-specific names into source code, tests, documentation, screenshots, fixtures, or release packages.
- Do not add organization-specific owner-name transformations or special cases.
- Do not collect or transmit browsing data. Persist only repository-local preferences required by the extension.

## GitHub compatibility

- Support both GitHub's classic diff view and its React-based Files changed preview.
- Prefer semantic attributes, accessible labels, links, and stable DOM relationships over generated CSS-module class names.
- Apply filtering to both diff entries and the file tree.
- Use OR semantics when multiple owner groups are selected.
- Treat Only mine as an action: select the groups inferred from GitHub's ownership labels and close the popup. It is not an independent filter state.
- Close popups when the user clicks outside them.

## CODEOWNERS

- Preserve the verbatim matching CODEOWNERS rule and its line number.
- Show every relevant matching rule in the owner tooltip and link each rule to its CODEOWNERS file and line.
- Preserve multiple owners for a file; never reduce them to one owner.
- Owner display names may remove the generic `-codeowners` suffix only.

## UI

- Integrate controls beside GitHub's existing file-filter controls without increasing the sidebar width.
- Indicate active owner filtering with GitHub-like blue text, not a colored background.
- Keep controls compact and avoid floating overlays when a suitable GitHub toolbar location exists.
- Place owner badges in diff headers to the left of the added and deleted line counts.

## Verification

- Run `npm test` after every behavior change.
- Never skip or weaken tests to make them pass.
- Before a release, run `npm run audit:release -- --forbid <sensitive-term>` once for every applicable sensitive term.
- The release audit must pass tests, `git diff --check`, version consistency, package allow-list validation, and sensitive-term scans of both the repository and ZIP.
- Manually inspect store screenshots for sensitive visible content because text scans cannot reliably inspect pixels.
- Inspect the generated ZIP and keep it limited to runtime extension files.

## Releases

- Package with `npm run package`.
- Never reuse a published version number for different contents.
- Do not commit, tag, publish, or push unless the user explicitly requests it.
- Use signed commits.
- Use commit titles in the form `area/subarea: short description`.

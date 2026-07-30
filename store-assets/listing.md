# Chrome Web Store listing

## Product details

- **Name:** GitHub CODEOWNERS Filter
- **Version:** 0.1.4
- **Language:** English
- **Category:** Developer Tools
- **Homepage:** https://github.com/sttts/chrome-github-codeowners-filter
- **Support:** https://github.com/sttts/chrome-github-codeowners-filter/issues
- **Privacy policy:** https://github.com/sttts/chrome-github-codeowners-filter/blob/main/PRIVACY.md

## Graphic assets

- **Store icon:** `assets/icons/icon-128.png`
- **Small promo tile:** `store-assets/promo-small.png`
- **Screenshot 1:** `store-assets/screenshot-1.png`
- **Screenshot 2:** `store-assets/screenshot-2.png`

## Summary

Filter changed GitHub pull request files by CODEOWNER and approver groups.

## Detailed description

GitHub CODEOWNERS Filter adds an approver-group filter to the Files changed view of GitHub pull requests.

Use it to focus large pull requests on the files relevant to a CODEOWNER or approver group. Select one or more groups, combine them with OR semantics, or use Only mine to select groups that GitHub identifies as yours.

Features:

- filters both rendered diffs and the changed-files tree
- reads the repository's CODEOWNERS rules from the pull request's base branch
- follows GitHub's last-matching-rule-wins behavior
- shows the matching CODEOWNERS rule and linked source line for each file
- supports multiple owners per file
- reacts to GitHub's dynamic navigation and lazily loaded diffs

This extension is experimental and purely vibe-coded. Use it at your own risk.

GitHub CODEOWNERS Filter is an independent open-source project and is not affiliated with or endorsed by GitHub.

## Privacy practices

### Single purpose

Filter changed files in GitHub pull requests by CODEOWNER and approver groups.

### Host permission: `https://github.com/*`

Required to read file paths and ownership information from GitHub pull request pages and to add the filtering interface to the Files changed view.

### Host permission: `https://raw.githubusercontent.com/*`

Required to retrieve the repository's CODEOWNERS file from the pull request's base branch so changed files can be assigned to their matching owner groups.

### Remote code

No. The extension does not load or execute remote code. It only retrieves CODEOWNERS as data.

### Data usage

No user data is collected or transmitted to the developer or third parties. GitHub page content and CODEOWNERS data are processed locally in the browser solely to provide the filtering feature.

## Distribution

- **Visibility:** Public
- **Regions:** All regions
- **Pricing:** Free
- **Mature content:** No
- **Test credentials:** Not required

## Reviewer test instructions

1. Open https://github.com/ai-dynamo/dynamo/pull/10494/files.
2. Open the Files changed tab.
3. Click the blue Approver button next to GitHub's file filter.
4. Select one or more owner groups.
5. Verify that both the file tree and rendered diffs are filtered.
6. Hover an Owner badge in a file header to inspect the matching CODEOWNERS rule and source link.

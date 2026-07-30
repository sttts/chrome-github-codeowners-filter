#!/usr/bin/env bash

set -euo pipefail

repository_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$repository_root"

blocked_terms=()
while (($# > 0)); do
  case "$1" in
    --forbid)
      if (($# < 2)) || [[ -z "$2" ]]; then
        echo "--forbid requires a non-empty term" >&2
        exit 2
      fi
      blocked_terms+=("$2")
      shift 2
      ;;
    *)
      echo "Unknown argument: $1" >&2
      exit 2
      ;;
  esac
done

scan_tree() {
  local root="$1"
  local label="$2"
  local failed=0
  local file
  local relative
  local term

  while IFS= read -r -d '' file; do
    relative="${file#"$root"/}"

    for term in "${blocked_terms[@]}"; do
      if printf '%s\n' "$relative" | grep -iF -- "$term" >/dev/null; then
        echo "Forbidden term found in $label filename: $relative" >&2
        failed=1
      fi

      if [[ -n "$(strings "$file" | grep -iF -- "$term" || true)" ]]; then
        echo "Forbidden term found in $label file: $relative" >&2
        failed=1
      fi
    done
  done < <(find "$root" -path "$root/.git" -prune -o -path "$root/dist" -prune -o -type f -print0)

  return "$failed"
}

package_version="$(node -p "require('./package.json').version")"
manifest_version="$(node -p "require('./manifest.json').version")"
listing_version="$(sed -n 's/^- \*\*Version:\*\* //p' store-assets/listing.md | head -n 1)"

if [[ "$package_version" != "$manifest_version" || "$package_version" != "$listing_version" ]]; then
  echo "Version mismatch: package=$package_version manifest=$manifest_version listing=$listing_version" >&2
  exit 1
fi

npm test
git diff --check
scan_tree "$repository_root" "repository"

archive="$(bash scripts/package.sh)"
audit_tmp="$(mktemp -d "${TMPDIR:-/tmp}/codeowners-filter-audit.XXXXXX")"
trap 'rm -rf "$audit_tmp"' EXIT
unzip -q "$archive" -d "$audit_tmp"
scan_tree "$audit_tmp" "package"

archive_entries="$(zipinfo -1 "$archive")"
required_entries=(
  "manifest.json"
  "assets/icons/icon-16.png"
  "assets/icons/icon-32.png"
  "assets/icons/icon-48.png"
  "assets/icons/icon-128.png"
  "src/codeowners.js"
  "src/content.js"
  "src/styles.css"
)

for entry in "${required_entries[@]}"; do
  if ! printf '%s\n' "$archive_entries" | grep -Fx -- "$entry" >/dev/null; then
    echo "Required package entry is missing: $entry" >&2
    exit 1
  fi
done

unexpected_entries="$(
  printf '%s\n' "$archive_entries" |
    grep -Ev '^(manifest\.json|assets/icons/?|assets/icons/icon-(16|32|48|128)\.png|src/?|src/(codeowners|content)\.js|src/styles\.css)$' ||
    true
)"

if [[ -n "$unexpected_entries" ]]; then
  echo "Unexpected package entries:" >&2
  printf '%s\n' "$unexpected_entries" >&2
  exit 1
fi

echo "Release audit passed: $archive"

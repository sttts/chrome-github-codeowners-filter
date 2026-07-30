#!/usr/bin/env bash

set -euo pipefail

repository_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$repository_root"

version="$(node -p "require('./package.json').version")"
archive="dist/chrome-github-codeowners-filter-${version}.zip"

mkdir -p dist
rm -f "$archive"
zip -q -r "$archive" manifest.json assets/icons src

echo "$archive"

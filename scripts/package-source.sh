#!/usr/bin/env bash
# Package source code for Firefox AMO review.
# Creates wikifix-source-v1.0.0.zip with source + build instructions.
# Run from repo root: bash scripts/package-source.sh

set -euo pipefail

VERSION=$(node -p "require('./package.json').version")
OUTPUT="wikifix-source-v${VERSION}.zip"
TMPDIR=$(mktemp -d)

echo "Packaging source code v${VERSION} for AMO review..."

# Copy source files excluding node_modules, dist, .git
rsync -a --exclude='node_modules' --exclude='dist' --exclude='.git' \
  --exclude='*.zip' --exclude='*.xpi' --exclude='.env' \
  --exclude='.idea' --exclude='.vscode' \
  ./ "${TMPDIR}/wikifix-source/"

# Write build instructions README
cat > "${TMPDIR}/wikifix-source/BUILD.md" << 'README'
# Building WikiCitationExtension from source

## Prerequisites

- Node.js 22+ (tested with 22.x)
- npm 10+

## Build steps

```bash
# 1. Install dependencies
npm ci

# 2. Build extension
npm run build

# 3. Verify output
ls -la dist/
# dist/ should contain: manifest.json, browser-polyfill.js, content.js,
# popup.html, popup.css, popup.js, background.js, icon*.png, icon.svg,
# _locales/en/messages.json
```

## Build environment

- OS: Ubuntu 24.04 LTS (or Windows 10 with git-bash)
- Architecture: x86_64
- Build tool: esbuild (bundled via npm)
- No commercial or web-based tools used

## Output verification

After running `npm run build`, verify the output matches the packaged .xpi:
1. The built files are in `dist/`
2. The Firefox .xpi is `wikifix-extension.xpi` in the repo root
3. You can diff `dist/` contents against the .xpi using:

```bash
unzip -l wikifix-extension.xpi | grep -v '__MACOSX'
```

## Package contents

- `src/` - TypeScript source files (content.ts, popup.ts, background.ts, wiki-detector.ts, editor-adapter.ts)
- `src/lib/` - Library modules (api.ts, cache.ts, cleanup.ts, crypto.ts, types.ts, wikitext.ts, diff.ts, spacing.ts, sfn.ts, expand.ts)
- `public/` - Static assets (manifest.json, icons, locales, browser-polyfill.js)
- `tests/` - Vitest test files
- `tools/` - Diagnostic tools
- `build.mjs` - esbuild + JSZip build script
- `package.json` - Dependencies and scripts
- `tsconfig.json` - TypeScript configuration
- `vitest*.ts` - Test configuration files
- `eslint.config.js` - Linter configuration

## Note for reviewers

The extension uses esbuild for bundling (TypeScript → JavaScript) and JSZip for packaging.
Both are open-source tools (MIT license). Minification is limited to:
- Whitespace removal
- Variable/function name shortening
- File concatenation

No obfuscation is used. The source code in `src/` is the human-readable original.
README

# Create the zip
cd "${TMPDIR}"
zip -r "${OUTPUT}" wikifix-source/ > /dev/null
mv "${OUTPUT}" "$(dirname "$0")/../${OUTPUT}"

rm -rf "${TMPDIR}"

echo "Created $(dirname "$0")/../${OUTPUT}"
echo ""
echo "Upload this file as the source code package when submitting to AMO."
echo "Include BUILD.md instructions in the reviewer notes."

---
applyTo: "**/*.ts"
---

# StoreForge Development Instructions

This is the **StoreForge CLI** project — a unified App Store & Google Play deployment tool.

## Architecture

### Core (`src/core/`)
- `config.ts` — Config management at `~/.storeforge/config.json`
- `apple.ts` — App Store Connect API client (JWT auth with ES256, builds, metadata, review submission)
- `google.ts` — Google Play Developer API client (service account auth, edits API, tracks)

### CLI Commands (`src/cli/commands/`)
- `init.ts` — Interactive credential setup wizard
- `upload.ts` — Upload iOS IPA / Android AAB builds
- `metadata.ts` — Sync/pull app store metadata from YAML
- `status.ts` — Check review/processing status on both stores
- `release.ts` — Promote builds and submit for review
- `config.ts` — Set/get/list credentials

### Types (`src/types/`)
- `index.ts` — TypeScript interfaces for config, metadata, build status

## Adding a New Command

1. Create `src/cli/commands/<name>.ts` exporting a `create<Name>Command()` function returning a Commander `Command`
2. Register in `src/index.ts` with `program.addCommand()`
3. Use the spinner + try/catch error handling pattern

## Conventions

- ESM modules (`"type": "module"` in package.json)
- All imports use `.js` extension (TypeScript ESM requirement)
- Dynamic imports for chalk/ora (ESM-only packages): `const chalk = (await import('chalk')).default`
- Node.js 20+ required
- No external HTTP dependencies — use built-in `fetch`
- jsonwebtoken is CJS; use default import: `import jwt from 'jsonwebtoken'`
- Apple auth: ES256 JWT with .p8 private key
- Google auth: RS256 JWT with service account JSON → OAuth2 token exchange

## Build & Run

```bash
npm install          # Install dependencies
npm run build        # Compile TypeScript (tsc)
npm run dev          # Build and run
node dist/index.js   # Run CLI directly
```

## Testing

```bash
npm run build
node dist/index.js --version
node dist/index.js --help
node dist/index.js init --help
node dist/index.js upload --help
node dist/index.js status --help
```

## CI/CD

- GitHub CI builds on push (`.github/workflows/ci.yml`)
- npm publish is automatic via GitHub Release (`.github/workflows/publish.yml`)
- NPM_TOKEN stored as GitHub repo secret — never commit tokens

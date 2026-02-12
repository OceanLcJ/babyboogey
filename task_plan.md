# Task Plan: Media Isolation and Video Persistence Refactor

## Goal
Implement private-by-default media storage with asset references, signed access, guest temp uploads, AI result persistence, and migration tooling for legacy URL-based fields.

## Status
- Phase 1: complete
- Phase 2: complete
- Phase 3: complete
- Phase 4: complete
- Phase 5: in_progress
- Phase 6: in_progress

## Completed
- Added `media_asset` schema + migrations (postgres/sqlite + d1), model, and helpers.
- Added `assetRef` utility and signed/private media service helpers.
- Added APIs:
  - `POST /api/storage/upload-media`
  - `GET /api/storage/assets/:assetId`
  - `POST /api/storage/assets/sign`
  - `POST /api/ai/notify/[provider]`
- Updated AI query flow:
  - `AIProvider.query` now accepts `userId`
  - task updates now trigger on `status/taskInfo/taskResult` changes
  - taskInfo response resolves `assetRef` to signed URLs
- Updated AI generate flow:
  - resolves input `assetRef` in options to signed absolute URLs
  - blocks inaccessible asset refs
- Updated providers (replicate/fal/kie/gemini) to persist generated media in `media_asset` and write `assetRef`.
- Updated refresh page with auth ownership check + richer query params.
- Updated activity tasks page to render video outputs and download links.
- Updated upload clients to use `/api/storage/upload-media` and pass `purpose`.
- Added dual-read media rendering for avatars/table images/posts via `assetRef` -> API path conversion.
- Added migration script scaffold: `scripts/migrate-media-assets.ts`.

## Remaining
- Hard deprecation/removal behavior for `/api/storage/upload-image` and `/api/proxy/file` (currently unused in app flow but still present).
- Optional: run migration script in a real env and verify manifest outputs.
- Optional: add focused integration tests for ownership/guest/video persistence.

## Verification
- `pnpm exec tsc --noEmit` passed.
- `pnpm exec eslint $(git diff --name-only -- '*.ts' '*.tsx')` reports many pre-existing repo lint errors; not treated as regression gate here.

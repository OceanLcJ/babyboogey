# Findings & Decisions

## Key findings addressed
- Legacy upload route lacked ownership-aware key partitioning.
- AI query write condition only watched `taskInfo`, causing stale status/result persistence.
- Activity history did not render video results.
- Refresh page lacked user ownership validation.
- Callback path existed in generate flow but notify route was missing.

## Decisions implemented
- Canonical media pointer is `asset://<id>`.
- Media read paths resolve to `/api/storage/assets/:assetId` with owner checks and optional signed token.
- AI routes resolve input/output asset refs through signed URL helpers.
- Guest uploads remain supported for `reference_image` with session-bound temp ownership.
- UI uses dual-read (`assetRef` or legacy URL) to avoid rollout breakage.

## Remaining risks / follow-ups
- Legacy endpoints (`/api/storage/upload-image`, `/api/proxy/file`) still exist and should be explicitly deprecated/locked down.
- Migration script execution still needs real-environment dry-run + full-run validation.
- Repo-wide lint baseline is noisy; strict lint clean-up is out of scope of this change.

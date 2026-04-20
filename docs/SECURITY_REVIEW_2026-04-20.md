# 2026-04-20 Security Review Checklist

This document records the repository review findings from April 20, 2026.
The list below consolidates the initial review and the follow-up validation
from Claude. It is intended to be a remediation checklist, not a final
incident report.

## Summary

- Scope: `src/app/api`, `src/shared/services`, `src/shared/models`, markdown rendering, uploads, payment flow, and admin routes
- Reviewers: Codex initial review, Claude read-only second opinion
- TypeScript status: `tsc --noEmit` passed
- ESLint status: no errors, warnings only

## Remediation Checklist

- [ ] High: Restrict `/api/admin/diagnose-payment` to admins only
  - Files: `src/app/api/admin/diagnose-payment/route.ts`
  - Issue: Any logged-in user can read recent orders and payment metadata because the route checks authentication only and does not enforce RBAC.
  - Notes: This should match the permission check already used in `src/app/api/admin/fix-stuck-orders/route.ts`.

- [ ] High: Restrict `/api/admin/check-orders` to admins only
  - Files: `src/app/api/admin/check-orders/route.ts`
  - Issue: Any logged-in user can open the HTML order report and view recent orders, user emails, transaction IDs, and payment session IDs.
  - Notes: This endpoint is also affected by the HTML injection issue listed below.

- [ ] Medium: Fix IDOR in chat message retrieval
  - Files: `src/app/api/chat/messages/route.ts`
  - Issue: The route authenticates the user but fetches messages by `chatId` without verifying that the chat belongs to the current user.
  - Notes: The ownership check already exists in `src/app/api/chat/info/route.ts` and should be mirrored here.

- [ ] High: Remove or lock down the outbound email test endpoint
  - Files: `src/app/api/email/send-email/route.ts`
  - Issue: The endpoint can send email without any authentication or authorization checks.
  - Notes: Current behavior is equivalent to an open relay for spam or phishing. If retained, it must require admin permission and strict input validation.

- [ ] High: Sanitize markdown rendering or disable raw HTML
  - Files: `src/shared/blocks/common/markdown-content.tsx`, `src/shared/blocks/common/markdown-preview.tsx`
  - Issue: Both renderers set `markdown-it` to `html: true` and inject the output with `dangerouslySetInnerHTML`.
  - Notes: This is a stored XSS risk if the markdown content can be controlled by users or by compromised admin/editor inputs.

- [ ] Medium: Remove the hard-coded media asset signing secret fallback
  - Files: `src/shared/services/media-asset.ts`
  - Issue: Asset tokens fall back to the static value `media-asset-dev-secret` when auth secrets are missing.
  - Notes: Production code should fail closed and refuse to sign or verify asset tokens without a configured secret.

- [ ] Medium: Validate upload MIME types and block active content for guest uploads
  - Files: `src/app/api/storage/upload-media/route.ts`, `src/app/api/storage/assets/[assetId]/route.ts`
  - Issue: Upload handling trusts `file.type`, stores files with `inline` disposition, and later replays the same `Content-Type` from a same-origin asset route.
  - Notes: Claude marked this as partially confirmed because signed URLs and TTL are present, but same-origin replay of active content is still possible without a strict allowlist.

- [ ] Medium-High: Fix incorrect order state on checkout creation failure
  - Files: `src/app/api/payment/checkout/route.ts`
  - Issue: When `createPayment()` throws, the catch block updates the order to `OrderStatus.COMPLETED`.
  - Notes: A failed checkout creation should not be represented as completed. This should likely become `FAILED` or remain a non-terminal failure state.

- [ ] Medium: Escape user-controlled values in the HTML order report
  - Files: `src/app/api/admin/check-orders/route.ts`
  - Issue: Order and user fields are interpolated directly into HTML without escaping.
  - Notes: If attacker-controlled data reaches those fields, the admin report becomes an XSS vector.

## Suggested Fix Order

1. Lock down the admin endpoints and the outbound email endpoint.
2. Fix the chat message ownership check.
3. Remove markdown raw HTML or add sanitization.
4. Harden uploads and asset serving against active content.
5. Remove the hard-coded signing secret fallback.
6. Correct the payment status transition for checkout creation failures.
7. Escape interpolated HTML in the admin report.

## Validation Notes

- Claude confirmed all findings except the upload issue as written; it narrowed that item to a same-origin active-content risk caused by MIME trust and inline replay, not by a broken signed-token design.
- No code changes were made as part of this document-only update.

# Task 9 report: Top-3 form UX and atomic wishlist completion

## Implementation

- Refactored the dish form into the required sequence: select and compress image, upload it through `/api/uploads/dish-photo`, optionally recognize it through `/api/recognize`, explicitly choose one Top-3 candidate or enter a name manually, then save.
- Recognition candidates do not mutate the name until clicked. Candidate categories apply only while the category remains untouched. Recognition never writes ingredients or steps; visible ingredients render as read-only reference chips.
- Added latest-selection guards to compression, preview, file, upload URL, upload loading/error, and recognition loading/error/results. Late work from a previously selected image cannot overwrite the current image state.
- Added pending-wishlist matching before a new dish POST. Matching uses the same punctuation/space-insensitive `normalizeDishName` rule on client, shared domain code, and server.
- Added a completion confirmation with explicit “完成心愿并保存” and “只保存到饭盆” choices. Each choice issues one dish request.
- Added a celebration overlay that is shown only when the successful dish response contains a server-produced `wishlistCompletion` payload.
- Refactored the dishes route into injectable handlers and replaced its localhost/production-writing tests with isolated temporary-file database tests.
- Added `saveDishAndMaybeCompleteWish` and `findCompletionCandidate`. The server validates duplicate dish names and recipe existence, then inserts the dish and re-reads/revalidates the requested pending wish inside the same transaction by owner plus recipe or normalized name/category.
- A successful completion conditionally updates the pending wish, links the dish, and writes a permanent completion snapshot from transaction-read wish/dish values. Declined, invalid, stale, completed, or cross-owner completion targets save only the dish. Any transaction failure rolls all three changes back.

## TDD and behavior coverage

- The first transaction/form run failed because the transaction module, dialog, separate upload flow, candidates, chips, and confirmation did not exist.
- Isolated transaction tests cover recipe-first and normalized fallback matching, atomic success, forced rollback, `completeWishlist=false`, invalid/cross-owner targets, unknown recipes, and duplicate names.
- SQLite `AFTER INSERT` triggers simulate a wish changing inside the transaction window. A wish whose recipe/category stops matching remains pending with no snapshot; a matching wish renamed in that window produces the newly read name in both snapshot and response.
- Executable form-helper tests cover category-touch behavior, latest image selection winning when an older upload returns late, stale recognition invalidation after selecting a new image, both confirmation payloads, exactly one dish request, successful celebration payloads, and failure producing no celebration.
- Contract tests retain checks for separate upload/recognition endpoints, explicit candidate/manual controls, read-only visible ingredients, no recognition writes to ingredients/steps, pending lookup, and confirmation copy.

## Review follow-up

Independent review found and verified fixes for:

1. Completion validation and snapshots initially used a pre-transaction read. Validation now occurs after dish insertion inside the same transaction, and snapshot values are read there.
2. Client matching initially used a different normalizer. Client, domain, and server now use `normalizeDishName`, with punctuation/space behavior covered by tests.
3. Rapid image selections initially allowed stale uploads to overwrite the current URL/loading state. A latest-task guard now protects all image state.
4. A follow-up review found the same race for recognition results. Recognition now captures the image revision and ignores stale result, error, and final loading updates.

Final focused re-review returned **Ready** with no Critical, Important, or Minor findings.

## Verification

- Target and related regression command — PASS: 6 files / 37 tests.
- `npm test` — PASS: 33 files / 119 tests.
- `npm run test:db` — PASS: 1 file / 6 tests.
- `npx tsc --noEmit` — PASS, no diagnostics.
- `npm run lint` — PASS, no findings.
- `npm run build` — PASS; the page and all dish/upload/recognition/wishlist routes compiled.
- `git diff --check` — PASS.

## Scope and safety

- Baseline was `2df049c`.
- All database and API writes in tests used disposable local file databases and injected handlers.
- No production database, real Gemini/Ollama, Vercel Blob, or other external service was called.
- User-owned untracked `CLAUDE.md` and `docs/design-prototype.html` were not modified or staged.

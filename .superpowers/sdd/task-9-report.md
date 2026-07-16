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

## External-review follow-up: immutable saves and mounted UI races

An external review found that form fields could theoretically change while the pending-wishlist lookup was unresolved, allowing a matched wish from the old form state to be combined with newer rendered fields. The follow-up introduces an immutable `PendingSaveSnapshot` containing one revision plus the exact name, category, image URL, ingredients, and steps captured at save-click time.

- Pending matching, confirmation state, and the eventual dish request all consume that same frozen snapshot.
- Name/category/ingredients/steps edits, candidate selection, generated recipe application, and a new image selection invalidate the pending save revision and remove stale confirmation state.
- Form controls are disabled during pending lookup and submission. A synchronous submission ref prevents two confirmation clicks in the same render turn from issuing duplicate requests.
- Backdrop close is ignored during lookup/submission, unmount cleanup invalidates the pending save revision, and delayed duplicate-result navigation buttons are disabled while saving.
- A jsdom development dependency and Vitest source alias allow mounting the real React component with `createRoot` and `act`.
- Mounted delayed-Promise tests prove that a field change invalidates an unresolved wishlist match, two immediate confirmation clicks make one dish request with the captured snapshot, stale upload/recognition responses do not enter rendered state, and the final dish request retains the newest image URL.
- A real SQLite `BEFORE INSERT ON wishlist_completions` trigger raises an insert failure. The regression proves the dish row and dish link are absent, the wish remains pending with no completed-dish link, and no completion snapshot survives.

Follow-up verification:

- Target and related regression command — PASS: 7 files / 42 tests.
- `npm test` — PASS: 34 files / 124 tests.
- `npm run test:db` — PASS: 1 file / 6 tests.
- TypeScript, ESLint, production build, and `git diff --check` — PASS.
- Final closure re-review — **Ready**, with no Critical, Important, or Minor findings.

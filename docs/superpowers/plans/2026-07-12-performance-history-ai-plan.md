# Performance, Unified History, and AI Fallback Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make tab switching image-light, expose dish creation and meal planning in one history, and generate editable recipe suggestions when Gemini is unavailable.

**Architecture:** Focused pure helpers own recipe fallback, field merging, and image compression settings. API routes compose Gemini with deterministic fallback and compose dishes with meal plans. UI components consume these stable interfaces and use optimized images.

**Tech Stack:** Next.js 16 App Router, React 19, TypeScript, Drizzle/Turso, Vercel Blob, Vitest, Next Image.

## Global Constraints

- Do not delete or rewrite existing dishes, meal plans, or Blob originals.
- Image longest edge is 1600px and JPEG quality is 0.8.
- Generated content is editable and never overwrites non-empty user fields.
- Gemini failure must return a deterministic reference recipe rather than close or clear the form.

---

### Task 1: Deterministic recipe generation and field merge

**Files:**
- Create: `src/lib/recipe-fallback.ts`
- Test: `tests/lib/recipe-fallback.test.ts`

**Interfaces:**
- Produces: `generateFallbackRecipe(name): RecipeSuggestion`
- Produces: `mergeRecipeFields(current, suggestion): EditableRecipeFields`

- [ ] Write failing tests asserting 红烧猪蹄 and 清蒸鲫鱼 produce non-empty ingredients/steps and merge does not overwrite existing text.
- [ ] Run `npx vitest run tests/lib/recipe-fallback.test.ts` and confirm missing-module failure.
- [ ] Implement keyword templates for 红烧、清蒸、白灼、炒、炖、汤、面、饭 plus a generic template and non-destructive merge.
- [ ] Re-run the focused test and expect all assertions to pass.

### Task 2: Text generation API with Gemini fallback

**Files:**
- Create: `src/app/api/generate-recipe/route.ts`
- Modify: `src/lib/gemini.ts`
- Test: `tests/api/generate-recipe.test.ts`

**Interfaces:**
- Consumes: `generateFallbackRecipe(name)`
- Produces: `POST /api/generate-recipe` returning `{name, category, ingredients, steps, source}`

- [ ] Write API tests for missing name and a successful structured response with `source` equal to `gemini` or `template`.
- [ ] Run the focused API test and confirm the route is missing.
- [ ] Add `generateRecipeFromName(name)` to the Gemini wrapper and a route that catches every provider error and returns the deterministic template.
- [ ] Re-run focused API tests and expect pass even while the current Gemini project returns 403.

### Task 3: Unified history data flow

**Files:**
- Modify: `src/app/api/history/route.ts`
- Modify: `src/components/HistoryPage.tsx`
- Modify: `src/lib/types.ts`
- Test: `tests/api/history.test.ts`

**Interfaces:**
- Produces: `HistoryEvent` with `type`, `eventTime`, `date`, `dish`, and optional `mealType`.

- [ ] Write an API test asserting returned events include both `dish_created` and `meal_planned`, are ordered descending, and include 红烧猪蹄/红烧鲫鱼 creation events.
- [ ] Run it and confirm the current `{history, frequency}` response fails.
- [ ] Join dishes and plans into typed events, sort by event time, limit after merging, and calculate frequency from meal plans.
- [ ] Render distinct creation/meal wording and keep detail navigation.
- [ ] Re-run the history and existing API tests.

### Task 4: Image performance and form integration

**Files:**
- Create: `src/lib/image-compression.ts`
- Modify: `next.config.ts`
- Modify: `src/components/RecordPage.tsx`
- Modify: `src/components/LibraryPage.tsx`
- Modify: `src/components/TodayPage.tsx`
- Modify: `src/components/DishDetail.tsx`
- Modify: `src/components/AddDishForm.tsx`
- Test: `tests/lib/image-compression.test.ts`

**Interfaces:**
- Produces: `IMAGE_COMPRESSION_CONFIG = { maxDimension: 1600, quality: 0.8 }`
- Produces: `compressImage(file): Promise<File>`

- [ ] Write a failing test for exact compression settings.
- [ ] Implement browser canvas compression with original-file fallback.
- [ ] Configure the Blob hostname for Next Image and replace list/detail raw images with sized optimized images.
- [ ] Use compressed files for preview/upload and add the菜名生成 button calling `/api/generate-recipe`; merge only empty fields and show the result source.
- [ ] Run focused tests, all tests, ESLint, and production build.
- [ ] At mobile viewport, verify four tabs, optimized image URLs, unified history, recipe generation, and form preservation on failure.

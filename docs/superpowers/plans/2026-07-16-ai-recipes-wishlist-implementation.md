# 猪猪食堂 AI 识图、公共菜谱与心愿单 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在保留现有饭盆数据和四页核心功能的前提下，上线 HowToCook 公共菜谱搜索、心愿单、完成记录、跨库随机推荐、Gemini Top‑3 识图，以及家庭局域网 Ollama Qwen3‑VL POC。

**Architecture:** 使用 Turso/libSQL 保存公共菜谱、心愿和永久完成快照，以可重复执行的迁移器和隔离数据库测试替代直接在生产库试错。页面继续使用现有单页状态容器，新增全屏心愿/菜谱视图；AI 通过统一 provider 接口选择公网 Gemini 或局域网 Ollama，图片上传与识图彻底解耦。

**Tech Stack:** Next.js 16、React 19、TypeScript、Drizzle ORM、Turso/libSQL、Vercel Blob、Gemini 2.5 Flash、Ollama `qwen3-vl:4b-instruct-q4_K_M`、Vitest。

## Global Constraints

- 现有 `dishes` 仅代表真正做过的菜；公共菜谱不得直接导入 `dishes`。
- 已有饭盆记录、图片、创建时间和历史全部保留，不自动改名或删除。
- 心愿菜加入今日菜单不得完成心愿或增加做过次数。
- AI 最多返回三个候选菜名，只提供分类建议和可见食材，不生成正式用量或步骤。
- AI 失败不得丢失照片、清空表单或阻止手动保存。
- 公网只使用 Gemini；局域网优先 Qwen，失败时回退 Gemini。
- 完成快照独立保存；删除饭盆菜品不得删除或回退已完成心愿。
- API 自动化测试必须使用隔离的本地 libSQL 数据库，禁止连接生产 Turso。
- HowToCook 固定到 Git commit `753d4940fe06ce0d5ef767e8fe046c88635a391c`，来源许可证记录为 `Unlicense`。

---

## File Map

### Database and domain

- `src/db/index.ts`: production database factory and exported connection.
- `src/db/schema.ts`: recipe, wishlist, completion, dish, and meal-plan schema.
- `src/db/migrate.ts`: idempotent additive migration runner shared by CLI and tests.
- `scripts/db/migrate-recipes-wishlist.ts`: explicit production migration command with dry-run output.
- `src/lib/recipe-normalize.ts`: recipe name/alias normalization and six-category mapping.
- `src/lib/recipe-search.ts`: deterministic search ranking.
- `src/lib/wishlist-domain.ts`: duplicate, matching, completion, and recommendation rules.
- `src/lib/recommendations.ts`: cross-source union and deduplication.

### HowToCook ingestion

- `scripts/howtocook/parse.ts`: Markdown-to-normalized-recipe parser.
- `scripts/howtocook/stage.ts`: clone pinned source and generate deterministic artifacts.
- `scripts/howtocook/import.ts`: transactional database import.
- `data/howtocook/recipes.json`: generated normalized recipe corpus.
- `data/howtocook/import-report.json`: generated parse counts and rejected files.
- `data/howtocook/SOURCE.md`: revision, source URL, license, and regeneration command.

### API

- `src/app/api/recipes/search/route.ts`
- `src/app/api/recipes/[id]/route.ts`
- `src/app/api/wishlist/route.ts`
- `src/app/api/wishlist/[id]/route.ts`
- `src/app/api/wishlist/completed/route.ts`
- `src/app/api/recommendations/route.ts`
- `src/app/api/uploads/dish-photo/route.ts`
- `src/app/api/recognize/route.ts`
- `src/app/api/recognize/health/route.ts`
- `src/app/api/dishes/route.ts`
- `src/app/api/plans/route.ts`
- `src/app/api/history/route.ts`

### UI

- `src/app/page.tsx`: view orchestration and shared wishlist summary.
- `src/components/TodayPage.tsx`: heart entry, union recommendations, dual-source meal planning.
- `src/components/WishlistPage.tsx`: pending list and recipe search.
- `src/components/RecipeDetail.tsx`: recipe detail and add action.
- `src/components/CompletedWishlistPage.tsx`: permanent completion list.
- `src/components/HistoryPage.tsx`: wishlist summary card and completion events.
- `src/components/AddDishForm.tsx`: separated upload, Top‑3 candidate selection, completion prompt.
- `src/components/WishlistCompletionDialog.tsx`: pre-save choice.
- `src/components/WishlistCelebration.tsx`: completion success state.
- `src/lib/types.ts`: shared types.

### AI

- `src/lib/vision/types.ts`: provider-neutral request and response types.
- `src/lib/vision/validate.ts`: strict response validation.
- `src/lib/vision/gemini-provider.ts`: Gemini adapter with timeout and retry.
- `src/lib/vision/ollama-provider.ts`: Qwen/Ollama adapter.
- `src/lib/vision/index.ts`: environment-based provider chain.
- `scripts/vision/evaluate-local.ts`: local JSONL evaluation runner.
- `data/vision/.gitkeep`: evaluation input/output directory marker; photos and JSONL outputs remain ignored.

---

### Task 1: Additive schema migration and isolated database harness

**Files:**
- Modify: `src/db/index.ts`
- Modify: `src/db/schema.ts`
- Create: `src/db/migrate.ts`
- Create: `scripts/db/migrate-recipes-wishlist.ts`
- Create: `scripts/db/export-backup.ts`
- Modify: `package.json`
- Create: `tests/db/migrate.test.ts`
- Modify: `.gitignore`

**Interfaces:**
- Produces: `createDatabase(url: string, authToken?: string)` and `applyRecipesWishlistMigration(client: Client): Promise<void>`.
- Produces: `exportDatabaseSnapshot(client: Client, outputPath: string): Promise<DatabaseSnapshot>` with table DDL and rows, excluding internal SQLite/libSQL tables.
- Produces schema exports: `recipes`, `recipeIngredients`, `recipeSteps`, `recipeAliases`, `wishlistItems`, `wishlistCompletions`.
- Extends: `dishes.recipeId`, `dishes.wishlistItemId`, `dishes.ownerId`, `mealPlans.recipeId`, `mealPlans.wishlistItemId`, `mealPlans.sourceType`, `mealPlans.ownerId`.

- [ ] **Step 1: Write the failing isolated migration test**

```ts
import { createClient } from "@libsql/client";
import { afterEach, describe, expect, it } from "vitest";
import { applyRecipesWishlistMigration } from "../../src/db/migrate";

describe("recipes and wishlist migration", () => {
  const clients: ReturnType<typeof createClient>[] = [];
  afterEach(async () => Promise.all(clients.map((client) => client.close())));

  it("is additive and idempotent", async () => {
    const client = createClient({ url: ":memory:" });
    clients.push(client);
    await client.executeMultiple(`
      CREATE TABLE dishes (id text PRIMARY KEY, name text NOT NULL);
      CREATE TABLE meal_plans (id integer PRIMARY KEY AUTOINCREMENT, date text NOT NULL, meal_type text NOT NULL);
    `);
    await applyRecipesWishlistMigration(client);
    await applyRecipesWishlistMigration(client);
    const tables = await client.execute("SELECT name FROM sqlite_master WHERE type='table'");
    expect(tables.rows.map((row) => row.name)).toEqual(expect.arrayContaining([
      "recipes", "recipe_ingredients", "recipe_steps", "recipe_aliases", "wishlist_items", "wishlist_completions",
    ]));
    const dishColumns = await client.execute("PRAGMA table_info(dishes)");
    expect(dishColumns.rows.map((row) => row.name)).toEqual(expect.arrayContaining(["recipe_id", "wishlist_item_id", "owner_id"]));
  });
});
```

- [ ] **Step 2: Run the test and verify the missing module failure**

Run: `npx vitest run tests/db/migrate.test.ts`

Expected: FAIL because `src/db/migrate.ts` does not exist.

- [ ] **Step 3: Implement the migration runner and database factory**

Use a `hasColumn(client, table, column)` helper based on `PRAGMA table_info`. Create all new tables and indexes with `IF NOT EXISTS`; add legacy-table columns only when absent. The exact integrity rules are:

```sql
CREATE TABLE IF NOT EXISTS recipes (
  id text PRIMARY KEY, name text NOT NULL, name_key text NOT NULL, category_key text NOT NULL,
  description text, servings integer, estimated_time_minutes integer,
  source_name text NOT NULL, source_url text NOT NULL, source_license text NOT NULL,
  source_path text NOT NULL, source_revision text NOT NULL, content_hash text NOT NULL,
  image_url text, created_at text NOT NULL, updated_at text NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS recipes_source_path_revision_uq ON recipes(source_path, source_revision);
CREATE INDEX IF NOT EXISTS recipes_name_key_idx ON recipes(name_key);
CREATE TABLE IF NOT EXISTS recipe_ingredients (
  id integer PRIMARY KEY AUTOINCREMENT, recipe_id text NOT NULL REFERENCES recipes(id) ON DELETE CASCADE,
  sort_order integer NOT NULL, ingredient_name text NOT NULL, amount_value real,
  amount_unit text, amount_text text NOT NULL, optional integer NOT NULL DEFAULT 0, note text
);
CREATE TABLE IF NOT EXISTS recipe_steps (
  id integer PRIMARY KEY AUTOINCREMENT, recipe_id text NOT NULL REFERENCES recipes(id) ON DELETE CASCADE,
  sort_order integer NOT NULL, text text NOT NULL, section_name text
);
CREATE TABLE IF NOT EXISTS recipe_aliases (
  id integer PRIMARY KEY AUTOINCREMENT, recipe_id text NOT NULL REFERENCES recipes(id) ON DELETE CASCADE,
  alias text NOT NULL, alias_key text NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS recipe_alias_recipe_uq ON recipe_aliases(recipe_id, alias_key);
CREATE INDEX IF NOT EXISTS recipe_alias_key_idx ON recipe_aliases(alias_key);
CREATE TABLE IF NOT EXISTS wishlist_items (
  id text PRIMARY KEY, owner_id text, recipe_id text REFERENCES recipes(id), custom_name text,
  name_key text NOT NULL, category_key text NOT NULL, status text NOT NULL CHECK(status IN ('pending','completed')),
  added_at text NOT NULL, completed_at text, completed_dish_id text REFERENCES dishes(id) ON DELETE SET NULL,
  created_at text NOT NULL, updated_at text NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS wishlist_pending_recipe_uq
  ON wishlist_items(ifnull(owner_id, '__legacy__'), recipe_id) WHERE status='pending' AND recipe_id IS NOT NULL;
CREATE TABLE IF NOT EXISTS wishlist_completions (
  id text PRIMARY KEY, owner_id text, wishlist_item_id text NOT NULL REFERENCES wishlist_items(id),
  recipe_id text REFERENCES recipes(id), completed_dish_id text REFERENCES dishes(id) ON DELETE SET NULL,
  added_at_snapshot text NOT NULL, completed_at text NOT NULL,
  name_snapshot text NOT NULL, image_url_snapshot text, created_at text NOT NULL
);
CREATE INDEX IF NOT EXISTS wishlist_completion_time_idx ON wishlist_completions(completed_at DESC);
```

Add package scripts:

```json
{
  "db:migrate:recipes": "tsx scripts/db/migrate-recipes-wishlist.ts",
  "db:backup": "tsx scripts/db/export-backup.ts",
  "test:db": "vitest run tests/db"
}
```

The migration CLI prints the target hostname and planned table/column list, and requires `--apply` before calling the migration. It never prints tokens. The backup CLI requires `--output`, enumerates user tables through `sqlite_master`, writes their exact `CREATE TABLE` SQL plus ordered row objects, and refuses to overwrite an existing file.

- [ ] **Step 4: Run migration tests twice and type-check**

Run: `npx vitest run tests/db/migrate.test.ts && npx tsc --noEmit`

Expected: PASS; the second migration call performs no destructive work.

- [ ] **Step 5: Commit the database foundation**

```bash
git add .gitignore package.json src/db scripts/db tests/db
git commit -m "feat: add recipes and wishlist database foundation"
```

---

### Task 2: Deterministic HowToCook staging and import

**Files:**
- Create: `src/lib/recipe-normalize.ts`
- Create: `scripts/howtocook/parse.ts`
- Create: `scripts/howtocook/stage.ts`
- Create: `scripts/howtocook/import.ts`
- Create: `tests/fixtures/howtocook/sample.md`
- Create: `tests/lib/howtocook-parser.test.ts`
- Create: `tests/lib/recipe-normalize.test.ts`
- Generate: `data/howtocook/recipes.json`
- Generate: `data/howtocook/import-report.json`
- Create: `data/howtocook/SOURCE.md`
- Modify: `package.json`

**Interfaces:**
- Produces: `normalizeRecipeName(value: string): string`.
- Produces: `mapHowToCookCategory(sourcePath: string): CategoryKey`.
- Produces: `parseHowToCookMarkdown(input: { path: string; markdown: string; revision: string }): StagedRecipe | ParseFailure`.
- Consumes: migration and recipe schema from Task 1.

- [ ] **Step 1: Add parser and normalization tests**

```ts
it("extracts name, servings, ingredients, steps, source, and stable id", () => {
  const parsed = parseHowToCookMarkdown({
    path: "dishes/meat_dish/示例菜/示例菜.md",
    markdown: fixture,
    revision: HOW_TO_COOK_REVISION,
  });
  expect(parsed).toMatchObject({
    name: "示例菜", categoryKey: "肉类", servings: 2,
    sourceLicense: "Unlicense", sourceRevision: HOW_TO_COOK_REVISION,
  });
  expect(parsed.ingredients).toEqual(expect.arrayContaining([
    expect.objectContaining({ ingredientName: "排骨", amountText: "500g" }),
  ]));
  expect(parsed.steps.length).toBeGreaterThan(1);
});

it("normalizes harmless whitespace and latin case only", () => {
  expect(normalizeRecipeName("  Mapo   Tofu ")).toBe("mapo tofu");
  expect(normalizeRecipeName("红烧 鲫鱼")).toBe("红烧 鲫鱼");
});
```

- [ ] **Step 2: Run the parser tests and verify failure**

Run: `npx vitest run tests/lib/howtocook-parser.test.ts tests/lib/recipe-normalize.test.ts`

Expected: FAIL because parser and normalizer are missing.

- [ ] **Step 3: Implement staging without mutating the database**

`stage.ts` performs these exact operations:

```ts
const revision = "753d4940fe06ce0d5ef767e8fe046c88635a391c";
// clone --filter=blob:none --no-checkout into .cache/howtocook
// fetch the exact revision, checkout detached, enumerate dishes/**/*.md
// parse each file, sort output by sourcePath, write stable JSON and report
```

Category mapping:

```ts
const CATEGORY_BY_FOLDER = {
  meat_dish: "肉类", aquatic: "海鲜", soup: "汤类", staple: "主食",
  vegetable_dish: "青菜", breakfast: "主食", dessert: "其他",
  drink: "其他", condiment: "其他", semi-finished: "其他",
} as const;
```

Unknown categories are reported and skipped rather than guessed. The parser keeps unstructured amount text when numeric parsing is unsafe.

- [ ] **Step 4: Implement transactional import**

Import each recipe by deterministic UUID derived from `sourcePath`, replace its child ingredients/steps/aliases inside one transaction, and update only when `contentHash` changes. The command supports `--dry-run` and requires `--apply` for writes.

Add scripts:

```json
{
  "recipes:stage": "tsx scripts/howtocook/stage.ts",
  "recipes:import": "tsx scripts/howtocook/import.ts"
}
```

- [ ] **Step 5: Generate artifacts and verify determinism**

Run twice: `npm run recipes:stage`

Run: `shasum -a 256 data/howtocook/recipes.json data/howtocook/import-report.json`

Expected: both runs produce identical hashes; report has zero fatal failures and at least 350 successfully parsed recipes.

- [ ] **Step 6: Run unit tests and dry-run import**

Run: `npx vitest run tests/lib/howtocook-parser.test.ts tests/lib/recipe-normalize.test.ts && npm run recipes:import -- --dry-run`

Expected: PASS; dry-run reports inserts/updates without writing.

- [ ] **Step 7: Commit source, generated corpus, and report**

```bash
git add package.json src/lib/recipe-normalize.ts scripts/howtocook tests/fixtures/howtocook tests/lib/howtocook-parser.test.ts tests/lib/recipe-normalize.test.ts data/howtocook
git commit -m "feat: stage HowToCook recipe corpus"
```

---

### Task 3: Recipe search and detail APIs

**Files:**
- Create: `src/lib/recipe-search.ts`
- Create: `src/lib/recipe-repository.ts`
- Create: `src/app/api/recipes/search/route.ts`
- Create: `src/app/api/recipes/[id]/route.ts`
- Modify: `src/lib/types.ts`
- Create: `tests/lib/recipe-search.test.ts`
- Create: `tests/api/recipe-handlers.test.ts`

**Interfaces:**
- Produces: `rankRecipeMatch(queryKey, nameKey, aliasKeys): 0 | 1 | 2 | null`.
- Produces: `searchRecipes(database, query, ownerId): Promise<RecipeSearchResult[]>`.
- Produces: `getRecipeDetail(database, id): Promise<RecipeDetail | null>`.

- [ ] **Step 1: Write ranking and handler tests**

```ts
expect(rankRecipeMatch("鱼香肉丝", "鱼香肉丝", [])).toBe(0);
expect(rankRecipeMatch("木须肉", "木樨肉", ["木须肉"])).toBe(1);
expect(rankRecipeMatch("排骨", "糖醋排骨", [])).toBe(2);
expect(rankRecipeMatch("不存在", "糖醋排骨", [])).toBeNull();
```

Handler tests seed an isolated database with one recipe, one alias, one pending wishlist row, and one existing dish; they assert `isWishlisted` and `isCooked` flags without starting the production server.

- [ ] **Step 2: Run and observe failure**

Run: `npx vitest run tests/lib/recipe-search.test.ts tests/api/recipe-handlers.test.ts`

Expected: FAIL because repository and handlers are missing.

- [ ] **Step 3: Implement bounded search and detail loading**

Rules:

```ts
export const RECIPE_SEARCH_LIMIT = 30;
// trim query; reject empty or >50 characters with 400
// load name/alias candidates; rank 0,1,2; then name localeCompare
// attach isWishlisted and isCooked via recipe_id, then normalized name+category fallback
```

`GET /api/recipes/search?q=` returns `{ items, query }`. `GET /api/recipes/:id` returns recipe plus sorted ingredients, steps, aliases, source fields, `isWishlisted`, and `isCooked`; missing IDs return 404.

- [ ] **Step 4: Run API/lib tests and build**

Run: `npx vitest run tests/lib/recipe-search.test.ts tests/api/recipe-handlers.test.ts && npm run build`

Expected: PASS and successful production build.

- [ ] **Step 5: Commit recipe read APIs**

```bash
git add src/lib/types.ts src/lib/recipe-search.ts src/lib/recipe-repository.ts src/app/api/recipes tests/lib/recipe-search.test.ts tests/api/recipe-handlers.test.ts
git commit -m "feat: add recipe search and detail APIs"
```

---

### Task 4: Wishlist domain, APIs, and permanent completion history

**Files:**
- Create: `src/lib/wishlist-domain.ts`
- Create: `src/lib/wishlist-repository.ts`
- Create: `src/app/api/wishlist/route.ts`
- Create: `src/app/api/wishlist/[id]/route.ts`
- Create: `src/app/api/wishlist/completed/route.ts`
- Create: `tests/lib/wishlist-domain.test.ts`
- Create: `tests/api/wishlist-handlers.test.ts`

**Interfaces:**
- Produces: `findPendingWishlistMatch(items, { recipeId, name, categoryKey })`.
- Produces: `addWishlistItem`, `listWishlistItems`, `removePendingWishlistItem`, `listWishlistCompletions`.
- Consumes recipe IDs and normalization from Tasks 2–3.

- [ ] **Step 1: Write failing domain/API tests**

```ts
it("prefers recipe id over normalized fallback", () => {
  expect(findPendingWishlistMatch(items, {
    recipeId: "recipe-2", name: "另一道菜", categoryKey: "肉类",
  })?.id).toBe("wish-recipe-2");
});

it("does not match the same name across different categories", () => {
  expect(findPendingWishlistMatch(items, {
    recipeId: null, name: "丸子", categoryKey: "汤类",
  })).toBeNull();
});
```

API tests verify add, duplicate 409, pending list, delete, completed list ordering, and inability to delete a completed row through the pending delete endpoint.

- [ ] **Step 2: Run tests and confirm failure**

Run: `npx vitest run tests/lib/wishlist-domain.test.ts tests/api/wishlist-handlers.test.ts`

Expected: FAIL because wishlist modules are missing.

- [ ] **Step 3: Implement repositories and routes**

Request/response contract:

```ts
POST /api/wishlist { recipeId: string }
// 201 { item }
// 404 unknown recipe
// 409 { error: "已经在猪猪心愿单里啦", itemId }

GET /api/wishlist?status=pending
// 200 { items, pendingCount, completedCount }

DELETE /api/wishlist/:id
// 200 { success: true } only when status=pending

GET /api/wishlist/completed
// 200 { items } ordered by completedAt desc
```

All current rows use `ownerId = null`; every repository signature accepts an owner ID so account filtering can be added without changing callers.

- [ ] **Step 4: Run tests and type-check**

Run: `npx vitest run tests/lib/wishlist-domain.test.ts tests/api/wishlist-handlers.test.ts && npx tsc --noEmit`

Expected: PASS.

- [ ] **Step 5: Commit wishlist APIs**

```bash
git add src/lib/wishlist-domain.ts src/lib/wishlist-repository.ts src/app/api/wishlist tests/lib/wishlist-domain.test.ts tests/api/wishlist-handlers.test.ts
git commit -m "feat: add wishlist APIs and completion history"
```

---

### Task 5: Wishlist, recipe, and completed-wish UI flows

**Files:**
- Modify: `src/app/page.tsx`
- Modify: `src/components/TodayPage.tsx`
- Create: `src/components/WishlistPage.tsx`
- Create: `src/components/RecipeDetail.tsx`
- Create: `src/components/CompletedWishlistPage.tsx`
- Modify: `src/app/globals.css`
- Create: `tests/lib/wishlist-ui-contract.test.ts`
- Modify: `tests/manual-test-cases.md`

**Interfaces:**
- `TodayPage` receives `wishlistCount` and `onOpenWishlist`.
- `WishlistPage` emits `onClose`, `onOpenRecipe`, and `onOpenCompleted`.
- `RecipeDetail` emits `onBack` and `onWishlistChanged`.

- [ ] **Step 1: Add UI contract tests**

```ts
expect(today).toContain('aria-label="打开猪猪心愿单"');
expect(wishlist).toContain("猪猪心愿单");
expect(wishlist).toContain("暂无匹配菜谱");
expect(detail).toContain("采购清单");
expect(detail).toContain("内容来源");
expect(completed).toContain("已完成心愿");
```

- [ ] **Step 2: Run the UI contract and observe failure**

Run: `npx vitest run tests/lib/wishlist-ui-contract.test.ts`

Expected: FAIL because components and entry are missing.

- [ ] **Step 3: Implement full-screen view orchestration**

Use one discriminated view state in `page.tsx`:

```ts
type OverlayView =
  | { type: "wishlist" }
  | { type: "recipe"; recipeId: string; backTo: "wishlist" | "completed" }
  | { type: "completed" }
  | null;
```

The heart button stays inside the menu title row, has a minimum 44×44 px target, and displays a badge only when `wishlistCount > 0`. All overlay pages use `PAGE_CONTENT_CLASS`, keep bottom safe-area padding, and have visible back buttons.

- [ ] **Step 4: Implement search, detail, add, remove, and completed states**

Search waits for explicit submit, displays loading/error/empty states, and never uses AI fallback. Pending cards show category, added date, detail, and a removal confirmation. Recipe detail disables add when already wishlisted and labels already cooked recipes.

- [ ] **Step 5: Run UI contracts, lint, and build**

Run: `npx vitest run tests/lib/wishlist-ui-contract.test.ts && npm run lint && npm run build`

Expected: tests pass, lint has no errors, build succeeds.

- [ ] **Step 6: Commit the wishlist UI**

```bash
git add src/app/page.tsx src/app/globals.css src/components/TodayPage.tsx src/components/WishlistPage.tsx src/components/RecipeDetail.tsx src/components/CompletedWishlistPage.tsx tests/lib/wishlist-ui-contract.test.ts tests/manual-test-cases.md
git commit -m "feat: add wishlist and recipe browsing flows"
```

---

### Task 6: Cross-source recommendations and dual-source meal plans

**Files:**
- Create: `src/lib/recommendations.ts`
- Create: `src/app/api/recommendations/route.ts`
- Modify: `src/app/api/plans/route.ts`
- Modify: `src/components/TodayPage.tsx`
- Modify: `src/lib/types.ts`
- Create: `tests/lib/recommendations.test.ts`
- Create: `tests/api/plans-source.test.ts`

**Interfaces:**
- Produces: `RecommendationItem = DishRecommendation | WishlistRecommendation`.
- Produces: `buildRecommendationPool(dishes, wishes, category): RecommendationItem[]`.
- `POST /api/plans` accepts exactly one of `{ dishId }` or `{ wishlistItemId }`.

- [ ] **Step 1: Write union, dedupe, and plan validation tests**

```ts
expect(buildRecommendationPool([dishLinkedToRecipe], [wishForSameRecipe], "all"))
  .toHaveLength(1);
expect(buildRecommendationPool([], [wish], "青菜")[0]).toMatchObject({
  source: "wishlist", sourceLabel: "心愿单 · 还没做过",
});
```

Plan handler tests assert that both IDs or neither ID returns 400, a pending wish creates `sourceType="wishlist"`, and the wish status remains `pending`.

- [ ] **Step 2: Run tests and verify failure**

Run: `npx vitest run tests/lib/recommendations.test.ts tests/api/plans-source.test.ts`

Expected: FAIL because union recommendation behavior is absent.

- [ ] **Step 3: Implement server recommendation pool and plan XOR validation**

```ts
const hasDish = typeof dishId === "string" && dishId.length > 0;
const hasWish = typeof wishlistItemId === "string" && wishlistItemId.length > 0;
if (hasDish === hasWish) return badRequest("只能选择饭盆菜品或心愿菜中的一种");
```

Wishlist plans copy `recipeId` from the verified pending wishlist row. Do not create dishes, completion rows, history completion events, or times-cooked increments.

- [ ] **Step 4: Replace client-only dish pool with API recommendation items**

The card image uses the dish photo for `source="dish"`; wishlist uses recipe image or category icon. Detail opens `DishDetail` for dishes and `RecipeDetail` for wishes. Meal buttons send the correct source ID.

- [ ] **Step 5: Run targeted and regression tests**

Run: `npx vitest run tests/lib/recommendations.test.ts tests/api/plans-source.test.ts tests/lib/today-page-contract.test.ts tests/api/plans.test.ts`

Expected: PASS; update legacy plan tests to use isolated handlers rather than the production server.

- [ ] **Step 6: Commit recommendation and meal-plan changes**

```bash
git add src/lib/recommendations.ts src/lib/types.ts src/app/api/recommendations src/app/api/plans/route.ts src/components/TodayPage.tsx tests/lib/recommendations.test.ts tests/api/plans-source.test.ts tests/api/plans.test.ts
git commit -m "feat: recommend dishes and pending wishes together"
```

---

### Task 7: Wishlist statistics and diary events

**Files:**
- Modify: `src/app/api/history/route.ts`
- Modify: `src/lib/history-data.ts`
- Modify: `src/lib/history-stats.ts`
- Modify: `src/lib/types.ts`
- Modify: `src/components/HistoryPage.tsx`
- Modify: `src/app/page.tsx`
- Create: `tests/lib/wishlist-history.test.ts`
- Modify: `tests/lib/history-stats.test.ts`

**Interfaces:**
- Extends `HistoryEvent.type` with `wishlist_completed`.
- Extends `HistoryData` with `wishlistSummary: { pending: number; completed: number }`.
- `HistoryPage` receives `onOpenWishlist`.

- [ ] **Step 1: Write history merge and stats tests**

```ts
expect(mergeHistoryEvents({ dishes: [], plans: [], completions: [completion] })[0])
  .toMatchObject({ type: "wishlist_completed", nameSnapshot: "糖醋排骨" });
expect(buildWishlistSummary(pendingRows, completionRows)).toEqual({ pending: 3, completed: 6 });
```

- [ ] **Step 2: Run tests and observe failure**

Run: `npx vitest run tests/lib/wishlist-history.test.ts tests/lib/history-stats.test.ts`

Expected: FAIL because completion events and summary are absent.

- [ ] **Step 3: Implement server history aggregation and UI card**

The completion event reads snapshot fields, not the current dish. The diary card copy is:

```text
3 个心愿待完成
已完成 6 个 · 去看看
```

Clicking the entire 44 px minimum card opens the existing wishlist view. Timeline completion copy is `完成心愿：${nameSnapshot}` with secondary text `心愿成就 +1`.

- [ ] **Step 4: Run history tests and build**

Run: `npx vitest run tests/lib/wishlist-history.test.ts tests/lib/history-stats.test.ts tests/api/history.test.ts && npm run build`

Expected: PASS and successful build.

- [ ] **Step 5: Commit diary integration**

```bash
git add src/app/api/history/route.ts src/lib/history-data.ts src/lib/history-stats.ts src/lib/types.ts src/components/HistoryPage.tsx src/app/page.tsx tests/lib/wishlist-history.test.ts tests/lib/history-stats.test.ts tests/api/history.test.ts
git commit -m "feat: show wishlist progress in pig diary"
```

---

### Task 8: Separate photo upload and implement provider-neutral Top-3 recognition

**Files:**
- Create: `src/app/api/uploads/dish-photo/route.ts`
- Create: `src/lib/vision/types.ts`
- Create: `src/lib/vision/validate.ts`
- Create: `src/lib/vision/gemini-provider.ts`
- Create: `src/lib/vision/ollama-provider.ts`
- Create: `src/lib/vision/index.ts`
- Replace: `src/app/api/recognize/route.ts`
- Create: `src/app/api/recognize/health/route.ts`
- Modify: `src/lib/types.ts`
- Create: `tests/lib/vision-validate.test.ts`
- Create: `tests/lib/vision-provider.test.ts`
- Modify: `tests/api/generate-recipe.test.ts`

**Interfaces:**
- Produces `VisionRecognitionResult` and `VisionProvider`.
- `POST /api/uploads/dish-photo` accepts multipart `image` and returns `{ imageUrl }`.
- `POST /api/recognize` accepts multipart `image` and returns provider-neutral candidates without uploading.

- [ ] **Step 1: Write validation and fallback tests**

```ts
expect(validateRecognition({
  candidates: [
    { name: "红烧排骨", category: "肉类" },
    { name: "糖醋排骨", category: "肉类" },
    { name: "排骨烧土豆", category: "肉类" },
    { name: "第四个", category: "肉类" },
  ],
  visibleIngredients: ["排骨", "葱"],
})).toMatchObject({ candidates: expect.arrayContaining([expect.objectContaining({ name: "红烧排骨" })]) });
expect(validateRecognition(invalidCategory).candidates).toHaveLength(0);
```

Provider tests use fake providers to prove one retry for Gemini, Qwen-to-Gemini fallback, timeout error mapping, and no fallback in production Gemini-only mode.

- [ ] **Step 2: Run tests and verify failure**

Run: `npx vitest run tests/lib/vision-validate.test.ts tests/lib/vision-provider.test.ts`

Expected: FAIL because the vision provider modules are missing.

- [ ] **Step 3: Define the stable provider contract**

```ts
export type VisionCandidate = { name: string; category: CategoryKey };
export type VisionRecognitionResult = {
  candidates: VisionCandidate[];
  visibleIngredients: string[];
  provider: "gemini" | "ollama";
  requestId: string;
};
export interface VisionProvider {
  name: "gemini" | "ollama";
  recognize(input: { bytes: Uint8Array; mimeType: string; signal: AbortSignal }): Promise<unknown>;
}
```

Prompt JSON shape contains only `candidates` and `visibleIngredients`. `validateRecognition` trims names, restricts six categories, deduplicates candidate names, caps candidates at 3 and visible ingredients at 12.

- [ ] **Step 4: Implement upload and recognition routes**

Upload validates `image/*` and a 10 MB server limit before calling Vercel Blob. Recognition validates image input, uses a 20-second timeout, returns 422 with `{ error, manualFallback: true, requestId }` when all providers fail, and never logs image bytes/Base64.

Health route returns 404 in production. In development it returns only `{ configuredProvider, ollamaReachable, geminiConfigured }`, never secrets.

- [ ] **Step 5: Run vision tests, lint, and build**

Run: `npx vitest run tests/lib/vision-validate.test.ts tests/lib/vision-provider.test.ts && npm run lint && npm run build`

Expected: PASS, no lint errors, successful build.

- [ ] **Step 6: Commit AI service refactor**

```bash
git add src/app/api/uploads src/app/api/recognize src/lib/vision src/lib/types.ts tests/lib/vision-validate.test.ts tests/lib/vision-provider.test.ts tests/api/generate-recipe.test.ts
git commit -m "feat: return safe top-three dish recognition candidates"
```

---

### Task 9: Top-3 form UX and atomic dish-plus-wish completion

**Files:**
- Modify: `src/components/AddDishForm.tsx`
- Create: `src/components/WishlistCompletionDialog.tsx`
- Create: `src/components/WishlistCelebration.tsx`
- Modify: `src/app/api/dishes/route.ts`
- Modify: `src/lib/dish-form.ts`
- Create: `src/lib/dish-wishlist-transaction.ts`
- Modify: `src/app/page.tsx`
- Create: `tests/lib/dish-wishlist-transaction.test.ts`
- Create: `tests/lib/recognition-form-contract.test.ts`
- Modify: `tests/api/dishes.test.ts`

**Interfaces:**
- Produces `findCompletionCandidate(database, { recipeId, name, categoryId, ownerId })`.
- Extends dish POST with `{ recipeId?, wishlistItemId?, completeWishlist?: boolean }`.
- Response includes `{ id, wishlistCompletion?: { id, name, imageUrl } }`.

- [ ] **Step 1: Write transaction rollback and form contract tests**

```ts
it("rolls back dish creation when completion insert fails", async () => {
  await expect(saveDishAndMaybeCompleteWish(database, request, { failAfterWishUpdate: true }))
    .rejects.toThrow();
  expect(await countRows(database, "dishes")).toBe(0);
  expect(await readWishStatus(database, request.wishlistItemId)).toBe("pending");
  expect(await countRows(database, "wishlist_completions")).toBe(0);
});
```

The form contract asserts candidate buttons, “都不对，手动输入”, separate upload endpoint, absence of automatic `ingredients`/`steps` writes from recognition, and the completion confirmation copy.

- [ ] **Step 2: Run tests and verify failure**

Run: `npx vitest run tests/lib/dish-wishlist-transaction.test.ts tests/lib/recognition-form-contract.test.ts`

Expected: FAIL because transaction service and UI contract are missing.

- [ ] **Step 3: Implement atomic database service**

Server behavior:

```ts
// validate dish and duplicate name first
// verify recipe exists when recipeId is supplied
// verify wishlist row is pending and matches recipe or normalized name+category
// transaction: insert dish -> optionally update wish -> insert completion snapshot
// never trust a client-supplied image/name snapshot
```

When `completeWishlist=false`, save only the dish and keep the wish pending. When no valid pending wish exists, ignore completion flags and save the dish normally.

- [ ] **Step 4: Refactor form sequence**

Exact state sequence:

```text
select image → upload /api/uploads/dish-photo → optional recognize → choose candidate or type
→ click 保存到饭盆 → check pending match → show confirmation when matched
→ POST dish once with chosen completion action → show celebration only from server success payload
```

Selecting a candidate changes name only after explicit click. Category changes only if the user has not touched it. Visible ingredients render as read-only chips. Existing manual ingredients and steps remain unchanged.

- [ ] **Step 5: Run transaction, form, duplicate, and build verification**

Run: `npx vitest run tests/lib/dish-wishlist-transaction.test.ts tests/lib/recognition-form-contract.test.ts tests/lib/dish-form.test.ts tests/lib/dish-name-match.test.ts && npm run build`

Expected: PASS and successful build.

- [ ] **Step 6: Commit end-to-end completion flow**

```bash
git add src/components/AddDishForm.tsx src/components/WishlistCompletionDialog.tsx src/components/WishlistCelebration.tsx src/app/api/dishes/route.ts src/lib/dish-form.ts src/lib/dish-wishlist-transaction.ts src/app/page.tsx tests/lib/dish-wishlist-transaction.test.ts tests/lib/recognition-form-contract.test.ts tests/api/dishes.test.ts
git commit -m "feat: complete wishes when a cooked dish is saved"
```

---

### Task 10: Install and evaluate the LAN Qwen POC

**Files:**
- Create: `scripts/vision/evaluate-local.ts`
- Create: `data/vision/.gitkeep`
- Modify: `.gitignore`
- Modify: `.env.example`
- Modify: `README.md`
- Create: `tests/lib/local-vision-config.test.ts`

**Interfaces:**
- Consumes `OLLAMA_BASE_URL`, `OLLAMA_VISION_MODEL`, `VISION_PROVIDER`.
- Produces JSONL evaluation records without committing user photos.

- [ ] **Step 1: Add local configuration tests**

```ts
expect(resolveVisionConfig({ NODE_ENV: "development", VISION_PROVIDER: "ollama" }))
  .toMatchObject({ primary: "ollama", fallback: "gemini", ollamaBaseUrl: "http://127.0.0.1:11434" });
expect(resolveVisionConfig({ NODE_ENV: "production", VISION_PROVIDER: "ollama" }).primary)
  .toBe("gemini");
```

- [ ] **Step 2: Run and verify failure**

Run: `npx vitest run tests/lib/local-vision-config.test.ts`

Expected: FAIL until config resolver is exported and production guard exists.

- [ ] **Step 3: Document and configure Ollama**

Document these commands:

```bash
brew install ollama
ollama serve
ollama pull qwen3-vl:4b-instruct-q4_K_M
ollama run qwen3-vl:4b-instruct-q4_K_M
```

Local environment values:

```dotenv
VISION_PROVIDER=ollama
OLLAMA_BASE_URL=http://127.0.0.1:11434
OLLAMA_VISION_MODEL=qwen3-vl:4b-instruct-q4_K_M
```

Do not add these values to Vercel production. Add `data/vision/*.jpg`, `*.jpeg`, `*.png`, and `*.jsonl` to `.gitignore`.

- [ ] **Step 4: Implement local evaluation runner**

The runner accepts `--input data/vision/input --expected data/vision/expected.json`, calls the same Ollama provider, and writes `data/vision/qwen3-vl-4b-results.jsonl` with one row per image:

```ts
type EvaluationRow = {
  file: string;
  expectedName: string;
  candidates: string[];
  top1Hit: boolean;
  top3Hit: boolean;
  elapsedMs: number;
  provider: "ollama";
  error: string | null;
};
```

- [ ] **Step 5: Install model and verify LAN behavior**

Run: `curl --fail http://127.0.0.1:11434/api/tags`

Expected: HTTP 200 and `qwen3-vl:4b-instruct-q4_K_M` listed.

Run app: `npm run dev -- --hostname 0.0.0.0`

From a phone on the same Wi‑Fi, open the LAN URL, upload one test image, and verify `/api/recognize` returns `provider: "ollama"`. Stop Ollama and repeat; verify Gemini fallback without losing the photo.

- [ ] **Step 6: Commit POC tooling and documentation**

```bash
git add .gitignore .env.example README.md scripts/vision data/vision/.gitkeep tests/lib/local-vision-config.test.ts src/lib/vision
git commit -m "chore: add LAN Qwen vision evaluation workflow"
```

---

### Task 11: Full regression, production migration, import, and deployment

**Files:**
- Modify: `tests/manual-test-cases.md`
- Modify: `README.md`
- Create: `docs/releases/2026-07-16-recipes-wishlist.md`

**Interfaces:**
- Consumes all tasks above.
- Produces a verified production deployment and release note.

- [ ] **Step 1: Run the complete isolated verification suite**

Run: `npm test`

Expected: all configured lib/config tests pass with zero failures.

Run: `npm run test:db`

Expected: all isolated database tests pass and no production URL is accessed.

Run: `npm run lint`

Expected: zero errors; pre-existing warnings must be listed rather than hidden.

Run: `npm run build`

Expected: production build exits 0 and lists all new API routes.

- [ ] **Step 2: Review database changes before production writes**

Run: `npm run db:migrate:recipes`

Expected: dry-run prints target hostname, six new tables, and additive columns only. It must not print `DROP`, `DELETE`, or secrets.

Create and verify an application-level snapshot before any write:

```bash
npm run db:backup -- --output backups/2026-07-16-before-recipes.json
test -s backups/2026-07-16-before-recipes.json
```

Expected: the backup JSON contains table DDL and rows for `categories`, `dishes`, and `meal_plans`, contains no auth token, and is excluded from Git. Record its absolute path and SHA-256 hash in the local deployment log; the release note records only the filename and hash. Then run:

```bash
npm run db:migrate:recipes -- --apply
npm run recipes:import -- --dry-run
npm run recipes:import -- --apply
```

Expected: migration succeeds; import counts match `data/howtocook/import-report.json`; existing `dishes` row count and IDs are unchanged.

- [ ] **Step 3: Verify production data before deploying UI**

Run read-only checks for:

```sql
SELECT count(*) FROM dishes;
SELECT count(*) FROM recipes;
SELECT count(*) FROM recipe_ingredients;
SELECT count(*) FROM recipe_steps;
SELECT count(*) FROM wishlist_items;
```

Expected: existing dish count matches the pre-migration count; recipe count matches the import report; wishlist count is initially unchanged/zero.

- [ ] **Step 4: Deploy and smoke-test the public site**

Run: `vercel deploy --prod --yes`

Verify with public URL:

```bash
curl --fail --max-time 30 https://zhuzhu-canteen.vercel.app/
curl --fail --max-time 30 'https://zhuzhu-canteen.vercel.app/api/recipes/search?q=排骨'
curl --fail --max-time 30 'https://zhuzhu-canteen.vercel.app/api/wishlist?status=pending'
curl --fail --max-time 30 'https://zhuzhu-canteen.vercel.app/api/recommendations?category=all'
```

Expected: HTTP 200, recipe search returns at least one item, wishlist returns counts, and recommendations identify their source.

- [ ] **Step 5: Perform mobile acceptance checks**

Walk through every acceptance item in `tests/manual-test-cases.md` on the public site and LAN site. Specifically verify no page clips at the bottom, image thumbnails load on two different phones, adding a wish to a meal does not complete it, and saving a photographed wish creates exactly one dish and one completion record.

- [ ] **Step 6: Write release note and commit verification documentation**

The release note records commit range, migration/backup identifiers, imported recipe counts, test totals, deployment URL, known limitations, and Qwen POC status. Do not include credentials or private photo names.

```bash
git add README.md tests/manual-test-cases.md docs/releases/2026-07-16-recipes-wishlist.md
git commit -m "docs: release recipes wishlist and top-three recognition"
git tag v0.3.0
git push origin main --tags
```

Expected: `main` and tag `v0.3.0` point to the verified release commit.

---

## Final Verification Checklist

- [ ] Existing dish IDs, images, names, and created times are unchanged by migration/import.
- [ ] Recipe import is reproducible from revision `753d4940fe06ce0d5ef767e8fe046c88635a391c`.
- [ ] Search covers exact names, aliases, and substring matches.
- [ ] Pending wishes cannot be duplicated.
- [ ] Meal planning does not complete wishes.
- [ ] Completed snapshots survive dish deletion.
- [ ] Recommendation cards show source and deduplicate cross-source matches.
- [ ] AI returns at most three candidates and never writes recipe steps/amounts.
- [ ] Photo persists through AI failure.
- [ ] Dish creation and wish completion are atomic.
- [ ] Public Gemini and LAN Ollama use the same response contract.
- [ ] Full tests, lint, build, public API smoke tests, and two-phone manual checks pass before completion is claimed.

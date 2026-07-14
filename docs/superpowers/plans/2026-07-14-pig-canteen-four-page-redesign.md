# 猪猪食堂四页养成式改版 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在不破坏现有真实数据与完整功能的前提下，将应用升级为参考稿中的“喂饭、饭盆、菜单、日记”四页养成式体验。

**Architecture:** 保留 `Home` 的全局数据和弹层协调职责，逐页替换现有组件的展示层；新增纯函数模块管理每日饱饱值、分类视觉信息和日记统计。所有业务写操作继续使用现有 API，养成状态仅按日期保存在浏览器本地，不进入数据库。

**Tech Stack:** Next.js 16、React 19、TypeScript、Tailwind CSS 4、Drizzle ORM、Vitest、Safari 移动端走查。

## Global Constraints

- 视觉参考固定为 `/Users/kanyun/Documents/猪猪食堂 2/pig-canteen.html`。
- 猪猪素材固定为 `/Users/kanyun/Documents/猪猪食堂 2/pig-mascot-cutout.png`。
- 不改变或清理现有真实菜品数据。
- 投喂每次增加 20%，每天从 0% 开始，最大 100%。
- 投喂状态不写数据库，不进入日记，不增加菜品制作次数。
- 投喂后立即打开现有拍照/AI 记录表单，取消表单不回退饱饱值。
- 创建查重、AI 识别、菜名生成参考做法、全部字段编辑、原创建时间保留、永久删除确认必须继续可用。
- 首页长按编辑/删除和饭盆右滑删除必须继续可用。
- 四页底部内容不得被悬浮导航遮挡。
- 不增加回收站、撤销删除、账号系统或演示菜品。

---

## File Structure

- Create `src/lib/categories.ts`: 分类名称、图标、颜色和成就文案的唯一映射。
- Create `src/lib/satiety.ts`: 日期键、每日状态读取、增加与限幅纯函数。
- Create `src/lib/history-stats.ts`: 从真实历史事件生成月度、连续天数和分类成就。
- Create `src/components/PigHero.tsx`: 猪猪头图、饱饱值和投喂动画。
- Create `public/pig-mascot-cutout.png`: 本地静态猪猪素材。
- Modify `src/app/globals.css`: 新主题变量、页面壳、悬浮导航和动效。
- Modify `src/app/page.tsx`: 全局提示、页面壳、历史统计数据与页面接口协调。
- Modify `src/components/RecordPage.tsx`: 喂饭页。
- Modify `src/components/LibraryPage.tsx`: 饭盆页。
- Modify `src/components/TodayPage.tsx`: 菜单页。
- Modify `src/components/HistoryPage.tsx`: 日记页。
- Modify `src/components/TabBar.tsx`: “喂饭、饭盆、菜单、日记”悬浮导航。
- Modify `src/components/AddDishForm.tsx`: 新主题表单，不改变保存链路。
- Modify `src/components/DishDetail.tsx`: 新主题完整详情，不删除已有能力。
- Modify `src/components/DeleteDishDialog.tsx`: 新主题确认弹框。
- Modify `src/lib/layout.ts`: 统一安全区与导航避让。
- Test `tests/lib/categories.test.ts`、`tests/lib/satiety.test.ts`、`tests/lib/history-stats.test.ts`、现有契约测试。

---

### Task 1: 共享主题与分类元数据

**Files:**
- Create: `src/lib/categories.ts`
- Modify: `src/app/globals.css`
- Modify: `src/lib/layout.ts`
- Test: `tests/lib/categories.test.ts`
- Test: `tests/lib/layout.test.ts`

**Interfaces:**
- Produces: `getCategoryMeta(categoryId: number | null): CategoryMeta`
- Produces: `CATEGORY_META: readonly CategoryMeta[]`
- Produces: `PAGE_CONTENT_CLASS: string`

- [ ] **Step 1: Write failing category metadata tests**

```ts
import { describe, expect, it } from "vitest";
import { getCategoryMeta } from "../../src/lib/categories";

describe("category metadata", () => {
  it("maps database category ids to the shared display model", () => {
    expect(getCategoryMeta(1)).toMatchObject({ name: "肉类", icon: "🥩", achievement: "肉肉达人" });
    expect(getCategoryMeta(6)).toMatchObject({ name: "其他", icon: "🍳", achievement: "惊喜探索家" });
  });
  it("uses the safe fallback for null and unknown ids", () => {
    expect(getCategoryMeta(null).name).toBe("其他");
    expect(getCategoryMeta(99).icon).toBe("🍳");
  });
});
```

- [ ] **Step 2: Run the focused tests and verify RED**

Run: `npx vitest run tests/lib/categories.test.ts tests/lib/layout.test.ts`

Expected: FAIL because `src/lib/categories.ts` does not exist and the old layout class lacks the new page-shell marker.

- [ ] **Step 3: Implement the shared mapping and page theme**

```ts
export interface CategoryMeta {
  id: number;
  name: string;
  icon: string;
  className: string;
  achievement: string;
}

export const CATEGORY_META: readonly CategoryMeta[] = [
  { id: 1, name: "肉类", icon: "🥩", className: "category-meat", achievement: "肉肉达人" },
  { id: 2, name: "青菜", icon: "🥬", className: "category-veg", achievement: "蔬菜勇士" },
  { id: 3, name: "主食", icon: "🍚", className: "category-rice", achievement: "主食冠军" },
  { id: 4, name: "海鲜", icon: "🦐", className: "category-sea", achievement: "海鲜新星" },
  { id: 5, name: "汤类", icon: "🍲", className: "category-soup", achievement: "喝汤高手" },
  { id: 6, name: "其他", icon: "🍳", className: "category-other", achievement: "惊喜探索家" },
] as const;

export function getCategoryMeta(categoryId: number | null): CategoryMeta {
  return CATEGORY_META.find((item) => item.id === categoryId) ?? CATEGORY_META[5];
}
```

Set `PAGE_CONTENT_CLASS` to `"page-content"`. Add CSS variables `--cream`, `--paper`, `--coral`, `--coral-dark`, `--peach`, `--cocoa`, `--muted`, `--line`, `--green` and define `.app-stage`, `.app-phone`, `.page-content`, `.section-head`, `.category-icon`, `.surface-card` with mobile safe-area padding and desktop width capped at `430px`.

- [ ] **Step 4: Run focused tests and verify GREEN**

Run: `npx vitest run tests/lib/categories.test.ts tests/lib/layout.test.ts`

Expected: both test files pass.

- [ ] **Step 5: Commit**

```bash
git add src/lib/categories.ts src/app/globals.css src/lib/layout.ts tests/lib/categories.test.ts tests/lib/layout.test.ts
git commit -m "feat: add pig canteen theme foundations"
```

### Task 2: 每日饱饱值状态

**Files:**
- Create: `src/lib/satiety.ts`
- Create: `src/components/PigHero.tsx`
- Create: `public/pig-mascot-cutout.png`
- Test: `tests/lib/satiety.test.ts`

**Interfaces:**
- Produces: `SatietyState = { date: string; value: number }`
- Produces: `readDailySatiety(storage: Pick<Storage, "getItem">, today: string): SatietyState`
- Produces: `increaseSatiety(state: SatietyState, today: string): SatietyState`
- Produces: `<PigHero value={number} celebrating={boolean} />`

- [ ] **Step 1: Write failing satiety tests**

```ts
import { describe, expect, it } from "vitest";
import { increaseSatiety, readDailySatiety } from "../../src/lib/satiety";

describe("daily satiety", () => {
  it("reads today's valid persisted value", () => {
    const storage = { getItem: () => JSON.stringify({ date: "2026-07-14", value: 40 }) };
    expect(readDailySatiety(storage, "2026-07-14")).toEqual({ date: "2026-07-14", value: 40 });
  });
  it("resets stale or invalid data", () => {
    const storage = { getItem: () => JSON.stringify({ date: "2026-07-13", value: 80 }) };
    expect(readDailySatiety(storage, "2026-07-14")).toEqual({ date: "2026-07-14", value: 0 });
  });
  it("adds twenty and caps at one hundred", () => {
    expect(increaseSatiety({ date: "2026-07-14", value: 90 }, "2026-07-14").value).toBe(100);
  });
});
```

- [ ] **Step 2: Run the focused test and verify RED**

Run: `npx vitest run tests/lib/satiety.test.ts`

Expected: FAIL because the satiety module does not exist.

- [ ] **Step 3: Implement pure state functions**

```ts
export const SATIETY_STORAGE_KEY = "zhuzhu-satiety-v1";
export interface SatietyState { date: string; value: number }

export function readDailySatiety(storage: Pick<Storage, "getItem">, today: string): SatietyState {
  try {
    const parsed = JSON.parse(storage.getItem(SATIETY_STORAGE_KEY) || "null") as SatietyState | null;
    if (parsed?.date === today && Number.isFinite(parsed.value)) {
      return { date: today, value: Math.max(0, Math.min(100, parsed.value)) };
    }
  } catch {}
  return { date: today, value: 0 };
}

export function increaseSatiety(state: SatietyState, today: string): SatietyState {
  const current = state.date === today ? state.value : 0;
  return { date: today, value: Math.min(100, current + 20) };
}
```

Copy the approved mascot with `cp '/Users/kanyun/Documents/猪猪食堂 2/pig-mascot-cutout.png' public/pig-mascot-cutout.png`. Build `PigHero` with a numeric meter, progress track, status speech, `next/image`, celebration sparks, `priority`, and `prefers-reduced-motion` compatible CSS classes.

- [ ] **Step 4: Run focused tests and verify GREEN**

Run: `npx vitest run tests/lib/satiety.test.ts`

Expected: all satiety tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/lib/satiety.ts src/components/PigHero.tsx public/pig-mascot-cutout.png tests/lib/satiety.test.ts src/app/globals.css
git commit -m "feat: add daily pig satiety experience"
```

### Task 3: 喂饭页与记录入口

**Files:**
- Modify: `src/components/RecordPage.tsx`
- Modify: `src/app/page.tsx`
- Test: `tests/lib/record-page-contract.test.ts`

**Interfaces:**
- Consumes: `PigHero`, `readDailySatiety`, `increaseSatiety`, `getCategoryMeta`
- Preserves: `onDishClick`, `onAddClick`, `onEditDish`, `onDeleteDish`

- [ ] **Step 1: Extend the page contract test**

```ts
expect(source).toContain("PigHero");
expect(source).toContain("increaseSatiety");
expect(source).toContain("onAddClick");
expect(source).toContain("DishActionMenu");
expect(source).toContain("IntersectionObserver");
expect(source).toContain("继续下滑加载更多");
```

- [ ] **Step 2: Run the contract test and verify RED**

Run: `npx vitest run tests/lib/record-page-contract.test.ts`

Expected: FAIL on `PigHero` and `increaseSatiety`.

- [ ] **Step 3: Implement the feed sequence without changing record callbacks**

```ts
const handleFeed = () => {
  const today = new Date().toISOString().slice(0, 10);
  const next = increaseSatiety(satiety, today);
  setSatiety(next);
  setCelebrating(true);
  try { localStorage.setItem(SATIETY_STORAGE_KEY, JSON.stringify(next)); } catch {}
  window.setTimeout(() => setCelebrating(false), 700);
  window.setTimeout(onAddClick, 450);
};
```

Render the new title row, `PigHero`, coral/dark feed button, “猪猪的饭盆” section header and existing infinite dish grid. Replace repeated category labels with `getCategoryMeta`. Keep pointer movement tolerance, 500ms long press, action menu and card detail click unchanged.

- [ ] **Step 4: Run page contracts and the full library suite**

Run: `npx vitest run tests/lib/record-page-contract.test.ts tests/lib/home-pagination.test.ts tests/lib/dish-gestures.test.ts tests/lib/satiety.test.ts`

Expected: all focused tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/components/RecordPage.tsx src/app/page.tsx tests/lib/record-page-contract.test.ts
git commit -m "feat: redesign the feed page"
```

### Task 4: 饭盆页与删除完整性

**Files:**
- Modify: `src/components/LibraryPage.tsx`
- Modify: `src/components/SwipeableDishRow.tsx`
- Modify: `src/components/DeleteDishDialog.tsx`
- Test: `tests/lib/swipeable-row-contract.test.ts`
- Create: `tests/lib/library-page-contract.test.ts`

**Interfaces:**
- Consumes: `getCategoryMeta`
- Preserves: `onDishClick(dish)`, `onDeleteDish(dish)` and the existing swipe threshold behavior

- [ ] **Step 1: Write failing style-and-behavior contracts**

```ts
expect(librarySource).toContain("饭盆里有什么？");
expect(librarySource).toContain("搜索菜品或食材");
expect(librarySource).toContain("getCategoryMeta");
expect(librarySource).toContain("SwipeableDishRow");
expect(swipeSource).toContain("pointerId");
expect(swipeSource).toContain("setPointerCapture");
expect(swipeSource).toContain("onDelete");
```

- [ ] **Step 2: Run focused tests and verify RED**

Run: `npx vitest run tests/lib/library-page-contract.test.ts tests/lib/swipeable-row-contract.test.ts`

Expected: the new library copy and shared category mapping assertions fail.

- [ ] **Step 3: Implement the new list without replacing gesture logic**

Filter with:

```ts
const query = search.trim().toLowerCase();
const filtered = dishes.filter((dish) => {
  const meta = getCategoryMeta(dish.categoryId);
  const ingredients = parseIngredients(dish.ingredients).join(" ").toLowerCase();
  return (catFilter === "all" || meta.name === catFilter)
    && (!query || `${dish.name} ${ingredients} ${meta.name}`.toLowerCase().includes(query));
});
```

Render reference-style chips, category-colored thumbnail, real image when available, ingredients preview, cooked count and arrow. Retain `SwipeableDishRow` as the outer interaction wrapper. Restyle `DeleteDishDialog` with the coral theme while retaining its confirm/cancel/loading/error props.

- [ ] **Step 4: Run swipe, library and deletion tests**

Run: `npx vitest run tests/lib/library-page-contract.test.ts tests/lib/swipeable-row-contract.test.ts tests/lib/dish-gestures.test.ts`

Expected: all focused tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/components/LibraryPage.tsx src/components/SwipeableDishRow.tsx src/components/DeleteDishDialog.tsx tests/lib/library-page-contract.test.ts tests/lib/swipeable-row-contract.test.ts
git commit -m "feat: redesign the dish library"
```

### Task 5: 真实菜单页改版

**Files:**
- Modify: `src/components/TodayPage.tsx`
- Create: `tests/lib/today-page-contract.test.ts`

**Interfaces:**
- Consumes: `Dish[]`, `getCategoryMeta`, existing `/api/plans`
- Preserves: random category selection, plan POST, plan DELETE, `refresh()`

- [ ] **Step 1: Write failing menu contracts**

```ts
expect(source).toContain("让猪猪帮你决定");
expect(source).toContain("猪猪随机推荐");
expect(source).toContain('fetch("/api/plans"');
expect(source).toContain('method: "POST"');
expect(source).toContain('method: "DELETE"');
expect(source).toContain("refresh()");
```

- [ ] **Step 2: Run the contract and verify RED**

Run: `npx vitest run tests/lib/today-page-contract.test.ts`

Expected: FAIL on the new reference copy.

- [ ] **Step 3: Replace the presentation while preserving request functions**

Render the reference chip row, peach recommendation panel, real image/category fallback, “换一道，让猪猪再想想”, three meal buttons and three meal slots. Use a local operation message instead of `alert` for successful actions; retain visible retryable errors for failed POST/DELETE. After both add and remove, call `await fetchTodayPlans()` and `refresh()`.

```ts
const removePlan = async (id: number) => {
  const response = await fetch(`/api/plans?id=${id}`, { method: "DELETE" });
  if (!response.ok) throw new Error("移除失败，请重试");
  await fetchTodayPlans();
  refresh();
};
```

- [ ] **Step 4: Run menu and history performance contracts**

Run: `npx vitest run tests/lib/today-page-contract.test.ts tests/lib/history-performance-contract.test.ts`

Expected: both files pass.

- [ ] **Step 5: Commit**

```bash
git add src/components/TodayPage.tsx tests/lib/today-page-contract.test.ts
git commit -m "feat: redesign the daily menu"
```

### Task 6: 真实日记统计

**Files:**
- Create: `src/lib/history-stats.ts`
- Modify: `src/lib/types.ts`
- Modify: `src/components/HistoryPage.tsx`
- Test: `tests/lib/history-stats.test.ts`
- Modify: `tests/lib/history-performance-contract.test.ts`

**Interfaces:**
- Consumes: `HistoryEvent[]`
- Produces: `HistoryStats = { monthlyMeals: number; consecutiveDays: number; unlockedCategories: number; categories: CategoryAchievement[]; weekMeals: number }`
- Produces: `buildHistoryStats(events: HistoryEvent[], today: string): HistoryStats`

- [ ] **Step 1: Write failing history statistics tests**

```ts
it("counts only real meal events for monthly and category achievements", () => {
  const stats = buildHistoryStats(events, "2026-07-14");
  expect(stats.monthlyMeals).toBe(2);
  expect(stats.unlockedCategories).toBe(2);
  expect(stats.categories.find((item) => item.categoryId === 1)?.times).toBe(1);
});

it("calculates consecutive meal days ending today or yesterday", () => {
  expect(buildHistoryStats(consecutiveEvents, "2026-07-14").consecutiveDays).toBe(3);
});
```

- [ ] **Step 2: Run focused tests and verify RED**

Run: `npx vitest run tests/lib/history-stats.test.ts tests/lib/history-data.test.ts`

Expected: FAIL because `buildHistoryStats` does not exist.

- [ ] **Step 3: Implement statistics using meal events only**

```ts
const meals = events.filter((event) => event.type === "meal_planned");
const month = today.slice(0, 7);
const monthly = meals.filter((event) => event.date.startsWith(month));
const counts = new Map<number, number>();
for (const event of monthly) {
  const id = getCategoryMeta(event.dish.categoryId).id;
  counts.set(id, (counts.get(id) ?? 0) + 1);
}
```

Build category rows for all six categories, set progress relative to the largest real count, derive the favorite dish per category, count meal days in the current seven-day window, and calculate the consecutive run from today or yesterday. Do not count `dish_created` events in meal statistics.

- [ ] **Step 4: Build the diary presentation**

Render the reference history hero with the mascot, monthly meal count, mini stats, six category achievement cards and the existing real event timeline. Keep `loading` handling and `onDishClick(event.dish)`. Do not add a fetch inside `HistoryPage`.

- [ ] **Step 5: Run history tests and commit**

Run: `npx vitest run tests/lib/history-stats.test.ts tests/lib/history-data.test.ts tests/lib/history-performance-contract.test.ts`

Expected: all history tests pass.

```bash
git add src/lib/history-stats.ts src/lib/types.ts src/components/HistoryPage.tsx tests/lib/history-stats.test.ts tests/lib/history-performance-contract.test.ts
git commit -m "feat: add real pig diary statistics"
```

### Task 7: 导航、弹层与完整功能换肤

**Files:**
- Modify: `src/components/TabBar.tsx`
- Modify: `src/components/AddDishForm.tsx`
- Modify: `src/components/DishDetail.tsx`
- Modify: `src/app/page.tsx`
- Modify: `src/app/globals.css`
- Create: `tests/lib/four-page-shell-contract.test.ts`

**Interfaces:**
- Preserves: `Tab = "record" | "library" | "today" | "history"`
- Preserves: all current form save, duplicate, edit, generate and recognition handlers

- [ ] **Step 1: Write a failing shell contract**

```ts
expect(tabSource).toContain('label: "喂饭"');
expect(tabSource).toContain('label: "饭盆"');
expect(tabSource).toContain('label: "菜单"');
expect(tabSource).toContain('label: "日记"');
expect(homeSource).toContain("app-stage");
expect(formSource).toContain("handleRecognize");
expect(formSource).toContain("handleGenerateRecipe");
expect(detailSource).toContain("onEdit");
```

- [ ] **Step 2: Run the shell contract and verify RED**

Run: `npx vitest run tests/lib/four-page-shell-contract.test.ts`

Expected: FAIL on the new labels and app shell.

- [ ] **Step 3: Implement the floating tab bar and app shell**

Keep tab keys unchanged and update only labels/icons/classes. Wrap page content in:

```tsx
<main className="app-stage">
  <div className="app-phone">{activePage}<TabBar active={tab} onTabChange={setTab} /></div>
</main>
```

Use a fixed mobile tab bar scoped to `.app-phone`, with safe-area padding, translucent paper background and active coral pill. Restyle load, error and toast states in the same theme.

- [ ] **Step 4: Restyle form and detail without changing handlers**

Replace green utility colors with theme classes, retain the full scrollable content area and bottom safe-area padding. Confirm source still includes `handleRecognize`, `handleGenerateRecipe`, `readDishSaveResult`, `onOpenExisting`, `onEdit`, `addToPlan`, ingredients and steps rendering.

- [ ] **Step 5: Run contracts and commit**

Run: `npx vitest run tests/lib/four-page-shell-contract.test.ts tests/lib/dish-form.test.ts tests/lib/recipe-fallback.test.ts tests/lib/image-display.test.ts`

Expected: all focused tests pass.

```bash
git add src/components/TabBar.tsx src/components/AddDishForm.tsx src/components/DishDetail.tsx src/app/page.tsx src/app/globals.css tests/lib/four-page-shell-contract.test.ts
git commit -m "feat: complete the four-page pig canteen shell"
```

### Task 8: 全量回归与真实页面走查

**Files:**
- Modify only files required by failures found during this task.

**Interfaces:**
- Verifies all Global Constraints and the design acceptance checklist.

- [ ] **Step 1: Run the complete automated verification**

Run separately:

```bash
npm test
npm run lint
npm run build
git diff --check
```

Expected: tests and build exit 0; lint has 0 errors; diff check has no output.

- [ ] **Step 2: Verify live API and data stability**

Request `/api/dishes`, `/api/history`, and `/api/plans?date=<today>` from the running app. Record response status and counts before UI interaction. Perform no test saves or deletes against the real database.

- [ ] **Step 3: Walk all four pages in Safari**

Verify:

1. 喂饭 → 投喂增加 20%、动画播放、记录表单打开、取消后饱饱值保留。
2. 饭盆 → 搜索菜名/用料、分类筛选、点详情、右滑露出删除但取消确认。
3. 菜单 → 换一道、分类推荐、查看真实今日三餐；不提交测试计划。
4. 日记 → 统计和时间线来自真实数据，二次切换无加载等待。
5. 每页滚动到底部，最后一项不被导航遮挡。

- [ ] **Step 4: Verify mobile layout and image rendering**

Use a narrow Safari viewport and the LAN URL. Confirm mascot preloads, real dish thumbnails render, fallback icons are visible, long press does not trigger normal click, and swipe does not trigger row navigation.

- [ ] **Step 5: Fix only verified regressions and rerun the relevant test plus full verification**

For every discovered regression, add or extend the closest contract/unit test first, observe failure, apply the smallest correction, then rerun `npm test`, `npm run lint`, `npm run build`, and `git diff --check`.

- [ ] **Step 6: Commit verified integration**

```bash
git add src tests public
git commit -m "test: verify four-page pig canteen redesign"
```

Do not stage unrelated existing changes such as `next.config.ts`, `CLAUDE.md`, or `docs/design-prototype.html` unless a verified regression requires a scoped change and the user separately approves it.

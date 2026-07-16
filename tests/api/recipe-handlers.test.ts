import { createClient, type Client } from "@libsql/client";
import { drizzle } from "drizzle-orm/libsql";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { createRecipeDetailHandler } from "../../src/app/api/recipes/[id]/route";
import { createRecipeSearchHandler } from "../../src/app/api/recipes/search/route";
import { applyRecipesWishlistMigration } from "../../src/db/migrate";

describe("recipe read handlers", () => {
  let client: Client;
  let searchHandler: ReturnType<typeof createRecipeSearchHandler>;
  let detailHandler: ReturnType<typeof createRecipeDetailHandler>;

  beforeEach(async () => {
    client = createClient({ url: ":memory:" });
    await client.executeMultiple(`
      CREATE TABLE categories (
        id integer PRIMARY KEY AUTOINCREMENT, name text NOT NULL,
        sort_order integer NOT NULL DEFAULT 0, created_at text NOT NULL
      );
      CREATE TABLE dishes (
        id text PRIMARY KEY, name text NOT NULL, name_key text UNIQUE, category_id integer,
        image_url text, ingredients text NOT NULL DEFAULT '[]', steps text NOT NULL DEFAULT '[]',
        times_cooked integer NOT NULL DEFAULT 0, created_at text NOT NULL, updated_at text NOT NULL
      );
      CREATE TABLE meal_plans (
        id integer PRIMARY KEY AUTOINCREMENT, date text NOT NULL, meal_type text NOT NULL,
        dish_id text REFERENCES dishes(id), notes text, created_at text NOT NULL
      );
    `);
    await applyRecipesWishlistMigration(client);
    await client.executeMultiple(`
      INSERT INTO categories (id,name,sort_order,created_at) VALUES
        (1,'肉类',1,'2026-07-17T00:00:00.000Z'),
        (2,'青菜',2,'2026-07-17T00:00:00.000Z');
      INSERT INTO recipes VALUES (
        'recipe-1','木樨肉','木樨肉','肉类','家常快手菜',2,20,
        'HowToCook','https://example.test/recipe-1','MIT','dishes/meat_dish/木樨肉.md','revision-1',
        'hash-1',NULL,'2026-07-17T00:00:00.000Z','2026-07-17T00:00:00.000Z'
      );
      INSERT INTO recipes VALUES (
        'recipe-fallback','清炒菜心','清炒菜心','青菜',NULL,NULL,NULL,
        'HowToCook','https://example.test/recipe-fallback','MIT','dishes/vegetable_dish/清炒菜心.md','revision-1',
        'hash-2',NULL,'2026-07-17T00:00:00.000Z','2026-07-17T00:00:00.000Z'
      );
      INSERT INTO recipe_aliases (recipe_id,alias,alias_key) VALUES ('recipe-1','木须肉','木须肉');
      INSERT INTO recipe_ingredients
        (recipe_id,sort_order,ingredient_name,amount_value,amount_unit,amount_text,optional,note) VALUES
        ('recipe-1',1,'鸡蛋',2,'个','2 个',0,NULL),
        ('recipe-1',0,'猪肉',200,'克','200 克',0,'切丝');
      INSERT INTO recipe_steps (recipe_id,sort_order,text,section_name) VALUES
        ('recipe-1',1,'加入鸡蛋翻炒',NULL),
        ('recipe-1',0,'猪肉炒至变色','炒制');
      INSERT INTO wishlist_items VALUES (
        'wish-1',NULL,'recipe-1',NULL,'木樨肉','肉类','pending',
        '2026-07-17T00:00:00.000Z',NULL,NULL,
        '2026-07-17T00:00:00.000Z','2026-07-17T00:00:00.000Z'
      );
      INSERT INTO wishlist_items VALUES (
        'wish-fallback',NULL,NULL,'清炒菜心','清炒菜心','青菜','pending',
        '2026-07-17T00:00:00.000Z',NULL,NULL,
        '2026-07-17T00:00:00.000Z','2026-07-17T00:00:00.000Z'
      );
      INSERT INTO dishes
        (id,name,name_key,category_id,image_url,ingredients,steps,recipe_id,wishlist_item_id,owner_id,times_cooked,created_at,updated_at) VALUES
        ('dish-1','木樨肉','木樨肉',1,NULL,'[]','[]','recipe-1',NULL,NULL,1,
         '2026-07-17T00:00:00.000Z','2026-07-17T00:00:00.000Z'),
        ('dish-fallback','清炒菜心','清炒菜心',2,NULL,'[]','[]',NULL,NULL,NULL,1,
         '2026-07-17T00:00:00.000Z','2026-07-17T00:00:00.000Z');
    `);

    const database = drizzle(client);
    searchHandler = createRecipeSearchHandler(database);
    detailHandler = createRecipeDetailHandler(database);
  });

  afterEach(() => client.close());

  it("returns alias matches with pending-wishlist and cooked flags", async () => {
    const response = await searchHandler(new Request("http://local.test/api/recipes/search?q=%20%E6%9C%A8%E9%A1%BB%E8%82%89%20"));

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      query: "木须肉",
      items: [{ id: "recipe-1", name: "木樨肉", isWishlisted: true, isCooked: true }],
    });
  });

  it("uses normalized name and category when recipe ids are absent", async () => {
    const response = await searchHandler(new Request("http://local.test/api/recipes/search?q=%E8%8F%9C%E5%BF%83"));

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      items: [{ id: "recipe-fallback", isWishlisted: true, isCooked: true }],
    });
  });

  it("falls back across different recipe ids with the same normalized name and category", async () => {
    await client.executeMultiple(`
      INSERT INTO recipes VALUES (
        'recipe-same-a','同名菜','同名菜','肉类',NULL,NULL,NULL,
        'HowToCook','https://example.test/same-a','MIT','dishes/meat_dish/同名菜-a.md','revision-1',
        'hash-same-a',NULL,'2026-07-17T00:00:00.000Z','2026-07-17T00:00:00.000Z'
      );
      INSERT INTO recipes VALUES (
        'recipe-same-b','同名菜','同名菜','肉类',NULL,NULL,NULL,
        'HowToCook','https://example.test/same-b','MIT','dishes/meat_dish/同名菜-b.md','revision-1',
        'hash-same-b',NULL,'2026-07-17T00:00:00.000Z','2026-07-17T00:00:00.000Z'
      );
      INSERT INTO wishlist_items VALUES (
        'wish-same-b',NULL,'recipe-same-b',NULL,'同名菜','肉类','pending',
        '2026-07-17T00:00:00.000Z',NULL,NULL,
        '2026-07-17T00:00:00.000Z','2026-07-17T00:00:00.000Z'
      );
      INSERT INTO dishes
        (id,name,name_key,category_id,image_url,ingredients,steps,recipe_id,wishlist_item_id,owner_id,times_cooked,created_at,updated_at) VALUES
        ('dish-same-b','同名菜','同名菜',1,NULL,'[]','[]','recipe-same-b',NULL,NULL,1,
         '2026-07-17T00:00:00.000Z','2026-07-17T00:00:00.000Z');
    `);

    const response = await searchHandler(new Request("http://local.test/api/recipes/search?q=%E5%90%8C%E5%90%8D%E8%8F%9C"));
    const body = await response.json() as {
      items: Array<{ id: string; isWishlisted: boolean; isCooked: boolean }>;
    };

    expect(body.items.find(({ id }) => id === "recipe-same-a")).toMatchObject({
      isWishlisted: true,
      isCooked: true,
    });
  });

  it("orders equal-rank matches by name and caps results at 30", async () => {
    for (let index = 31; index >= 1; index -= 1) {
      const suffix = String(index).padStart(2, "0");
      await client.execute({
        sql: `INSERT INTO recipes
          (id,name,name_key,category_key,source_name,source_url,source_license,source_path,source_revision,
           content_hash,created_at,updated_at)
          VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`,
        args: [
          `limit-${suffix}`, `测试菜${suffix}`, `测试菜${suffix}`, "其他", "HowToCook",
          `https://example.test/limit-${suffix}`, "MIT", `dishes/other/测试菜${suffix}.md`, "revision-1",
          `hash-${suffix}`, "2026-07-17T00:00:00.000Z", "2026-07-17T00:00:00.000Z",
        ],
      });
    }

    const response = await searchHandler(new Request("http://local.test/api/recipes/search?q=%E6%B5%8B%E8%AF%95"));
    const body = await response.json() as { items: Array<{ name: string }> };

    expect(body.items).toHaveLength(30);
    expect(body.items.map(({ name }) => name)).toEqual(
      [...body.items.map(({ name }) => name)].sort((left, right) => left.localeCompare(right, "zh-CN")),
    );
    expect(body.items.at(-1)?.name).toBe("测试菜30");
  });

  it.each([
    ["", "请输入菜谱名称"],
    ["a".repeat(51), "搜索词不能超过 50 个字符"],
  ])("rejects an invalid query", async (query, error) => {
    const response = await searchHandler(new Request(`http://local.test/api/recipes/search?q=${query}`));

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({ error });
  });

  it("returns complete detail with sorted children and source metadata", async () => {
    const response = await detailHandler(new Request("http://local.test/api/recipes/recipe-1"), {
      params: Promise.resolve({ id: "recipe-1" }),
    });

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      id: "recipe-1",
      name: "木樨肉",
      sourceName: "HowToCook",
      sourceUrl: "https://example.test/recipe-1",
      sourceLicense: "MIT",
      sourcePath: "dishes/meat_dish/木樨肉.md",
      sourceRevision: "revision-1",
      contentHash: "hash-1",
      aliases: ["木须肉"],
      ingredients: [
        { sortOrder: 0, ingredientName: "猪肉", amountText: "200 克", optional: false },
        { sortOrder: 1, ingredientName: "鸡蛋", amountText: "2 个", optional: false },
      ],
      steps: [
        { sortOrder: 0, text: "猪肉炒至变色", sectionName: "炒制" },
        { sortOrder: 1, text: "加入鸡蛋翻炒", sectionName: null },
      ],
      isWishlisted: true,
      isCooked: true,
    });
  });

  it("returns 404 for an unknown recipe", async () => {
    const response = await detailHandler(new Request("http://local.test/api/recipes/missing"), {
      params: Promise.resolve({ id: "missing" }),
    });

    expect(response.status).toBe(404);
    await expect(response.json()).resolves.toEqual({ error: "菜谱不存在" });
  });
});

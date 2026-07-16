import { createClient } from "@libsql/client";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { applyRecipesWishlistMigration } from "../../src/db/migrate";
import { importStagedRecipes, resolveImportMode } from "../../scripts/howtocook/import";
import { parseHowToCookMarkdown, type StagedRecipe } from "../../scripts/howtocook/parse";
import { stageFromCheckout } from "../../scripts/howtocook/stage";

const HOW_TO_COOK_REVISION = "753d4940fe06ce0d5ef767e8fe046c88635a391c";
const fixture = readFileSync(join(process.cwd(), "tests/fixtures/howtocook/sample.md"), "utf8");

describe("HowToCook markdown parser", () => {
  it("extracts name, servings, ingredients, steps, source, and stable id", () => {
    const parsed = parseHowToCookMarkdown({
      path: "dishes/meat_dish/示例菜/示例菜.md",
      markdown: fixture,
      revision: HOW_TO_COOK_REVISION,
    });

    expect(parsed).not.toHaveProperty("failure");
    if ("failure" in parsed) throw new Error(parsed.failure);

    expect(parsed).toMatchObject({
      name: "示例菜",
      nameKey: "示例菜",
      categoryKey: "肉类",
      servings: 2,
      sourceName: "HowToCook",
      sourceLicense: "Unlicense",
      sourceRevision: HOW_TO_COOK_REVISION,
      sourcePath: "dishes/meat_dish/示例菜/示例菜.md",
    });
    expect(parsed.id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-5[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
    expect(parsed.contentHash).toMatch(/^[0-9a-f]{64}$/);
    expect(parsed.ingredients).toEqual(expect.arrayContaining([
      expect.objectContaining({ ingredientName: "排骨", amountText: "500g", amountValue: 500, amountUnit: "g" }),
      expect.objectContaining({ ingredientName: "生抽", amountText: "2 汤匙", amountValue: 2, amountUnit: "汤匙" }),
    ]));
    expect(parsed.steps.length).toBeGreaterThan(1);
  });

  it("keeps unstructured amount text when numeric parsing is unsafe", () => {
    const parsed = parseHowToCookMarkdown({
      path: "dishes/meat_dish/示例菜/示例菜.md",
      markdown: fixture.replace("排骨 500g", "排骨 适量，按口味调整"),
      revision: HOW_TO_COOK_REVISION,
    });

    if ("failure" in parsed) throw new Error(parsed.failure);
    expect(parsed.ingredients).toContainEqual(expect.objectContaining({
      ingredientName: "排骨",
      amountText: "适量，按口味调整",
      amountValue: null,
      amountUnit: null,
    }));
  });

  it("does not treat serving formulas as safely parsed numeric amounts", () => {
    const parsed = parseHowToCookMarkdown({
      path: "dishes/meat_dish/示例菜/示例菜.md",
      markdown: fixture.replace("排骨 500g", "排骨用量 = 份数 * 500g"),
      revision: HOW_TO_COOK_REVISION,
    });

    if ("failure" in parsed) throw new Error(parsed.failure);
    expect(parsed.ingredients).toContainEqual(expect.objectContaining({
      ingredientName: "排骨用量",
      amountText: "= 份数 * 500g",
      amountValue: null,
      amountUnit: null,
    }));
  });

  it("does not collapse numeric ranges into a single safe amount", () => {
    const parsed = parseHowToCookMarkdown({
      path: "dishes/meat_dish/示例菜/示例菜.md",
      markdown: fixture
        .replace("排骨 500g", "白糖 6-15 g")
        .replace("生抽 2 汤匙", "生抽 10 ml - 15 ml"),
      revision: HOW_TO_COOK_REVISION,
    });

    if ("failure" in parsed) throw new Error(parsed.failure);
    expect(parsed.ingredients).toContainEqual(expect.objectContaining({
      ingredientName: "白糖",
      amountText: "6-15 g",
      amountValue: null,
      amountUnit: null,
    }));
    expect(parsed.ingredients).toContainEqual(expect.objectContaining({
      ingredientName: "生抽",
      amountText: "10 ml - 15 ml",
      amountValue: null,
      amountUnit: null,
    }));
  });

  it("parses safe numeric amounts separated by Chinese punctuation", () => {
    const parsed = parseHowToCookMarkdown({
      path: "dishes/meat_dish/示例菜/示例菜.md",
      markdown: fixture.replace("排骨 500g", "排骨：2 个"),
      revision: HOW_TO_COOK_REVISION,
    });

    if ("failure" in parsed) throw new Error(parsed.failure);
    expect(parsed.ingredients).toContainEqual(expect.objectContaining({
      ingredientName: "排骨",
      amountText: "2 个",
      amountValue: 2,
      amountUnit: "个",
    }));
  });

  it("preserves real multi-quantity formulas and quantitative parentheses", () => {
    const items = [
      "豆角 300g * 2 人",
      "米酒 10 + 25 ml",
      "清水 720g + 600g",
      "高度白酒 50ml + 水 150ml",
      "青椒用量为 2 颗/人, 每颗 100g",
      "饺子一包（根据个人食量选择，约 10 - 15 个）",
      "清水（50ml）",
      "生抽（40ml）",
      "鲤鱼（大约 2 斤）",
      "20 颗花椒",
      "20 克白糖（根据个人口味调整）",
    ];
    const markdown = fixture.replace(
      /每份：[\s\S]*?(?=\n## 操作)/,
      `每份：\n\n${items.map((item) => `- ${item}`).join("\n")}\n`,
    );
    const parsed = parseHowToCookMarkdown({
      path: "dishes/meat_dish/示例菜/示例菜.md",
      markdown,
      revision: HOW_TO_COOK_REVISION,
    });

    if ("failure" in parsed) throw new Error(parsed.failure);
    for (const expected of [
      { ingredientName: "豆角", amountText: "300g * 2 人" },
      { ingredientName: "米酒", amountText: "10 + 25 ml" },
      { ingredientName: "清水", amountText: "720g + 600g" },
      { ingredientName: "高度白酒", amountText: "50ml + 水 150ml" },
      { ingredientName: "青椒", amountText: "2 颗/人, 每颗 100g" },
      { ingredientName: "饺子", amountText: "一包（根据个人食量选择，约 10 - 15 个）" },
      { ingredientName: "鲤鱼", amountText: "（大约 2 斤）" },
    ]) {
      expect(parsed.ingredients).toContainEqual(expect.objectContaining({
        ...expected,
        amountValue: null,
        amountUnit: null,
      }));
    }
    expect(parsed.ingredients).toContainEqual(expect.objectContaining({
      ingredientName: "清水",
      amountText: "（50ml）",
      amountValue: 50,
      amountUnit: "ml",
    }));
    expect(parsed.ingredients).toContainEqual(expect.objectContaining({
      ingredientName: "生抽",
      amountText: "（40ml）",
      amountValue: 40,
      amountUnit: "ml",
    }));
    expect(parsed.ingredients).toContainEqual(expect.objectContaining({
      ingredientName: "花椒",
      amountText: "20 颗",
      amountValue: 20,
      amountUnit: "颗",
    }));
    expect(parsed.ingredients).toContainEqual(expect.objectContaining({
      ingredientName: "白糖",
      amountText: "20 克",
      amountValue: 20,
      amountUnit: "克",
      note: "根据个人口味调整",
    }));
  });

  it("keeps suffix-qualified real amounts unstructured", () => {
    const items = [
      ["翘嘴鱼 2 斤最佳", "翘嘴鱼", "2 斤最佳"],
      ["鸡蛋 1 颗或更多", "鸡蛋", "1 颗或更多"],
      ["冰块 160 克以上", "冰块", "160 克以上"],
      ["清水 500ml左右", "清水", "500ml左右"],
      ["面粉 300g上下", "面粉", "300g上下"],
      ["盐 5g以下", "盐", "5g以下"],
      ["黄油 20g约", "黄油", "20g约"],
      ["糖 10g约等于", "糖", "10g约等于"],
      ["香料（2 把香菜）", "香料", "（2 把香菜）"],
      ["酱油 每个生蚝 1 ml", "酱油", "每个生蚝 1 ml"],
      ["水：米的体积的 2 倍", "水", "米的体积的 2 倍"],
    ] as const;
    const markdown = fixture.replace(
      /每份：[\s\S]*?(?=\n## 操作)/,
      `每份：\n\n${items.map(([item]) => `- ${item}`).join("\n")}\n`,
    );
    const parsed = parseHowToCookMarkdown({
      path: "dishes/aquatic/示例菜/示例菜.md",
      markdown,
      revision: HOW_TO_COOK_REVISION,
    });

    if ("failure" in parsed) throw new Error(parsed.failure);
    for (const [, ingredientName, amountText] of items) {
      expect(parsed.ingredients).toContainEqual(expect.objectContaining({
        ingredientName,
        amountText,
        amountValue: null,
        amountUnit: null,
      }));
    }
  });

  it("falls back to the required-items section when calculation has no list", () => {
    const markdown = fixture.replace(
      /每份：[\s\S]*?(?=\n## 操作)/,
      "以下用料可供两人食用。\n",
    );
    const parsed = parseHowToCookMarkdown({
      path: "dishes/meat_dish/示例菜/示例菜.md",
      markdown,
      revision: HOW_TO_COOK_REVISION,
    });

    if ("failure" in parsed) throw new Error(parsed.failure);
    expect(parsed.ingredients).toEqual(expect.arrayContaining([
      expect.objectContaining({ ingredientName: "排骨" }),
      expect.objectContaining({ ingredientName: "生抽" }),
    ]));
  });

  it("returns a parse failure for unknown categories", () => {
    expect(parseHowToCookMarkdown({
      path: "dishes/template/示例菜/示例菜.md",
      markdown: fixture,
      revision: HOW_TO_COOK_REVISION,
    })).toMatchObject({ sourcePath: "dishes/template/示例菜/示例菜.md", failure: expect.any(String) });
  });

  it("derives the same id from sourcePath regardless of content or revision", () => {
    const first = parseHowToCookMarkdown({
      path: "dishes/meat_dish/示例菜/示例菜.md",
      markdown: fixture,
      revision: HOW_TO_COOK_REVISION,
    });
    const second = parseHowToCookMarkdown({
      path: "dishes/meat_dish/示例菜/示例菜.md",
      markdown: `${fixture}\n`,
      revision: "another-revision",
    });

    if ("failure" in first || "failure" in second) throw new Error("fixture failed to parse");
    expect(first.id).toBe(second.id);
  });
});

describe("HowToCook staging", () => {
  const temporaryDirectories: string[] = [];

  afterEach(async () => {
    await Promise.all(temporaryDirectories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })));
  });

  it("writes sorted deterministic recipes and reports unknown categories as skipped", async () => {
    const checkoutDir = await mkdtemp(join(tmpdir(), "howtocook-checkout-"));
    const outputDir = await mkdtemp(join(tmpdir(), "howtocook-output-"));
    temporaryDirectories.push(checkoutDir, outputDir);
    for (const path of [
      "dishes/meat_dish/后一个/后一个.md",
      "dishes/aquatic/前一个/前一个.md",
      "dishes/template/示例菜/示例菜.md",
      "dishes/meat_dish/缓存残留/缓存残留.md",
    ]) {
      const fullPath = join(checkoutDir, path);
      mkdirSync(join(fullPath, ".."), { recursive: true });
      writeFileSync(fullPath, fixture.replaceAll("示例菜", path.includes("前一个") ? "前一个" : path.includes("后一个") ? "后一个" : "示例菜"));
    }

    const sourcePaths = [
      "dishes/meat_dish/后一个/后一个.md",
      "dishes/aquatic/前一个/前一个.md",
      "dishes/template/示例菜/示例菜.md",
    ];
    const first = await stageFromCheckout({ checkoutDir, outputDir, revision: HOW_TO_COOK_REVISION, sourcePaths });
    const firstRecipes = await readFile(join(outputDir, "recipes.json"), "utf8");
    const firstReport = await readFile(join(outputDir, "import-report.json"), "utf8");
    const second = await stageFromCheckout({ checkoutDir, outputDir, revision: HOW_TO_COOK_REVISION, sourcePaths });

    expect(second).toEqual(first);
    expect(await readFile(join(outputDir, "recipes.json"), "utf8")).toBe(firstRecipes);
    expect(await readFile(join(outputDir, "import-report.json"), "utf8")).toBe(firstReport);
    expect(first.recipes.map((recipe) => recipe.sourcePath)).toEqual([
      "dishes/aquatic/前一个/前一个.md",
      "dishes/meat_dish/后一个/后一个.md",
    ]);
    expect(first.report).toMatchObject({ discovered: 3, parsed: 2, skipped: 1, fatalFailures: 0 });
  });

  it("does not publish structured values for unsafe generated amount expressions", () => {
    const recipes = JSON.parse(readFileSync(
      join(process.cwd(), "data/howtocook/recipes.json"),
      "utf8",
    )) as StagedRecipe[];
    const allowedUnits = new Set([
      "g", "kg", "ml", "mL", "L", "cc", "cm", "cup",
      "克", "千克", "斤", "毫升", "升", "公分", "厘米",
      "个", "颗", "枚", "盒", "片", "根", "瓣", "勺", "汤匙", "茶匙",
      "包", "罐", "碗", "杯", "块", "小块", "只", "条", "把", "株", "张",
      "份", "人份", "滴", "段", "粒", "棵", "朵", "叶", "袋", "圈", "撮",
      "节", "瓶",
    ]);
    const unsafeSuffix = /(?:左右|上下|以上|以下|或更多|最佳|大?约|约等(?:于)?)\s*[。.]?$/;
    const violations = recipes.flatMap((recipe) => recipe.ingredients
      .filter((ingredient) => {
        if (ingredient.amountValue === null) return false;
        const expression = `${ingredient.ingredientName} ${ingredient.amountText}`;
        const numbers = ingredient.amountText.match(/\d+(?:\.\d+)?/g) ?? [];
        return !ingredient.amountUnit
          || !allowedUnits.has(ingredient.amountUnit)
          || unsafeSuffix.test(ingredient.amountText)
          || numbers.length > 1
          || /[+*×]|\/\s*人|每|份数/.test(expression)
          || /\d/.test(ingredient.note ?? "");
      })
      .map((ingredient) => ({ sourcePath: recipe.sourcePath, ingredient })));

    expect(violations).toEqual([]);
  });
});

describe("HowToCook import", () => {
  it("requires one explicit import mode and distinguishes connected from offline dry-run", () => {
    expect(resolveImportMode(["--dry-run"])).toBe("dry-run");
    expect(resolveImportMode(["--offline-dry-run"])).toBe("offline-dry-run");
    expect(resolveImportMode(["--apply"])).toBe("apply");
    expect(() => resolveImportMode([])).toThrow(/exactly one mode/i);
    expect(() => resolveImportMode(["--dry-run", "--apply"])).toThrow(/exactly one mode/i);
  });

  it("keeps dry-run read-only and skips unchanged content hashes on apply", async () => {
    const client = createClient({ url: ":memory:" });
    try {
      await client.executeMultiple(`
        CREATE TABLE dishes (id text PRIMARY KEY, name text NOT NULL);
        CREATE TABLE meal_plans (id integer PRIMARY KEY AUTOINCREMENT, date text NOT NULL, meal_type text NOT NULL);
      `);
      await applyRecipesWishlistMigration(client);
      const parsed = parseHowToCookMarkdown({
        path: "dishes/meat_dish/示例菜/示例菜.md",
        markdown: fixture,
        revision: HOW_TO_COOK_REVISION,
      });
      if ("failure" in parsed) throw new Error(parsed.failure);

      expect(await importStagedRecipes(client, [parsed], { apply: false })).toEqual({ inserts: 1, updates: 0, unchanged: 0 });
      expect((await client.execute("SELECT count(*) AS count FROM recipes")).rows[0].count).toBe(0);
      let transactionStarted = false;
      let hashReadInsideTransaction = false;
      const observedClient = new Proxy(client, {
        get(target, property) {
          if (property === "execute") {
            return async (statement: Parameters<typeof target.execute>[0]) => {
              const sql = typeof statement === "string" ? statement : (statement as { sql: string }).sql;
              if (sql === "BEGIN IMMEDIATE") transactionStarted = true;
              if (sql.startsWith("SELECT id, content_hash")) hashReadInsideTransaction = transactionStarted;
              return target.execute(statement);
            };
          }
          const value = Reflect.get(target, property, target);
          return typeof value === "function" ? value.bind(target) : value;
        },
      });
      expect(await importStagedRecipes(observedClient, [parsed], { apply: true })).toEqual({ inserts: 1, updates: 0, unchanged: 0 });
      expect(hashReadInsideTransaction).toBe(true);
      expect(await importStagedRecipes(client, [parsed], { apply: true })).toEqual({ inserts: 0, updates: 0, unchanged: 1 });
      expect((await client.execute("SELECT count(*) AS count FROM recipe_ingredients")).rows[0].count).toBe(parsed.ingredients.length);
      expect((await client.execute("SELECT count(*) AS count FROM recipe_steps")).rows[0].count).toBe(parsed.steps.length);

      const changed = {
        ...parsed,
        contentHash: "f".repeat(64),
        ingredients: parsed.ingredients.slice(0, 1),
        steps: parsed.steps.slice(0, 1),
        aliases: [{ alias: "测试别名", aliasKey: "测试别名" }],
      };
      expect(await importStagedRecipes(client, [changed], { apply: true })).toEqual({ inserts: 0, updates: 1, unchanged: 0 });
      expect((await client.execute("SELECT count(*) AS count FROM recipe_ingredients")).rows[0].count).toBe(1);
      expect((await client.execute("SELECT count(*) AS count FROM recipe_steps")).rows[0].count).toBe(1);
      expect((await client.execute("SELECT alias FROM recipe_aliases")).rows[0].alias).toBe("测试别名");
    } finally {
      client.close();
    }
  });
});

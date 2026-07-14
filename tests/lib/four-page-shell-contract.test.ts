import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const source = (path: string) => readFileSync(new URL(path, import.meta.url), "utf8");

describe("四页应用外壳", () => {
  it("使用新版四页导航和手机外壳", () => {
    const tabs = source("../../src/components/TabBar.tsx");
    const home = source("../../src/app/page.tsx");
    expect(tabs).toContain('label: "喂饭"');
    expect(tabs).toContain('label: "饭盆"');
    expect(tabs).toContain('label: "菜单"');
    expect(tabs).toContain('label: "日记"');
    expect(home).toContain("app-stage");
    expect(home).toContain("app-phone");
  });

  it("换肤后仍保留表单和详情的完整业务处理器", () => {
    const form = source("../../src/components/AddDishForm.tsx");
    const detail = source("../../src/components/DishDetail.tsx");
    expect(form).toContain("handleRecognize");
    expect(form).toContain("handleGenerateRecipe");
    expect(form).toContain("readDishSaveResult");
    expect(form).toContain("onOpenExisting");
    expect(detail).toContain("onEdit");
    expect(detail).toContain("addToPlan");
  });
});

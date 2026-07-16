import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

const FORM_PATH = new URL("../../src/components/AddDishForm.tsx", import.meta.url);
const DIALOG_PATH = new URL("../../src/components/WishlistCompletionDialog.tsx", import.meta.url);

describe("recognition form contract", () => {
  it("uploads separately before optional recognition and waits for an explicit candidate click", async () => {
    const source = await readFile(FORM_PATH, "utf8");

    expect(source).toContain('fetch("/api/uploads/dish-photo"');
    expect(source).toContain('fetch("/api/recognize"');
    expect(source.indexOf('fetch("/api/uploads/dish-photo"')).toBeLessThan(source.indexOf('fetch("/api/recognize"'));
    expect(source).toContain("识别结果更像哪一道？");
    expect(source).toContain("都不对，手动输入");
    expect(source).toContain("onClick={() => handleCandidateClick(candidate)}");
  });

  it("shows visible ingredients only as read-only chips and never writes recipe fields from recognition", async () => {
    const source = await readFile(FORM_PATH, "utf8");
    const recognizeBody = source.slice(source.indexOf("const handleRecognize"), source.indexOf("const handleSave"));

    expect(source).toContain("识别到的可见食材（仅供参考）");
    expect(source).toContain("visibleIngredients.map");
    expect(recognizeBody).not.toContain("setEditIngs");
    expect(recognizeBody).not.toContain("setEditSteps");
  });

  it("checks the pending wishlist before posting and asks for an explicit completion choice", async () => {
    const formSource = await readFile(FORM_PATH, "utf8");
    const dialogSource = await readFile(DIALOG_PATH, "utf8");

    expect(formSource).toContain('/api/wishlist?status=pending');
    expect(formSource).toContain("保存到饭盆");
    expect(dialogSource).toContain("这道菜在心愿单里");
    expect(dialogSource).toContain("完成心愿并保存");
    expect(dialogSource).toContain("只保存到饭盆");
  });

  it("uses the server name normalization and ignores stale upload completions", async () => {
    const source = await readFile(FORM_PATH, "utf8");

    expect(source).toContain('import { normalizeDishName } from "@/lib/dish-name-match"');
    expect(source).toContain("nameKey: normalizeDishName(item.name)");
    expect(source).toContain("uploadGuardRef");
    expect(source).toContain("uploadGuardRef.current.isCurrent(revision)");
    expect(source).toContain("uploadGuardRef.current.isCurrent(recognitionRevision)");
  });
});

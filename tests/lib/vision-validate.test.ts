import { describe, expect, it } from "vitest";
import { validateRecognition } from "../../src/lib/vision/validate";

describe("validateRecognition", () => {
  it("trims, deduplicates, and caps candidates at three", () => {
    const result = validateRecognition({
      candidates: [
        { name: " 红烧排骨 ", category: "肉类" },
        { name: "糖醋排骨", category: "肉类" },
        { name: "红烧排骨", category: "肉类" },
        { name: "排骨烧土豆", category: "肉类" },
        { name: "第四个", category: "肉类" },
      ],
      visibleIngredients: ["排骨", "葱"],
    });

    expect(result.candidates).toEqual([
      { name: "红烧排骨", category: "肉类" },
      { name: "糖醋排骨", category: "肉类" },
      { name: "排骨烧土豆", category: "肉类" },
    ]);
  });

  it("drops candidates outside the six supported categories", () => {
    const result = validateRecognition({
      candidates: [{ name: "红烧排骨", category: "甜点" }],
      visibleIngredients: [],
    });

    expect(result.candidates).toHaveLength(0);
  });

  it("keeps at most twelve unique, non-empty visible ingredients", () => {
    const result = validateRecognition({
      candidates: [],
      visibleIngredients: [
        " 葱 ", "姜", "葱", "蒜", "排骨", "土豆", "胡萝卜", "八角",
        "桂皮", "香叶", "冰糖", "生抽", "老抽", "料酒",
      ],
    });

    expect(result.visibleIngredients).toHaveLength(12);
    expect(result.visibleIngredients[0]).toBe("葱");
    expect(new Set(result.visibleIngredients).size).toBe(12);
  });

  it("returns an empty safe shape for malformed model output", () => {
    expect(validateRecognition(null)).toEqual({ candidates: [], visibleIngredients: [] });
    expect(validateRecognition({ candidates: "nope", visibleIngredients: {} })).toEqual({
      candidates: [],
      visibleIngredients: [],
    });
  });
});

import { mkdtemp, mkdir, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import type { VisionProvider } from "../../src/lib/vision";
import { evaluateLocalVision, parseEvaluationArgs } from "../../scripts/vision/evaluate-local";

describe("local vision evaluation", () => {
  it("parses the documented input and expected arguments", () => {
    expect(parseEvaluationArgs([
      "--input", "data/vision/input",
      "--expected", "data/vision/expected.json",
    ])).toEqual({
      inputDir: "data/vision/input",
      expectedFile: "data/vision/expected.json",
      outputFile: "data/vision/qwen3-vl-4b-results.jsonl",
    });
  });

  it("writes one stable JSONL result for every supported image", async () => {
    const root = await mkdtemp(join(tmpdir(), "vision-evaluate-"));
    const inputDir = join(root, "input");
    const expectedFile = join(root, "expected.json");
    const outputFile = join(root, "results.jsonl");
    await mkdir(inputDir);
    await Promise.all([
      writeFile(join(inputDir, "a.jpg"), new Uint8Array([1])),
      writeFile(join(inputDir, "b.png"), new Uint8Array([2])),
      writeFile(join(inputDir, "notes.txt"), "ignored"),
      writeFile(expectedFile, JSON.stringify({ "a.jpg": "红烧 肉", "b.png": "清蒸鱼" })),
    ]);

    const provider: VisionProvider = {
      name: "ollama",
      async recognize({ bytes }) {
        if (bytes[0] === 2) throw new Error("model unavailable");
        return {
          candidates: [
            { name: "红烧肉", category: "肉类" },
            { name: "糖醋排骨", category: "肉类" },
          ],
          visibleIngredients: ["猪肉"],
        };
      },
    };

    const rows = await evaluateLocalVision({ inputDir, expectedFile, outputFile, provider });

    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatchObject({
      file: "a.jpg",
      expectedName: "红烧 肉",
      candidates: ["红烧肉", "糖醋排骨"],
      top1Hit: true,
      top3Hit: true,
      provider: "ollama",
      error: null,
    });
    expect(rows[0].elapsedMs).toBeGreaterThanOrEqual(0);
    expect(rows[1]).toMatchObject({
      file: "b.png",
      expectedName: "清蒸鱼",
      candidates: [],
      top1Hit: false,
      top3Hit: false,
      provider: "ollama",
      error: "model unavailable",
    });

    const written = (await readFile(outputFile, "utf8"))
      .trim()
      .split("\n")
      .map((line) => JSON.parse(line));
    expect(written).toEqual(rows);
  });
});

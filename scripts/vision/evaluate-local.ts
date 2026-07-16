import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import { dirname, extname, resolve } from "node:path";
import { pathToFileURL } from "node:url";

import { normalizeDishName } from "../../src/lib/dish-name-match";
import { createOllamaProvider } from "../../src/lib/vision/ollama-provider";
import type { VisionProvider } from "../../src/lib/vision/types";
import { validateRecognition } from "../../src/lib/vision/validate";

const DEFAULT_OUTPUT = "data/vision/qwen3-vl-4b-results.jsonl";
const IMAGE_MIME_TYPES = new Map([
  [".jpg", "image/jpeg"],
  [".jpeg", "image/jpeg"],
  [".png", "image/png"],
]);

export type EvaluationRow = {
  file: string;
  expectedName: string;
  candidates: string[];
  top1Hit: boolean;
  top3Hit: boolean;
  elapsedMs: number;
  provider: "ollama";
  error: string | null;
};

type EvaluationArguments = {
  inputDir: string;
  expectedFile: string;
  outputFile: string;
};

export function parseEvaluationArgs(args: string[]): EvaluationArguments {
  const values = new Map<string, string>();
  for (let index = 0; index < args.length; index += 2) {
    const flag = args[index];
    const value = args[index + 1];
    if (!flag?.startsWith("--") || !value || value.startsWith("--")) {
      throw new Error("Usage: --input <directory> --expected <json> [--output <jsonl>]");
    }
    values.set(flag, value);
  }

  const inputDir = values.get("--input");
  const expectedFile = values.get("--expected");
  if (!inputDir || !expectedFile) {
    throw new Error("Usage: --input <directory> --expected <json> [--output <jsonl>]");
  }
  for (const flag of values.keys()) {
    if (!["--input", "--expected", "--output"].includes(flag)) {
      throw new Error(`Unknown argument: ${flag}`);
    }
  }
  return { inputDir, expectedFile, outputFile: values.get("--output") ?? DEFAULT_OUTPUT };
}

function parseExpectedNames(value: unknown): Record<string, string> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("Expected labels must be a JSON object mapping file names to dish names");
  }
  const result: Record<string, string> = {};
  for (const [file, expectedName] of Object.entries(value)) {
    if (typeof expectedName !== "string" || !expectedName.trim()) {
      throw new Error(`Invalid expected dish name for ${file}`);
    }
    result[file] = expectedName.trim();
  }
  return result;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export async function evaluateLocalVision(options: EvaluationArguments & {
  provider?: VisionProvider;
}): Promise<EvaluationRow[]> {
  const provider = options.provider ?? createOllamaProvider();
  if (provider.name !== "ollama") throw new Error("Local evaluation requires the Ollama provider");

  const expectedNames = parseExpectedNames(JSON.parse(await readFile(options.expectedFile, "utf8")));
  const files = (await readdir(options.inputDir, { withFileTypes: true }))
    .filter((entry) => entry.isFile() && IMAGE_MIME_TYPES.has(extname(entry.name).toLowerCase()))
    .map((entry) => entry.name)
    .sort((left, right) => left.localeCompare(right, "zh-CN"));
  const rows: EvaluationRow[] = [];

  for (const file of files) {
    const expectedName = expectedNames[file] ?? "";
    const startedAt = Date.now();
    let candidates: string[] = [];
    let error: string | null = expectedName ? null : "missing_expected_name";
    if (expectedName) {
      try {
        const bytes = await readFile(resolve(options.inputDir, file));
        const raw = await provider.recognize({
          bytes,
          mimeType: IMAGE_MIME_TYPES.get(extname(file).toLowerCase())!,
          signal: AbortSignal.timeout(60_000),
        });
        candidates = validateRecognition(raw).candidates.map((candidate) => candidate.name);
        if (candidates.length === 0) error = "invalid_response";
      } catch (caught) {
        error = errorMessage(caught);
      }
    }

    const expectedKey = normalizeDishName(expectedName);
    const hitKeys = candidates.map(normalizeDishName);
    rows.push({
      file,
      expectedName,
      candidates,
      top1Hit: Boolean(expectedKey) && hitKeys[0] === expectedKey,
      top3Hit: Boolean(expectedKey) && hitKeys.includes(expectedKey),
      elapsedMs: Date.now() - startedAt,
      provider: "ollama",
      error,
    });
  }

  await mkdir(dirname(options.outputFile), { recursive: true });
  await writeFile(options.outputFile, rows.map((row) => JSON.stringify(row)).join("\n") + (rows.length ? "\n" : ""));
  return rows;
}

async function main(): Promise<void> {
  const options = parseEvaluationArgs(process.argv.slice(2));
  const rows = await evaluateLocalVision(options);
  const top1 = rows.filter((row) => row.top1Hit).length;
  const top3 = rows.filter((row) => row.top3Hit).length;
  const errors = rows.filter((row) => row.error).length;
  console.log(`Evaluated ${rows.length} images: Top-1 ${top1}, Top-3 ${top3}, errors ${errors}.`);
  console.log(`Results: ${resolve(options.outputFile)}`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  void main().catch((error) => {
    console.error(errorMessage(error));
    process.exitCode = 1;
  });
}

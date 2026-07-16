import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import { dirname, join, relative, resolve, sep } from "node:path";
import { pathToFileURL } from "node:url";

import { parseHowToCookMarkdown, type ParseFailure, type StagedRecipe } from "./parse";

export const HOW_TO_COOK_REVISION = "753d4940fe06ce0d5ef767e8fe046c88635a391c";
const HOW_TO_COOK_REPOSITORY = "https://github.com/Anduin2017/HowToCook.git";

export interface ImportReport {
  source: "HowToCook";
  revision: string;
  discovered: number;
  parsed: number;
  skipped: number;
  fatalFailures: number;
  failures: Array<{ sourcePath: string; reason: string; fatal: boolean }>;
}

export interface StageResult {
  recipes: StagedRecipe[];
  report: ImportReport;
}

async function markdownFiles(directory: string): Promise<string[]> {
  const paths: string[] = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) paths.push(...await markdownFiles(path));
    else if (entry.isFile() && entry.name.endsWith(".md")) paths.push(path);
  }
  return paths;
}

function stableJson(value: unknown): string {
  return `${JSON.stringify(value, null, 2)}\n`;
}

function compareSourcePath(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function isUnknownCategory(failure: ParseFailure): boolean {
  return failure.failure.startsWith("Unknown HowToCook category folder:");
}

export async function stageFromCheckout(input: {
  checkoutDir: string;
  outputDir: string;
  revision: string;
  sourcePaths?: string[];
}): Promise<StageResult> {
  const dishesDirectory = join(input.checkoutDir, "dishes");
  const sourcePaths = input.sourcePaths
    ? [...input.sourcePaths].map((path) => path.replaceAll("\\", "/")).sort(compareSourcePath)
    : (await markdownFiles(dishesDirectory))
      .map((file) => relative(input.checkoutDir, file).split(sep).join("/"))
      .sort(compareSourcePath);
  const recipes: StagedRecipe[] = [];
  const failures: ImportReport["failures"] = [];

  for (const sourcePath of sourcePaths) {
    const file = join(input.checkoutDir, sourcePath);
    const result = parseHowToCookMarkdown({
      path: sourcePath,
      markdown: await readFile(file, "utf8"),
      revision: input.revision,
    });
    if ("failure" in result) {
      failures.push({ sourcePath, reason: result.failure, fatal: !isUnknownCategory(result) });
    } else {
      recipes.push(result);
    }
  }

  recipes.sort((left, right) => compareSourcePath(left.sourcePath, right.sourcePath));
  failures.sort((left, right) => compareSourcePath(left.sourcePath, right.sourcePath));
  const report: ImportReport = {
    source: "HowToCook",
    revision: input.revision,
    discovered: sourcePaths.length,
    parsed: recipes.length,
    skipped: failures.filter((failure) => !failure.fatal).length,
    fatalFailures: failures.filter((failure) => failure.fatal).length,
    failures,
  };

  await mkdir(input.outputDir, { recursive: true });
  await Promise.all([
    writeFile(join(input.outputDir, "recipes.json"), stableJson(recipes)),
    writeFile(join(input.outputDir, "import-report.json"), stableJson(report)),
  ]);

  return { recipes, report };
}

function runGit(arguments_: string[], cwd?: string): void {
  execFileSync("git", arguments_, { cwd, stdio: "inherit" });
}

function trackedMarkdownPaths(checkoutDir: string): string[] {
  return execFileSync(
    "git",
    ["ls-tree", "-rz", "--name-only", HOW_TO_COOK_REVISION, "--", "dishes"],
    { cwd: checkoutDir },
  ).toString("utf8").split("\0").filter((path) => path.endsWith(".md"));
}

export async function stagePinnedHowToCook(options: {
  cacheDir?: string;
  outputDir?: string;
} = {}): Promise<StageResult> {
  const checkoutDir = resolve(options.cacheDir ?? ".cache/howtocook");
  const outputDir = resolve(options.outputDir ?? "data/howtocook");

  if (!existsSync(join(checkoutDir, ".git"))) {
    await mkdir(dirname(checkoutDir), { recursive: true });
    runGit(["clone", "--filter=blob:none", "--no-checkout", HOW_TO_COOK_REPOSITORY, checkoutDir]);
  }
  runGit(["fetch", "origin", HOW_TO_COOK_REVISION], checkoutDir);
  runGit(["checkout", "--detach", "--force", HOW_TO_COOK_REVISION], checkoutDir);

  return stageFromCheckout({
    checkoutDir,
    outputDir,
    revision: HOW_TO_COOK_REVISION,
    sourcePaths: trackedMarkdownPaths(checkoutDir),
  });
}

async function main(): Promise<void> {
  const { report } = await stagePinnedHowToCook();
  console.log(`Staged ${report.parsed}/${report.discovered} recipes at ${report.revision}.`);
  console.log(`Skipped: ${report.skipped}; fatal failures: ${report.fatalFailures}.`);
  if (report.fatalFailures > 0) process.exitCode = 1;
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  void main().catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  });
}

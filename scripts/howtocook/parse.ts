import { createHash } from "node:crypto";

import { v5 as uuidv5 } from "uuid";

import { mapHowToCookCategory, normalizeRecipeName, type CategoryKey } from "../../src/lib/recipe-normalize";

const HOW_TO_COOK_REPOSITORY = "https://github.com/Anduin2017/HowToCook";

export interface StagedIngredient {
  ingredientName: string;
  amountValue: number | null;
  amountUnit: string | null;
  amountText: string;
  optional: boolean;
  note: string | null;
}

export interface StagedStep {
  text: string;
  sectionName: string | null;
}

export interface StagedAlias {
  alias: string;
  aliasKey: string;
}

export interface StagedRecipe {
  id: string;
  name: string;
  nameKey: string;
  categoryKey: CategoryKey;
  description: string | null;
  servings: number | null;
  estimatedTimeMinutes: number | null;
  sourceName: "HowToCook";
  sourceUrl: string;
  sourceLicense: "Unlicense";
  sourcePath: string;
  sourceRevision: string;
  contentHash: string;
  imageUrl: null;
  ingredients: StagedIngredient[];
  steps: StagedStep[];
  aliases: StagedAlias[];
}

export interface ParseFailure {
  sourcePath: string;
  failure: string;
}

interface Section {
  heading: string;
  lines: string[];
}

function sectionsFrom(markdown: string): Section[] {
  const sections: Section[] = [];
  let current: Section = { heading: "", lines: [] };
  sections.push(current);

  for (const line of markdown.replaceAll("\r\n", "\n").split("\n")) {
    const heading = line.match(/^##\s+(.+?)\s*$/);
    if (heading) {
      current = { heading: heading[1], lines: [] };
      sections.push(current);
    } else {
      current.lines.push(line);
    }
  }

  return sections;
}

function stripMarkdown(value: string): string {
  return value
    .replace(/!\[[^\]]*\]\([^)]*\)/g, "")
    .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
    .replace(/\*\*(.*?)\*\*/g, "$1")
    .replace(/_(.*?)_/g, "$1")
    .replace(/`([^`]+)`/g, "$1")
    .trim();
}

function parseDescription(lines: string[]): string | null {
  const paragraphs = lines
    .slice(1)
    .map(stripMarkdown)
    .filter((line) => line && !line.startsWith("预估烹饪难度：") && !line.startsWith("预估卡路里："));
  return paragraphs[0] ?? null;
}

function parseServings(text: string): number | null {
  const match = text.match(/(?:正好够|按照)\s*(\d+)\s*(?:个?人|人)/)
    ?? text.match(/(\d+)\s*人(?:的)?份量/);
  return match ? Number(match[1]) : null;
}

function parseEstimatedTime(text: string): number | null {
  const match = text.match(/(?:大约|约|只需|需要|全程)\s*(\d+)\s*分钟/);
  return match ? Number(match[1]) : null;
}

function listItems(lines: string[]): string[] {
  return lines.flatMap((line) => {
    const match = line.match(/^\s*(?:[-*+]\s+|\d+[.)、]\s*)(.+?)\s*$/);
    return match ? [stripMarkdown(match[1])] : [];
  }).filter(Boolean);
}

function parseIngredient(item: string): StagedIngredient {
  const optional = /(?:可选|按需|任选)/.test(item);
  const noteMatch = item.match(/[（(]([^）)]+)[）)]\s*$/);
  const note = noteMatch ? noteMatch[1].trim() : null;
  const withoutNote = noteMatch ? item.slice(0, noteMatch.index).trim() : item.trim();
  const unsafeRange = withoutNote.match(
    /\d+(?:\.\d+)?\s*[\p{L}\p{Script=Han}]*\s*(?:-|–|—|~|～|至|\/)\s*\d+(?:\.\d+)?\s*[\p{L}\p{Script=Han}]*/u,
  ) ?? withoutNote.match(
    /\d+(?:\.\d+)?\s*[\p{L}\p{Script=Han}]*(?:[^\d\n]{0,40})±\s*\d+(?:\.\d+)?\s*[\p{L}\p{Script=Han}]*/u,
  );
  if (unsafeRange) {
    const ingredientName = withoutNote.slice(0, unsafeRange.index).trim().replace(/[：:,，]\s*$/u, "");
    return {
      ingredientName: ingredientName || withoutNote,
      amountValue: null,
      amountUnit: null,
      amountText: ingredientName
        ? withoutNote.slice(unsafeRange.index).replace(/\s+/g, " ").trim()
        : "",
      optional,
      note,
    };
  }
  const formula = withoutNote.match(/^(.+?)\s*(=.+)$/);
  if (formula && /[=×*\/]/.test(formula[2])) {
    return {
      ingredientName: formula[1].trim().replace(/[：:]$/u, ""),
      amountValue: null,
      amountUnit: null,
      amountText: formula[2].replace(/\s+/g, " ").trim(),
      optional,
      note,
    };
  }
  const numeric = withoutNote.match(/^(.+?)[：:]\s*(\d+(?:\.\d+)?)\s*([\p{L}\p{Script=Han}]+)\s*$/u)
    ?? withoutNote.match(/^(.+?)\s+(\d+(?:\.\d+)?)\s*([\p{L}\p{Script=Han}]+)\s*$/u)
    ?? withoutNote.match(/^(.+?)(\d+(?:\.\d+)?)\s*([\p{L}\p{Script=Han}]+)\s*$/u);

  if (numeric) {
    return {
      ingredientName: numeric[1].trim().replace(/[：:=的数量]+$/u, "").trim(),
      amountValue: Number(numeric[2]),
      amountUnit: numeric[3],
      amountText: `${numeric[2]}${/^[a-zA-Z]+$/.test(numeric[3]) ? "" : " "}${numeric[3]}`,
      optional,
      note,
    };
  }

  const unstructured = withoutNote.match(/^(.+?)\s+(.+)$/);
  return {
    ingredientName: unstructured?.[1].trim() ?? withoutNote,
    amountValue: null,
    amountUnit: null,
    amountText: unstructured?.[2].trim() ?? "",
    optional,
    note,
  };
}

function parseSteps(lines: string[]): StagedStep[] {
  const steps: StagedStep[] = [];
  let sectionName: string | null = null;

  for (const line of lines) {
    const subheading = line.match(/^###\s+(.+?)\s*$/);
    if (subheading) {
      sectionName = stripMarkdown(subheading[1]);
      continue;
    }
    const item = line.match(/^\s*(?:[-*+]\s+|\d+[.)、]\s*)(.+?)\s*$/);
    if (item) {
      const text = stripMarkdown(item[1]);
      if (text) steps.push({ text, sectionName });
    }
  }

  return steps;
}

function hashRecipe(recipe: Omit<StagedRecipe, "contentHash">): string {
  return createHash("sha256").update(JSON.stringify(recipe)).digest("hex");
}

export function parseHowToCookMarkdown(input: {
  path: string;
  markdown: string;
  revision: string;
}): StagedRecipe | ParseFailure {
  const sourcePath = input.path.replaceAll("\\", "/");

  try {
    const categoryKey = mapHowToCookCategory(sourcePath);
    const sections = sectionsFrom(input.markdown);
    const introduction = sections[0]?.lines ?? [];
    const heading = introduction.find((line) => /^#\s+/.test(line));
    const name = heading ? stripMarkdown(heading.replace(/^#\s+/, "")).replace(/的做法\s*$/, "").trim() : "";
    const calculation = sections.find((section) => section.heading === "计算");
    const requiredItems = sections.find((section) => section.heading === "必备原料和工具");
    const operation = sections.find((section) => section.heading === "操作");
    const calculatedItems = calculation ? listItems(calculation.lines) : [];
    const ingredients = (calculatedItems.length > 0 ? calculatedItems : listItems(requiredItems?.lines ?? []))
      .filter((item) => item !== "工具" && item !== "原料")
      .map(parseIngredient);
    const steps = operation ? parseSteps(operation.lines) : [];

    if (!name) throw new Error("Missing recipe name");
    if (ingredients.length === 0) throw new Error("Missing calculated ingredients");
    if (steps.length === 0) throw new Error("Missing operation steps");

    const recipe: Omit<StagedRecipe, "contentHash"> = {
      id: uuidv5(sourcePath, uuidv5.URL),
      name,
      nameKey: normalizeRecipeName(name),
      categoryKey,
      description: parseDescription(introduction),
      servings: parseServings(calculation?.lines.join("\n") ?? ""),
      estimatedTimeMinutes: parseEstimatedTime(introduction.join("\n")),
      sourceName: "HowToCook",
      sourceUrl: `${HOW_TO_COOK_REPOSITORY}/blob/${input.revision}/${sourcePath}`,
      sourceLicense: "Unlicense",
      sourcePath,
      sourceRevision: input.revision,
      imageUrl: null,
      ingredients,
      steps,
      aliases: [],
    };

    return { ...recipe, contentHash: hashRecipe(recipe) };
  } catch (error) {
    return {
      sourcePath,
      failure: error instanceof Error ? error.message : String(error),
    };
  }
}

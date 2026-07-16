"use client";
/* eslint-disable react-hooks/set-state-in-effect */

import { useCallback, useEffect, useState } from "react";
import { PAGE_CONTENT_CLASS } from "@/lib/layout";
import type { RecipeDetail as RecipeDetailData } from "@/lib/types";

interface RecipeDetailProps {
  recipeId: string;
  onBack: () => void;
  onWishlistChanged: () => void;
}

async function responseError(response: Response, fallback: string) {
  const data = await response.json().catch(() => null) as { error?: string } | null;
  return data?.error || fallback;
}

export default function RecipeDetail({ recipeId, onBack, onWishlistChanged }: RecipeDetailProps) {
  const [recipe, setRecipe] = useState<RecipeDetailData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [adding, setAdding] = useState(false);
  const [message, setMessage] = useState("");

  const loadRecipe = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const response = await fetch(`/api/recipes/${recipeId}`);
      if (!response.ok) throw new Error(await responseError(response, "菜谱读取失败"));
      setRecipe(await response.json() as RecipeDetailData);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "菜谱读取失败");
    } finally {
      setLoading(false);
    }
  }, [recipeId]);

  useEffect(() => { void loadRecipe(); }, [loadRecipe]);

  const addToWishlist = async () => {
    if (!recipe || recipe.isWishlisted || adding) return;
    setAdding(true);
    setMessage("");
    try {
      const response = await fetch("/api/wishlist", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ recipeId: recipe.id }),
      });
      if (!response.ok && response.status !== 409) throw new Error(await responseError(response, "加入失败，请重试"));
      setRecipe((current) => current ? { ...current, isWishlisted: true } : current);
      setMessage(response.status === 409 ? "已经在猪猪心愿单里啦" : "已加入猪猪心愿单");
      onWishlistChanged();
    } catch (addError) {
      setMessage(addError instanceof Error ? addError.message : "加入失败，请重试");
    } finally {
      setAdding(false);
    }
  };

  return (
    <div className={`${PAGE_CONTENT_CLASS} wishlist-overlay animate-fade-in`}>
      <header className="flex items-center gap-3">
        <button type="button" onClick={onBack} aria-label="返回上一页" className="overlay-back-button">‹</button>
        <div className="min-w-0 flex-1"><p className="page-kicker">猪猪菜谱</p><h1 className="page-title truncate">菜谱详情</h1></div>
      </header>

      {loading ? (
        <p className="py-16 text-center text-sm text-[var(--muted)]">正在展开菜谱…</p>
      ) : error || !recipe ? (
        <div className="surface-card mt-6 rounded-2xl p-5 text-center"><p role="alert" className="text-sm text-[var(--coral-dark)]">{error || "菜谱不存在"}</p><button type="button" onClick={() => void loadRecipe()} className="mt-4 min-h-11 rounded-xl bg-[var(--cocoa)] px-5 text-sm font-bold text-white">重新加载</button></div>
      ) : (
        <>
          <section className="mt-5 rounded-[1.6rem] bg-gradient-to-br from-[#ffe2d7] to-[#ffcdbd] p-5">
            <span className="grid h-16 w-16 place-items-center rounded-2xl bg-white/70 text-3xl">🍳</span>
            <div className="mt-4 flex flex-wrap gap-1.5 text-[.65rem] font-bold">
              <span className="rounded-full bg-white/70 px-2.5 py-1">{recipe.categoryKey}</span>
              {recipe.estimatedTimeMinutes && <span className="rounded-full bg-white/70 px-2.5 py-1">约 {recipe.estimatedTimeMinutes} 分钟</span>}
              {recipe.servings && <span className="rounded-full bg-white/70 px-2.5 py-1">{recipe.servings} 人份</span>}
              {recipe.isCooked && <span className="rounded-full bg-[#e8f4e2] px-2.5 py-1 text-[#557b47]">✓ 已经做过</span>}
            </div>
            <h2 className="mt-3 text-2xl font-extrabold tracking-tight">{recipe.name}</h2>
            {recipe.description && <p className="mt-2 text-sm leading-6 text-[#76564c]">{recipe.description}</p>}
            <button type="button" onClick={() => void addToWishlist()} disabled={recipe.isWishlisted || adding} className="mt-5 min-h-12 w-full rounded-xl bg-[var(--cocoa)] px-4 text-sm font-extrabold text-white disabled:bg-[#7a9c6c]">
              {adding ? "加入中…" : recipe.isWishlisted ? "✓ 已在猪猪心愿单" : "♡ 加入猪猪心愿单"}
            </button>
            {message && <p role="status" className="mt-2 text-center text-xs font-bold text-[#76564c]">{message}</p>}
          </section>

          <section className="mt-6">
            <div className="section-head"><h2>采购清单</h2><span>{recipe.ingredients.length} 样食材</span></div>
            <div className="surface-card overflow-hidden rounded-2xl">
              {recipe.ingredients.length === 0 ? <p className="p-4 text-sm text-[var(--muted)]">原菜谱未列出食材</p> : recipe.ingredients.map((ingredient, index) => (
                <div key={ingredient.id} className={`flex items-start gap-3 px-4 py-3 ${index > 0 ? "border-t border-[var(--line)]" : ""}`}>
                  <span className="mt-1 h-4 w-4 flex-none rounded border-2 border-[#efaaa0]" />
                  <span className="min-w-0 flex-1 text-sm font-bold">{ingredient.ingredientName}{ingredient.optional ? <small className="ml-1 font-normal text-[var(--muted)]">可选</small> : null}</span>
                  <span className="text-right text-xs text-[var(--muted)]">{ingredient.amountText}{ingredient.note ? <small className="block">{ingredient.note}</small> : null}</span>
                </div>
              ))}
            </div>
          </section>

          <section className="mt-6">
            <div className="section-head"><h2>做法步骤</h2><span>{recipe.steps.length} 步</span></div>
            <div className="grid gap-3">
              {recipe.steps.length === 0 ? <div className="surface-card rounded-2xl p-4 text-sm text-[var(--muted)]">原菜谱未列出步骤</div> : recipe.steps.map((step, index) => (
                <article key={step.id} className="surface-card flex gap-3 rounded-2xl p-4">
                  <span className="grid h-8 w-8 flex-none place-items-center rounded-full bg-[#fff0eb] text-xs font-extrabold text-[var(--coral-dark)]">{index + 1}</span>
                  <div>{step.sectionName && <p className="mb-1 text-[.65rem] font-extrabold text-[var(--coral-dark)]">{step.sectionName}</p>}<p className="text-sm leading-6">{step.text}</p></div>
                </article>
              ))}
            </div>
          </section>

          <section className="surface-card mt-6 rounded-2xl p-4">
            <h2 className="text-sm font-extrabold">内容来源</h2>
            <p className="mt-2 text-xs leading-5 text-[var(--muted)]">{recipe.sourceName} · {recipe.sourceLicense}</p>
            <a href={recipe.sourceUrl} target="_blank" rel="noreferrer" className="mt-3 inline-flex min-h-11 items-center text-sm font-bold text-[var(--coral-dark)] underline underline-offset-4">查看原始菜谱</a>
          </section>
        </>
      )}
    </div>
  );
}

"use client";
/* eslint-disable react-hooks/set-state-in-effect */

import { FormEvent, useCallback, useEffect, useRef, useState } from "react";
import { PAGE_CONTENT_CLASS } from "@/lib/layout";
import type { RecipeSearchResult } from "@/lib/types";

interface WishlistItem {
  id: string;
  recipeId: string | null;
  name: string;
  categoryKey: string;
  addedAt: string;
}

interface WishlistResponse {
  items: WishlistItem[];
  pendingCount: number;
  completedCount: number;
}

interface WishlistPageProps {
  onClose: () => void;
  onOpenRecipe: (recipeId: string) => void;
  onOpenCompleted: () => void;
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("zh-CN", { month: "short", day: "numeric" }).format(new Date(value));
}

async function readError(response: Response, fallback: string) {
  const data = await response.json().catch(() => null) as { error?: string } | null;
  return data?.error || fallback;
}

export default function WishlistPage({ onClose, onOpenRecipe, onOpenCompleted }: WishlistPageProps) {
  const [items, setItems] = useState<WishlistItem[]>([]);
  const [completedCount, setCompletedCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [query, setQuery] = useState("");
  const [submittedQuery, setSubmittedQuery] = useState("");
  const [results, setResults] = useState<RecipeSearchResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState("");
  const [removeTarget, setRemoveTarget] = useState<WishlistItem | null>(null);
  const [removing, setRemoving] = useState(false);
  const [removeError, setRemoveError] = useState("");
  const backButtonRef = useRef<HTMLButtonElement>(null);
  const removeDialogRef = useRef<HTMLDialogElement>(null);
  const removeTriggerRef = useRef<HTMLButtonElement | null>(null);

  const loadWishlist = useCallback(async () => {
    setLoadError("");
    try {
      const response = await fetch("/api/wishlist?status=pending");
      if (!response.ok) throw new Error(await readError(response, "心愿单读取失败"));
      const data = await response.json() as WishlistResponse;
      setItems(data.items || []);
      setCompletedCount(data.completedCount || 0);
    } catch (error) {
      setLoadError(error instanceof Error ? error.message : "心愿单读取失败");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void loadWishlist(); }, [loadWishlist]);

  useEffect(() => {
    const dialog = removeDialogRef.current;
    if (removeTarget && dialog && !dialog.open) dialog.showModal();
  }, [removeTarget]);

  const closeRemoveDialog = () => {
    setRemoveTarget(null);
    window.requestAnimationFrame(() => {
      const trigger = removeTriggerRef.current;
      if (trigger?.isConnected) trigger.focus();
      else backButtonRef.current?.focus();
    });
  };

  const search = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const term = query.trim();
    setSubmittedQuery(term);
    setResults([]);
    setSearchError("");
    if (!term) {
      setSearchError("请输入想找的菜谱名称");
      return;
    }
    setSearching(true);
    try {
      const response = await fetch(`/api/recipes/search?q=${encodeURIComponent(term)}`);
      if (!response.ok) throw new Error(await readError(response, "菜谱搜索失败"));
      const data = await response.json() as { items?: RecipeSearchResult[] };
      setResults(data.items || []);
    } catch (error) {
      setSearchError(error instanceof Error ? error.message : "菜谱搜索失败");
    } finally {
      setSearching(false);
    }
  };

  const confirmRemove = async () => {
    if (!removeTarget || removing) return;
    setRemoving(true);
    setRemoveError("");
    try {
      const response = await fetch(`/api/wishlist/${removeTarget.id}`, { method: "DELETE" });
      if (!response.ok) throw new Error(await readError(response, "移除失败，请重试"));
      setItems((current) => current.filter((item) => item.id !== removeTarget.id));
      closeRemoveDialog();
    } catch (error) {
      setRemoveError(error instanceof Error ? error.message : "移除失败，请重试");
    } finally {
      setRemoving(false);
    }
  };

  return (
    <div className={`${PAGE_CONTENT_CLASS} wishlist-overlay animate-fade-in`}>
      <header className="flex items-start gap-3">
        <button ref={backButtonRef} type="button" onClick={onClose} aria-label="返回菜单" className="overlay-back-button">‹</button>
        <div className="min-w-0 flex-1">
          <p className="page-kicker">想吃的，都先记下来</p>
          <h1 className="page-title">猪猪心愿单</h1>
        </div>
        <button type="button" onClick={onOpenCompleted} className="min-h-11 rounded-xl bg-[#fff0eb] px-3 text-xs font-extrabold text-[var(--coral-dark)]">
          已完成{completedCount > 0 ? ` ${completedCount}` : ""}
        </button>
      </header>

      <form onSubmit={search} role="search" className="mt-5 flex gap-2">
        <label htmlFor="recipe-search" className="sr-only">搜索菜谱</label>
        <input id="recipe-search" value={query} onChange={(event) => setQuery(event.target.value)} maxLength={50} placeholder="输入菜名，如木樨肉" className="h-11 min-w-0 flex-1 rounded-xl border border-[var(--line)] bg-white px-3 text-sm outline-none focus:border-[var(--coral)]" />
        <button type="submit" disabled={searching} className="h-11 rounded-xl bg-[var(--cocoa)] px-4 text-sm font-extrabold text-white disabled:opacity-50">
          {searching ? "搜索中…" : "搜索"}
        </button>
      </form>

      {searchError && <p role="alert" className="mt-2 rounded-xl bg-[#fff0ec] px-3 py-2 text-xs text-[var(--coral-dark)]">{searchError}</p>}
      {submittedQuery && !searching && !searchError && (
        <section aria-label="菜谱搜索结果" className="mt-4">
          <div className="section-head"><h2>搜索结果</h2><span>{results.length} 道菜谱</span></div>
          {results.length === 0 ? (
            <div className="surface-card rounded-2xl px-4 py-8 text-center text-sm text-[var(--muted)]">暂无匹配菜谱</div>
          ) : (
            <div className="grid gap-2.5">
              {results.map((recipe) => (
                <button key={recipe.id} type="button" onClick={() => onOpenRecipe(recipe.id)} className="surface-card flex min-h-20 w-full items-center gap-3 rounded-2xl p-3 text-left">
                  <span className="grid h-12 w-12 flex-none place-items-center rounded-xl bg-[#fff0eb] text-2xl">🍳</span>
                  <span className="min-w-0 flex-1">
                    <strong className="block truncate text-sm">{recipe.name}</strong>
                    <span className="mt-1 block text-xs text-[var(--muted)]">{recipe.categoryKey}{recipe.estimatedTimeMinutes ? ` · 约 ${recipe.estimatedTimeMinutes} 分钟` : ""}</span>
                    {(recipe.isWishlisted || recipe.isCooked) && <span className="mt-1 block text-[.65rem] font-bold text-[var(--green)]">{[recipe.isWishlisted && "已在心愿单", recipe.isCooked && "已经做过"].filter(Boolean).join(" · ")}</span>}
                  </span>
                  <span aria-hidden="true" className="text-xl text-[#c7b5ae]">›</span>
                </button>
              ))}
            </div>
          )}
        </section>
      )}

      <section className="mt-5" aria-label="待完成心愿">
        <div className="section-head"><h2>待完成心愿</h2><span>{items.length} 道想吃</span></div>
        {loading ? (
          <p className="py-8 text-center text-sm text-[var(--muted)]">正在翻心愿本…</p>
        ) : loadError ? (
          <div className="surface-card rounded-2xl p-4 text-center"><p role="alert" className="text-sm text-[var(--coral-dark)]">{loadError}</p><button type="button" onClick={() => { setLoading(true); void loadWishlist(); }} className="mt-3 min-h-11 rounded-xl bg-[var(--cocoa)] px-4 text-xs font-bold text-white">重新加载</button></div>
        ) : items.length === 0 ? (
          <div className="surface-card rounded-2xl px-4 py-8 text-center"><p className="text-2xl">💗</p><p className="mt-2 text-sm font-bold">心愿单还是空的</p><p className="mt-1 text-xs text-[var(--muted)]">搜索一道想吃的菜，把它收进来吧</p></div>
        ) : (
          <div className="grid gap-2.5">
            {items.map((item) => (
              <article key={item.id} className="surface-card rounded-2xl p-3">
                <div className="flex items-center gap-3">
                  <span className="grid h-12 w-12 flex-none place-items-center rounded-xl bg-[#ffe7de] text-2xl">💗</span>
                  <div className="min-w-0 flex-1">
                    <h3 className="truncate text-sm font-extrabold">{item.name}</h3>
                    <p className="mt-1 text-xs text-[var(--muted)]">{item.categoryKey} · {formatDate(item.addedAt)} 加入</p>
                  </div>
                </div>
                <div className="mt-3 grid grid-cols-2 gap-2">
                  <button type="button" disabled={!item.recipeId} onClick={() => item.recipeId && onOpenRecipe(item.recipeId)} className="min-h-11 rounded-xl bg-[var(--cocoa)] text-xs font-bold text-white disabled:bg-[#d9cfca]">{item.recipeId ? "查看菜谱" : "暂无菜谱详情"}</button>
                  <button type="button" onClick={(event) => { removeTriggerRef.current = event.currentTarget; setRemoveError(""); setRemoveTarget(item); }} className="min-h-11 rounded-xl bg-[#fff0ec] text-xs font-bold text-[var(--coral-dark)]">移除心愿</button>
                </div>
              </article>
            ))}
          </div>
        )}
      </section>

      {removeTarget && (
          <dialog ref={removeDialogRef} role="alertdialog" aria-modal="true" aria-labelledby="remove-wish-title" aria-describedby="remove-wish-description" onCancel={(event) => { event.preventDefault(); if (!removing) closeRemoveDialog(); }} className="overlay-dialog-card">
            <p className="text-2xl">💔</p>
            <h2 id="remove-wish-title" className="mt-2 text-lg font-extrabold">移除这个心愿？</h2>
            <p id="remove-wish-description" className="mt-2 text-sm text-[var(--muted)]">“{removeTarget.name}”会从待完成心愿里移除。</p>
            {removeError && <p role="alert" className="mt-2 text-xs text-[var(--coral-dark)]">{removeError}</p>}
            <div className="mt-5 grid grid-cols-2 gap-2">
              <button type="button" disabled={removing} onClick={closeRemoveDialog} className="min-h-11 rounded-xl border border-[var(--line)] bg-white text-sm font-bold">再想想</button>
              <button type="button" autoFocus disabled={removing} onClick={() => void confirmRemove()} className="min-h-11 rounded-xl bg-[var(--coral)] text-sm font-bold text-white disabled:opacity-50">{removing ? "移除中…" : "确认移除"}</button>
            </div>
          </dialog>
      )}
    </div>
  );
}

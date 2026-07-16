"use client";
/* eslint-disable react-hooks/set-state-in-effect */
/* eslint-disable @next/next/no-img-element */

import { useCallback, useEffect, useState } from "react";
import { PAGE_CONTENT_CLASS } from "@/lib/layout";

interface CompletedWishlistItem {
  id: string;
  recipeId: string | null;
  completedDishId: string | null;
  dishExists: boolean;
  name: string;
  imageUrl: string | null;
  addedAt: string;
  completedAt: string;
}

interface CompletedWishlistPageProps {
  onClose: () => void;
  onOpenRecipe: (recipeId: string) => void;
  onOpenDish: (dishId: string) => void;
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("zh-CN", { year: "numeric", month: "short", day: "numeric" }).format(new Date(value));
}

export default function CompletedWishlistPage({ onClose, onOpenRecipe, onOpenDish }: CompletedWishlistPageProps) {
  const [items, setItems] = useState<CompletedWishlistItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const loadCompleted = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const response = await fetch("/api/wishlist/completed");
      const data = await response.json() as { items?: CompletedWishlistItem[]; error?: string };
      if (!response.ok) throw new Error(data.error || "完成记录读取失败");
      setItems(data.items || []);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "完成记录读取失败");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void loadCompleted(); }, [loadCompleted]);

  return (
    <div className={`${PAGE_CONTENT_CLASS} wishlist-overlay animate-fade-in`}>
      <header className="flex items-start gap-3">
        <button type="button" onClick={onClose} aria-label="返回猪猪心愿单" className="overlay-back-button">‹</button>
        <div><p className="page-kicker">每一道都值得纪念</p><h1 className="page-title">已完成心愿</h1></div>
      </header>

      <section className="mt-6">
        {loading ? (
          <p className="py-16 text-center text-sm text-[var(--muted)]">正在翻找完成记录…</p>
        ) : error ? (
          <div className="surface-card rounded-2xl p-5 text-center"><p role="alert" className="text-sm text-[var(--coral-dark)]">{error}</p><button type="button" onClick={() => void loadCompleted()} className="mt-4 min-h-11 rounded-xl bg-[var(--cocoa)] px-5 text-sm font-bold text-white">重新加载</button></div>
        ) : items.length === 0 ? (
          <div className="surface-card rounded-2xl px-5 py-12 text-center"><p className="text-3xl">🐷</p><h2 className="mt-3 text-sm font-extrabold">还没有完成的心愿</h2><p className="mt-1 text-xs text-[var(--muted)]">做过心愿菜后，它会出现在这里</p></div>
        ) : (
          <div className="grid gap-3">
            {items.map((item) => (
              <article key={item.id} className="surface-card rounded-2xl p-4">
                <div className="flex items-center gap-3">
                  {item.imageUrl ? (
                    <img src={item.imageUrl} alt={item.name} className="h-16 w-16 flex-none rounded-xl object-cover" />
                  ) : (
                    <span className="grid h-16 w-16 flex-none place-items-center rounded-xl bg-[#e8f4e2] text-2xl">✓</span>
                  )}
                  <div className="min-w-0 flex-1"><h2 className="truncate text-sm font-extrabold">{item.name}</h2><p className="mt-1 text-xs text-[var(--muted)]">{formatDate(item.completedAt)} 完成</p></div>
                </div>
                <p className="mt-3 rounded-xl bg-[#faf5ef] px-3 py-2 text-[.68rem] text-[var(--muted)]">从 {formatDate(item.addedAt)} 的心愿，变成了餐桌上的美味</p>
                <p className={`mt-3 text-xs font-bold ${item.dishExists ? "text-[#467343]" : "text-[var(--muted)]"}`}>
                  {item.dishExists ? "饭盆菜品仍在" : "饭盆菜品已删除"}
                </p>
                <div className="mt-3 grid gap-2 sm:grid-cols-2">
                  {item.dishExists && item.completedDishId && (
                    <button type="button" onClick={() => onOpenDish(item.completedDishId!)} className="min-h-11 rounded-xl bg-[var(--coral)] text-xs font-bold text-white">查看饭盆菜品</button>
                  )}
                  {item.recipeId && <button type="button" onClick={() => onOpenRecipe(item.recipeId!)} className="min-h-11 rounded-xl bg-[var(--cocoa)] text-xs font-bold text-white">查看菜谱</button>}
                </div>
              </article>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

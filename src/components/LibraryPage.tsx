"use client";

import { useState } from "react";
import Image from "next/image";
import { CATEGORIES, Dish } from "@/lib/types";
import { PAGE_CONTENT_CLASS } from "@/lib/layout";
import { BYPASS_IMAGE_OPTIMIZATION, getDisplayImageSrc } from "@/lib/image-display";
import { getCategoryMeta } from "@/lib/categories";
import SwipeableDishRow from "./SwipeableDishRow";

function parseIngredients(value: string): string[] {
  try {
    const parsed: unknown = JSON.parse(value);
    return Array.isArray(parsed) ? parsed.map(String) : value ? [value] : [];
  } catch { return value ? [value] : []; }
}

export default function LibraryPage({
  dishes, onDishClick, onDeleteDish,
}: { dishes: Dish[]; onDishClick: (d: Dish) => void; onDeleteDish: (d: Dish) => void }) {
  const [catFilter, setCatFilter] = useState("all");
  const [search, setSearch] = useState("");
  const [openDishId, setOpenDishId] = useState<string | null>(null);
  const query = search.trim().toLowerCase();

  const filtered = dishes.filter((dish) => {
    const meta = getCategoryMeta(dish.categoryId);
    const ingredients = parseIngredients(dish.ingredients).join(" ").toLowerCase();
    return (catFilter === "all" || meta.name === catFilter)
      && (!query || `${dish.name} ${ingredients} ${meta.name}`.toLowerCase().includes(query));
  });

  return (
    <div className={PAGE_CONTENT_CLASS} onClick={() => setOpenDishId(null)}>
      <p className="page-kicker">猪猪的家庭菜谱</p>
      <h1 className="page-title">饭盆里有什么？</h1>

      <div className="relative mt-4">
        <span className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-[var(--muted)]">⌕</span>
        <input
          type="search"
          placeholder="搜索菜品或食材…"
          aria-label="搜索菜品或食材"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          className="h-12 w-full rounded-[1.05rem] border border-[var(--line)] bg-[var(--paper)] pl-10 pr-4 text-sm text-[var(--cocoa)] outline-none transition focus:border-[var(--coral)] focus:ring-3 focus:ring-[#ef68651c]"
        />
      </div>

      <div className="scrollbar-hide -mx-[1.125rem] mt-3 flex gap-2 overflow-x-auto px-[1.125rem] pb-1">
        {CATEGORIES.map((category) => (
          <button
            key={category.key}
            onClick={(event) => { event.stopPropagation(); setCatFilter(category.key); }}
            className={`h-8 flex-none rounded-full border px-3 text-[.7rem] font-bold transition ${catFilter === category.key ? "border-[var(--coral)] bg-[var(--coral)] text-white" : "border-[var(--line)] bg-[var(--paper)] text-[#806c66]"}`}
          >
            {category.label}
          </button>
        ))}
      </div>

      <div className="section-head"><h2>全部菜品</h2><span>{filtered.length} 道菜</span></div>
      <div className="grid gap-2.5">
        {filtered.length === 0 ? (
          <div className="py-12 text-center text-xs leading-6 text-[var(--muted)]">
            {dishes.length === 0 ? "饭盆还是空的，先去喂一道菜吧 🐽" : "饭盆里没有找到这道菜，换个关键词试试吧 🐽"}
          </div>
        ) : filtered.map((dish) => {
          const meta = getCategoryMeta(dish.categoryId);
          const ingredients = parseIngredients(dish.ingredients);
          return (
            <SwipeableDishRow
              key={dish.id}
              dish={dish}
              open={openDishId === dish.id}
              onOpen={() => setOpenDishId(dish.id)}
              onClose={() => setOpenDishId(null)}
              onClick={() => onDishClick(dish)}
              onDelete={(item) => { setOpenDishId(null); onDeleteDish(item); }}
            >
              <div className="surface-card grid w-full grid-cols-[3.25rem_1fr_auto] items-center gap-3 rounded-[1.1rem] p-2.5 text-left transition active:scale-[.98]">
                <div className={`category-icon ${meta.className} relative h-[3.25rem] w-[3.25rem] flex-none overflow-hidden text-2xl`}>
                  {dish.imageUrl ? <Image src={getDisplayImageSrc(dish.imageUrl, process.env.NODE_ENV)} alt={dish.name} fill sizes="52px" unoptimized={BYPASS_IMAGE_OPTIMIZATION} className="object-cover" /> : meta.icon}
                </div>
                <div className="min-w-0">
                  <p className="text-[.82rem] font-bold text-[var(--cocoa)]">{dish.name}</p>
                  <p className="mt-1 truncate text-[.6rem] text-[var(--muted)]">{ingredients.join("、") || "还没有填写用料"}</p>
                  <p className="mt-1 text-[.58rem] text-[#b09d96]">{meta.name} · 做过 {dish.timesCooked} 次</p>
                </div>
                <span className="text-lg text-[#c9b9b2]">›</span>
              </div>
            </SwipeableDishRow>
          );
        })}
      </div>
    </div>
  );
}

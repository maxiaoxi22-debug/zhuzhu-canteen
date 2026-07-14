"use client";
import { useState } from "react";
import { Dish, CATEGORIES } from "@/lib/types";
import Image from "next/image";
import { PAGE_CONTENT_CLASS } from "@/lib/layout";
import { BYPASS_IMAGE_OPTIMIZATION, getDisplayImageSrc } from "@/lib/image-display";
import SwipeableDishRow from "./SwipeableDishRow";

function getCatLabel(catId: number | null) {
  if (catId === null) return "";
  const cats = ["肉类", "青菜", "主食", "海鲜", "汤类", "其他"];
  return cats[catId - 1] || "";
}

export default function LibraryPage({
  dishes, onDishClick, onDeleteDish,
}: { dishes: Dish[]; onDishClick: (d: Dish) => void; onDeleteDish: (d: Dish) => void }) {
  const [catFilter, setCatFilter] = useState("all");
  const [search, setSearch] = useState("");
  const [openDishId, setOpenDishId] = useState<string | null>(null);

  const filtered = dishes.filter((d) => {
    if (catFilter !== "all" && getCatLabel(d.categoryId) !== catFilter) return false;
    if (search && !d.name.includes(search)) return false;
    return true;
  });

  return (
    <div className={PAGE_CONTENT_CLASS} onClick={() => setOpenDishId(null)}>
      <h1 className="text-2xl font-bold text-gray-900">菜单库</h1>
      <p className="text-gray-400 text-sm mt-0.5">{dishes.length} 道菜，按分类浏览</p>

      <div className="mt-4 relative">
        <svg className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
        <input type="text" placeholder="搜索菜品..." value={search} onChange={(e) => setSearch(e.target.value)}
          className="w-full bg-gray-100 rounded-xl pl-10 pr-4 py-3 text-sm outline-none focus:ring-2 focus:ring-green-300 focus:bg-white transition" />
      </div>

      <div className="flex gap-2 mt-3 overflow-x-auto scrollbar-hide pb-2">
        {CATEGORIES.map((c) => (
          <button key={c.key}
            onClick={() => setCatFilter(c.key)}
            className={`rounded-2xl px-4 py-1.5 text-sm font-medium whitespace-nowrap transition border ${
              catFilter === c.key ? "bg-green-500 text-white border-green-500" : "bg-white text-gray-600 border-gray-200"
            }`}>
            {c.label}
          </button>
        ))}
      </div>

      <div className="space-y-2 mt-2">
        {filtered.length === 0 ? (
          <p className="text-gray-400 text-center py-16 text-sm">
            {dishes.length === 0 ? "还没有记录菜品，先去拍一张吧 📸" : "没有匹配的菜品"}
          </p>
        ) : (
          filtered.map((d) => (
            <SwipeableDishRow key={d.id} dish={d} open={openDishId === d.id} onOpen={() => setOpenDishId(d.id)} onClose={() => setOpenDishId(null)} onClick={() => onDishClick(d)} onDelete={(dish) => { setOpenDishId(null); onDeleteDish(dish); }}>
            <div className="w-full bg-white rounded-2xl border border-gray-100 p-3 flex gap-3 text-left transition active:scale-[.98]">
              <div className="w-16 h-16 bg-gray-50 rounded-xl flex items-center justify-center text-2xl flex-shrink-0 relative overflow-hidden">
                {d.imageUrl ? <Image src={getDisplayImageSrc(d.imageUrl, process.env.NODE_ENV)} alt={d.name} fill sizes="64px" unoptimized={BYPASS_IMAGE_OPTIMIZATION} className="object-cover" /> : "🍽️"}
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-semibold text-gray-800 text-sm">{d.name}</p>
                <p className="text-xs text-gray-400 mt-0.5 truncate">
                  {(() => { try { return JSON.parse(d.ingredients).join("、"); } catch { return d.ingredients; } })()}
                </p>
                <div className="flex items-center gap-2 mt-1.5">
                  <span className="text-xs text-gray-400">{getCatLabel(d.categoryId)}</span>
                  <span className="text-gray-300 text-xs">·</span>
                  <span className="text-xs text-gray-400">做过{d.timesCooked}次</span>
                </div>
              </div>
              <div className="flex items-center text-gray-300">→</div>
            </div>
            </SwipeableDishRow>
          ))
        )}
      </div>
    </div>
  );
}

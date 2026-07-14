"use client";
import { useState } from "react";
import { Dish, MEAL_TYPES } from "@/lib/types";
import Image from "next/image";
import { BYPASS_IMAGE_OPTIMIZATION, getDisplayImageSrc } from "@/lib/image-display";
import { getCategoryMeta } from "@/lib/categories";

export default function DishDetail({ dish, onClose, onEdit, refresh }: { dish: Dish; onClose: () => void; onEdit: () => void; refresh: () => void }) {
  const [adding, setAdding] = useState("");
  let ingredients: string[] = [];
  let steps: string[] = [];
  try { ingredients = JSON.parse(dish.ingredients); } catch { ingredients = dish.ingredients ? [dish.ingredients] : []; }
  try { steps = JSON.parse(dish.steps); } catch { steps = dish.steps ? [dish.steps] : []; }

  const addToPlan = async (mealType: string) => {
    setAdding(mealType);
    try {
      const date = new Date().toISOString().slice(0, 10);
      const res = await fetch("/api/plans", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ date, mealType, dishId: dish.id }),
      });
      if (!res.ok) {
        const data = await res.json();
        alert(data.error || "添加失败，请重试");
        return;
      }
      refresh();
      onClose();
    } catch {
      alert("网络错误，请重试");
    } finally {
      setAdding("");
    }
  };

  return (
    <div className="fixed inset-0 z-30 flex items-end bg-[#36251f57] backdrop-blur-[2px]" onClick={onClose}>
      <div className="animate-slide-up max-h-[88%] w-full overflow-y-auto rounded-t-[1.8rem] bg-[var(--paper)] text-[var(--cocoa)]" onClick={(e) => e.stopPropagation()}>
        <div className="w-10 h-1 bg-gray-300 rounded-full mx-auto mt-3" />
        <div className="p-5 pb-[calc(1.25rem+env(safe-area-inset-bottom))]">
          <div className="flex justify-end mb-3">
            <button onClick={onEdit} className="rounded-xl bg-[#fff0eb] px-4 py-2 text-sm font-semibold text-[var(--coral-dark)]">✏️ 编辑</button>
          </div>
          <div className="h-48 bg-gray-50 rounded-2xl flex items-center justify-center text-7xl relative overflow-hidden">
            {dish.imageUrl ? <Image src={getDisplayImageSrc(dish.imageUrl, process.env.NODE_ENV)} alt={dish.name} fill sizes="(max-width: 640px) 100vw, 640px" unoptimized={BYPASS_IMAGE_OPTIMIZATION} className="object-cover" /> : "🍽️"}
          </div>
          <div className="flex items-center gap-3 mt-4">
            <h2 className="text-xl font-bold text-[var(--cocoa)]">{dish.name}</h2>
            <span className="rounded-2xl bg-[var(--coral)] px-3 py-1 text-xs font-medium text-white">{getCategoryMeta(dish.categoryId).name}</span>
          </div>
          <p className="mt-1 text-xs text-[var(--muted)]">已做过 <span className="font-semibold text-[var(--coral)]">{dish.timesCooked}</span> 次</p>

          {ingredients.length > 0 && (
            <div className="mt-5">
              <h3 className="text-sm font-semibold text-gray-700 mb-2.5">🥬 食材</h3>
              <div className="flex flex-wrap gap-1.5">
                {ingredients.map((s, i) => (
                  <span key={i} className="bg-gray-50 rounded-xl px-3 py-1.5 text-xs text-gray-600">{s}</span>
                ))}
              </div>
            </div>
          )}

          {steps.length > 0 && (
            <div className="mt-5">
              <h3 className="text-sm font-semibold text-gray-700 mb-2.5">👨‍🍳 做法</h3>
              <div className="space-y-3">
                {steps.map((s, i) => (
                  <div key={i} className="flex gap-3">
                    <span className="flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-full bg-[#fff0eb] text-xs font-bold text-[var(--coral)]">{i + 1}</span>
                    <p className="text-sm text-gray-600 leading-relaxed">{s}</p>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="mt-6">
            <p className="text-sm font-semibold text-gray-700 mb-2">📅 加入今日菜单</p>
            <div className="flex gap-2">
              {MEAL_TYPES.map((mt) => (
                <button key={mt.key} onClick={() => addToPlan(mt.key)} disabled={adding !== ""}
                  className="flex-1 bg-gray-50 hover:bg-green-50 rounded-xl py-2.5 text-sm font-medium text-gray-600 hover:text-green-600 transition disabled:opacity-50">
                  {adding === mt.key ? "添加中..." : `${mt.emoji} ${mt.label}`}
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

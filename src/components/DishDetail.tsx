"use client";
import { Dish, MEAL_TYPES } from "@/lib/types";

function getCatLabel(catId: number | null) {
  if (catId === null) return "";
  const cats = ["肉类", "青菜", "主食", "海鲜", "汤类", "其他"];
  return cats[catId - 1] || "";
}

export default function DishDetail({ dish, onClose, refresh }: { dish: Dish; onClose: () => void; refresh: () => void }) {
  let ingredients: string[] = [];
  let steps: string[] = [];
  try { ingredients = JSON.parse(dish.ingredients); } catch { ingredients = dish.ingredients ? [dish.ingredients] : []; }
  try { steps = JSON.parse(dish.steps); } catch { steps = dish.steps ? [dish.steps] : []; }

  const addToPlan = async (mealType: string) => {
    const date = new Date().toISOString().slice(0, 10);
    await fetch("/api/plans", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ date, mealType, dishId: dish.id }),
    });
    refresh();
    onClose();
  };

  return (
    <div className="fixed inset-0 z-30 flex items-end" style={{ background: "rgba(0,0,0,.35)" }} onClick={onClose}>
      <div className="bg-white rounded-t-3xl w-full max-h-[88%] overflow-y-auto animate-slide-up" onClick={(e) => e.stopPropagation()}>
        <div className="w-10 h-1 bg-gray-300 rounded-full mx-auto mt-3" />
        <div className="p-5">
          <div className="h-48 bg-gray-50 rounded-2xl flex items-center justify-center text-7xl">
            {dish.imageUrl ? <img src={dish.imageUrl} alt={dish.name} className="w-full h-full rounded-2xl object-cover" /> : "🍽️"}
          </div>
          <div className="flex items-center gap-3 mt-4">
            <h2 className="text-xl font-bold text-gray-800">{dish.name}</h2>
            <span className="bg-green-500 text-white rounded-2xl px-3 py-1 text-xs font-medium">{getCatLabel(dish.categoryId)}</span>
          </div>
          <p className="text-xs text-gray-400 mt-1">已做过 <span className="text-green-500 font-semibold">{dish.timesCooked}</span> 次</p>

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
                    <span className="w-5 h-5 rounded-full bg-green-50 text-green-500 flex items-center justify-center text-xs font-bold flex-shrink-0">{i + 1}</span>
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
                <button key={mt.key} onClick={() => addToPlan(mt.key)}
                  className="flex-1 bg-gray-50 hover:bg-green-50 rounded-xl py-2.5 text-sm font-medium text-gray-600 hover:text-green-600 transition">
                  {mt.emoji} {mt.label}
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
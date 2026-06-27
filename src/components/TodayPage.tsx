"use client";
import { useState, useEffect, useCallback } from "react";
import { Dish, CATEGORIES, MEAL_TYPES, MealPlan } from "@/lib/types";

function getCatLabel(catId: number | null) {
  if (catId === null) return "";
  const cats = ["肉类", "青菜", "主食", "海鲜", "汤类", "其他"];
  return cats[catId - 1] || "";
}

export default function TodayPage({
  dishes, onDishClick, refresh,
}: { dishes: Dish[]; onDishClick: (d: Dish) => void; refresh: () => void }) {
  const [randCat, setRandCat] = useState("all");
  const [randDish, setRandDish] = useState<Dish | null>(null);
  const [todayPlans, setTodayPlans] = useState<MealPlan[]>([]);

  const pool = randCat === "all" ? dishes : dishes.filter((d) => getCatLabel(d.categoryId) === randCat);

  const randomize = useCallback(() => {
    if (pool.length > 0) setRandDish(pool[Math.floor(Math.random() * pool.length)]);
    else setRandDish(null);
  }, [pool]);

  useEffect(() => { randomize(); }, [randCat, dishes.length]);

  const fetchTodayPlans = async () => {
    const date = new Date().toISOString().slice(0, 10);
    try {
      const res = await fetch(`/api/plans?date=${date}`);
      if (res.ok) setTodayPlans(await res.json());
    } catch {}
  };
  useEffect(() => { fetchTodayPlans(); }, [dishes.length]);

  const addToPlan = async (dishId: string, mealType: string) => {
    const date = new Date().toISOString().slice(0, 10);
    await fetch("/api/plans", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ date, mealType, dishId }),
    });
    fetchTodayPlans();
    refresh();
  };

  const getDish = (id: string | null) => dishes.find((d) => d.id === id);

  return (
    <div className="px-5 pt-12 pb-4">
      <h1 className="text-2xl font-bold text-gray-900">今天吃点啥</h1>
      <p className="text-gray-400 text-sm mt-0.5">选不出来？让菜库帮你决定</p>

      <div className="mt-4 rounded-2xl p-5 border" style={{ background: "linear-gradient(135deg,#f0fdf4,#fafdf7)", borderColor: "#d1f0d9" }}>
        <p className="text-xs text-green-500 font-semibold mb-3 flex items-center gap-1">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2l3.09 6.26L22 9.27l-5 4.87L18.18 22 12 18.56 5.82 22 7 14.14l-5-4.87 6.91-1.01L12 2z"/></svg>
          随机推荐
        </p>
        <div className="flex gap-2 mb-3 overflow-x-auto scrollbar-hide">
          {CATEGORIES.map((c) => (
            <button key={c.key}
              onClick={() => setRandCat(c.key)}
              className={`rounded-2xl px-3 py-1.5 text-xs font-medium whitespace-nowrap transition border ${
                randCat === c.key ? "bg-green-500 text-white border-green-500" : "bg-white text-gray-600 border-gray-200"
              }`}>
              {c.label}
            </button>
          ))}
        </div>
        {randDish ? (
          <button onClick={() => onDishClick(randDish)} className="bg-white rounded-2xl p-5 text-center w-full active:scale-[.98] transition">
            <div className="text-5xl mb-2">{randDish.imageUrl ? <img src={randDish.imageUrl} alt="" className="w-16 h-16 mx-auto rounded-xl object-cover" /> : "🍽️"}</div>
            <p className="text-lg font-bold text-gray-800">{randDish.name}</p>
            <p className="text-xs text-gray-400 mt-1">{getCatLabel(randDish.categoryId)} · 做过{randDish.timesCooked}次</p>
          </button>
        ) : (
          <div className="bg-white rounded-2xl p-8 text-center text-gray-400 text-sm">
            该分类暂无菜品<br />先去拍一张吧 📸
          </div>
        )}
        <div className="flex gap-3 mt-4">
          <button onClick={randomize}
            className="flex-1 flex items-center justify-center gap-1.5 bg-white border border-gray-200 rounded-2xl py-3 text-sm font-semibold text-gray-600 active:bg-gray-50 transition">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="1 4 1 10 7 10"/><path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10"/></svg>
            换一道
          </button>
          <button onClick={() => addToPlan(randDish!.id, "lunch")} disabled={!randDish}
            className="flex-1 bg-green-500 text-white rounded-2xl py-3 text-sm font-semibold active:bg-green-600 transition disabled:opacity-40">
            📅 加入今天
          </button>
        </div>
      </div>

      <div className="mt-6">
        <h2 className="text-[15px] font-semibold text-gray-800 mb-3">📅 今日菜单</h2>
        <div className="space-y-2">
          {MEAL_TYPES.map((mt) => {
            const plan = todayPlans.filter((p) => p.mealType === mt.key);
            return (
              <div key={mt.key} className="bg-white rounded-2xl border border-gray-100 p-3">
                <p className="text-xs font-semibold text-gray-500 mb-1">{mt.emoji} {mt.label}</p>
                {plan.length === 0 ? (
                  <p className="text-sm text-gray-300">还没想好</p>
                ) : (
                  plan.map((p) => {
                    const d = getDish(p.dishId);
                    return d ? (
                      <div key={p.id} className="flex items-center gap-2 py-0.5">
                        <span className="text-sm">🍽️</span>
                        <span className="text-sm font-medium text-gray-800 flex-1">{d.name}</span>
                        <button onClick={async () => {
                          await fetch(`/api/plans?id=${p.id}`, { method: "DELETE" });
                          fetchTodayPlans();
                        }} className="text-xs text-red-400">✕</button>
                      </div>
                    ) : null;
                  })
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
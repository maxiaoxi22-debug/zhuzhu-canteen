"use client";
import { useState, useEffect } from "react";
import { Dish, MealPlan } from "@/lib/types";

function getCatLabel(catId: number | null) {
  if (catId === null) return "";
  const cats = ["肉类", "青菜", "主食", "海鲜", "汤类", "其他"];
  return cats[catId - 1] || "";
}

export default function HistoryPage({
  dishes, onDishClick,
}: { dishes: Dish[]; onDishClick: (d: Dish) => void }) {
  const [history, setHistory] = useState<MealPlan[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/history")
      .then((r) => r.json())
      .then((data) => {
        setHistory(data.history || []);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, [dishes]);

  const freq = [...dishes].sort((a, b) => b.timesCooked - a.timesCooked).slice(0, 5);
  const maxFreq = freq[0]?.timesCooked || 1;

  if (loading) return <div className="px-5 pt-20 text-center text-gray-400">加载中...</div>;

  return (
    <div className="px-5 pt-12 pb-4">
      <h1 className="text-2xl font-bold text-gray-900">历史</h1>
      <p className="text-gray-400 text-sm mt-0.5">看看最近都吃了什么</p>

      {freq.length > 0 && (
        <div className="mt-5 bg-white rounded-2xl border border-gray-100 p-4">
          <p className="text-sm font-semibold text-gray-700 mb-3 flex items-center gap-1.5">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="#f59e0b"><path d="M12 2l3.09 6.26L22 9.27l-5 4.87L18.18 22 12 18.56 5.82 22 7 14.14l-5-4.87 6.91-1.01L12 2z"/></svg>
            常做菜品排行
          </p>
          <div className="space-y-2.5">
            {freq.map((d, i) => {
              const colors = ["#34c759","#30b350","#4cd964","#84d892","#a8e6b0"];
              const pct = Math.round(d.timesCooked / maxFreq * 100);
              return (
                <div key={d.id} className="flex items-center gap-2.5">
                  <span className={`text-xs w-4 text-center font-bold ${i === 0 ? "text-yellow-500" : "text-gray-400"}`}>{i + 1}</span>
                  <span className="text-sm w-7 text-center">🍽️</span>
                  <span className="text-xs text-gray-700 flex-1 truncate font-medium">{d.name}</span>
                  <div className="w-20 bg-gray-100 rounded-full h-1.5 overflow-hidden">
                    <div className="h-1.5 rounded-full" style={{ width: `${pct}%`, background: colors[i] }} />
                  </div>
                  <span className="text-xs text-gray-400 w-10 text-right tabular-nums">{d.timesCooked} 次</span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      <h2 className="text-[15px] font-semibold text-gray-800 mt-6 mb-3">📆 最近记录</h2>
      {history.length === 0 ? (
        <p className="text-gray-400 text-center py-10 text-sm">还没有点菜记录，去排个菜单吧 📅</p>
      ) : (
        <div className="space-y-2">
          {history.map((r) => (
            <button key={r.id}
              onClick={() => r.dish && onDishClick(r.dish as Dish)}
              className="w-full bg-white rounded-2xl border border-gray-100 p-3 flex gap-3 text-left transition active:scale-[.98]">
              <div className="text-2xl flex-shrink-0">🍽️</div>
              <div className="flex-1 min-w-0">
                <div className="flex justify-between items-start">
                  <p className="text-sm font-semibold text-gray-800">
                    {r.dish ? (r.dish as Dish).name : "未知菜品"}
                    <span className="text-xs text-gray-400 font-normal ml-1.5">
                      {r.mealType === "breakfast" ? "早餐" : r.mealType === "lunch" ? "午餐" : "晚餐"}
                    </span>
                  </p>
                  <span className="text-xs text-gray-400 flex-shrink-0 ml-2">{r.date}</span>
                </div>
                {r.notes && <p className="text-xs text-gray-500 mt-1">📝 {r.notes}</p>}
              </div>
              <div className="flex items-center text-gray-300">→</div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
"use client";
import { Dish, HistoryEvent, HistoryFrequency } from "@/lib/types";
import { PAGE_CONTENT_CLASS } from "@/lib/layout";

export default function HistoryPage({
  events, frequency, loading, onDishClick,
}: { events: HistoryEvent[]; frequency: HistoryFrequency[]; loading: boolean; onDishClick: (d: Dish) => void }) {

  const maxFreq = frequency[0]?.times || 1;

  if (loading) return <div className="px-5 pt-20 text-center text-gray-400">加载中...</div>;

  return (
    <div className={PAGE_CONTENT_CLASS}>
      <h1 className="text-2xl font-bold text-gray-900">历史</h1>
      <p className="text-gray-400 text-sm mt-0.5">看看最近都吃了什么</p>

      {frequency.length > 0 && (
        <div className="mt-5 bg-white rounded-2xl border border-gray-100 p-4">
          <p className="text-sm font-semibold text-gray-700 mb-3 flex items-center gap-1.5">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="#f59e0b"><path d="M12 2l3.09 6.26L22 9.27l-5 4.87L18.18 22 12 18.56 5.82 22 7 14.14l-5-4.87 6.91-1.01L12 2z"/></svg>
            常做菜品排行
          </p>
          <div className="space-y-2.5">
            {frequency.map((d, i) => {
              const colors = ["#34c759","#30b350","#4cd964","#84d892","#a8e6b0"];
              const pct = Math.round(d.times / maxFreq * 100);
              return (
                <div key={d.id} className="flex items-center gap-2.5">
                  <span className={`text-xs w-4 text-center font-bold ${i === 0 ? "text-yellow-500" : "text-gray-400"}`}>{i + 1}</span>
                  <span className="text-sm w-7 text-center">🍽️</span>
                  <span className="text-xs text-gray-700 flex-1 truncate font-medium">{d.name}</span>
                  <div className="w-20 bg-gray-100 rounded-full h-1.5 overflow-hidden">
                    <div className="h-1.5 rounded-full" style={{ width: `${pct}%`, background: colors[i] }} />
                  </div>
                  <span className="text-xs text-gray-400 w-10 text-right tabular-nums">{d.times} 次</span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      <h2 className="text-[15px] font-semibold text-gray-800 mt-6 mb-3">📆 最近记录</h2>
      {events.length === 0 ? (
        <p className="text-gray-400 text-center py-10 text-sm">还没有点菜记录，去排个菜单吧 📅</p>
      ) : (
        <div className="space-y-2">
          {events.map((event) => (
            <button key={event.id}
              onClick={() => onDishClick(event.dish)}
              className="w-full bg-white rounded-2xl border border-gray-100 p-3 flex gap-3 text-left transition active:scale-[.98]">
              <div className="text-2xl flex-shrink-0">{event.type === "dish_created" ? "📸" : "🍽️"}</div>
              <div className="flex-1 min-w-0">
                <div className="flex justify-between items-start">
                  <p className="text-sm font-semibold text-gray-800">
                    {event.dish.name}
                    <span className="text-xs text-gray-400 font-normal ml-1.5">
                      {event.type === "dish_created" ? "新增菜品" : event.mealType === "breakfast" ? "早餐" : event.mealType === "lunch" ? "午餐" : "晚餐"}
                    </span>
                  </p>
                  <span className="text-xs text-gray-400 flex-shrink-0 ml-2">{event.date}</span>
                </div>
              </div>
              <div className="flex items-center text-gray-300">→</div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

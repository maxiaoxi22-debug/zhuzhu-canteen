"use client";
import { Dish, CATEGORIES } from "@/lib/types";

function getCatLabel(catId: number | null) {
  if (catId === null) return "";
  const cats = ["肉类", "青菜", "主食", "海鲜", "汤类", "其他"];
  return cats[catId - 1] || "";
}

export default function RecordPage({
  dishes, onDishClick, onAddClick,
}: { dishes: Dish[]; onDishClick: (d: Dish) => void; onAddClick: () => void }) {
  const recent = [...dishes].sort((a,b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()).slice(0, 6);

  return (
    <div className="px-5 pt-12 pb-4">
      <h1 className="text-2xl font-bold text-gray-900">猪猪食堂</h1>
      <p className="text-gray-400 text-sm mt-0.5">记录家里会做的每一道菜</p>

      <div className="mt-4">
        <button
          onClick={onAddClick}
          className="w-full rounded-2xl p-6 flex flex-col items-center transition active:scale-[.98]"
          style={{ border: "2px dashed #34c759", background: "linear-gradient(135deg,#f0fdf4,#fafdf7)" }}
        >
          <div className="w-[72px] h-[72px] rounded-full flex items-center justify-center mb-3"
            style={{ background: "linear-gradient(135deg,#34c759,#2db84e)", boxShadow: "0 6px 20px rgba(52,199,89,.3)" }}>
            <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z" />
              <circle cx="12" cy="13" r="4" />
            </svg>
          </div>
          <p className="font-semibold text-gray-800 text-base">拍照记录一道菜</p>
          <p className="text-xs text-gray-400 mt-1">AI 自动识别食材和做法</p>
        </button>
      </div>

      <div className="mt-6">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-[15px] font-semibold text-gray-800">
            已记录 <span className="text-green-500">{dishes.length}</span> 道菜
          </h2>
          <span className="text-xs text-gray-400">最近添加 ↓</span>
        </div>
        {recent.length === 0 ? (
          <p className="text-gray-400 text-center py-10 text-sm">还没有记录菜品，快去拍第一张吧 📸</p>
        ) : (
          <div className="grid grid-cols-2 gap-3">
            {recent.map((d) => (
              <button key={d.id} onClick={() => onDishClick(d)}
                className="bg-white rounded-2xl border border-gray-100 overflow-hidden text-left transition active:scale-[.97]">
                <div className="h-28 bg-gray-50 flex items-center justify-center text-5xl">
                  {d.imageUrl ? <img src={d.imageUrl} alt={d.name} className="w-full h-full object-cover" /> : "🍽️"}
                </div>
                <div className="p-3">
                  <p className="text-sm font-semibold text-gray-800 truncate">{d.name}</p>
                  <p className="text-xs text-gray-400 mt-1">
                    {getCatLabel(d.categoryId)} · {d.timesCooked}次
                  </p>
                </div>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
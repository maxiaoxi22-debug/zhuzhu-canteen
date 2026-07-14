"use client";
import { useEffect, useRef, useState } from "react";
import { Dish } from "@/lib/types";
import Image from "next/image";
import { PAGE_CONTENT_CLASS } from "@/lib/layout";
import { BYPASS_IMAGE_OPTIMIZATION, getDisplayImageSrc } from "@/lib/image-display";
import { HOME_DISH_BATCH_SIZE, nextVisibleDishCount } from "@/lib/home-pagination";
import { movedPastLongPressTolerance, Point } from "@/lib/dish-gestures";
import DishActionMenu from "./DishActionMenu";

function getCatLabel(catId: number | null) {
  if (catId === null) return "";
  const cats = ["肉类", "青菜", "主食", "海鲜", "汤类", "其他"];
  return cats[catId - 1] || "";
}

export default function RecordPage({
  dishes, onDishClick, onAddClick, onEditDish, onDeleteDish,
}: { dishes: Dish[]; onDishClick: (d: Dish) => void; onAddClick: () => void; onEditDish: (d: Dish) => void; onDeleteDish: (d: Dish) => void }) {
  const [visibleCount, setVisibleCount] = useState(HOME_DISH_BATCH_SIZE);
  const [actionDishId, setActionDishId] = useState<string | null>(null);
  const loadMoreRef = useRef<HTMLDivElement>(null);
  const longPressTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pressStart = useRef<Point | null>(null);
  const longPressTriggered = useRef(false);
  const recent = [...dishes].sort((a,b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  const visibleDishes = recent.slice(0, visibleCount);
  const hasMore = visibleCount < recent.length;

  useEffect(() => {
    const target = loadMoreRef.current;
    if (!target || !hasMore) return;
    if (!("IntersectionObserver" in window)) {
      queueMicrotask(() => setVisibleCount(dishes.length));
      return;
    }
    const observer = new IntersectionObserver(([entry]) => {
      if (entry.isIntersecting) setVisibleCount((current) => nextVisibleDishCount(current, dishes.length));
    }, { rootMargin: "160px 0px" });
    observer.observe(target);
    return () => observer.disconnect();
  }, [dishes.length, hasMore]);

  useEffect(() => {
    const close = () => setActionDishId(null);
    window.addEventListener("scroll", close, { passive: true });
    document.addEventListener("click", close);
    return () => { window.removeEventListener("scroll", close); document.removeEventListener("click", close); };
  }, []);

  const cancelLongPress = () => {
    if (longPressTimer.current) clearTimeout(longPressTimer.current);
    longPressTimer.current = null;
    pressStart.current = null;
  };

  const startLongPress = (dish: Dish, event: React.PointerEvent) => {
    cancelLongPress();
    longPressTriggered.current = false;
    pressStart.current = { x: event.clientX, y: event.clientY };
    longPressTimer.current = setTimeout(() => {
      longPressTriggered.current = true;
      navigator.vibrate?.(20);
      setActionDishId(dish.id);
    }, 500);
  };

  return (
    <div className={PAGE_CONTENT_CLASS}>
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
            {visibleDishes.map((d) => (
              <div key={d.id} className="relative rounded-2xl">
                <button
                  onPointerDown={(event) => startLongPress(d, event)}
                  onPointerMove={(event) => {
                    if (pressStart.current && movedPastLongPressTolerance(pressStart.current, { x: event.clientX, y: event.clientY })) cancelLongPress();
                  }}
                  onPointerUp={cancelLongPress}
                  onPointerCancel={cancelLongPress}
                  onClick={(event) => {
                    if (longPressTriggered.current) { longPressTriggered.current = false; event.stopPropagation(); return; }
                    setActionDishId(null);
                    onDishClick(d);
                  }}
                  className="dish-card-motion w-full bg-white rounded-2xl border border-gray-100 overflow-hidden text-left transition active:scale-[.97]">
                  <div className="h-28 bg-gray-50 flex items-center justify-center text-5xl relative">
                    {d.imageUrl ? <Image src={getDisplayImageSrc(d.imageUrl, process.env.NODE_ENV)} alt={d.name} fill sizes="(max-width: 640px) 45vw, 320px" unoptimized={BYPASS_IMAGE_OPTIMIZATION} className="object-cover" /> : "🍽️"}
                  </div>
                  <div className="p-3 pr-9">
                    <p className="text-sm font-semibold text-gray-800 truncate">{d.name}</p>
                    <p className="text-xs text-gray-400 mt-1">{getCatLabel(d.categoryId)} · {d.timesCooked}次</p>
                  </div>
                </button>
                <button aria-label={`${d.name}更多操作`} onClick={(event) => { event.stopPropagation(); setActionDishId((current) => current === d.id ? null : d.id); }} className="absolute right-2 bottom-2 z-10 h-8 w-8 rounded-full bg-white/90 text-gray-400 shadow-sm">···</button>
                {actionDishId === d.id && <DishActionMenu dish={d} onEdit={(dish) => { setActionDishId(null); onEditDish(dish); }} onDelete={(dish) => { setActionDishId(null); onDeleteDish(dish); }} />}
              </div>
            ))}
          </div>
        )}
        {recent.length > 0 && (
          hasMore
            ? <div ref={loadMoreRef} className="py-6 text-center text-xs text-gray-400">继续下滑加载更多...</div>
            : <div className="py-6 text-center text-xs text-gray-300">已经到底了 · 共 {recent.length} 道菜</div>
        )}
      </div>
    </div>
  );
}

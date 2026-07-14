"use client";

import { useEffect, useRef, useState } from "react";
import Image from "next/image";
import { Dish } from "@/lib/types";
import { PAGE_CONTENT_CLASS } from "@/lib/layout";
import { BYPASS_IMAGE_OPTIMIZATION, getDisplayImageSrc } from "@/lib/image-display";
import { HOME_DISH_BATCH_SIZE, nextVisibleDishCount } from "@/lib/home-pagination";
import { movedPastLongPressTolerance, Point } from "@/lib/dish-gestures";
import { getCategoryMeta } from "@/lib/categories";
import { getLocalDateKey, increaseSatiety, readDailySatiety, SATIETY_STORAGE_KEY, SatietyState } from "@/lib/satiety";
import DishActionMenu from "./DishActionMenu";
import PigHero from "./PigHero";

export default function RecordPage({
  dishes, onDishClick, onAddClick, onEditDish, onDeleteDish,
}: { dishes: Dish[]; onDishClick: (d: Dish) => void; onAddClick: () => void; onEditDish: (d: Dish) => void; onDeleteDish: (d: Dish) => void }) {
  const [visibleCount, setVisibleCount] = useState(HOME_DISH_BATCH_SIZE);
  const [actionDishId, setActionDishId] = useState<string | null>(null);
  const [satiety, setSatiety] = useState<SatietyState>({ date: "", value: 0 });
  const [celebrating, setCelebrating] = useState(false);
  const loadMoreRef = useRef<HTMLDivElement>(null);
  const longPressTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pressStart = useRef<Point | null>(null);
  const longPressTriggered = useRef(false);
  const recent = [...dishes].sort((a,b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  const visibleDishes = recent.slice(0, visibleCount);
  const hasMore = visibleCount < recent.length;

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => {
      setSatiety(readDailySatiety(localStorage, getLocalDateKey()));
    });
    return () => window.cancelAnimationFrame(frame);
  }, []);

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

  const handleFeed = () => {
    const next = increaseSatiety(satiety, getLocalDateKey());
    setSatiety(next);
    setCelebrating(true);
    try { localStorage.setItem(SATIETY_STORAGE_KEY, JSON.stringify(next)); } catch {}
    window.setTimeout(() => setCelebrating(false), 700);
    window.setTimeout(onAddClick, 450);
  };

  return (
    <div className={PAGE_CONTENT_CLASS}>
      <div className="flex items-start justify-between gap-3">
        <div><p className="page-kicker">猪猪食堂 · 今日投喂</p><h1 className="page-title">今天喂猪猪了吗？</h1></div>
        <div className="grid h-11 w-11 place-items-center rounded-2xl bg-[#ffe2d7] text-2xl" aria-hidden="true">🐽</div>
      </div>

      <PigHero value={satiety.value} celebrating={celebrating} />

      <button onClick={handleFeed} className={`feed-button${satiety.value >= 100 ? " is-done" : ""}`}>
        <span className="feed-button-icon">📷</span>
        <span>{satiety.value >= 100 ? "再记录一道菜 · 猪猪今天吃饱啦" : "拍一道菜 · 喂给猪猪"}</span>
      </button>

      <div>
        <div className="section-head"><h2>猪猪的饭盆</h2><span>{dishes.length} 道菜 · 最近添加</span></div>
        {recent.length === 0 ? (
          <p className="py-10 text-center text-sm text-[var(--muted)]">饭盆还是空的，快喂第一道菜吧 🐽</p>
        ) : (
          <div className="grid grid-cols-2 gap-2.5">
            {visibleDishes.map((dish) => {
              const category = getCategoryMeta(dish.categoryId);
              return (
                <div key={dish.id} className="relative rounded-[1.25rem]">
                  <button
                    onPointerDown={(event) => startLongPress(dish, event)}
                    onPointerMove={(event) => {
                      if (pressStart.current && movedPastLongPressTolerance(pressStart.current, { x: event.clientX, y: event.clientY })) cancelLongPress();
                    }}
                    onPointerUp={cancelLongPress}
                    onPointerCancel={cancelLongPress}
                    onClick={(event) => {
                      if (longPressTriggered.current) { longPressTriggered.current = false; event.stopPropagation(); return; }
                      setActionDishId(null);
                      onDishClick(dish);
                    }}
                    className="dish-card-motion surface-card w-full overflow-hidden rounded-[1.25rem] p-2.5 text-left transition active:scale-[.97]">
                    <div className={`category-icon ${category.className} relative h-[5.5rem] overflow-hidden text-[2.4rem]`}>
                      {dish.imageUrl ? <Image src={getDisplayImageSrc(dish.imageUrl, process.env.NODE_ENV)} alt={dish.name} fill sizes="(max-width: 640px) 45vw, 320px" unoptimized={BYPASS_IMAGE_OPTIMIZATION} className="object-cover" /> : category.icon}
                    </div>
                    <div className="px-0.5 pb-0.5 pt-2">
                      <p className="truncate text-[.82rem] font-bold text-[var(--cocoa)]">{dish.name}</p>
                      <p className="mt-1 text-[.64rem] text-[var(--muted)]">{category.name} · 做过 {dish.timesCooked} 次</p>
                    </div>
                  </button>
                  {actionDishId === dish.id && <DishActionMenu dish={dish} onEdit={(item) => { setActionDishId(null); onEditDish(item); }} onDelete={(item) => { setActionDishId(null); onDeleteDish(item); }} />}
                </div>
              );
            })}
          </div>
        )}
        {recent.length > 0 && (
          hasMore
            ? <div ref={loadMoreRef} className="py-6 text-center text-xs text-[var(--muted)]">继续下滑加载更多...</div>
            : <div className="py-6 text-center text-xs text-[#c8b8b1]">饭盆到底啦 · 共 {recent.length} 道菜</div>
        )}
      </div>
    </div>
  );
}

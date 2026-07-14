"use client";
/* eslint-disable react-hooks/set-state-in-effect */

import { useCallback, useEffect, useMemo, useState } from "react";
import Image from "next/image";
import { CATEGORIES, Dish, MEAL_TYPES, MealPlan } from "@/lib/types";
import { PAGE_CONTENT_CLASS } from "@/lib/layout";
import { BYPASS_IMAGE_OPTIMIZATION, getDisplayImageSrc } from "@/lib/image-display";
import { getCategoryMeta } from "@/lib/categories";
import { getLocalDateKey } from "@/lib/satiety";

export default function TodayPage({
  dishes, onDishClick, refresh,
}: { dishes: Dish[]; onDishClick: (d: Dish) => void; refresh: () => void }) {
  const [randCat, setRandCat] = useState("all");
  const [randDish, setRandDish] = useState<Dish | null>(null);
  const [todayPlans, setTodayPlans] = useState<MealPlan[]>([]);
  const [adding, setAdding] = useState("");
  const [message, setMessage] = useState("");

  const pool = useMemo(
    () => randCat === "all" ? dishes : dishes.filter((dish) => getCategoryMeta(dish.categoryId).name === randCat),
    [dishes, randCat],
  );

  const randomize = useCallback(() => {
    if (!pool.length) { setRandDish(null); return; }
    const alternatives = pool.length > 1 ? pool.filter((dish) => dish.id !== randDish?.id) : pool;
    setRandDish(alternatives[Math.floor(Math.random() * alternatives.length)] || pool[0]);
  }, [pool, randDish?.id]);

  useEffect(() => {
    setRandDish((current) => {
      if (!pool.length) return null;
      return pool.some((dish) => dish.id === current?.id)
        ? current
        : pool[Math.floor(Math.random() * pool.length)];
    });
  }, [pool]);

  const fetchTodayPlans = useCallback(async () => {
    try {
      const response = await fetch(`/api/plans?date=${getLocalDateKey()}`);
      if (!response.ok) throw new Error("今日菜单读取失败");
      setTodayPlans(await response.json());
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "今日菜单读取失败");
    }
  }, []);

  useEffect(() => { void fetchTodayPlans(); }, [fetchTodayPlans, dishes.length]);

  const addToPlan = async (dishId: string, mealType: string) => {
    setAdding(mealType);
    setMessage("");
    try {
      const response = await fetch("/api/plans", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ date: getLocalDateKey(), mealType, dishId }),
      });
      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || "添加失败，请重试");
      }
      await fetchTodayPlans();
      refresh();
      const meal = MEAL_TYPES.find((item) => item.key === mealType)?.label || "菜单";
      setMessage(`${randDish?.name || "菜品"} 已加入${meal}`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "网络错误，请重试");
    } finally {
      setAdding("");
    }
  };

  const removePlan = async (id: number) => {
    setMessage("");
    try {
      const response = await fetch(`/api/plans?id=${id}`, { method: "DELETE" });
      if (!response.ok) throw new Error("移除失败，请重试");
      await fetchTodayPlans();
      refresh();
      setMessage("已从今日菜单移除");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "移除失败，请重试");
    }
  };

  const getDish = (id: string | null) => dishes.find((dish) => dish.id === id);
  const recommendationMeta = getCategoryMeta(randDish?.categoryId ?? null);

  return (
    <div className={PAGE_CONTENT_CLASS}>
      <p className="page-kicker">让猪猪帮你决定</p>
      <h1 className="page-title">今天吃点啥？</h1>

      <div className="scrollbar-hide -mx-[1.125rem] mt-3 flex gap-2 overflow-x-auto px-[1.125rem] pb-1">
        {CATEGORIES.map((category) => (
          <button key={category.key} onClick={() => setRandCat(category.key)} className={`h-8 flex-none rounded-full border px-3 text-[.7rem] font-bold transition ${randCat === category.key ? "border-[var(--coral)] bg-[var(--coral)] text-white" : "border-[var(--line)] bg-[var(--paper)] text-[#806c66]"}`}>
            {category.label}
          </button>
        ))}
      </div>

      <div className="mt-3 rounded-[1.55rem] bg-gradient-to-br from-[#ffe0d3] to-[#ffcab9] p-3.5">
        <div className="flex items-center justify-between text-[.65rem] font-extrabold text-[#8c5d51]"><span>✦ 猪猪随机推荐</span><span>{randCat === "all" ? "全部菜品" : randCat}</span></div>
        {randDish ? (
          <button onClick={() => onDishClick(randDish)} className="mt-3 w-full rounded-[1.25rem] bg-[#fffdf9f0] p-4 text-center transition active:scale-[.98]">
            <div className={`category-icon ${recommendationMeta.className} relative mx-auto h-[4.9rem] w-[4.9rem] overflow-hidden text-[2.6rem]`}>
              {randDish.imageUrl ? <Image src={getDisplayImageSrc(randDish.imageUrl, process.env.NODE_ENV)} alt={randDish.name} fill sizes="78px" unoptimized={BYPASS_IMAGE_OPTIMIZATION} className="object-cover" /> : recommendationMeta.icon}
            </div>
            <h2 className="mt-2.5 text-lg font-extrabold text-[var(--cocoa)]">{randDish.name}</h2>
            <p className="mt-1 text-[.65rem] text-[var(--muted)]">{recommendationMeta.name} · 做过 {randDish.timesCooked} 次</p>
          </button>
        ) : (
          <div className="mt-3 rounded-[1.25rem] bg-[#fffdf9f0] p-8 text-center text-sm text-[var(--muted)]">该分类暂无菜品<br />先去喂一道菜吧 🐽</div>
        )}
        <button onClick={randomize} disabled={!randDish} className="mt-2.5 h-10 w-full rounded-[.9rem] border border-[#68463a1f] bg-white/80 text-xs font-extrabold text-[var(--cocoa)] disabled:opacity-40">↻ 换一道，让猪猪再想想</button>
        <div className="mt-2 grid grid-cols-3 gap-2">
          {MEAL_TYPES.map((meal) => (
            <button key={meal.key} onClick={() => randDish && addToPlan(randDish.id, meal.key)} disabled={!randDish || Boolean(adding)} className="h-10 rounded-[.8rem] bg-[var(--cocoa)] text-[.65rem] font-extrabold text-white disabled:opacity-40">
              {adding === meal.key ? "添加中…" : `${meal.emoji} ${meal.label}`}
            </button>
          ))}
        </div>
      </div>

      {message && <p role="status" className="mt-2 rounded-xl bg-white/70 px-3 py-2 text-center text-xs text-[#806d67]">{message}</p>}

      <div className="section-head"><h2>今日菜单</h2><span>实时保存到家庭菜单</span></div>
      <div className="grid gap-2.5">
        {MEAL_TYPES.map((meal) => {
          const plans = todayPlans.filter((plan) => plan.mealType === meal.key);
          return (
            <div key={meal.key} className="surface-card rounded-[1.1rem] p-3">
              <div className="flex items-center justify-between text-[.7rem] font-extrabold text-[#806d67]"><span>{meal.emoji} {meal.label}</span><span>{plans.length ? "已安排" : "待投喂"}</span></div>
              <div className="mt-2 grid min-h-8 gap-1.5">
                {plans.length === 0 ? <span className="text-xs text-[#c3b2ab]">还没想好，先让猪猪推荐一道吧</span> : plans.map((plan) => {
                  const dish = getDish(plan.dishId);
                  if (!dish) return null;
                  const meta = getCategoryMeta(dish.categoryId);
                  return <div key={plan.id} className="flex items-center gap-2"><span className={`category-icon ${meta.className} h-8 w-8 text-base`}>{meta.icon}</span><strong className="flex-1 text-xs">{dish.name}</strong><button onClick={() => void removePlan(plan.id)} aria-label={`移除${dish.name}`} className="h-7 w-7 rounded-lg bg-[#fff0ec] text-[var(--coral-dark)]">×</button></div>;
                })}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

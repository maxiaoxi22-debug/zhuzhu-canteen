"use client";
/* eslint-disable react-hooks/set-state-in-effect */

import { useCallback, useEffect, useState } from "react";
import Image from "next/image";
import { CATEGORIES, Dish, MEAL_TYPES, MealPlan, RecommendationItem } from "@/lib/types";
import { PAGE_CONTENT_CLASS } from "@/lib/layout";
import { BYPASS_IMAGE_OPTIMIZATION, getDisplayImageSrc } from "@/lib/image-display";
import { CATEGORY_META, getCategoryMeta } from "@/lib/categories";
import { getLocalDateKey } from "@/lib/satiety";

interface TodayPageProps {
  dishes: Dish[];
  onDishClick: (dish: Dish) => void;
  onRecipeClick: (recipeId: string) => void;
  refresh: () => void;
  recommendationRevision: number;
  wishlistCount: number;
  onOpenWishlist: () => void;
}

function recommendationKey(item: RecommendationItem): string {
  return item.source === "dish" ? `dish:${item.dishId}` : `wishlist:${item.wishlistItemId}`;
}

function categoryMeta(categoryKey: string, categoryId?: number | null) {
  return categoryId !== undefined
    ? getCategoryMeta(categoryId)
    : CATEGORY_META.find((item) => item.name === categoryKey) ?? getCategoryMeta(null);
}

export default function TodayPage({
  dishes,
  onDishClick,
  onRecipeClick,
  refresh,
  recommendationRevision,
  wishlistCount,
  onOpenWishlist,
}: TodayPageProps) {
  const [randCat, setRandCat] = useState("all");
  const [pool, setPool] = useState<RecommendationItem[]>([]);
  const [recommendation, setRecommendation] = useState<RecommendationItem | null>(null);
  const [todayPlans, setTodayPlans] = useState<MealPlan[]>([]);
  const [adding, setAdding] = useState("");
  const [message, setMessage] = useState("");

  const fetchRecommendations = useCallback(async () => {
    try {
      const response = await fetch(`/api/recommendations?category=${encodeURIComponent(randCat)}`);
      if (!response.ok) throw new Error("推荐读取失败，请重试");
      const data = await response.json() as { items?: RecommendationItem[] };
      const items = data.items ?? [];
      setPool(items);
      setRecommendation((current) => {
        if (!items.length) return null;
        return items.find((item) => recommendationKey(item) === (current ? recommendationKey(current) : ""))
          ?? items[Math.floor(Math.random() * items.length)];
      });
    } catch (error) {
      setPool([]);
      setRecommendation(null);
      setMessage(error instanceof Error ? error.message : "推荐读取失败，请重试");
    }
  }, [randCat]);

  useEffect(() => { void fetchRecommendations(); }, [fetchRecommendations, recommendationRevision, wishlistCount]);

  const randomize = useCallback(() => {
    if (!pool.length) { setRecommendation(null); return; }
    const alternatives = pool.length > 1
      ? pool.filter((item) => recommendationKey(item) !== (recommendation ? recommendationKey(recommendation) : ""))
      : pool;
    setRecommendation(alternatives[Math.floor(Math.random() * alternatives.length)] ?? pool[0]);
  }, [pool, recommendation]);

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

  const openRecommendation = () => {
    if (!recommendation) return;
    if (recommendation.source === "dish") {
      const dish = dishes.find((item) => item.id === recommendation.dishId);
      if (dish) onDishClick(dish);
      return;
    }
    if (recommendation.recipeId) onRecipeClick(recommendation.recipeId);
  };

  const addToPlan = async (mealType: string) => {
    if (!recommendation) return;
    setAdding(mealType);
    setMessage("");
    const source = recommendation.source === "dish"
      ? { dishId: recommendation.dishId }
      : { wishlistItemId: recommendation.wishlistItemId };
    try {
      const response = await fetch("/api/plans", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ date: getLocalDateKey(), mealType, ...source }),
      });
      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || "添加失败，请重试");
      }
      await fetchTodayPlans();
      refresh();
      const meal = MEAL_TYPES.find((item) => item.key === mealType)?.label || "菜单";
      setMessage(`${recommendation.name} 已加入${meal}`);
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

  const recommendationMeta = recommendation
    ? categoryMeta(recommendation.categoryKey, recommendation.source === "dish" ? recommendation.categoryId : undefined)
    : getCategoryMeta(null);

  return (
    <div className={PAGE_CONTENT_CLASS}>
      <p className="page-kicker">让猪猪帮你决定</p>
      <div className="flex items-center justify-between gap-3">
        <h1 className="page-title">今天吃点啥？</h1>
        <button type="button" onClick={onOpenWishlist} aria-label="打开猪猪心愿单" className="relative grid min-h-11 min-w-11 place-items-center rounded-xl bg-[#fff0eb] text-xl text-[var(--coral-dark)]">
          ♥
          {wishlistCount > 0 && <span aria-hidden="true" className="absolute -right-1 -top-1 grid min-h-5 min-w-5 place-items-center rounded-full bg-[var(--coral)] px-1 text-[.62rem] font-extrabold leading-none text-white">{wishlistCount > 99 ? "99+" : wishlistCount}</span>}
        </button>
        <span className="sr-only" role="status">{wishlistCount > 0 ? `${wishlistCount} 个待完成心愿` : "暂无待完成心愿"}</span>
      </div>

      <div className="scrollbar-hide -mx-[1.125rem] mt-3 flex gap-2 overflow-x-auto px-[1.125rem] pb-1">
        {CATEGORIES.map((category) => (
          <button key={category.key} onClick={() => setRandCat(category.key)} className={`h-8 flex-none rounded-full border px-3 text-[.7rem] font-bold transition ${randCat === category.key ? "border-[var(--coral)] bg-[var(--coral)] text-white" : "border-[var(--line)] bg-[var(--paper)] text-[#806c66]"}`}>
            {category.label}
          </button>
        ))}
      </div>

      <div className="mt-3 rounded-[1.55rem] bg-gradient-to-br from-[#ffe0d3] to-[#ffcab9] p-3.5">
        <div className="flex items-center justify-between text-[.65rem] font-extrabold text-[#8c5d51]"><span>✦ 猪猪随机推荐</span><span>{randCat === "all" ? "全部菜品" : randCat}</span></div>
        {recommendation ? (
          <button onClick={openRecommendation} disabled={recommendation.source === "wishlist" && !recommendation.recipeId} className="mt-3 w-full rounded-[1.25rem] bg-[#fffdf9f0] p-4 text-center transition active:scale-[.98] disabled:cursor-default">
            <div className={`category-icon ${recommendationMeta.className} relative mx-auto h-[4.9rem] w-[4.9rem] overflow-hidden text-[2.6rem]`}>
              {recommendation.imageUrl ? <Image src={getDisplayImageSrc(recommendation.imageUrl, process.env.NODE_ENV)} alt={recommendation.name} fill sizes="78px" unoptimized={BYPASS_IMAGE_OPTIMIZATION} className="object-cover" /> : recommendationMeta.icon}
            </div>
            <h2 className="mt-2.5 text-lg font-extrabold text-[var(--cocoa)]">{recommendation.name}</h2>
            <p className="mt-1 text-[.65rem] text-[var(--muted)]">{recommendationMeta.name} · {recommendation.sourceLabel}</p>
            {recommendation.source === "wishlist" && <span className="sr-only">心愿单 · 还没做过</span>}
          </button>
        ) : (
          <div className="mt-3 rounded-[1.25rem] bg-[#fffdf9f0] p-8 text-center text-sm text-[var(--muted)]">该分类暂无饭盆菜品或待完成心愿<br />先去喂一道菜吧 🐽</div>
        )}
        <button onClick={randomize} disabled={!recommendation} className="mt-2.5 h-10 w-full rounded-[.9rem] border border-[#68463a1f] bg-white/80 text-xs font-extrabold text-[var(--cocoa)] disabled:opacity-40">↻ 换一道，让猪猪再想想</button>
        <div className="mt-2 grid grid-cols-3 gap-2">
          {MEAL_TYPES.map((meal) => (
            <button key={meal.key} onClick={() => void addToPlan(meal.key)} disabled={!recommendation || Boolean(adding)} className="h-10 rounded-[.8rem] bg-[var(--cocoa)] text-[.65rem] font-extrabold text-white disabled:opacity-40">
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
                  const dish = plan.dishId ? dishes.find((item) => item.id === plan.dishId) : undefined;
                  const name = plan.name ?? dish?.name ?? "未知菜品";
                  const meta = categoryMeta(plan.categoryKey ?? "其他", plan.sourceType === "dish" ? plan.categoryId ?? dish?.categoryId : undefined);
                  return <div key={plan.id} className="flex items-center gap-2"><span className={`category-icon ${meta.className} h-8 w-8 text-base`}>{meta.icon}</span><strong className="flex-1 text-xs">{name}</strong>{plan.sourceType === "wishlist" && <span className="text-[.58rem] font-bold text-[var(--coral-dark)]">心愿</span>}<button onClick={() => void removePlan(plan.id)} aria-label={`移除${name}`} className="h-7 w-7 rounded-lg bg-[#fff0ec] text-[var(--coral-dark)]">×</button></div>;
                })}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

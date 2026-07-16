"use client";

import Image from "next/image";
import { Dish, HistoryEvent, HistoryFrequency } from "@/lib/types";
import { PAGE_CONTENT_CLASS } from "@/lib/layout";
import { buildHistoryStats } from "@/lib/history-stats";
import { getLocalDateKey } from "@/lib/satiety";
import { getCategoryMeta } from "@/lib/categories";

function formatEventDate(date: string, today: string): string {
  if (date === today) return "今天";
  const yesterday = new Date(`${today}T00:00:00.000Z`);
  yesterday.setUTCDate(yesterday.getUTCDate() - 1);
  if (date === yesterday.toISOString().slice(0, 10)) return "昨天";
  const [, month, day] = date.split("-");
  return `${Number(month)}月${Number(day)}日`;
}

export default function HistoryPage(props: {
  events: HistoryEvent[];
  frequency: HistoryFrequency[];
  wishlistSummary: { pending: number; completed: number };
  loading: boolean;
  onDishClick: (dish: Dish) => void;
  onOpenWishlist: () => void;
}) {
  const { events, wishlistSummary, loading, onDishClick, onOpenWishlist } = props;
  const today = getLocalDateKey();
  const stats = buildHistoryStats(events, today);
  const maxCategory = Math.max(1, ...stats.categories.map((category) => category.times));

  if (loading) return <div className="page-content text-center text-sm text-[var(--muted)]">猪猪正在翻日记…</div>;

  return (
    <div className={PAGE_CONTENT_CLASS}>
      <p className="page-kicker">每一顿都算数</p>
      <h1 className="page-title">猪猪成长日记</h1>

      <div className="relative mt-4 h-36 overflow-hidden rounded-[1.6rem] bg-gradient-to-br from-[#ffd8c9] to-[#ffc0ae] p-4.5">
        <div className="inline-flex rotate-[-2deg] items-center gap-1 rounded-[.65rem] bg-[#fffaf1] px-2.5 py-1.5 text-[.65rem] font-extrabold">🏅 本月吃饭小能手</div>
        <div className="mt-4"><strong className="block font-serif text-3xl leading-none">{stats.monthlyMeals} 顿</strong><span className="mt-1 block text-[.65rem] text-[#805b50]">这个月已经认真开饭</span></div>
        <Image src="/pig-mascot-cutout.png" alt="猪猪食堂小猪" width={205} height={205} className="absolute -bottom-[4.5rem] -right-8 h-[12.8rem] w-[12.8rem] object-contain" />
      </div>

      <div className="mt-2.5 grid grid-cols-2 gap-2.5">
        <div className="surface-card rounded-[1.05rem] px-3.5 py-3"><strong className="block text-lg">{stats.consecutiveDays} 天</strong><span className="text-[.65rem] text-[var(--muted)]">连续开饭</span></div>
        <div className="surface-card rounded-[1.05rem] px-3.5 py-3"><strong className="block text-lg">{stats.unlockedCategories} 类</strong><span className="text-[.65rem] text-[var(--muted)]">食物已解锁</span></div>
      </div>

      <button onClick={onOpenWishlist} className="surface-card mt-2.5 flex min-h-11 w-full items-center justify-between rounded-[1.05rem] px-3.5 py-2.5 text-left transition active:scale-[.98]">
        <strong className="text-xs">{wishlistSummary.pending} 个心愿待完成</strong>
        <span className="text-[.65rem] text-[var(--muted)]">已完成 {wishlistSummary.completed} 个 · 去看看</span>
      </button>

      <div className="section-head"><h2>六类食物成就</h2><span>按本月真实菜单</span></div>
      <div className="grid gap-2">
        {stats.categories.map((category) => (
          <div key={category.categoryId} className="surface-card grid grid-cols-[2.5rem_1fr_auto] items-center gap-2.5 rounded-[1.05rem] p-2.5">
            <span className={`category-icon ${category.className} h-10 w-10 text-xl`}>{category.icon}</span>
            <div className="min-w-0">
              <b className="block text-xs">{category.achievement}</b>
              <span className="text-[.58rem] text-[var(--muted)]">{category.favoriteDish ? `最爱${category.favoriteDish}` : `等待解锁${category.name}`}</span>
              <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-[#f1e7e1]"><i className="block h-full rounded-full bg-[var(--coral)]" style={{ width: `${category.times / maxCategory * 100}%` }} /></div>
            </div>
            <span className="min-w-10 text-right text-[.65rem] text-[var(--muted)]">{category.times} 次</span>
          </div>
        ))}
      </div>

      <div className="section-head"><h2>投喂时间线</h2><span>本周 {stats.weekMeals} 顿</span></div>
      {events.length === 0 ? (
        <p className="py-10 text-center text-sm text-[var(--muted)]">日记还是空的，去安排一顿饭吧 🐽</p>
      ) : (
        <div className="grid gap-2">
          {events.map((event) => {
            if (event.type === "wishlist_completed") {
              return (
                <button key={event.id} onClick={onOpenWishlist} className="surface-card grid min-h-11 w-full grid-cols-[2.2rem_1fr_auto] items-center gap-2.5 rounded-[1.05rem] p-2.5 text-left transition active:scale-[.98]">
                  <span className="category-icon h-9 w-9 bg-[#fff0dc] text-lg">✨</span>
                  <span className="min-w-0"><b className="block truncate text-xs">完成心愿：{event.nameSnapshot}</b><small className="text-[.58rem] text-[var(--muted)]">心愿成就 +1</small></span>
                  <span className="text-[.58rem] text-[var(--muted)]">{formatEventDate(event.date, today)}</span>
                </button>
              );
            }
            const meta = getCategoryMeta(event.dish.categoryId);
            const mealLabel = event.type === "meal_planned"
              ? event.mealType === "breakfast" ? "早餐" : event.mealType === "lunch" ? "午餐" : "晚餐"
              : "";
            return (
              <button key={event.id} onClick={() => onDishClick(event.dish)} className="surface-card grid w-full grid-cols-[2.2rem_1fr_auto] items-center gap-2.5 rounded-[1.05rem] p-2.5 text-left transition active:scale-[.98]">
                <span className={`category-icon ${meta.className} h-9 w-9 text-lg`}>{meta.icon}</span>
                <span className="min-w-0"><b className="block truncate text-xs">{event.type === "dish_created" ? `解锁新菜：${event.dish.name}` : `${event.dish.name} · ${mealLabel}`}</b><small className="text-[.58rem] text-[var(--muted)]">{event.type === "dish_created" ? "猪猪尝到了新味道" : `${meta.achievement} +1`}</small></span>
                <span className="text-[.58rem] text-[var(--muted)]">{formatEventDate(event.date, today)}</span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

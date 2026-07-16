"use client";
/* eslint-disable @next/next/no-img-element */

export interface WishlistCelebrationData {
  id: string;
  name: string;
  imageUrl: string | null;
}

export default function WishlistCelebration({
  completion,
  onReturnDish,
  onOpenCompleted,
}: {
  completion: WishlistCelebrationData;
  onReturnDish: () => void;
  onOpenCompleted: () => void;
}) {
  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-[#36251f80] px-6" onClick={onReturnDish}>
      <div className="w-full max-w-sm animate-[pop_.35s_ease-out] rounded-[2rem] bg-[var(--paper)] p-6 text-center shadow-2xl" onClick={(event) => event.stopPropagation()}>
        <div className="text-6xl">🎉🐷🎉</div>
        {completion.imageUrl && <img src={completion.imageUrl} alt={completion.name} className="mx-auto mt-4 h-24 w-24 rounded-full object-cover ring-4 ring-[#fff0eb]" />}
        <h3 className="mt-4 text-xl font-bold text-[var(--cocoa)]">心愿完成啦！</h3>
        <p className="mt-2 text-sm text-gray-500">{completion.name} 已经装进猪猪饭盆</p>
        <div className="mt-5 grid gap-2">
          <button type="button" onClick={onReturnDish} className="min-h-11 rounded-full bg-[var(--coral)] px-6 py-2.5 text-sm font-semibold text-white">返回饭盆</button>
          <button type="button" onClick={onOpenCompleted} className="min-h-11 rounded-full border border-[var(--cocoa)] px-6 py-2.5 text-sm font-semibold text-[var(--cocoa)]">查看已完成心愿</button>
        </div>
      </div>
    </div>
  );
}

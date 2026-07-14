"use client";
import { Dish } from "@/lib/types";

export default function DeleteDishDialog({ dish, deleting, error, onCancel, onConfirm }: {
  dish: Dish;
  deleting: boolean;
  error: string;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center px-6 bg-black/40" onClick={() => !deleting && onCancel()}>
      <div role="dialog" aria-modal="true" aria-labelledby="delete-title" className="w-full max-w-sm rounded-3xl bg-white p-5 shadow-xl" onClick={(event) => event.stopPropagation()}>
        <h2 id="delete-title" className="text-lg font-bold text-gray-900">确定删除「{dish.name}」吗？</h2>
        <p className="mt-2 text-sm leading-6 text-gray-500">菜品、相关今日菜单和全部历史记录都会被删除，删除后无法恢复。</p>
        {error && <p className="mt-3 rounded-xl bg-red-50 p-3 text-sm text-red-600">{error}</p>}
        <div className="mt-5 flex gap-3">
          <button disabled={deleting} onClick={onCancel} className="flex-1 rounded-xl bg-gray-100 py-3 text-sm font-semibold text-gray-600 disabled:opacity-50">取消</button>
          <button disabled={deleting} onClick={onConfirm} className="flex-1 rounded-xl bg-red-500 py-3 text-sm font-semibold text-white disabled:opacity-50">{deleting ? "删除中..." : "彻底删除"}</button>
        </div>
      </div>
    </div>
  );
}

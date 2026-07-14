"use client";
import { Dish } from "@/lib/types";

export default function DishActionMenu({ dish, onEdit, onDelete }: {
  dish: Dish;
  onEdit: (dish: Dish) => void;
  onDelete: (dish: Dish) => void;
}) {
  return (
    <div className="absolute right-2 top-9 z-20 flex overflow-hidden rounded-xl border border-gray-100 bg-white shadow-lg animate-fade-in">
      <button onClick={(event) => { event.stopPropagation(); onEdit(dish); }} className="px-4 py-2.5 text-xs font-semibold text-green-600">编辑</button>
      <button onClick={(event) => { event.stopPropagation(); onDelete(dish); }} className="border-l border-gray-100 px-4 py-2.5 text-xs font-semibold text-red-500">删除</button>
    </div>
  );
}

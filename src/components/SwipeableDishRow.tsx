"use client";
import { PointerEvent, ReactNode, useRef, useState } from "react";
import { Dish } from "@/lib/types";
import { resolveHorizontalSwipe } from "@/lib/dish-gestures";

const ACTION_WIDTH = 88;

export default function SwipeableDishRow({ dish, open, onOpen, onClose, onClick, onDelete, children }: {
  dish: Dish;
  open: boolean;
  onOpen: () => void;
  onClose: () => void;
  onClick: () => void;
  onDelete: (dish: Dish) => void;
  children: ReactNode;
}) {
  const [dragOffset, setDragOffset] = useState<number | null>(null);
  const currentOffset = useRef(open ? ACTION_WIDTH : 0);
  const start = useRef<{ x: number; y: number; offset: number } | null>(null);
  const horizontal = useRef(false);
  const moved = useRef(false);

  const offset = dragOffset ?? (open ? ACTION_WIDTH : 0);

  const pointerMove = (event: PointerEvent<HTMLDivElement>) => {
    if (!start.current) return;
    const dx = event.clientX - start.current.x;
    const dy = event.clientY - start.current.y;
    if (!horizontal.current && Math.hypot(dx, dy) > 6) {
      if (Math.abs(dy) > Math.abs(dx)) { start.current = null; return; }
      horizontal.current = true;
    }
    if (!horizontal.current) return;
    event.preventDefault();
    moved.current = true;
    const next = Math.max(0, Math.min(ACTION_WIDTH, start.current.offset + dx));
    currentOffset.current = next;
    setDragOffset(next);
  };

  const pointerEnd = (event: PointerEvent<HTMLDivElement>) => {
    if (!start.current) return;
    const dx = event.clientX - start.current.x;
    if (horizontal.current) {
      if ((!open && resolveHorizontalSwipe(dx, event.clientY - start.current.y, ACTION_WIDTH) === "open") || (open && currentOffset.current >= ACTION_WIDTH / 2)) onOpen();
      else onClose();
    }
    setDragOffset(null);
    start.current = null;
    horizontal.current = false;
  };

  return (
    <div className="relative overflow-hidden rounded-2xl bg-red-500">
      <button onClick={() => onDelete(dish)} className="absolute inset-y-0 left-0 w-[88px] text-sm font-semibold text-white">删除</button>
      <div
        className="dish-swipe-motion relative bg-white touch-pan-y select-none"
        style={{ transform: `translateX(${offset}px)`, touchAction: "pan-y", userSelect: "none" }}
        onDragStart={(event) => event.preventDefault()}
        onPointerDown={(event) => { currentOffset.current = offset; start.current = { x: event.clientX, y: event.clientY, offset }; horizontal.current = false; moved.current = false; event.currentTarget.setPointerCapture(event.pointerId); }}
        onPointerMove={pointerMove}
        onPointerUp={pointerEnd}
        onPointerCancel={() => { start.current = null; horizontal.current = false; setDragOffset(null); }}
        onClick={(event) => { event.stopPropagation(); if (moved.current) { moved.current = false; return; } if (open) onClose(); else onClick(); }}
      >
        {children}
      </div>
    </div>
  );
}

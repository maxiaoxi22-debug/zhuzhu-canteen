"use client";

import { Tab } from "@/app/page";

const TABS: { key: Tab; label: string; icon: string }[] = [
  { key: "record", label: "喂饭", icon: "🐷" },
  { key: "library", label: "饭盆", icon: "▦" },
  { key: "today", label: "菜单", icon: "✦" },
  { key: "history", label: "日记", icon: "◷" },
];

export default function TabBar({ active, onTabChange }: { active: Tab; onTabChange: (tab: Tab) => void }) {
  return (
    <nav className="pig-tabbar" aria-label="主导航">
      {TABS.map((tab) => (
        <button key={tab.key} onClick={() => onTabChange(tab.key)} className={`pig-tab${active === tab.key ? " is-active" : ""}`}>
          <span>{tab.icon}</span>{tab.label}
        </button>
      ))}
    </nav>
  );
}

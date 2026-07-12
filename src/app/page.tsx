"use client";
/* eslint-disable react-hooks/set-state-in-effect */
import { useState, useEffect, useCallback } from "react";
import TabBar from "@/components/TabBar";
import RecordPage from "@/components/RecordPage";
import LibraryPage from "@/components/LibraryPage";
import TodayPage from "@/components/TodayPage";
import HistoryPage from "@/components/HistoryPage";
import DishDetail from "@/components/DishDetail";
import AddDishForm from "@/components/AddDishForm";
import { Dish } from "@/lib/types";

export type Tab = "record" | "library" | "today" | "history";

export default function Home() {
  const [tab, setTab] = useState<Tab>("record");
  const [dishes, setDishes] = useState<Dish[]>([]);
  const [selectedDish, setSelectedDish] = useState<Dish | null>(null);
  const [editingDish, setEditingDish] = useState<Dish | null>(null);
  const [showAddForm, setShowAddForm] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);
  const [dbReady, setDbReady] = useState(false);
  const [loadError, setLoadError] = useState("");

  const fetchDishes = useCallback(async () => {
    setLoadError("");
    try {
      const res = await fetch("/api/dishes");
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "数据库连接失败");
      setDishes(data);
    } catch (error) {
      setLoadError(error instanceof Error ? error.message : "数据库连接失败");
    } finally {
      setDbReady(true);
    }
  }, []);

  useEffect(() => { fetchDishes(); }, [fetchDishes, refreshKey]);

  const refresh = () => setRefreshKey((k) => k + 1);

  if (!dbReady) {
    return <div className="min-h-screen bg-white flex items-center justify-center text-sm text-gray-400">正在读取菜单...</div>;
  }

  if (loadError) {
    return (
      <div className="min-h-screen bg-white flex flex-col items-center justify-center px-6 text-center">
        <p className="text-gray-700 font-semibold">菜单读取失败</p>
        <p className="text-sm text-gray-400 mt-2">{loadError}</p>
        <button onClick={() => { setDbReady(false); fetchDishes(); }} className="mt-4 bg-green-500 text-white rounded-xl px-5 py-2.5 text-sm font-semibold">
          重新加载
        </button>
      </div>
    );
  }

  return (
    <div className="bg-white min-h-screen">
      {tab === "record" && (
        <RecordPage dishes={dishes} onDishClick={setSelectedDish} onAddClick={() => setShowAddForm(true)} />
      )}
      {tab === "library" && (
        <LibraryPage dishes={dishes} onDishClick={setSelectedDish} />
      )}
      {tab === "today" && (
        <TodayPage dishes={dishes} onDishClick={setSelectedDish} refresh={refresh} />
      )}
      {tab === "history" && (
        <HistoryPage dishes={dishes} onDishClick={setSelectedDish} />
      )}

      <TabBar active={tab} onTabChange={setTab} />

      {selectedDish && (
        <DishDetail dish={selectedDish} onClose={() => setSelectedDish(null)} onEdit={() => { setEditingDish(selectedDish); setSelectedDish(null); }} refresh={refresh} />
      )}
      {(showAddForm || editingDish) && (
        <AddDishForm
          dishes={dishes}
          dish={editingDish || undefined}
          onClose={() => { setShowAddForm(false); setEditingDish(null); }}
          onSaved={() => { setShowAddForm(false); setEditingDish(null); refresh(); }}
        />
      )}
    </div>
  );
}

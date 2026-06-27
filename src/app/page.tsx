"use client";
import { useState, useEffect, useCallback } from "react";
import TabBar from "@/components/TabBar";
import RecordPage from "@/components/RecordPage";
import LibraryPage from "@/components/LibraryPage";
import TodayPage from "@/components/TodayPage";
import HistoryPage from "@/components/HistoryPage";
import DishDetail from "@/components/DishDetail";
import AddDishForm from "@/components/AddDishForm";
import { Dish, MOCK_DISHES } from "@/lib/types";

export type Tab = "record" | "library" | "today" | "history";

export default function Home() {
  const [tab, setTab] = useState<Tab>("record");
  const [dishes, setDishes] = useState<Dish[]>(MOCK_DISHES);
  const [selectedDish, setSelectedDish] = useState<Dish | null>(null);
  const [showAddForm, setShowAddForm] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);
  const [dbReady, setDbReady] = useState(false);

  const fetchDishes = useCallback(async () => {
    try {
      const res = await fetch("/api/dishes");
      if (res.ok) {
        const data = await res.json();
        if (data.length > 0) {
          setDishes(data);
          setDbReady(true);
        }
      }
    } catch {}
  }, []);

  useEffect(() => { fetchDishes(); }, [fetchDishes, refreshKey]);

  const refresh = () => setRefreshKey((k) => k + 1);

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
        <DishDetail dish={selectedDish} onClose={() => setSelectedDish(null)} refresh={refresh} />
      )}
      {showAddForm && (
        <AddDishForm
          dishes={dishes}
          onClose={() => setShowAddForm(false)}
          onSaved={() => { setShowAddForm(false); refresh(); }}
        />
      )}
    </div>
  );
}
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
import DeleteDishDialog from "@/components/DeleteDishDialog";
import WishlistPage from "@/components/WishlistPage";
import RecipeDetail from "@/components/RecipeDetail";
import CompletedWishlistPage from "@/components/CompletedWishlistPage";
import WishlistCelebration, { type WishlistCelebrationData } from "@/components/WishlistCelebration";
import { Dish, HistoryData } from "@/lib/types";

export type Tab = "record" | "library" | "today" | "history";

type OverlayView =
  | { type: "wishlist" }
  | { type: "recipe"; recipeId: string; backTo: "wishlist" | "completed" | "today" }
  | { type: "completed" }
  | null;

export default function Home() {
  const [tab, setTab] = useState<Tab>("record");
  const [dishes, setDishes] = useState<Dish[]>([]);
  const [selectedDish, setSelectedDish] = useState<Dish | null>(null);
  const [editingDish, setEditingDish] = useState<Dish | null>(null);
  const [showAddForm, setShowAddForm] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);
  const [dbReady, setDbReady] = useState(false);
  const [loadError, setLoadError] = useState("");
  const [deleteTarget, setDeleteTarget] = useState<Dish | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState("");
  const [toast, setToast] = useState("");
  const [historyData, setHistoryData] = useState<HistoryData>({
    events: [],
    frequency: [],
    wishlistSummary: { pending: 0, completed: 0 },
  });
  const [historyLoading, setHistoryLoading] = useState(true);
  const [overlayView, setOverlayView] = useState<OverlayView>(null);
  const [wishlistCount, setWishlistCount] = useState(0);
  const [wishlistCelebration, setWishlistCelebration] = useState<WishlistCelebrationData | null>(null);

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

  const fetchHistory = useCallback(async () => {
    try {
      const response = await fetch("/api/history");
      const data = await response.json();
      if (response.ok) setHistoryData({
        events: data.events || [],
        frequency: data.frequency || [],
        wishlistSummary: data.wishlistSummary || { pending: 0, completed: 0 },
      });
    } catch {
      // Keep the last successful history snapshot when the network is temporarily unavailable.
    } finally {
      setHistoryLoading(false);
    }
  }, []);

  const fetchWishlistCount = useCallback(async () => {
    try {
      const response = await fetch("/api/wishlist?status=pending");
      if (!response.ok) return;
      const data = await response.json() as { pendingCount?: number };
      setWishlistCount(data.pendingCount || 0);
    } catch {
      // Keep the last known badge count while the network is temporarily unavailable.
    }
  }, []);

  useEffect(() => { fetchDishes(); }, [fetchDishes, refreshKey]);
  useEffect(() => { void fetchHistory(); }, [fetchHistory]);
  useEffect(() => { void fetchWishlistCount(); }, [fetchWishlistCount]);

  const refresh = () => { setRefreshKey((k) => k + 1); void fetchHistory(); };

  const confirmDelete = async () => {
    if (!deleteTarget || deleting) return;
    const target = deleteTarget;
    setDeleting(true);
    setDeleteError("");
    try {
      const response = await fetch(`/api/dishes/${target.id}`, { method: "DELETE" });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "删除失败，请重试");
      setDishes((current) => current.filter((dish) => dish.id !== target.id));
      setDeleteTarget(null);
      setSelectedDish(null);
      setToast("已删除");
      window.setTimeout(() => setToast(""), 1800);
      await fetchDishes();
      await fetchHistory();
    } catch (error) {
      setDeleteError(error instanceof Error ? error.message : "删除失败，请重试");
    } finally {
      setDeleting(false);
    }
  };

  const openExisting = (id: string, mode: "detail" | "edit") => {
    const existing = dishes.find((dish) => dish.id === id);
    setShowAddForm(false);
    setEditingDish(null);
    if (!existing) { refresh(); return; }
    if (mode === "edit") setEditingDish(existing);
    else setSelectedDish(existing);
  };

  const openCompletedDish = async (id: string) => {
    let dish = dishes.find((item) => item.id === id) ?? null;
    if (!dish) {
      try {
        const response = await fetch(`/api/dishes/${id}`);
        if (response.ok) dish = await response.json() as Dish;
      } catch {
        // The completed-wish page already reports if its linked dish was deleted.
      }
    }
    if (!dish) {
      setToast("饭盆菜品暂时无法打开");
      window.setTimeout(() => setToast(""), 1800);
      return;
    }
    setTab("record");
    setOverlayView(null);
    setSelectedDish(dish);
  };

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
    <main className="app-stage">
      <div className="app-phone">
      {overlayView?.type === "wishlist" && (
        <WishlistPage
          onClose={() => { setOverlayView(null); void fetchWishlistCount(); }}
          onOpenRecipe={(recipeId) => setOverlayView({ type: "recipe", recipeId, backTo: "wishlist" })}
          onOpenCompleted={() => setOverlayView({ type: "completed" })}
        />
      )}
      {overlayView?.type === "recipe" && (
        <RecipeDetail
          recipeId={overlayView.recipeId}
          onBack={() => setOverlayView(overlayView.backTo === "today" ? null : { type: overlayView.backTo })}
          onWishlistChanged={() => void fetchWishlistCount()}
        />
      )}
      {overlayView?.type === "completed" && (
        <CompletedWishlistPage
          onClose={() => setOverlayView({ type: "wishlist" })}
          onOpenRecipe={(recipeId) => setOverlayView({ type: "recipe", recipeId, backTo: "completed" })}
          onOpenDish={(dishId) => { void openCompletedDish(dishId); }}
        />
      )}
      {!overlayView && <>
      {tab === "record" && (
        <RecordPage dishes={dishes} onDishClick={setSelectedDish} onAddClick={() => setShowAddForm(true)} onEditDish={setEditingDish} onDeleteDish={(dish) => { setDeleteError(""); setDeleteTarget(dish); }} />
      )}
      {tab === "library" && (
        <LibraryPage dishes={dishes} onDishClick={setSelectedDish} onDeleteDish={(dish) => { setDeleteError(""); setDeleteTarget(dish); }} />
      )}
      {tab === "today" && (
        <TodayPage dishes={dishes} onDishClick={setSelectedDish} onRecipeClick={(recipeId) => setOverlayView({ type: "recipe", recipeId, backTo: "today" })} refresh={refresh} recommendationRevision={refreshKey} wishlistCount={wishlistCount} onOpenWishlist={() => setOverlayView({ type: "wishlist" })} />
      )}
      {tab === "history" && (
        <HistoryPage events={historyData.events} frequency={historyData.frequency} wishlistSummary={historyData.wishlistSummary} loading={historyLoading} onDishClick={setSelectedDish} onOpenWishlist={() => setOverlayView({ type: "wishlist" })} />
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
          onSaved={(completion) => {
            setShowAddForm(false);
            setEditingDish(null);
            if (completion) setWishlistCelebration(completion);
            refresh();
            void fetchWishlistCount();
          }}
          onOpenExisting={openExisting}
        />
      )}
      {deleteTarget && <DeleteDishDialog dish={deleteTarget} deleting={deleting} error={deleteError} onCancel={() => { if (!deleting) { setDeleteTarget(null); setDeleteError(""); } }} onConfirm={confirmDelete} />}
      {toast && <div className="fixed left-1/2 top-6 z-[60] -translate-x-1/2 rounded-full bg-gray-900 px-4 py-2 text-sm text-white shadow-lg">{toast}</div>}
      {wishlistCelebration && (
        <WishlistCelebration
          completion={wishlistCelebration}
          onReturnDish={() => { setWishlistCelebration(null); setTab("record"); }}
          onOpenCompleted={() => { setWishlistCelebration(null); setOverlayView({ type: "completed" }); }}
        />
      )}
      </>}
      </div>
    </main>
  );
}

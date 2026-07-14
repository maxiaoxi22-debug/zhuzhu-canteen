"use client";
/* eslint-disable @next/next/no-img-element */
import { useEffect, useState, useRef } from "react";
import { CATEGORIES, Dish, DishDuplicateMatch } from "@/lib/types";
import { categoryIdFromKey, DishSaveError, readDishSaveResult } from "@/lib/dish-form";
import { compressImage } from "@/lib/image-compression";
import { mergeRecipeFields, RecipeSuggestion } from "@/lib/recipe-fallback";

export default function AddDishForm({
  dish, onClose, onSaved, onOpenExisting,
}: { dishes: Dish[]; dish?: Dish; onClose: () => void; onSaved: () => void; onOpenExisting: (id: string, mode: "detail" | "edit") => void }) {
  const parseLines = (value: string): string => {
    try {
      const parsed: unknown = JSON.parse(value);
      return Array.isArray(parsed) ? parsed.map(String).join("\n") : value || "";
    } catch { return value || ""; }
  };
  const [image, setImage] = useState<string | null>(dish?.imageUrl || null);
  const [file, setFile] = useState<File | null>(null);
  const [aiLoading, setAiLoading] = useState(false);
  const [aiError, setAiError] = useState("");
  const [aiSuccess, setAiSuccess] = useState(false);
  const [imageUrl, setImageUrl] = useState(dish?.imageUrl || "");

  const [editName, setEditName] = useState(dish?.name || "");
  const [editCat, setEditCat] = useState(dish?.categoryId ? CATEGORIES[dish.categoryId]?.key || "其他" : "其他");
  const [editIngs, setEditIngs] = useState(() => dish ? parseLines(dish.ingredients) : "");
  const [editSteps, setEditSteps] = useState(() => dish ? parseLines(dish.steps) : "");
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState("");
  const [generating, setGenerating] = useState(false);
  const [generateMessage, setGenerateMessage] = useState("");
  const [categoryTouched, setCategoryTouched] = useState(false);
  const [duplicateMatch, setDuplicateMatch] = useState<DishDuplicateMatch | null>(null);
  const [duplicateChecking, setDuplicateChecking] = useState(false);
  const [duplicateCheckError, setDuplicateCheckError] = useState("");

  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const name = editName.trim();
    if (!name) return;
    const controller = new AbortController();
    const timer = window.setTimeout(async () => {
      setDuplicateChecking(true);
      setDuplicateCheckError("");
      try {
        const query = new URLSearchParams({ name });
        if (dish) query.set("excludeId", dish.id);
        const response = await fetch(`/api/dishes/check-name?${query}`, { signal: controller.signal });
        if (!response.ok) throw new Error("查重失败");
        const data = await response.json() as { match: DishDuplicateMatch | null };
        setDuplicateMatch(data.match);
      } catch (error) {
        if (error instanceof DOMException && error.name === "AbortError") return;
        setDuplicateCheckError("暂时无法检查是否重复，保存时会再次校验");
      } finally {
        if (!controller.signal.aborted) setDuplicateChecking(false);
      }
    }, 350);
    return () => { window.clearTimeout(timer); controller.abort(); };
  }, [editName, dish]);

  const handleFile = async (f: File) => {
    const optimized = await compressImage(f);
    setFile(optimized);
    setAiError("");
    setAiSuccess(false);
    setImageUrl("");
    const reader = new FileReader();
    reader.onload = (e) => setImage(e.target?.result as string);
    reader.readAsDataURL(optimized);
  };

  const handleGenerateRecipe = async () => {
    if (!editName.trim()) return;
    setGenerating(true);
    setGenerateMessage("");
    try {
      const response = await fetch("/api/generate-recipe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: editName.trim() }),
      });
      const suggestion = await response.json() as RecipeSuggestion & { error?: string };
      if (!response.ok) throw new Error(suggestion.error || "生成失败");
      const merged = mergeRecipeFields({ category: categoryTouched ? editCat : "", ingredients: editIngs, steps: editSteps }, suggestion);
      setEditCat(merged.category || editCat);
      setEditIngs(merged.ingredients);
      setEditSteps(merged.steps);
      setGenerateMessage(suggestion.source === "gemini" ? "AI 已生成，可继续修改" : "已生成参考用料和做法，请按实际情况修改");
    } catch (error) {
      setGenerateMessage(error instanceof Error ? error.message : "生成失败，请手动填写");
    } finally {
      setGenerating(false);
    }
  };

  const handleRecognize = async () => {
    if (!file) return;
    setAiLoading(true);
    setAiError("");
    try {
      const formData = new FormData();
      formData.append("image", file);
      const res = await fetch("/api/recognize", { method: "POST", body: formData });
      const data = await res.json();
      // Always capture imageUrl from upload
      if (data.imageUrl) setImageUrl(data.imageUrl);
      // Check if AI recognition failed
      if (data.aiFailed || !res.ok || data.error) {
        setAiError(data.error || "AI 识别失败，请手动填写信息。照片已自动保存。");
        return;
      }
      setEditName(data.name || "");
      setEditCat(data.category || "肉类");
      setEditIngs(Array.isArray(data.ingredients) ? data.ingredients.join("\n") : "");
      setEditSteps(Array.isArray(data.steps) ? data.steps.join("\n") : "");
      setAiSuccess(true);
    } catch {
      setAiError("网络错误，请手动输入");
    } finally {
      setAiLoading(false);
    }
  };

  const handleSave = async () => {
    if (!editName.trim()) return;
    setSaving(true);
    setSaveError("");

    try {
      let finalImageUrl = imageUrl;
      if (file && !finalImageUrl) {
        const formData = new FormData();
        formData.append("image", file);
        const res = await fetch("/api/recognize", { method: "POST", body: formData });
        const data = await res.json();
        if (data.imageUrl) finalImageUrl = data.imageUrl;
      }

      const response = await fetch(dish ? `/api/dishes/${dish.id}` : "/api/dishes", {
        method: dish ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: editName.trim(),
          categoryId: categoryIdFromKey(editCat),
          imageUrl: finalImageUrl || null,
          ingredients: editIngs.split("\n").map((item) => item.trim()).filter(Boolean),
          steps: editSteps.split("\n").map((item) => item.trim()).filter(Boolean),
        }),
      });
      await readDishSaveResult(response);
      onSaved();
    } catch (error) {
      if (error instanceof DishSaveError && error.match) setDuplicateMatch(error.match);
      setSaveError(error instanceof Error ? error.message : "保存失败，请重试");
    } finally {
      setSaving(false);
    }
  };

  const canSave = Boolean(editName.trim() && (file || imageUrl) && !duplicateMatch);

  return (
    <div className="fixed inset-0 z-30 flex items-end bg-[#36251f57] backdrop-blur-[2px]" onClick={onClose}>
      <div className="animate-slide-up max-h-[90%] w-full overflow-y-auto rounded-t-[1.8rem] bg-[var(--paper)] text-[var(--cocoa)]" onClick={(e) => e.stopPropagation()}>
        <div className="w-10 h-1 bg-gray-300 rounded-full mx-auto mt-3" />
        <div className="p-5 pb-[calc(1.25rem+env(safe-area-inset-bottom))]">
          <h2 className="mb-4 text-lg font-bold text-[var(--cocoa)]">{dish ? "✏️ 编辑菜品" : "📸 记录一道菜"}</h2>

          <input ref={fileRef} type="file" accept="image/*" className="hidden"
            onChange={(e) => e.target.files?.[0] && void handleFile(e.target.files[0])} />

          {/* Photo area */}
          <button onClick={() => fileRef.current?.click()}
            className="w-full h-48 rounded-2xl flex flex-col items-center justify-center border-2 border-dashed border-gray-200 bg-gray-50 active:bg-gray-100 transition overflow-hidden">
            {image ? (
              <img src={image} alt="预览" className="w-full h-full rounded-2xl object-cover" />
            ) : (
              <>
                <div className="mb-3 flex h-14 w-14 items-center justify-center rounded-full bg-[#fff0eb]">
                  <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#ef6865" strokeWidth="2"><path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/><circle cx="12" cy="13" r="4"/></svg>
                </div>
                <p className="text-sm text-gray-600 font-medium">拍照或从相册选择</p>
                <p className="text-xs text-gray-400 mt-1">拍摄成品菜照片</p>
              </>
            )}
          </button>

          {/* AI recognize button */}
          {image && !aiSuccess && (
            <div className="mt-4">
              <button onClick={handleRecognize} disabled={aiLoading}
                className="w-full rounded-2xl bg-[var(--coral)] py-3.5 text-sm font-semibold text-white transition active:bg-[var(--coral-dark)] disabled:opacity-50">
                {aiLoading ? "🤖 AI 识别中..." : "🤖 AI 智能识别（可选）"}
              </button>
              <p className="text-xs text-gray-400 text-center mt-2">也可以跳过 AI，直接手动填写下方信息</p>
            </div>
          )}

          {/* AI error */}
          {aiError && (
            <div className="mt-4 bg-red-50 border border-red-200 rounded-2xl p-4">
              <p className="text-sm font-semibold text-red-600 mb-1">⚠️ AI 识别失败</p>
              <p className="text-xs text-red-500">{aiError}</p>
              <p className="text-xs text-red-400 mt-2">请在下方手动填写菜品信息，照片会正常保存</p>
            </div>
          )}

          {aiSuccess && (
            <div className="mt-4 rounded-2xl border border-[#dbe9d5] bg-[#f2f8ef] p-3">
              <p className="text-sm font-semibold text-[var(--green)]">✅ AI 识别完成，请确认或修改</p>
            </div>
          )}

          {/* Manual input fields - show after photo selected */}
          {image && (
            <div className="mt-4 space-y-3">
              <div>
                <label className="text-xs text-gray-400 font-medium">菜品名称 *</label>
                <input value={editName} onChange={(e) => { setEditName(e.target.value); setDuplicateMatch(null); setDuplicateCheckError(""); }} placeholder="例：红烧排骨"
                  className="mt-1 w-full rounded-xl border border-[var(--line)] bg-white px-3 py-3 text-sm outline-none focus:ring-2 focus:ring-[#ef68654d]" />
                {duplicateChecking && <p className="text-xs text-gray-400 mt-2">正在检查菜单库...</p>}
                {duplicateCheckError && <p className="text-xs text-amber-600 mt-2">{duplicateCheckError}</p>}
                {duplicateMatch && (
                  <div className="mt-2 rounded-xl border border-amber-200 bg-amber-50 p-3">
                    <p className="text-sm font-semibold text-amber-700">{duplicateMatch.message}：{duplicateMatch.name}</p>
                    <div className="flex gap-2 mt-2">
                      <button type="button" onClick={() => onOpenExisting(duplicateMatch.id, "detail")} className="flex-1 rounded-lg bg-white border border-amber-200 py-2 text-xs text-amber-700">查看已有菜品</button>
                      <button type="button" onClick={() => onOpenExisting(duplicateMatch.id, "edit")} className="flex-1 rounded-lg bg-amber-500 py-2 text-xs text-white">编辑已有菜品</button>
                    </div>
                  </div>
                )}
                <button type="button" onClick={handleGenerateRecipe} disabled={!editName.trim() || generating}
                  className="w-full mt-2 bg-amber-50 text-amber-700 border border-amber-200 rounded-xl py-2.5 text-sm font-semibold disabled:opacity-40">
                  {generating ? "正在生成..." : "✨ 根据菜名生成参考用料和做法"}
                </button>
                {generateMessage && <p className="text-xs text-amber-600 mt-2">{generateMessage}</p>}
              </div>
              <div>
                <label className="text-xs text-gray-400 font-medium">分类</label>
                <select value={editCat} onChange={(e) => { setEditCat(e.target.value); setCategoryTouched(true); }}
                  className="w-full bg-gray-50 rounded-xl px-3 py-3 text-sm mt-1 border border-gray-100 outline-none">
                  {CATEGORIES.filter((c) => c.key !== "all").map((c) => (
                    <option key={c.key} value={c.key}>{c.label}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="text-xs text-gray-400 font-medium">食材清单（每行一个）</label>
                <textarea value={editIngs} onChange={(e) => setEditIngs(e.target.value)} rows={4}
                  placeholder={"例：\n排骨 500g\n生抽 2勺\n老抽 1勺\n冰糖 15g"}
                  className="w-full bg-gray-50 rounded-xl px-3 py-3 text-sm mt-1 border border-gray-100 outline-none focus:ring-2 focus:ring-green-300 resize-none" />
              </div>
              <div>
                <label className="text-xs text-gray-400 font-medium">做法步骤（每行一步）</label>
                <textarea value={editSteps} onChange={(e) => setEditSteps(e.target.value)} rows={5}
                  placeholder={"例：\n排骨冷水下锅焯水去血沫\n炒糖色下排骨翻炒上色\n加调料和热水炖40分钟\n大火收汁出锅"}
                  className="w-full bg-gray-50 rounded-xl px-3 py-3 text-sm mt-1 border border-gray-100 outline-none focus:ring-2 focus:ring-green-300 resize-none" />
              </div>
            </div>
          )}

          {/* Save button */}
          {canSave && (
            <>
              {saveError && (
                <div className="mt-4 bg-red-50 border border-red-200 rounded-2xl p-3 text-sm text-red-600">
                  保存失败：{saveError}。你填写的内容仍保留，请稍后重试。
                </div>
              )}
              <button onClick={handleSave} disabled={saving}
                className="mt-4 w-full rounded-2xl bg-[var(--coral)] py-3.5 text-sm font-semibold text-white transition active:bg-[var(--coral-dark)] disabled:opacity-50">
              {saving ? "保存中..." : dish ? "💾 保存修改" : "💾 保存到菜单库"}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

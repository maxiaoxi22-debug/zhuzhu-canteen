"use client";
/* eslint-disable @next/next/no-img-element */

import { useEffect, useRef, useState } from "react";

import {
  applyRecognitionCandidate,
  buildWishlistCompletionFields,
  categoryIdFromKey,
  createLatestTaskGuard,
  createPendingSaveSnapshot,
  DishSaveError,
  type PendingSaveSnapshot,
  saveDishOnce,
} from "@/lib/dish-form";
import { normalizeDishName } from "@/lib/dish-name-match";
import { compressImage } from "@/lib/image-compression";
import { mergeRecipeFields, type RecipeSuggestion } from "@/lib/recipe-fallback";
import { findPendingWishlistMatch } from "@/lib/wishlist-domain";
import {
  CATEGORIES,
  type CategoryKey,
  type Dish,
  type DishDuplicateMatch,
  type RecipeSearchResult,
  type RecognitionResult,
} from "@/lib/types";

import RecipeDetail from "./RecipeDetail";
import WishlistCompletionDialog, { type WishlistCompletionChoice } from "./WishlistCompletionDialog";

interface PendingWishlistItem extends WishlistCompletionChoice {
  recipeId: string | null;
  nameKey: string;
  categoryKey: string;
  status: "pending" | "completed";
}

type PendingWishlistResponseItem = Omit<PendingWishlistItem, "nameKey">;

interface PendingCompletion {
  candidate: PendingWishlistItem;
  snapshot: PendingSaveSnapshot;
}

interface UploadedPhoto {
  id: string;
  imageUrl: string;
  cleanupToken: string;
}

async function cleanupUploadedPhoto(photo: UploadedPhoto): Promise<void> {
  try {
    await fetch("/api/uploads/dish-photo", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ cleanupToken: photo.cleanupToken }),
      keepalive: true,
    });
  } catch {
    // Cleanup is best-effort and must never clear the local preview or form data.
  }
}

function parseLines(value: string): string {
  try {
    const parsed: unknown = JSON.parse(value);
    return Array.isArray(parsed) ? parsed.map(String).join("\n") : value || "";
  } catch {
    return value || "";
  }
}

export default function AddDishForm({
  dish,
  onClose,
  onSaved,
  onOpenExisting,
}: {
  dishes: Dish[];
  dish?: Dish;
  onClose: () => void;
  onSaved: (completion?: WishlistCompletionChoice) => void;
  onOpenExisting: (id: string, mode: "detail" | "edit") => void;
}) {
  const [image, setImage] = useState<string | null>(dish?.imageUrl || null);
  const [file, setFile] = useState<File | null>(null);
  const [imageUrl, setImageUrl] = useState(dish?.imageUrl || "");
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState("");
  const [aiLoading, setAiLoading] = useState(false);
  const [aiError, setAiError] = useState("");
  const [recognitionCandidates, setRecognitionCandidates] = useState<RecognitionResult["candidates"]>([]);
  const [visibleIngredients, setVisibleIngredients] = useState<string[]>([]);

  const [editName, setEditName] = useState(dish?.name || "");
  const [editCat, setEditCat] = useState(dish?.categoryId ? CATEGORIES[dish.categoryId]?.key || "其他" : "其他");
  const [editIngs, setEditIngs] = useState(() => dish ? parseLines(dish.ingredients) : "");
  const [editSteps, setEditSteps] = useState(() => dish ? parseLines(dish.steps) : "");
  const [categoryTouched, setCategoryTouched] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState("");
  const [generating, setGenerating] = useState(false);
  const [generateMessage, setGenerateMessage] = useState("");
  const [duplicateMatch, setDuplicateMatch] = useState<DishDuplicateMatch | null>(null);
  const [duplicateChecking, setDuplicateChecking] = useState(false);
  const [duplicateCheckError, setDuplicateCheckError] = useState("");
  const [pendingCompletion, setPendingCompletion] = useState<PendingCompletion | null>(null);
  const [matchedRecipe, setMatchedRecipe] = useState<RecipeSearchResult | null>(null);
  const [recipeMatching, setRecipeMatching] = useState(false);
  const [recipeMatchMessage, setRecipeMatchMessage] = useState("");
  const [openRecipeId, setOpenRecipeId] = useState<string | null>(null);

  const fileRef = useRef<HTMLInputElement>(null);
  const nameRef = useRef<HTMLInputElement>(null);
  const uploadGuardRef = useRef(createLatestTaskGuard());
  const recipeGuardRef = useRef(createLatestTaskGuard());
  const saveGuardRef = useRef(createLatestTaskGuard());
  const submissionInFlightRef = useRef(false);
  const uploadedPhotoRef = useRef<UploadedPhoto | null>(null);

  const invalidatePendingSave = () => {
    saveGuardRef.current.begin();
    setPendingCompletion(null);
    if (!submissionInFlightRef.current) setSaving(false);
  };

  const invalidateRecipeMatch = () => {
    recipeGuardRef.current.begin();
    setMatchedRecipe(null);
    setRecipeMatching(false);
    setRecipeMatchMessage("");
  };

  const snapshotFor = (revision: number): PendingSaveSnapshot => createPendingSaveSnapshot(revision, {
    name: editName.trim(),
    categoryId: categoryIdFromKey(editCat),
    categoryKey: editCat,
    imageUrl,
    ingredients: editIngs.split("\n").map((item) => item.trim()).filter(Boolean),
    steps: editSteps.split("\n").map((item) => item.trim()).filter(Boolean),
    recipeId: matchedRecipe?.id ?? null,
    photoUploadId: uploadedPhotoRef.current?.id ?? null,
    photoUploadToken: uploadedPhotoRef.current?.cleanupToken ?? null,
  });

  useEffect(() => () => {
    saveGuardRef.current.begin();
    recipeGuardRef.current.begin();
    uploadGuardRef.current.begin();
    const photo = uploadedPhotoRef.current;
    if (!submissionInFlightRef.current) {
      uploadedPhotoRef.current = null;
      if (photo) void cleanupUploadedPhoto(photo);
    }
  }, []);

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

  const handleFile = async (selectedFile: File) => {
    invalidatePendingSave();
    invalidateRecipeMatch();
    const replacedPhoto = uploadedPhotoRef.current;
    uploadedPhotoRef.current = null;
    if (replacedPhoto) void cleanupUploadedPhoto(replacedPhoto);
    const revision = uploadGuardRef.current.begin();
    setUploading(true);
    setFile(null);
    setImage(null);
    setImageUrl("");
    setUploadError("");
    setAiLoading(false);
    setAiError("");
    setRecognitionCandidates([]);
    setVisibleIngredients([]);

    try {
      const optimized = await compressImage(selectedFile);
      if (!uploadGuardRef.current.isCurrent(revision)) return;
      setFile(optimized);
      const reader = new FileReader();
      reader.onload = (event) => {
        if (uploadGuardRef.current.isCurrent(revision)) setImage(event.target?.result as string);
      };
      reader.readAsDataURL(optimized);

      const formData = new FormData();
      formData.append("image", optimized);
      const response = await fetch("/api/uploads/dish-photo", { method: "POST", body: formData });
      const result = await response.json() as { imageUrl?: string; photoUploadId?: string; cleanupToken?: string; error?: string };
      if (!uploadGuardRef.current.isCurrent(revision)) {
        if (result.imageUrl && result.photoUploadId && result.cleanupToken) {
          void cleanupUploadedPhoto({ id: result.photoUploadId, imageUrl: result.imageUrl, cleanupToken: result.cleanupToken });
        }
        return;
      }
      if (!response.ok || !result.imageUrl) throw new Error(result.error || "照片上传失败");
      setImageUrl(result.imageUrl);
      if (result.photoUploadId && result.cleanupToken) {
        uploadedPhotoRef.current = { id: result.photoUploadId, imageUrl: result.imageUrl, cleanupToken: result.cleanupToken };
      }
    } catch (error) {
      if (uploadGuardRef.current.isCurrent(revision)) {
        setUploadError(error instanceof Error ? error.message : "照片上传失败，请重试");
      }
    } finally {
      if (uploadGuardRef.current.isCurrent(revision)) setUploading(false);
    }
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
      invalidatePendingSave();
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

  const handleCandidateClick = async (candidate: RecognitionResult["candidates"][number]) => {
    invalidatePendingSave();
    const recipeRevision = recipeGuardRef.current.begin();
    const imageRevision = uploadGuardRef.current.current();
    setMatchedRecipe(null);
    setRecipeMatching(true);
    setRecipeMatchMessage("");
    const next = applyRecognitionCandidate(editCat, categoryTouched, candidate);
    setEditName(next.name);
    setDuplicateMatch(null);
    setDuplicateCheckError("");
    setEditCat(next.category);
    try {
      const candidateKey = normalizeDishName(candidate.name);
      const response = await fetch(`/api/recipes/search?q=${encodeURIComponent(candidateKey)}`);
      if (!response.ok) throw new Error("公共菜谱暂时不可用");
      const data = await response.json() as { items?: RecipeSearchResult[] };
      if (!recipeGuardRef.current.isCurrent(recipeRevision)
        || !uploadGuardRef.current.isCurrent(imageRevision)) return;
      const exact = (data.items ?? []).find((recipe) => normalizeDishName(recipe.name) === candidateKey) ?? null;
      setMatchedRecipe(exact);
      setRecipeMatchMessage(exact ? "" : "公共菜谱暂无同名菜谱，可继续手动保存");
    } catch {
      if (recipeGuardRef.current.isCurrent(recipeRevision)
        && uploadGuardRef.current.isCurrent(imageRevision)) {
        setRecipeMatchMessage("公共菜谱暂时无法匹配，可继续手动保存");
      }
    } finally {
      if (recipeGuardRef.current.isCurrent(recipeRevision)
        && uploadGuardRef.current.isCurrent(imageRevision)) setRecipeMatching(false);
    }
  };

  const handleRecognize = async () => {
    if (!file || !imageUrl) return;
    invalidateRecipeMatch();
    const recognitionRevision = uploadGuardRef.current.current();
    setAiLoading(true);
    setAiError("");
    try {
      const formData = new FormData();
      formData.append("image", file);
      const response = await fetch("/api/recognize", { method: "POST", body: formData });
      const result = await response.json() as Partial<RecognitionResult> & { error?: string };
      if (!uploadGuardRef.current.isCurrent(recognitionRevision)) return;
      if (!response.ok || result.error) throw new Error(result.error || "AI 识别失败，请手动输入");
      setRecognitionCandidates(Array.isArray(result.candidates) ? result.candidates : []);
      setVisibleIngredients(Array.isArray(result.visibleIngredients) ? result.visibleIngredients : []);
    } catch (error) {
      if (uploadGuardRef.current.isCurrent(recognitionRevision)) {
        setAiError(error instanceof Error ? error.message : "网络错误，请手动输入");
      }
    } finally {
      if (uploadGuardRef.current.isCurrent(recognitionRevision)) setAiLoading(false);
    }
  };

  const handleSaveResponse = async (
    snapshot: PendingSaveSnapshot,
    candidate: PendingWishlistItem | null,
    completeWishlist: boolean,
  ) => {
    if (submissionInFlightRef.current || !saveGuardRef.current.isCurrent(snapshot.revision)) return;
    submissionInFlightRef.current = true;
    setSaving(true);
    setSaveError("");
    try {
      const completionFields = candidate
        ? buildWishlistCompletionFields(candidate, completeWishlist)
        : { completeWishlist: false };
      const result = await saveDishOnce(fetch, dish ? `/api/dishes/${dish.id}` : "/api/dishes", dish ? "PUT" : "POST", {
        name: snapshot.name,
        categoryId: snapshot.categoryId,
        imageUrl: snapshot.imageUrl,
        ingredients: snapshot.ingredients,
        steps: snapshot.steps,
        recipeId: snapshot.recipeId ?? undefined,
        photoUploadId: snapshot.photoUploadId ?? undefined,
        photoUploadToken: snapshot.photoUploadToken ?? undefined,
        ...completionFields,
      });
      uploadedPhotoRef.current = null;
      if (!saveGuardRef.current.isCurrent(snapshot.revision)) return;
      onSaved(result.wishlistCompletion);
    } catch (error) {
      if (!saveGuardRef.current.isCurrent(snapshot.revision)) {
        const photo = uploadedPhotoRef.current;
        uploadedPhotoRef.current = null;
        if (photo) void cleanupUploadedPhoto(photo);
        return;
      }
      if (error instanceof DishSaveError && error.match) setDuplicateMatch(error.match);
      setSaveError(error instanceof Error ? error.message : "保存失败，请重试");
    } finally {
      submissionInFlightRef.current = false;
      if (saveGuardRef.current.isCurrent(snapshot.revision)) setSaving(false);
    }
  };

  const handleSave = async () => {
    if (!editName.trim() || !imageUrl || saving || submissionInFlightRef.current) return;
    const revision = saveGuardRef.current.begin();
    const snapshot = snapshotFor(revision);
    if (dish) {
      await handleSaveResponse(snapshot, null, false);
      return;
    }

    setSaving(true);
    setSaveError("");
    try {
      const response = await fetch("/api/wishlist?status=pending");
      if (!response.ok) throw new Error("心愿单暂时不可用");
      const data = await response.json() as { items?: PendingWishlistResponseItem[] };
      if (!saveGuardRef.current.isCurrent(snapshot.revision)) return;
      const items = (data.items || []).map((item) => ({ ...item, nameKey: normalizeDishName(item.name) }));
      const match = findPendingWishlistMatch(items, {
        recipeId: snapshot.recipeId,
        name: snapshot.name,
        categoryKey: snapshot.categoryKey as CategoryKey,
      });
      if (match) {
        setPendingCompletion({ candidate: match, snapshot });
        return;
      }
    } catch {
      // A temporary wishlist read failure must not prevent saving the cooked dish.
    } finally {
      if (saveGuardRef.current.isCurrent(snapshot.revision) && !submissionInFlightRef.current) setSaving(false);
    }
    await handleSaveResponse(snapshot, null, false);
  };

  const chooseCompletion = async (completeWishlist: boolean) => {
    const pending = pendingCompletion;
    if (!pending) return;
    await handleSaveResponse(pending.snapshot, pending.candidate, completeWishlist);
  };

  const closeForm = () => {
    if (saving) return;
    uploadGuardRef.current.begin();
    const photo = uploadedPhotoRef.current;
    uploadedPhotoRef.current = null;
    if (photo) void cleanupUploadedPhoto(photo);
    onClose();
  };

  const canSave = Boolean(editName.trim() && imageUrl && !uploading && !recipeMatching && !duplicateMatch);

  return (
    <div className="fixed inset-0 z-30 flex items-end bg-[#36251f57] backdrop-blur-[2px]" onClick={closeForm}>
      <div className="animate-slide-up max-h-[90%] w-full overflow-y-auto rounded-t-[1.8rem] bg-[var(--paper)] text-[var(--cocoa)]" onClick={(event) => event.stopPropagation()}>
        <div className="mx-auto mt-3 h-1 w-10 rounded-full bg-gray-300" />
        <div className="p-5 pb-[calc(1.25rem+env(safe-area-inset-bottom))]">
          <h2 className="mb-4 text-lg font-bold">{dish ? "✏️ 编辑菜品" : "📸 记录一道菜"}</h2>
          <input ref={fileRef} type="file" accept="image/*" disabled={saving} className="hidden" onChange={(event) => event.target.files?.[0] && void handleFile(event.target.files[0])} />

          <button type="button" disabled={saving} onClick={() => fileRef.current?.click()} className="flex h-48 w-full flex-col items-center justify-center overflow-hidden rounded-2xl border-2 border-dashed border-gray-200 bg-gray-50 transition active:bg-gray-100 disabled:opacity-60">
            {image ? <img src={image} alt="预览" className="h-full w-full rounded-2xl object-cover" /> : <>
              <div className="mb-3 flex h-14 w-14 items-center justify-center rounded-full bg-[#fff0eb] text-2xl">📷</div>
              <p className="text-sm font-medium text-gray-600">拍照或从相册选择</p>
              <p className="mt-1 text-xs text-gray-400">拍摄成品菜照片</p>
            </>}
          </button>
          {uploading && <p className="mt-2 text-center text-xs text-gray-400">正在保存照片...</p>}
          {uploadError && <div className="mt-3 rounded-xl border border-red-200 bg-red-50 p-3 text-xs text-red-600">{uploadError}，请重新选择照片。</div>}

          {image && <div className="mt-4">
            <button type="button" onClick={handleRecognize} disabled={saving || aiLoading || uploading || !imageUrl} className="w-full rounded-2xl bg-[var(--coral)] py-3.5 text-sm font-semibold text-white disabled:opacity-50">
              {aiLoading ? "🤖 AI 识别中..." : "🤖 AI 智能识别（可选）"}
            </button>
            <p className="mt-2 text-center text-xs text-gray-400">照片保存后可识别，也可以直接手动填写</p>
          </div>}
          {aiError && <div className="mt-4 rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-600">⚠️ {aiError}，照片已正常保存。</div>}

          {recognitionCandidates.length > 0 && <section className="mt-4 rounded-2xl border border-[#f2d6cf] bg-[#fff8f5] p-4">
            <p className="text-sm font-semibold">识别结果更像哪一道？</p>
            <div className="mt-3 grid gap-2">
              {recognitionCandidates.map((candidate) => <button key={`${candidate.name}-${candidate.category}`} type="button" disabled={saving} onClick={() => handleCandidateClick(candidate)} className="rounded-xl border border-[#f3c9bf] bg-white px-3 py-2.5 text-left text-sm disabled:opacity-50">
                <span className="font-semibold">{candidate.name}</span><span className="ml-2 text-xs text-gray-400">{candidate.category}</span>
              </button>)}
              <button type="button" disabled={saving} onClick={() => { invalidateRecipeMatch(); setRecognitionCandidates([]); nameRef.current?.focus(); }} className="rounded-xl py-2 text-sm text-gray-500 disabled:opacity-50">都不对，手动输入</button>
            </div>
          </section>}

          {visibleIngredients.length > 0 && <section className="mt-3 rounded-2xl bg-[#f2f8ef] p-4">
            <p className="text-xs font-semibold text-[var(--green)]">识别到的可见食材（仅供参考）</p>
            <div className="mt-2 flex flex-wrap gap-2">{visibleIngredients.map((ingredient) => <span key={ingredient} className="rounded-full bg-white px-3 py-1.5 text-xs text-gray-600">{ingredient}</span>)}</div>
          </section>}

          {image && <div className="mt-4 space-y-3">
            <div>
              <label className="text-xs font-medium text-gray-400">菜品名称 *</label>
              <input ref={nameRef} disabled={saving} value={editName} onChange={(event) => { invalidatePendingSave(); invalidateRecipeMatch(); setEditName(event.target.value); setDuplicateMatch(null); setDuplicateCheckError(""); }} placeholder="例：红烧排骨" className="mt-1 w-full rounded-xl border border-[var(--line)] bg-white px-3 py-3 text-sm outline-none focus:ring-2 focus:ring-[#ef68654d] disabled:opacity-60" />
              {recipeMatching && <p className="mt-2 text-xs text-gray-400">正在匹配公共菜谱...</p>}
              {matchedRecipe && <div className="mt-2 flex items-center justify-between gap-2 rounded-xl border border-green-200 bg-green-50 p-3 text-xs text-green-700"><span>已匹配公共菜谱：{matchedRecipe.name}</span><button type="button" onClick={() => setOpenRecipeId(matchedRecipe.id)} className="min-h-9 rounded-lg bg-white px-3 font-semibold">查看公共菜谱</button></div>}
              {recipeMatchMessage && <p className="mt-2 text-xs text-amber-600">{recipeMatchMessage}</p>}
              {duplicateChecking && <p className="mt-2 text-xs text-gray-400">正在检查菜单库...</p>}
              {duplicateCheckError && <p className="mt-2 text-xs text-amber-600">{duplicateCheckError}</p>}
              {duplicateMatch && <div className="mt-2 rounded-xl border border-amber-200 bg-amber-50 p-3">
                <p className="text-sm font-semibold text-amber-700">{duplicateMatch.message}：{duplicateMatch.name}</p>
                <div className="mt-2 flex gap-2">
                  <button type="button" disabled={saving} onClick={() => onOpenExisting(duplicateMatch.id, "detail")} className="flex-1 rounded-lg border border-amber-200 bg-white py-2 text-xs text-amber-700 disabled:opacity-50">查看已有菜品</button>
                  <button type="button" disabled={saving} onClick={() => onOpenExisting(duplicateMatch.id, "edit")} className="flex-1 rounded-lg bg-amber-500 py-2 text-xs text-white disabled:opacity-50">编辑已有菜品</button>
                </div>
              </div>}
              <button type="button" onClick={handleGenerateRecipe} disabled={saving || !editName.trim() || generating} className="mt-2 w-full rounded-xl border border-amber-200 bg-amber-50 py-2.5 text-sm font-semibold text-amber-700 disabled:opacity-40">{generating ? "正在生成..." : "✨ 根据菜名生成参考用料和做法"}</button>
              {generateMessage && <p className="mt-2 text-xs text-amber-600">{generateMessage}</p>}
            </div>
            <div>
              <label className="text-xs font-medium text-gray-400">分类</label>
              <select disabled={saving} value={editCat} onChange={(event) => { invalidatePendingSave(); setEditCat(event.target.value); setCategoryTouched(true); }} className="mt-1 w-full rounded-xl border border-gray-100 bg-gray-50 px-3 py-3 text-sm outline-none disabled:opacity-60">
                {CATEGORIES.filter((category) => category.key !== "all").map((category) => <option key={category.key} value={category.key}>{category.label}</option>)}
              </select>
            </div>
            <div>
              <label className="text-xs font-medium text-gray-400">食材清单（每行一个）</label>
              <textarea disabled={saving} value={editIngs} onChange={(event) => { invalidatePendingSave(); setEditIngs(event.target.value); }} rows={4} placeholder={"例：\n排骨 500g\n生抽 2勺"} className="mt-1 w-full resize-none rounded-xl border border-gray-100 bg-gray-50 px-3 py-3 text-sm outline-none disabled:opacity-60" />
            </div>
            <div>
              <label className="text-xs font-medium text-gray-400">做法步骤（每行一步）</label>
              <textarea disabled={saving} value={editSteps} onChange={(event) => { invalidatePendingSave(); setEditSteps(event.target.value); }} rows={5} placeholder={"例：\n排骨焯水\n加调料炖熟"} className="mt-1 w-full resize-none rounded-xl border border-gray-100 bg-gray-50 px-3 py-3 text-sm outline-none disabled:opacity-60" />
            </div>
          </div>}

          {saveError && <div className="mt-4 rounded-2xl border border-red-200 bg-red-50 p-3 text-sm text-red-600">保存失败：{saveError}。你填写的内容仍保留，请稍后重试。</div>}
          {canSave && <button type="button" onClick={handleSave} disabled={saving} className="mt-4 w-full rounded-2xl bg-[var(--coral)] py-3.5 text-sm font-semibold text-white disabled:opacity-50">
            {saving ? "保存中..." : dish ? "💾 保存修改" : "💾 保存到饭盆"}
          </button>}
        </div>
      </div>

      {pendingCompletion && <WishlistCompletionDialog candidate={pendingCompletion.candidate} saving={saving} onChoose={(complete) => void chooseCompletion(complete)} onCancel={() => { if (!saving) setPendingCompletion(null); }} />}
      {openRecipeId && <div className="fixed inset-0 z-40 overflow-y-auto bg-[var(--cream)]" onClick={(event) => event.stopPropagation()}><RecipeDetail recipeId={openRecipeId} onBack={() => setOpenRecipeId(null)} onWishlistChanged={() => {}} /></div>}
    </div>
  );
}

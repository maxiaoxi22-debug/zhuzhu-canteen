"use client";
import { useState, useRef } from "react";
import { Dish, CATEGORIES, RecognitionResult } from "@/lib/types";

export default function AddDishForm({
  dishes, onClose, onSaved,
}: { dishes: Dish[]; onClose: () => void; onSaved: () => void }) {
  const [image, setImage] = useState<string | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<RecognitionResult | null>(null);
  const [editName, setEditName] = useState("");
  const [editCat, setEditCat] = useState("");
  const [editIngs, setEditIngs] = useState("");
  const [editSteps, setEditSteps] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);

  const handleFile = (f: File) => {
    setFile(f);
    const reader = new FileReader();
    reader.onload = (e) => setImage(e.target?.result as string);
    reader.readAsDataURL(f);
  };

  const handleRecognize = async () => {
    if (!file) return;
    setLoading(true);
    try {
      const formData = new FormData();
      formData.append("image", file);
      const res = await fetch("/api/recognize", { method: "POST", body: formData });
      const data = await res.json();
      if (data.error) { alert("识别失败: " + data.error); return; }
      setResult(data);
      setEditName(data.name);
      setEditCat(data.category);
      setEditIngs(data.ingredients.join("\n"));
      setEditSteps(data.steps.join("\n"));
    } catch (e) {
      alert("识别失败，请重试");
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    if (!result) return;
    const catIdx = CATEGORIES.findIndex((c) => c.label === editCat || c.key === editCat);
    await fetch("/api/dishes", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: editName,
        categoryId: catIdx > 0 ? catIdx : null,
        imageUrl: result.imageUrl,
        ingredients: editIngs.split("\n").filter(Boolean),
        steps: editSteps.split("\n").filter(Boolean),
      }),
    });
    onSaved();
  };

  return (
    <div className="fixed inset-0 z-30 flex items-end" style={{ background: "rgba(0,0,0,.35)" }} onClick={onClose}>
      <div className="bg-white rounded-t-3xl w-full max-h-[88%] overflow-y-auto animate-slide-up" onClick={(e) => e.stopPropagation()}>
        <div className="w-10 h-1 bg-gray-300 rounded-full mx-auto mt-3" />
        <div className="p-5">
          <h2 className="text-lg font-bold text-gray-800 mb-4">📸 记录一道菜</h2>

          <input ref={fileRef} type="file" accept="image/*" capture="environment" className="hidden"
            onChange={(e) => e.target.files?.[0] && handleFile(e.target.files[0])} />

          <button onClick={() => fileRef.current?.click()}
            className="w-full h-48 rounded-2xl flex flex-col items-center justify-center border-2 border-dashed border-gray-200 bg-gray-50 active:bg-gray-100 transition">
            {image ? (
              <img src={image} alt="预览" className="w-full h-full rounded-2xl object-cover" />
            ) : (
              <>
                <div className="w-14 h-14 rounded-full bg-green-50 flex items-center justify-center mb-3">
                  <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#34c759" strokeWidth="2"><path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/><circle cx="12" cy="13" r="4"/></svg>
                </div>
                <p className="text-sm text-gray-600 font-medium">拍照或从相册选择</p>
                <p className="text-xs text-gray-400 mt-1">拍摄成品菜照片，AI 自动识别</p>
              </>
            )}
          </button>

          {!result && image && (
            <button onClick={handleRecognize} disabled={loading}
              className="w-full mt-4 bg-green-500 text-white rounded-2xl py-3.5 font-semibold text-sm active:bg-green-600 transition disabled:opacity-50">
              {loading ? "🤖 AI 识别中..." : "🤖 开始识别"}
            </button>
          )}

          {result && (
            <div className="mt-5 rounded-2xl p-4 border" style={{ background: "#f0fdf4", borderColor: "#d1f0d9" }}>
              <p className="text-sm font-semibold text-green-600 mb-3">✅ 识别完成，请确认</p>
              <div className="space-y-3">
                <div>
                  <label className="text-xs text-gray-400 font-medium">菜品名称</label>
                  <input value={editName} onChange={(e) => setEditName(e.target.value)}
                    className="w-full bg-white rounded-xl px-3 py-2.5 text-sm mt-1 border border-gray-100 outline-none focus:ring-2 focus:ring-green-300" />
                </div>
                <div>
                  <label className="text-xs text-gray-400 font-medium">分类</label>
                  <select value={editCat} onChange={(e) => setEditCat(e.target.value)}
                    className="w-full bg-white rounded-xl px-3 py-2.5 text-sm mt-1 border border-gray-100 outline-none">
                    {CATEGORIES.filter((c) => c.key !== "all").map((c) => (
                      <option key={c.key} value={c.key}>{c.label}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="text-xs text-gray-400 font-medium">食材清单（每行一个）</label>
                  <textarea value={editIngs} onChange={(e) => setEditIngs(e.target.value)} rows={4}
                    className="w-full bg-white rounded-xl px-3 py-2.5 text-sm mt-1 border border-gray-100 outline-none focus:ring-2 focus:ring-green-300 resize-none" />
                </div>
                <div>
                  <label className="text-xs text-gray-400 font-medium">做法步骤（每行一步）</label>
                  <textarea value={editSteps} onChange={(e) => setEditSteps(e.target.value)} rows={5}
                    className="w-full bg-white rounded-xl px-3 py-2.5 text-sm mt-1 border border-gray-100 outline-none focus:ring-2 focus:ring-green-300 resize-none" />
                </div>
              </div>
            </div>
          )}

          {result && (
            <button onClick={handleSave}
              className="w-full mt-4 bg-green-500 text-white rounded-2xl py-3.5 font-semibold text-sm active:bg-green-600 transition">
              确认并保存到菜单库
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
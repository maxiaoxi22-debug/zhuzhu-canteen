export interface WishlistCompletionChoice {
  id: string;
  name: string;
  imageUrl: string | null;
}

export default function WishlistCompletionDialog({
  candidate,
  saving,
  onChoose,
  onCancel,
}: {
  candidate: WishlistCompletionChoice;
  saving: boolean;
  onChoose: (complete: boolean) => void;
  onCancel: () => void;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#36251f73] px-6" onClick={(event) => { event.stopPropagation(); onCancel(); }}>
      <div className="w-full max-w-sm rounded-[1.75rem] bg-[var(--paper)] p-5 shadow-2xl" onClick={(event) => event.stopPropagation()}>
        <div className="text-center">
          <div className="text-4xl">🐷✨</div>
          <h3 className="mt-3 text-lg font-bold text-[var(--cocoa)]">这道菜在心愿单里</h3>
          <p className="mt-2 text-sm text-gray-500">“{candidate.name}”已经做出来啦，要一起完成这个心愿吗？</p>
        </div>
        <div className="mt-5 space-y-2">
          <button type="button" disabled={saving} onClick={() => onChoose(true)} className="w-full rounded-2xl bg-[var(--coral)] py-3 text-sm font-semibold text-white disabled:opacity-50">
            {saving ? "保存中..." : "完成心愿并保存"}
          </button>
          <button type="button" disabled={saving} onClick={() => onChoose(false)} className="w-full rounded-2xl border border-[var(--line)] bg-white py-3 text-sm font-semibold text-[var(--cocoa)] disabled:opacity-50">
            只保存到饭盆
          </button>
          <button type="button" disabled={saving} onClick={onCancel} className="w-full py-2 text-xs text-gray-400 disabled:opacity-50">返回修改</button>
        </div>
      </div>
    </div>
  );
}

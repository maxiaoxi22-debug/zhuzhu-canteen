export const SATIETY_STORAGE_KEY = "zhuzhu-satiety-v1";

export interface SatietyState {
  date: string;
  value: number;
}

export function readDailySatiety(storage: Pick<Storage, "getItem">, today: string): SatietyState {
  try {
    const parsed = JSON.parse(storage.getItem(SATIETY_STORAGE_KEY) || "null") as SatietyState | null;
    if (parsed?.date === today && Number.isFinite(parsed.value)) {
      return { date: today, value: Math.max(0, Math.min(100, parsed.value)) };
    }
  } catch {}
  return { date: today, value: 0 };
}

export function increaseSatiety(state: SatietyState, today: string): SatietyState {
  const current = state.date === today ? state.value : 0;
  return { date: today, value: Math.min(100, current + 20) };
}

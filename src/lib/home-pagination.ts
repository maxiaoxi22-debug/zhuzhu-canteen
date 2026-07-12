export const HOME_DISH_BATCH_SIZE = 6;

export function nextVisibleDishCount(current: number, total: number) {
  return Math.min(total, current + HOME_DISH_BATCH_SIZE);
}

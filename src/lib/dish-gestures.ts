export interface Point { x: number; y: number }

export function movedPastLongPressTolerance(start: Point, current: Point, tolerance = 10): boolean {
  return Math.hypot(current.x - start.x, current.y - start.y) > tolerance;
}

export function resolveHorizontalSwipe(
  deltaX: number,
  deltaY: number,
  width: number,
): "open" | "closed" | "vertical" {
  if (Math.abs(deltaY) > Math.abs(deltaX)) return "vertical";
  return deltaX >= width / 2 ? "open" : "closed";
}

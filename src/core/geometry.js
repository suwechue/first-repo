// Small geometry helpers shared by every layer.

export function dist(a, b) {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

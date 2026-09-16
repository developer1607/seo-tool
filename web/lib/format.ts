export function pctChange(cur: number, prev: number): string {
  if (!prev) return cur ? "+100%" : "—";
  const v = ((cur - prev) / Math.abs(prev)) * 100;
  const sign = v > 0 ? "+" : "";
  return `${sign}${v.toFixed(1)}%`;
}

export type TrendKind = "up" | "down" | "flat";

export function trendKind(cur: number, prev: number): TrendKind {
  if (!prev && !cur) return "flat";
  if (!prev) return cur ? "up" : "flat";
  const d = cur - prev;
  if (d > 0) return "up";
  if (d < 0) return "down";
  return "flat";
}

export function trendArrow(kind: TrendKind): string {
  if (kind === "up") return "↗";
  if (kind === "down") return "↘";
  return "→";
}

export function trendClass(kind: TrendKind): string {
  if (kind === "up") return "trend trend-up";
  if (kind === "down") return "trend trend-down";
  return "trend trend-flat";
}

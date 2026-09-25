"use client";

import type { ReactNode } from "react";

export type AaLegendItem = {
  color: string;
  label: string;
  /** Short plain-language meaning shown under the chart */
  meaning?: string;
};

export function AaChartMeta({
  items,
  explain,
  children,
}: {
  items?: AaLegendItem[];
  explain?: string | string[];
  children?: ReactNode;
}) {
  const notes = Array.isArray(explain)
    ? explain
    : explain
      ? [explain]
      : [];
  const meaningRows = (items || []).filter((i) => i.meaning);

  if (!items?.length && !notes.length && !children && !meaningRows.length) {
    return null;
  }

  return (
    <div className="aa-chart-meta">
      {items?.length ? (
        <div className="aa-rank-legend" role="list">
          {items.map((item) => (
            <span key={item.label} role="listitem">
              <i style={{ background: item.color }} aria-hidden />
              {item.label}
            </span>
          ))}
        </div>
      ) : null}
      {meaningRows.length > 0 ? (
        <ul className="aa-chart-explain">
          {meaningRows.map((item) => (
            <li key={`m-${item.label}`}>
              <strong style={{ color: item.color }}>{item.label}</strong>
              {" — "}
              {item.meaning}
            </li>
          ))}
        </ul>
      ) : null}
      {notes.length > 0 ? (
        <ul className="aa-chart-explain">
          {notes.map((n) => (
            <li key={n}>{n}</li>
          ))}
        </ul>
      ) : null}
      {children}
    </div>
  );
}

export const RANK_BUCKET_LEGEND: AaLegendItem[] = [
  {
    color: "#1f9d55",
    label: "1-3",
    meaning: "Keywords in positions 1–3 (top of page one)",
  },
  {
    color: "#7dcc6a",
    label: "4-10",
    meaning: "Keywords in positions 4–10 (rest of page one)",
  },
  {
    color: "#f0c419",
    label: "11-20",
    meaning: "Keywords in positions 11–20 (page two)",
  },
  {
    color: "#f08a24",
    label: "21-50",
    meaning: "Keywords in positions 21–50",
  },
  {
    color: "#e24c3b",
    label: "51+",
    meaning: "Keywords ranking beyond position 50",
  },
];

export const KEYWORD_TABLE_EXPLAIN = [
  "Prev / Current — average Search Console position in the prior vs this period",
  "Change — how many positions the keyword moved (▲ green = improved / moved up)",
  "Tracked — custom keywords you pinned; others are top auto queries",
];

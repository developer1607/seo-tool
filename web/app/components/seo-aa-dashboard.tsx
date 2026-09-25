"use client";

import type { ReactNode } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import {
  AaChartMeta,
  RANK_BUCKET_LEGEND,
} from "./aa-chart-meta";

export type RankingPoint = {
  date: string;
  label: string;
  b1_3: number;
  b4_10: number;
  b11_20: number;
  b21_50: number;
  b51: number;
  avg_position?: number;
};

export type HeroScore = {
  id: string;
  label: string;
  value: number;
  note: string;
};

export type HeroPayload = {
  googleChange: number;
  googleDecline: number;
  googleRankings: number;
  keywordsTracked: number;
  visibility: number;
  scores: HeroScore[];
};

const RANK_COLORS = {
  b1_3: "#1f9d55",
  b4_10: "#7dcc6a",
  b11_20: "#f0c419",
  b21_50: "#f08a24",
  b51: "#e24c3b",
};

function gaugeColor(score: number) {
  if (score >= 70) return "#1f9d55";
  if (score >= 45) return "#e6b422";
  return "#e24c3b";
}

export function AaCard({
  title,
  icon,
  children,
  className = "",
  meta,
}: {
  title: string;
  icon?: string;
  children: ReactNode;
  className?: string;
  meta?: string;
}) {
  return (
    <article className={`aa-card ${className}`}>
      <header className="aa-card-head">
        {icon ? (
          <span className="aa-card-icon" aria-hidden>
            {icon}
          </span>
        ) : null}
        <span className="aa-card-title">{title}</span>
        {meta ? <span className="aa-card-meta">{meta}</span> : null}
      </header>
      <div className="aa-card-body">{children}</div>
    </article>
  );
}

function RankingChart({ series }: { series: RankingPoint[] }) {
  const hasBuckets = series.some(
    (p) => p.b1_3 + p.b4_10 + p.b11_20 + p.b21_50 + p.b51 > 0
  );
  const hasPosition = series.some((p) => Number(p.avg_position) > 0);

  return (
    <AaCard title="Google Rankings" icon="▮" className="aa-card-rankings">
      <div className="aa-chart-frame">
        {!series.length ? (
          <p className="aa-empty">
            No Search Console days in this range. Sync GSC or widen the dates.
          </p>
        ) : hasBuckets ? (
          <ResponsiveContainer width="100%" height={220}>
            <BarChart
              data={series}
              margin={{ top: 8, right: 8, left: -12, bottom: 0 }}
            >
              <CartesianGrid
                strokeDasharray="3 3"
                vertical={false}
                stroke="#eceff3"
              />
              <XAxis
                dataKey="label"
                tick={{ fontSize: 10, fill: "#9aa3af" }}
                axisLine={false}
                tickLine={false}
                interval="preserveStartEnd"
              />
              <YAxis
                tick={{ fontSize: 10, fill: "#9aa3af" }}
                axisLine={false}
                tickLine={false}
                allowDecimals={false}
              />
              <Tooltip
                contentStyle={{
                  borderRadius: 8,
                  border: "1px solid #e5e7eb",
                  fontSize: 11,
                }}
              />
              <Bar dataKey="b1_3" stackId="r" fill={RANK_COLORS.b1_3} name="1-3" />
              <Bar
                dataKey="b4_10"
                stackId="r"
                fill={RANK_COLORS.b4_10}
                name="4-10"
              />
              <Bar
                dataKey="b11_20"
                stackId="r"
                fill={RANK_COLORS.b11_20}
                name="11-20"
              />
              <Bar
                dataKey="b21_50"
                stackId="r"
                fill={RANK_COLORS.b21_50}
                name="21-50"
              />
              <Bar
                dataKey="b51"
                stackId="r"
                fill={RANK_COLORS.b51}
                name="51+"
                radius={[3, 3, 0, 0]}
              />
            </BarChart>
          </ResponsiveContainer>
        ) : hasPosition ? (
          <ResponsiveContainer width="100%" height={200}>
            <LineChart
              data={series}
              margin={{ top: 8, right: 8, left: -12, bottom: 0 }}
            >
              <CartesianGrid
                strokeDasharray="3 3"
                vertical={false}
                stroke="#eceff3"
              />
              <XAxis
                dataKey="label"
                tick={{ fontSize: 10, fill: "#9aa3af" }}
                axisLine={false}
                tickLine={false}
              />
              <YAxis
                reversed
                tick={{ fontSize: 10, fill: "#9aa3af" }}
                axisLine={false}
                tickLine={false}
                domain={["auto", "auto"]}
              />
              <Tooltip
                contentStyle={{
                  borderRadius: 8,
                  border: "1px solid #e5e7eb",
                  fontSize: 11,
                }}
              />
              <Line
                type="monotone"
                dataKey="avg_position"
                name="Avg. position"
                stroke="#2f6fed"
                strokeWidth={2}
                dot={false}
              />
            </LineChart>
          </ResponsiveContainer>
        ) : (
          <p className="aa-empty">
            Sync Search Console again so query rankings are stored, then refresh.
          </p>
        )}
      </div>
      {hasBuckets ? (
        <AaChartMeta
          items={RANK_BUCKET_LEGEND}
          explain="Stacked bars = count of tracked/top queries in each Google position band for that day."
        />
      ) : hasPosition ? (
        <AaChartMeta
          items={[
            {
              color: "#2f6fed",
              label: "Avg. position",
              meaning: "Site-wide average ranking from Search Console (lower is better)",
            },
          ]}
          explain="Query-level buckets were empty for these days, so the line shows overall average position instead."
        />
      ) : null}
    </AaCard>
  );
}

function StatTile({
  title,
  value,
  tone,
  icon,
  explain,
}: {
  title: string;
  value: string | number;
  tone?: "up" | "down" | "neutral";
  icon?: string;
  explain?: string;
}) {
  return (
    <AaCard title={title} icon={icon || "▣"} className="aa-card-stat">
      <div className={`aa-stat-value tone-${tone || "neutral"}`}>
        {tone === "up" ? <span className="aa-arrow">▲</span> : null}
        {tone === "down" ? <span className="aa-arrow">▼</span> : null}
        <strong>{value}</strong>
      </div>
      {explain ? <p className="aa-stat-explain">{explain}</p> : null}
    </AaCard>
  );
}

function VisibilityCard({ value }: { value: number }) {
  return (
    <AaCard title="Visibility" icon="🔥" className="aa-card-visibility">
      <div className="aa-visibility-value">
        {(Number(value) || 0).toFixed(2)}
        <span>%</span>
      </div>
      <AaChartMeta
        items={[
          {
            color: "#f08a24",
            label: "CTR %",
            meaning: "Clicks ÷ impressions from Search Console for this period",
          },
        ]}
        explain="Used as a visibility proxy until a dedicated rank-visibility index is connected."
      />
    </AaCard>
  );
}

function GaugeCard({ score }: { score: HeroScore }) {
  const color = gaugeColor(score.value);
  const deg = (score.value / 100) * 360;
  return (
    <AaCard title={score.label} icon="◎" className="aa-card-gauge">
      <div
        className="aa-gauge"
        style={{
          background: `conic-gradient(${color} ${deg}deg, #e8eaee 0deg)`,
        }}
      >
        <div className="aa-gauge-inner">
          <strong>{score.value}</strong>
        </div>
      </div>
      <AaChartMeta
        items={[
          {
            color,
            label: String(score.value),
            meaning: score.note,
          },
        ]}
        explain={[
          "70–100 healthy (green) · 45–69 needs attention (amber) · under 45 weak (red)",
        ]}
      />
    </AaCard>
  );
}

export default function SeoAaDashboard({
  rankingSeries,
  hero,
}: {
  rankingSeries: RankingPoint[];
  hero: HeroPayload;
}) {
  return (
    <div className="aa-dash">
      <RankingChart series={rankingSeries} />
      <div className="aa-mid-grid">
        <StatTile
          title="Google Change"
          value={hero.googleChange}
          tone="up"
          icon="▮"
          explain="Keywords that moved up vs prior period"
        />
        <StatTile
          title="Declines"
          value={hero.googleDecline}
          tone="down"
          icon="▮"
          explain="Keywords that dropped vs prior period"
        />
        <StatTile
          title="Google Rankings"
          value={hero.googleRankings}
          tone="neutral"
          icon="▮"
          explain="Keywords currently in positions 1–10"
        />
        <StatTile
          title="Keywords tracked"
          value={hero.keywordsTracked}
          tone="neutral"
          icon="▮"
          explain="Top auto queries + custom tracked keywords"
        />
      </div>
      <VisibilityCard value={hero.visibility} />
      <div className="aa-gauge-row">
        {(hero.scores || []).map((s) => (
          <GaugeCard key={s.id} score={s} />
        ))}
      </div>
    </div>
  );
}

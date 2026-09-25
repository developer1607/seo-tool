"use client";

import { useMemo, type ReactNode } from "react";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  ComposedChart,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import {
  AaChartMeta,
  type AaLegendItem,
} from "./aa-chart-meta";

type Row = Record<string, unknown>;

type SeriesPoint = {
  date: string;
  label: string;
  clicks: number;
  impressions: number;
  reach: number;
  sessions: number;
  users: number;
  engaged_sessions: number;
  engagement_rate: number;
  primary_conversions: number;
  primary_value: number;
  spend: number;
  ctr: number;
  avg_position: number;
  cpc: number;
  cpm: number;
  cpa: number;
  roas: number;
};

const C = {
  purple: "#2f6fed",
  blue: "#2f6fed",
  green: "#12b76a",
  orange: "#f08a24",
  pink: "#e24c3b",
  prior: "#b9c0cc",
  muted: "#98a2b3",
  ink: "#101828",
  grid: "#eceff3",
};

function shortDate(d: string) {
  return d.length >= 10 ? d.slice(5) : d;
}

function tipStyle() {
  return {
    background: "rgba(255,255,255,0.98)",
    border: "1px solid #e4e7ec",
    borderRadius: 10,
    color: C.ink,
    fontSize: 11,
    boxShadow: "0 8px 24px rgba(16,24,40,0.08)",
  };
}

function gradientId(prefix: string, field: string) {
  return `${prefix}-${field}`.replace(/[^a-zA-Z0-9-]/g, "-");
}

function ChartCard({
  title,
  subtitle,
  children,
  wide,
  legend,
  explain,
}: {
  title: string;
  subtitle?: string;
  children: ReactNode;
  wide?: boolean;
  legend?: AaLegendItem[];
  explain?: string | string[];
}) {
  return (
    <article className={`aa-card platform-chart-card${wide ? " wide" : ""}`}>
      <header className="aa-card-head">
        <span className="aa-card-icon" aria-hidden>
          ▮
        </span>
        <span className="aa-card-title">{title}</span>
      </header>
      {subtitle ? <p className="aa-chart-hint">{subtitle}</p> : null}
      <div className="platform-chart-body">{children}</div>
      <AaChartMeta items={legend} explain={explain} />
    </article>
  );
}

function EmptyChart({ message }: { message: string }) {
  return (
    <div className="empty-section left-aligned platform-chart-empty" style={{ minHeight: 160 }}>
      <p>{message}</p>
    </div>
  );
}

function useSeries(rows: Row[]): SeriesPoint[] {
  return useMemo(
    () =>
      [...rows]
        .sort((a, b) => String(a.date).localeCompare(String(b.date)))
        .map((r) => {
          const clicks = Number(r.clicks) || 0;
          const impressions = Number(r.impressions) || 0;
          const sessions = Number(r.sessions) || 0;
          const spend = Number(r.spend) || 0;
          const engaged = Number(r.engaged_sessions) || 0;
          const conversions = Number(r.primary_conversions) || 0;
          const value = Number(r.primary_value) || 0;
          return {
            date: String(r.date),
            label: shortDate(String(r.date)),
            clicks,
            impressions,
            reach: Number(r.reach) || 0,
            sessions,
            users: Number(r.users) || 0,
            engaged_sessions: engaged,
            engagement_rate:
              sessions > 0
                ? (engaged / sessions) * 100
                : Number(r.engagement_rate) || 0,
            primary_conversions: conversions,
            primary_value: value,
            spend,
            ctr:
              impressions > 0
                ? (clicks / impressions) * 100
                : Number(r.ctr) || 0,
            avg_position: Number(r.avg_position) || 0,
            cpc: clicks > 0 ? spend / clicks : 0,
            cpm: impressions > 0 ? (spend / impressions) * 1000 : 0,
            cpa: conversions > 0 ? spend / conversions : 0,
            roas: spend > 0 ? value / spend : 0,
          };
        }),
    [rows]
  );
}

function Ga4Charts({ rows }: { rows: Row[] }) {
  const data = useSeries(rows);
  if (!data.length) {
    return <EmptyChart message="No GA4 daily rows for this range — Sync under Integrations." />;
  }
  return (
    <div className="platform-charts-grid">
      <ChartCard
        title="Sessions & users"
        subtitle="Daily traffic volume"
        wide
        legend={[
          {
            color: C.purple,
            label: "Sessions",
            meaning: "Total site sessions from GA4 for each day",
          },
          {
            color: C.blue,
            label: "Users",
            meaning: "Active users who visited that day",
          },
        ]}
        explain="Area fill shows volume trend; compare peaks to campaigns or content publishes."
      >
        <ResponsiveContainer width="100%" height={260}>
          <AreaChart data={data}>
            <defs>
              <linearGradient id="ga4Sessions" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={C.purple} stopOpacity={0.35} />
                <stop offset="100%" stopColor={C.purple} stopOpacity={0.02} />
              </linearGradient>
              <linearGradient id="ga4Users" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={C.blue} stopOpacity={0.3} />
                <stop offset="100%" stopColor={C.blue} stopOpacity={0.02} />
              </linearGradient>
            </defs>
            <CartesianGrid stroke={C.grid} strokeDasharray="3 3" />
            <XAxis dataKey="label" tick={{ fontSize: 10, fill: C.muted }} />
            <YAxis tick={{ fontSize: 10, fill: C.muted }} width={40} />
            <Tooltip contentStyle={tipStyle()} />
            <Area
              type="monotone"
              dataKey="sessions"
              name="Sessions"
              stroke={C.purple}
              fill="url(#ga4Sessions)"
              strokeWidth={2}
            />
            <Area
              type="monotone"
              dataKey="users"
              name="Users"
              stroke={C.blue}
              fill="url(#ga4Users)"
              strokeWidth={2}
            />
          </AreaChart>
        </ResponsiveContainer>
      </ChartCard>

      <ChartCard
        title="Engaged sessions"
        subtitle="Daily engaged volume"
        legend={[
          {
            color: C.green,
            label: "Engaged",
            meaning: "Sessions with meaningful interaction (GA4 engaged sessions)",
          },
        ]}
      >
        <ResponsiveContainer width="100%" height={220}>
          <BarChart data={data}>
            <CartesianGrid stroke={C.grid} strokeDasharray="3 3" />
            <XAxis dataKey="label" tick={{ fontSize: 10, fill: C.muted }} />
            <YAxis tick={{ fontSize: 10, fill: C.muted }} width={40} />
            <Tooltip contentStyle={tipStyle()} />
            <Bar
              dataKey="engaged_sessions"
              name="Engaged"
              fill={C.green}
              radius={[4, 4, 0, 0]}
            />
          </BarChart>
        </ResponsiveContainer>
      </ChartCard>

      <ChartCard
        title="Engagement rate"
        subtitle="Curved daily rate %"
        legend={[
          {
            color: C.orange,
            label: "Eng. rate",
            meaning: "Engaged sessions ÷ sessions × 100",
          },
        ]}
      >
        <ResponsiveContainer width="100%" height={220}>
          <AreaChart data={data}>
            <defs>
              <linearGradient id="ga4Eng" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={C.orange} stopOpacity={0.35} />
                <stop offset="100%" stopColor={C.orange} stopOpacity={0.02} />
              </linearGradient>
            </defs>
            <CartesianGrid stroke={C.grid} strokeDasharray="3 3" />
            <XAxis dataKey="label" tick={{ fontSize: 10, fill: C.muted }} />
            <YAxis
              tick={{ fontSize: 10, fill: C.muted }}
              width={40}
              unit="%"
            />
            <Tooltip
              contentStyle={tipStyle()}
              formatter={(v) => [`${Number(v).toFixed(1)}%`, "Engagement"]}
            />
            <Area
              type="monotone"
              dataKey="engagement_rate"
              name="Engagement %"
              stroke={C.orange}
              fill="url(#ga4Eng)"
              strokeWidth={2.5}
            />
          </AreaChart>
        </ResponsiveContainer>
      </ChartCard>

      <ChartCard
        title="Key events"
        subtitle="Conversions / key events"
        wide
        legend={[
          {
            color: C.pink,
            label: "Key events",
            meaning: "Primary conversion / key-event count from GA4",
          },
          {
            color: C.purple,
            label: "Sessions",
            meaning: "Overlay of daily sessions for context",
          },
        ]}
      >
        <ResponsiveContainer width="100%" height={220}>
          <ComposedChart data={data}>
            <CartesianGrid stroke={C.grid} strokeDasharray="3 3" />
            <XAxis dataKey="label" tick={{ fontSize: 10, fill: C.muted }} />
            <YAxis tick={{ fontSize: 10, fill: C.muted }} width={40} />
            <Tooltip contentStyle={tipStyle()} />
            <Bar
              dataKey="primary_conversions"
              name="Key events"
              fill={C.pink}
              radius={[4, 4, 0, 0]}
            />
            <Line
              type="monotone"
              dataKey="sessions"
              name="Sessions"
              stroke={C.purple}
              strokeWidth={2}
              dot={false}
            />
          </ComposedChart>
        </ResponsiveContainer>
      </ChartCard>
    </div>
  );
}

function GscCharts({ rows }: { rows: Row[] }) {
  const data = useSeries(rows);
  if (!data.length) {
    return (
      <EmptyChart message="No Search Console daily rows for this range — Sync under Integrations." />
    );
  }
  return (
    <div className="platform-charts-grid">
      <ChartCard
        title="Clicks & impressions"
        subtitle="Organic search volume"
        wide
        legend={[
          {
            color: C.purple,
            label: "Clicks",
            meaning: "Clicks from Google Search to your site",
          },
          {
            color: C.blue,
            label: "Impressions",
            meaning: "How often your links were shown in Google results",
          },
        ]}
        explain="Bars = clicks (left axis). Area = impressions (right axis)."
      >
        <ResponsiveContainer width="100%" height={260}>
          <ComposedChart data={data}>
            <defs>
              <linearGradient id="gscImp" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={C.blue} stopOpacity={0.25} />
                <stop offset="100%" stopColor={C.blue} stopOpacity={0.02} />
              </linearGradient>
            </defs>
            <CartesianGrid stroke={C.grid} strokeDasharray="3 3" />
            <XAxis dataKey="label" tick={{ fontSize: 10, fill: C.muted }} />
            <YAxis
              yAxisId="left"
              tick={{ fontSize: 10, fill: C.muted }}
              width={42}
            />
            <YAxis
              yAxisId="right"
              orientation="right"
              tick={{ fontSize: 10, fill: C.muted }}
              width={42}
            />
            <Tooltip contentStyle={tipStyle()} />
            <Area
              yAxisId="right"
              type="monotone"
              dataKey="impressions"
              name="Impressions"
              stroke={C.blue}
              fill="url(#gscImp)"
              strokeWidth={2}
            />
            <Bar
              yAxisId="left"
              dataKey="clicks"
              name="Clicks"
              fill={C.purple}
              radius={[4, 4, 0, 0]}
            />
          </ComposedChart>
        </ResponsiveContainer>
      </ChartCard>

      <ChartCard
        title="CTR"
        subtitle="Click-through rate %"
        legend={[
          {
            color: C.green,
            label: "CTR %",
            meaning: "Clicks ÷ impressions × 100 for each day",
          },
        ]}
      >
        <ResponsiveContainer width="100%" height={220}>
          <AreaChart data={data}>
            <defs>
              <linearGradient id="gscCtr" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={C.green} stopOpacity={0.35} />
                <stop offset="100%" stopColor={C.green} stopOpacity={0.02} />
              </linearGradient>
            </defs>
            <CartesianGrid stroke={C.grid} strokeDasharray="3 3" />
            <XAxis dataKey="label" tick={{ fontSize: 10, fill: C.muted }} />
            <YAxis tick={{ fontSize: 10, fill: C.muted }} width={40} unit="%" />
            <Tooltip
              contentStyle={tipStyle()}
              formatter={(v) => [`${Number(v).toFixed(2)}%`, "CTR"]}
            />
            <Area
              type="monotone"
              dataKey="ctr"
              name="CTR %"
              stroke={C.green}
              fill="url(#gscCtr)"
              strokeWidth={2.5}
            />
          </AreaChart>
        </ResponsiveContainer>
      </ChartCard>

      <ChartCard
        title="Average position"
        subtitle="Lower is better"
        legend={[
          {
            color: C.orange,
            label: "Avg. position",
            meaning: "Average ranking across queries that day (1 = top result)",
          },
        ]}
        explain="Y-axis is reversed so upward movement on the chart means better rankings."
      >
        <ResponsiveContainer width="100%" height={220}>
          <LineChartLike data={data} />
        </ResponsiveContainer>
      </ChartCard>
    </div>
  );
}

function LineChartLike({ data }: { data: SeriesPoint[] }) {
  return (
    <ComposedChart data={data}>
      <defs>
        <linearGradient id="positionFill" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={C.orange} stopOpacity={0.24} />
          <stop offset="100%" stopColor={C.orange} stopOpacity={0.02} />
        </linearGradient>
      </defs>
      <CartesianGrid stroke={C.grid} strokeDasharray="3 3" vertical={false} />
      <XAxis dataKey="label" tick={{ fontSize: 10, fill: C.muted }} />
      <YAxis
        reversed
        tick={{ fontSize: 10, fill: C.muted }}
        width={36}
        domain={["auto", "auto"]}
      />
      <Tooltip
        contentStyle={tipStyle()}
        formatter={(v) => [Number(v).toFixed(1), "Avg position"]}
      />
      <Area
        type="monotone"
        dataKey="avg_position"
        name="Avg position"
        stroke={C.orange}
        fill="url(#positionFill)"
        strokeWidth={2.5}
        strokeLinecap="round"
      />
    </ComposedChart>
  );
}

function weekdayLabel(dateStr: string) {
  const d = new Date(`${dateStr}T12:00:00`);
  if (Number.isNaN(d.getTime())) return shortDate(dateStr);
  return d.toLocaleDateString("en-US", { weekday: "short" });
}

/** Day-index align: this Mon vs last Mon when both windows are equal length. */
function alignCompareByDay(
  current: SeriesPoint[],
  prior: SeriesPoint[],
  field: keyof SeriesPoint
) {
  const cur = [...current].sort((a, b) => a.date.localeCompare(b.date));
  const pri = [...prior].sort((a, b) => a.date.localeCompare(b.date));
  const n = Math.max(cur.length, pri.length, 1);
  const useWeekday = n > 0 && n <= 14;
  const points: {
    label: string;
    thisPeriod: number;
    priorPeriod: number;
    thisDate: string;
    priorDate: string;
  }[] = [];
  for (let i = 0; i < n; i++) {
    const c = cur[i];
    const p = pri[i];
    const label = c
      ? useWeekday
        ? weekdayLabel(c.date)
        : c.label
      : p
        ? useWeekday
          ? weekdayLabel(p.date)
          : `P${p.label}`
        : `D${i + 1}`;
    points.push({
      label,
      thisPeriod: c ? Number(c[field]) || 0 : 0,
      priorPeriod: p ? Number(p[field]) || 0 : 0,
      thisDate: c?.date || "",
      priorDate: p?.date || "",
    });
  }
  return points;
}

function CompareMetricChart({
  title,
  subtitle,
  current,
  prior,
  field,
  thisLabel,
  priorLabel,
  wide,
  format = "int",
}: {
  title: string;
  subtitle?: string;
  current: SeriesPoint[];
  prior: SeriesPoint[];
  field: keyof SeriesPoint;
  thisLabel: string;
  priorLabel: string;
  wide?: boolean;
  format?: "int" | "money" | "pct";
}) {
  const points = useMemo(
    () => alignCompareByDay(current, prior, field),
    [current, prior, field]
  );
  const hasPrior = points.some((p) => p.priorPeriod > 0 || Boolean(p.priorDate));
  if (!points.some((p) => p.thisPeriod || p.priorPeriod)) {
    return null;
  }
  const fmt = (v: number) => {
    if (format === "money") return v.toFixed(2);
    if (format === "pct") return `${v.toFixed(1)}%`;
    return String(Math.round(v));
  };
  const fillId = gradientId("compare", String(field));
  return (
    <ChartCard
      title={title}
      subtitle={subtitle}
      wide={wide}
      legend={[
        {
          color: C.purple,
          label: thisLabel,
          meaning: "Value for each day in the selected reporting range",
        },
        {
          color: C.prior,
          label: priorLabel,
          meaning: "Matching day from the prior period of the same length",
        },
      ]}
      explain="Bars = this period. Dashed line = prior period (weekday-aligned when the window is ≤14 days)."
    >
      <ResponsiveContainer width="100%" height={240}>
        <ComposedChart data={points}>
          <defs>
            <linearGradient id={fillId} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={C.purple} stopOpacity={0.32} />
              <stop offset="100%" stopColor={C.purple} stopOpacity={0.08} />
            </linearGradient>
          </defs>
          <CartesianGrid stroke={C.grid} strokeDasharray="3 3" vertical={false} />
          <XAxis dataKey="label" tick={{ fontSize: 10, fill: C.muted }} />
          <YAxis tick={{ fontSize: 10, fill: C.muted }} width={44} />
          <Tooltip
            contentStyle={tipStyle()}
            formatter={(v, name) => [
              fmt(Number(v)),
              name === "thisPeriod" ? thisLabel : priorLabel,
            ]}
            labelFormatter={(_, payload) => {
              const row = payload?.[0]?.payload as
                | { thisDate?: string; priorDate?: string; label?: string }
                | undefined;
              if (!row) return "";
              const bits = [];
              if (row.thisDate) bits.push(`${thisLabel}: ${row.thisDate}`);
              if (row.priorDate) bits.push(`${priorLabel}: ${row.priorDate}`);
              return bits.join(" · ") || String(row.label || "");
            }}
          />
          <Bar
            dataKey="thisPeriod"
            name="thisPeriod"
            fill={`url(#${fillId})`}
            radius={[6, 6, 0, 0]}
          />
          {hasPrior ? (
            <Line
              type="monotone"
              dataKey="priorPeriod"
              name="priorPeriod"
              stroke={C.prior}
              strokeWidth={2}
              strokeDasharray="4 4"
              dot={{ r: 3, fill: C.prior }}
              strokeLinecap="round"
            />
          ) : null}
        </ComposedChart>
      </ResponsiveContainer>
    </ChartCard>
  );
}

function AdsCharts({
  rows,
  compareRows = [],
  label,
  thisLabel = "This period",
  priorLabel = "Prior period",
  showReach = false,
}: {
  rows: Row[];
  compareRows?: Row[];
  label: string;
  thisLabel?: string;
  priorLabel?: string;
  showReach?: boolean;
}) {
  const data = useSeries(rows);
  const prior = useSeries(compareRows);
  if (!data.length && !prior.length) {
    return (
      <EmptyChart
        message={`No ${label} daily rows for this range — Sync under Integrations.`}
      />
    );
  }
  return (
    <div className="platform-charts-grid">
      <CompareMetricChart
        title="Impressions — this vs prior"
        subtitle="Same weekday aligned (e.g. this Mon vs last Mon)"
        current={data}
        prior={prior}
        field="impressions"
        thisLabel={thisLabel}
        priorLabel={priorLabel}
        wide
      />
      <CompareMetricChart
        title="Clicks — this vs prior"
        subtitle="Day-by-day vs matching prior period"
        current={data}
        prior={prior}
        field="clicks"
        thisLabel={thisLabel}
        priorLabel={priorLabel}
        wide
      />
      {showReach ? (
        <CompareMetricChart
          title="Reach — this vs prior"
          subtitle="Unique reach vs prior window"
          current={data}
          prior={prior}
          field="reach"
          thisLabel={thisLabel}
          priorLabel={priorLabel}
          wide
        />
      ) : null}
      <CompareMetricChart
        title="Spend — this vs prior"
        subtitle="Daily cost vs prior period"
        current={data}
        prior={prior}
        field="spend"
        thisLabel={thisLabel}
        priorLabel={priorLabel}
        format="money"
        wide
      />

      <ChartCard
        title="Clicks & impressions (this period)"
        subtitle="Delivery volume"
        wide
        legend={[
          {
            color: C.purple,
            label: "Clicks",
            meaning: "Ad clicks for each day in this period",
          },
          {
            color: C.blue,
            label: "Impressions",
            meaning: "How often ads were shown",
          },
          ...(showReach
            ? [
                {
                  color: C.green,
                  label: "Reach",
                  meaning: "Unique people reached (Meta)",
                },
              ]
            : []),
        ]}
      >
        <ResponsiveContainer width="100%" height={240}>
          <ComposedChart data={data}>
            <defs>
              <linearGradient id="deliveryClicks" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={C.purple} stopOpacity={0.34} />
                <stop offset="100%" stopColor={C.purple} stopOpacity={0.08} />
              </linearGradient>
            </defs>
            <CartesianGrid stroke={C.grid} strokeDasharray="3 3" vertical={false} />
            <XAxis dataKey="label" tick={{ fontSize: 10, fill: C.muted }} />
            <YAxis
              yAxisId="left"
              tick={{ fontSize: 10, fill: C.muted }}
              width={40}
            />
            <YAxis
              yAxisId="right"
              orientation="right"
              tick={{ fontSize: 10, fill: C.muted }}
              width={44}
            />
            <Tooltip contentStyle={tipStyle()} />
            <Bar
              yAxisId="left"
              dataKey="clicks"
              name="Clicks"
              fill="url(#deliveryClicks)"
              radius={[6, 6, 0, 0]}
            />
            <Line
              yAxisId="right"
              type="monotone"
              dataKey="impressions"
              name="Impressions"
              stroke={C.blue}
              strokeWidth={2}
              dot={false}
            />
            {showReach ? (
              <Line
                yAxisId="right"
                type="monotone"
                dataKey="reach"
                name="Reach"
                stroke={C.green}
                strokeWidth={2}
                strokeDasharray="3 3"
                dot={false}
              />
            ) : null}
          </ComposedChart>
        </ResponsiveContainer>
      </ChartCard>

      <ChartCard
        title="CTR & CPC"
        subtitle="Efficiency curves"
        legend={[
          {
            color: C.green,
            label: "CTR %",
            meaning: "Click-through rate (clicks ÷ impressions)",
          },
          {
            color: C.pink,
            label: "CPC",
            meaning: "Cost per click (spend ÷ clicks)",
          },
        ]}
      >
        <ResponsiveContainer width="100%" height={220}>
          <ComposedChart data={data}>
            <defs>
              <linearGradient id="efficiencyCtr" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={C.green} stopOpacity={0.28} />
                <stop offset="100%" stopColor={C.green} stopOpacity={0.02} />
              </linearGradient>
            </defs>
            <CartesianGrid stroke={C.grid} strokeDasharray="3 3" vertical={false} />
            <XAxis dataKey="label" tick={{ fontSize: 10, fill: C.muted }} />
            <YAxis
              yAxisId="left"
              tick={{ fontSize: 10, fill: C.muted }}
              width={36}
              unit="%"
            />
            <YAxis
              yAxisId="right"
              orientation="right"
              tick={{ fontSize: 10, fill: C.muted }}
              width={40}
            />
            <Tooltip contentStyle={tipStyle()} />
            <Area
              yAxisId="left"
              type="monotone"
              dataKey="ctr"
              name="CTR %"
              stroke={C.green}
              fill="url(#efficiencyCtr)"
              strokeWidth={2.5}
              strokeLinecap="round"
            />
            <Line
              yAxisId="right"
              type="monotone"
              dataKey="cpc"
              name="CPC"
              stroke={C.pink}
              strokeWidth={2}
              dot={false}
            />
          </ComposedChart>
        </ResponsiveContainer>
      </ChartCard>

      <ChartCard
        title="Conversions"
        subtitle="Volume and value"
        legend={[
          {
            color: C.purple,
            label: "Conversions",
            meaning: "Primary conversion count attributed to ads",
          },
          {
            color: C.orange,
            label: "Conv. value",
            meaning: "Reported conversion value / revenue when available",
          },
        ]}
      >
        <ResponsiveContainer width="100%" height={220}>
          <ComposedChart data={data}>
            <defs>
              <linearGradient id="conversionBars" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={C.purple} stopOpacity={0.34} />
                <stop offset="100%" stopColor={C.purple} stopOpacity={0.08} />
              </linearGradient>
            </defs>
            <CartesianGrid stroke={C.grid} strokeDasharray="3 3" vertical={false} />
            <XAxis dataKey="label" tick={{ fontSize: 10, fill: C.muted }} />
            <YAxis
              yAxisId="left"
              tick={{ fontSize: 10, fill: C.muted }}
              width={36}
            />
            <YAxis
              yAxisId="right"
              orientation="right"
              tick={{ fontSize: 10, fill: C.muted }}
              width={44}
            />
            <Tooltip contentStyle={tipStyle()} />
            <Bar
              yAxisId="left"
              dataKey="primary_conversions"
              name="Conversions"
              fill="url(#conversionBars)"
              radius={[6, 6, 0, 0]}
            />
            <Line
              yAxisId="right"
              type="monotone"
              dataKey="primary_value"
              name="Conv. value"
              stroke={C.orange}
              strokeWidth={2}
              dot={false}
            />
          </ComposedChart>
        </ResponsiveContainer>
      </ChartCard>
    </div>
  );
}

export default function PlatformCharts({
  platformKey,
  rows,
  compareRows = [],
  thisLabel = "This period",
  priorLabel = "Prior period",
}: {
  platformKey: string;
  rows: Row[];
  compareRows?: Row[];
  thisLabel?: string;
  priorLabel?: string;
}) {
  if (platformKey === "ga4") return <Ga4Charts rows={rows} />;
  if (platformKey === "gsc") return <GscCharts rows={rows} />;
  if (platformKey === "google-ads") {
    return (
      <AdsCharts
        rows={rows}
        compareRows={compareRows}
        label="Google Ads"
        thisLabel={thisLabel}
        priorLabel={priorLabel}
      />
    );
  }
  if (platformKey === "meta") {
    return (
      <AdsCharts
        rows={rows}
        compareRows={compareRows}
        label="Meta Ads"
        thisLabel={thisLabel}
        priorLabel={priorLabel}
        showReach
      />
    );
  }
  return null;
}

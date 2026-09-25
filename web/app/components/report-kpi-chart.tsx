"use client";

import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { ChartType, ReportKpiDef } from "../../lib/report-kpis";

type SeriesPoint = {
  date: string;
  [key: string]: string | number;
};

type PieSlice = { name: string; value: number };

const C = {
  prior: "#b9c0cc",
  grid: "#eceff3",
  muted: "#98a2b3",
  ink: "#101828",
  panel: "#ffffff",
  purple: "#2f6fed",
  blue: "#2f6fed",
  green: "#12b76a",
  orange: "#f08a24",
  pink: "#e24c3b",
};

const PRIOR_COLOR = C.prior;

function shortDate(d: string) {
  return d.length >= 10 ? d.slice(5) : d;
}

function weekdayLabel(dateStr: string) {
  const d = new Date(`${dateStr}T12:00:00`);
  if (Number.isNaN(d.getTime())) return shortDate(dateStr);
  return d.toLocaleDateString("en-US", { weekday: "short" });
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

function chartId(key: string) {
  return key.replace(/[^a-zA-Z0-9]/g, "-");
}

function compactNumber(value: number | string) {
  const n = Number(value);
  if (!Number.isFinite(n)) return String(value);
  return Intl.NumberFormat("en", {
    notation: Math.abs(n) >= 10000 ? "compact" : "standard",
    maximumFractionDigits: Math.abs(n) >= 1000 ? 1 : 0,
  }).format(n);
}

function metricValue(def: ReportKpiDef, value: unknown) {
  const n = Number(value);
  if (!Number.isFinite(n)) return String(value);
  const formatted = Intl.NumberFormat("en", {
    maximumFractionDigits: def.digits,
    minimumFractionDigits: def.digits > 0 ? 1 : 0,
  }).format(n);
  return def.suffix ? `${formatted}${def.suffix}` : formatted;
}

/** Align current vs prior by day index (this Mon vs last Mon on equal windows). */
export function alignPeriodSeries(
  current: SeriesPoint[],
  prior: SeriesPoint[],
  field: string
) {
  const cur = [...(current || [])].sort((a, b) =>
    String(a.date).localeCompare(String(b.date))
  );
  const pri = [...(prior || [])].sort((a, b) =>
    String(a.date).localeCompare(String(b.date))
  );
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
    points.push({
      label: c
        ? useWeekday
          ? weekdayLabel(String(c.date))
          : shortDate(String(c.date))
        : p
          ? useWeekday
            ? weekdayLabel(String(p.date))
            : `P${shortDate(String(p.date))}`
          : `D${i + 1}`,
      thisPeriod: c ? Number(c[field]) || 0 : 0,
      priorPeriod: p ? Number(p[field]) || 0 : 0,
      thisDate: c ? String(c.date) : "",
      priorDate: p ? String(p.date) : "",
    });
  }
  return points;
}

export default function ReportKpiChart({
  def,
  chart,
  series,
  compareSeries,
  pie,
  color = "#6658d3",
  thisLabel = "This period",
  priorLabel = "Prior period",
}: {
  def: ReportKpiDef;
  chart: ChartType;
  series: SeriesPoint[];
  compareSeries?: SeriesPoint[];
  pie?: PieSlice[] | null;
  color?: string;
  thisLabel?: string;
  priorLabel?: string;
}) {
  const type: ChartType = def.charts.includes(chart)
    ? chart
    : def.defaultChart;

  if (type === "pie") {
    const curTotal = (series || []).reduce(
      (n, r) => n + (Number(r[def.seriesField]) || 0),
      0
    );
    const priTotal = (compareSeries || []).reduce(
      (n, r) => n + (Number(r[def.seriesField]) || 0),
      0
    );
    const periodSlices: PieSlice[] = [];
    if (curTotal > 0) periodSlices.push({ name: thisLabel, value: curTotal });
    if (priTotal > 0) periodSlices.push({ name: priorLabel, value: priTotal });

    // Prefer period comparison; fall back to composition share when no prior
    const slices =
      periodSlices.length >= 1
        ? periodSlices
        : pie && pie.length
          ? pie
          : [];

    if (!slices.length) {
      return (
        <div className="report-kpi-chart-empty">
          No share breakdown for this period.
        </div>
      );
    }
    const fills =
      periodSlices.length >= 1
        ? [color, PRIOR_COLOR]
        : [C.purple, C.blue, C.green, C.orange, C.pink];
    return (
      <div className="report-kpi-chart-body">
        <ResponsiveContainer width="100%" height={168}>
          <PieChart>
            <Pie
              data={slices}
              dataKey="value"
              nameKey="name"
              cx="50%"
              cy="50%"
              innerRadius={30}
              outerRadius={58}
              paddingAngle={2}
              cornerRadius={5}
              isAnimationActive={false}
              labelLine={false}
              label={({ name, percent }: { name?: string; percent?: number }) =>
                `${name || ""} ${Math.round((percent || 0) * 100)}%`
              }
            >
              {slices.map((_, i) => (
                <Cell key={i} fill={fills[i % fills.length]} />
              ))}
            </Pie>
            <Tooltip
              contentStyle={tipStyle()}
              formatter={(value) => [
                metricValue(def, value),
                "Value",
              ]}
            />
            <Legend
              iconType="circle"
              wrapperStyle={{ fontSize: 10, color: C.muted }}
            />
          </PieChart>
        </ResponsiveContainer>
      </div>
    );
  }

  const points = alignPeriodSeries(
    series || [],
    compareSeries || [],
    def.seriesField
  );

  const hasThis = points.some((p) => p.thisPeriod);
  const hasPrior = points.some((p) => p.priorPeriod);

  if (!hasThis && !hasPrior) {
    return (
      <div className="report-kpi-chart-empty">
        No daily data for this metric yet. Sync the linked sources, then reopen
        the report.
      </div>
    );
  }

  const yProps = def.reverseY
    ? { reversed: true, domain: ["auto", "auto"] as const }
    : {};

  const common = (
    <>
      <defs>
        <linearGradient id={`${chartId(def.key)}Fill`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity={0.32} />
          <stop offset="100%" stopColor={color} stopOpacity={0.03} />
        </linearGradient>
        <linearGradient id={`${chartId(def.key)}PriorFill`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={PRIOR_COLOR} stopOpacity={0.24} />
          <stop offset="100%" stopColor={PRIOR_COLOR} stopOpacity={0.02} />
        </linearGradient>
      </defs>
      <CartesianGrid stroke={C.grid} strokeDasharray="3 3" vertical={false} />
      <XAxis
        dataKey="label"
        axisLine={false}
        tickLine={false}
        tick={{ fontSize: 10, fill: C.muted }}
      />
      <YAxis
        width={36}
        axisLine={false}
        tickLine={false}
        tick={{ fontSize: 10, fill: C.muted }}
        tickFormatter={compactNumber}
        {...yProps}
      />
      <Tooltip
        contentStyle={tipStyle()}
        formatter={(value, name) => [
          metricValue(def, value),
          name === "thisPeriod"
            ? thisLabel
            : name === "priorPeriod"
              ? priorLabel
              : String(name),
        ]}
        labelFormatter={(label, payload) => {
          const row = payload?.[0]?.payload as
            | { thisDate?: string; priorDate?: string }
            | undefined;
          if (row?.thisDate || row?.priorDate) {
            return [
              label,
              row.thisDate ? `${thisLabel}: ${row.thisDate}` : null,
              row.priorDate ? `${priorLabel}: ${row.priorDate}` : null,
            ]
              .filter(Boolean)
              .join(" · ");
          }
          return String(label);
        }}
      />
      <Legend
        iconType="circle"
        wrapperStyle={{ fontSize: 10, color: C.muted }}
        formatter={(value) =>
          value === "thisPeriod"
            ? thisLabel
            : value === "priorPeriod"
              ? priorLabel
              : value
        }
      />
    </>
  );

  return (
    <div className="report-kpi-chart-body">
      <ResponsiveContainer width="100%" height={168}>
        {type === "bar" ? (
          <BarChart
            data={points}
            margin={{ top: 4, right: 8, left: 0, bottom: 0 }}
          >
            {common}
            <Bar
              dataKey="priorPeriod"
              name="priorPeriod"
              fill={PRIOR_COLOR}
              radius={[6, 6, 0, 0]}
              isAnimationActive={false}
            />
            <Bar
              dataKey="thisPeriod"
              name="thisPeriod"
              fill={color}
              radius={[6, 6, 0, 0]}
              isAnimationActive={false}
            />
          </BarChart>
        ) : type === "area" ? (
          <AreaChart
            data={points}
            margin={{ top: 4, right: 8, left: 0, bottom: 0 }}
          >
            {common}
            <Area
              type="monotone"
              dataKey="priorPeriod"
              name="priorPeriod"
              stroke={PRIOR_COLOR}
              fill={`url(#${chartId(def.key)}PriorFill)`}
              strokeWidth={2}
              strokeDasharray="4 4"
              isAnimationActive={false}
            />
            <Area
              type="monotone"
              dataKey="thisPeriod"
              name="thisPeriod"
              stroke={color}
              fill={`url(#${chartId(def.key)}Fill)`}
              strokeWidth={2.5}
              isAnimationActive={false}
            />
          </AreaChart>
        ) : (
          <LineChart
            data={points}
            margin={{ top: 4, right: 8, left: 0, bottom: 0 }}
          >
            {common}
            <Line
              type="monotone"
              dataKey="priorPeriod"
              name="priorPeriod"
              stroke={PRIOR_COLOR}
              strokeWidth={2}
              strokeDasharray="4 3"
              dot={false}
              strokeLinecap="round"
              isAnimationActive={false}
            />
            <Line
              type="monotone"
              dataKey="thisPeriod"
              name="thisPeriod"
              stroke={color}
              strokeWidth={2.5}
              dot={false}
              activeDot={{ r: 4, strokeWidth: 0 }}
              strokeLinecap="round"
              isAnimationActive={false}
            />
          </LineChart>
        )}
      </ResponsiveContainer>
    </div>
  );
}

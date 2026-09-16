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

const PRIOR_COLOR = "#b0afbb";

function shortDate(d: string) {
  return d.length >= 10 ? d.slice(5) : d;
}

function tipStyle() {
  return {
    background: "#fff",
    border: "1px solid #e9e8f0",
    borderRadius: 8,
    fontSize: 11,
    boxShadow: "0 8px 24px #25243914",
  };
}

/** Align current vs prior by day index (Day 1 of each window side-by-side). */
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
        ? shortDate(String(c.date))
        : p
          ? `P${shortDate(String(p.date))}`
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
      periodSlices.length >= 1 ? [color, PRIOR_COLOR] : ["#6658d3", "#5c9ed1", "#58ae91", "#e68a58"];
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
              outerRadius={54}
              isAnimationActive={false}
              label={({ name, percent }: { name?: string; percent?: number }) =>
                `${name || ""} ${Math.round((percent || 0) * 100)}%`
              }
            >
              {slices.map((_, i) => (
                <Cell key={i} fill={fills[i % fills.length]} />
              ))}
            </Pie>
            <Tooltip contentStyle={tipStyle()} />
            <Legend wrapperStyle={{ fontSize: 10 }} />
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
      <CartesianGrid stroke="#edecf2" strokeDasharray="3 3" />
      <XAxis dataKey="label" tick={{ fontSize: 10, fill: "#8a8798" }} />
      <YAxis
        width={36}
        tick={{ fontSize: 10, fill: "#8a8798" }}
        {...yProps}
      />
      <Tooltip
        contentStyle={tipStyle()}
        formatter={(value: number | string, name: string) => [
          value,
          name === "thisPeriod" ? thisLabel : name === "priorPeriod" ? priorLabel : name,
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
        wrapperStyle={{ fontSize: 10 }}
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
              radius={[3, 3, 0, 0]}
              isAnimationActive={false}
            />
            <Bar
              dataKey="thisPeriod"
              name="thisPeriod"
              fill={color}
              radius={[3, 3, 0, 0]}
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
              fill={PRIOR_COLOR}
              fillOpacity={0.12}
              strokeWidth={2}
              isAnimationActive={false}
            />
            <Area
              type="monotone"
              dataKey="thisPeriod"
              name="thisPeriod"
              stroke={color}
              fill={color}
              fillOpacity={0.2}
              strokeWidth={2}
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
              isAnimationActive={false}
            />
            <Line
              type="monotone"
              dataKey="thisPeriod"
              name="thisPeriod"
              stroke={color}
              strokeWidth={2}
              dot={false}
              isAnimationActive={false}
            />
          </LineChart>
        )}
      </ResponsiveContainer>
    </div>
  );
}

"use client";

import { useMemo, type ReactNode } from "react";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  ComposedChart,
  Legend,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

type Row = Record<string, unknown>;

type SeriesPoint = {
  date: string;
  label: string;
  clicks: number;
  impressions: number;
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
  purple: "#6658d3",
  blue: "#5c9ed1",
  green: "#58ae91",
  orange: "#e68a58",
  pink: "#cf7f9d",
  muted: "#8a8798",
  grid: "#edecf2",
};

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

function ChartCard({
  title,
  subtitle,
  children,
  wide,
}: {
  title: string;
  subtitle?: string;
  children: ReactNode;
  wide?: boolean;
}) {
  return (
    <section className={`panel platform-chart-card${wide ? " wide" : ""}`}>
      <div className="panel-header" style={{ marginBottom: 8 }}>
        <div>
          <h2>{title}</h2>
          {subtitle ? <p className="muted">{subtitle}</p> : null}
        </div>
      </div>
      <div className="platform-chart-body">{children}</div>
    </section>
  );
}

function EmptyChart({ message }: { message: string }) {
  return (
    <div className="empty-section left-aligned" style={{ minHeight: 160 }}>
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
      <ChartCard title="Sessions & users" subtitle="Daily traffic volume" wide>
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
            <Legend />
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

      <ChartCard title="Engaged sessions" subtitle="Daily engaged volume">
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

      <ChartCard title="Engagement rate" subtitle="Curved daily rate %">
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

      <ChartCard title="Key events" subtitle="Conversions / key events" wide>
        <ResponsiveContainer width="100%" height={220}>
          <ComposedChart data={data}>
            <CartesianGrid stroke={C.grid} strokeDasharray="3 3" />
            <XAxis dataKey="label" tick={{ fontSize: 10, fill: C.muted }} />
            <YAxis tick={{ fontSize: 10, fill: C.muted }} width={40} />
            <Tooltip contentStyle={tipStyle()} />
            <Legend />
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
      <ChartCard title="Clicks & impressions" subtitle="Organic search volume" wide>
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
            <Legend />
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

      <ChartCard title="CTR" subtitle="Click-through rate %">
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

      <ChartCard title="Average position" subtitle="Lower is better">
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
      <CartesianGrid stroke={C.grid} strokeDasharray="3 3" />
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
        fill="transparent"
        strokeWidth={2.5}
      />
    </ComposedChart>
  );
}

function AdsCharts({ rows, label }: { rows: Row[]; label: string }) {
  const data = useSeries(rows);
  if (!data.length) {
    return (
      <EmptyChart
        message={`No ${label} daily rows for this range — Sync under Integrations.`}
      />
    );
  }
  return (
    <div className="platform-charts-grid">
      <ChartCard title="Spend" subtitle="Daily ad cost" wide>
        <ResponsiveContainer width="100%" height={240}>
          <AreaChart data={data}>
            <defs>
              <linearGradient id="adsSpend" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={C.orange} stopOpacity={0.4} />
                <stop offset="100%" stopColor={C.orange} stopOpacity={0.02} />
              </linearGradient>
            </defs>
            <CartesianGrid stroke={C.grid} strokeDasharray="3 3" />
            <XAxis dataKey="label" tick={{ fontSize: 10, fill: C.muted }} />
            <YAxis tick={{ fontSize: 10, fill: C.muted }} width={44} />
            <Tooltip
              contentStyle={tipStyle()}
              formatter={(v) => [Number(v).toFixed(2), "Spend"]}
            />
            <Area
              type="monotone"
              dataKey="spend"
              name="Spend"
              stroke={C.orange}
              fill="url(#adsSpend)"
              strokeWidth={2.5}
            />
          </AreaChart>
        </ResponsiveContainer>
      </ChartCard>

      <ChartCard title="Clicks & impressions" subtitle="Delivery volume" wide>
        <ResponsiveContainer width="100%" height={240}>
          <ComposedChart data={data}>
            <CartesianGrid stroke={C.grid} strokeDasharray="3 3" />
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
            <Legend />
            <Bar
              yAxisId="left"
              dataKey="clicks"
              name="Clicks"
              fill={C.purple}
              radius={[4, 4, 0, 0]}
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
          </ComposedChart>
        </ResponsiveContainer>
      </ChartCard>

      <ChartCard title="CTR & CPC" subtitle="Efficiency curves">
        <ResponsiveContainer width="100%" height={220}>
          <ComposedChart data={data}>
            <CartesianGrid stroke={C.grid} strokeDasharray="3 3" />
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
            <Legend />
            <Area
              yAxisId="left"
              type="monotone"
              dataKey="ctr"
              name="CTR %"
              stroke={C.green}
              fill="transparent"
              strokeWidth={2.5}
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

      <ChartCard title="Conversions" subtitle="Volume and value">
        <ResponsiveContainer width="100%" height={220}>
          <ComposedChart data={data}>
            <CartesianGrid stroke={C.grid} strokeDasharray="3 3" />
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
            <Legend />
            <Bar
              yAxisId="left"
              dataKey="primary_conversions"
              name="Conversions"
              fill={C.purple}
              radius={[4, 4, 0, 0]}
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
}: {
  platformKey: string;
  rows: Row[];
}) {
  if (platformKey === "ga4") return <Ga4Charts rows={rows} />;
  if (platformKey === "gsc") return <GscCharts rows={rows} />;
  if (platformKey === "google-ads") {
    return <AdsCharts rows={rows} label="Google Ads" />;
  }
  if (platformKey === "meta") {
    return <AdsCharts rows={rows} label="Meta Ads" />;
  }
  return null;
}

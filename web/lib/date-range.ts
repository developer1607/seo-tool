export type DateRangeState = {
  preset: string;
  from: string;
  to: string;
};

export type PresetOption = { id: string; label: string };

export const DEFAULT_PRESETS: PresetOption[] = [
  { id: "last_7", label: "Last 7 days" },
  { id: "last_14", label: "Last 14 days" },
  { id: "last_30", label: "Last 30 days" },
  { id: "last_month", label: "Last month" },
  { id: "current_month", label: "Current month" },
  { id: "previous_month", label: "Previous month" },
  { id: "custom", label: "Custom" },
];

/** Client-side mirror of server resolvePreset for Generate preview hints. */
export function previewResolveRange(
  preset: string,
  customFrom = "",
  customTo = ""
): {
  from: string;
  to: string;
  compareFrom: string;
  compareTo: string;
  label: string;
} {
  const pad = (n: number) => String(n).padStart(2, "0");
  const fmt = (d: Date) =>
    `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  const addDays = (d: Date, n: number) => {
    const x = new Date(d.getFullYear(), d.getMonth(), d.getDate());
    x.setDate(x.getDate() + n);
    return x;
  };
  const end = addDays(new Date(), -1);
  let from = addDays(end, -29);
  let to = end;
  let label = "Last 30 days";

  if (preset === "last_7") {
    from = addDays(end, -6);
    label = "Last 7 days";
  } else if (preset === "last_14") {
    from = addDays(end, -13);
    label = "Last 14 days";
  } else if (preset === "last_month" || preset === "previous_month") {
    const prev = new Date(end.getFullYear(), end.getMonth() - 1, 1);
    from = new Date(prev.getFullYear(), prev.getMonth(), 1);
    to = new Date(prev.getFullYear(), prev.getMonth() + 1, 0);
    label = preset === "previous_month" ? "Previous month" : "Last month";
  } else if (preset === "current_month") {
    from = new Date(end.getFullYear(), end.getMonth(), 1);
    label = "Current month";
  } else if (preset === "custom") {
    const ok =
      /^\d{4}-\d{2}-\d{2}$/.test(customFrom) &&
      /^\d{4}-\d{2}-\d{2}$/.test(customTo);
    if (ok && customFrom <= customTo) {
      from = new Date(customFrom + "T00:00:00");
      to = new Date(customTo + "T00:00:00");
      label = "Custom";
    }
  }

  const days =
    Math.round((to.getTime() - from.getTime()) / 86400000) + 1;
  const compareTo = addDays(from, -1);
  const compareFrom = addDays(compareTo, -(days - 1));
  return {
    from: fmt(from),
    to: fmt(to),
    compareFrom: fmt(compareFrom),
    compareTo: fmt(compareTo),
    label,
  };
}

const STORAGE_KEY = "webastral_date_range";

export function loadDateRange(): DateRangeState {
  if (typeof window === "undefined") {
    return { preset: "last_30", from: "", to: "" };
  }
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as DateRangeState;
      if (parsed?.preset === "custom") {
        const ok =
          /^\d{4}-\d{2}-\d{2}$/.test(parsed.from || "") &&
          /^\d{4}-\d{2}-\d{2}$/.test(parsed.to || "");
        if (!ok) return { preset: "last_30", from: "", to: "" };
      }
      if (parsed?.preset) return parsed;
    }
  } catch {
    /* ignore */
  }
  return { preset: "last_30", from: "", to: "" };
}

export function saveDateRange(state: DateRangeState) {
  if (typeof window === "undefined") return;
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

export function rangeQuery(state: DateRangeState) {
  const q = new URLSearchParams();
  q.set("preset", state.preset || "last_30");
  if (state.preset === "custom") {
    if (state.from) q.set("from", state.from);
    if (state.to) q.set("to", state.to);
  }
  return q.toString();
}

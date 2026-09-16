"use client";

import { useEffect, useState } from "react";
import { useSession } from "../providers";
import {
  DEFAULT_PRESETS,
  type DateRangeState,
  type PresetOption,
} from "../../lib/date-range";

export default function DateRangeBar({
  presets = DEFAULT_PRESETS,
  compareFrom,
  compareTo,
  rangeFrom,
  rangeTo,
}: {
  presets?: PresetOption[];
  compareFrom?: string | null;
  compareTo?: string | null;
  rangeFrom?: string | null;
  rangeTo?: string | null;
}) {
  const { dateRange, setDateRange } = useSession();
  const [draft, setDraft] = useState<DateRangeState>(dateRange);

  useEffect(() => {
    setDraft(dateRange);
  }, [dateRange]);

  function apply(next: DateRangeState) {
    setDraft(next);
    setDateRange(next);
  }

  return (
    <section className="date-range-bar panel">
      <label className="date-field">
        <span>Range</span>
        <select
          value={draft.preset}
          onChange={(e) => {
            const preset = e.target.value;
            if (preset === "custom") {
              setDraft({ ...draft, preset });
              return;
            }
            apply({ preset, from: "", to: "" });
          }}
        >
          {presets.map((p) => (
            <option key={p.id} value={p.id}>
              {p.label}
            </option>
          ))}
        </select>
      </label>
      <label className="date-field">
        <span>From</span>
        <input
          type="date"
          value={draft.from || rangeFrom || ""}
          onChange={(e) =>
            setDraft({ ...draft, preset: "custom", from: e.target.value })
          }
        />
      </label>
      <label className="date-field">
        <span>To</span>
        <input
          type="date"
          value={draft.to || rangeTo || ""}
          onChange={(e) =>
            setDraft({ ...draft, preset: "custom", to: e.target.value })
          }
        />
      </label>
      <button
        type="button"
        className="primary-button"
        disabled={
          draft.preset === "custom" && (!draft.from || !draft.to)
        }
        onClick={() =>
          apply({
            preset: "custom",
            from: draft.from || rangeFrom || "",
            to: draft.to || rangeTo || "",
          })
        }
      >
        Apply
      </button>
      <span className="muted date-range-hint">
        {rangeFrom && rangeTo ? `${rangeFrom} → ${rangeTo}` : "Selected range"}
        {compareFrom && compareTo
          ? ` · vs ${compareFrom} → ${compareTo}`
          : ""}
      </span>
    </section>
  );
}

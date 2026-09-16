'use strict';

/** Date range helpers for Webastral (FR-006 / FR-009). Dates as YYYY-MM-DD. */

function pad(n) {
  return String(n).padStart(2, '0');
}

function fmt(d) {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function parseYmd(s) {
  const m = String(s || '').match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return null;
  const y = Number(m[1]);
  const mo = Number(m[2]);
  const d = Number(m[3]);
  const dt = new Date(y, mo - 1, d);
  if (
    Number.isNaN(dt.getTime()) ||
    dt.getFullYear() !== y ||
    dt.getMonth() !== mo - 1 ||
    dt.getDate() !== d
  ) {
    return null;
  }
  return dt;
}

function addDays(d, n) {
  const x = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  x.setDate(x.getDate() + n);
  return x;
}

function startOfMonth(d) {
  return new Date(d.getFullYear(), d.getMonth(), 1);
}

function endOfMonth(d) {
  return new Date(d.getFullYear(), d.getMonth() + 1, 0);
}

function yesterday() {
  return addDays(new Date(), -1);
}

function resolvePreset(preset, customFrom, customTo) {
  const end = yesterday();
  let from;
  let to = end;
  let label = preset || 'last_30';
  let resolved = preset || 'last_30';

  switch (preset) {
    case 'last_7':
      from = addDays(end, -6);
      label = 'Last 7 days';
      resolved = 'last_7';
      break;
    case 'last_14':
      from = addDays(end, -13);
      label = 'Last 14 days';
      resolved = 'last_14';
      break;
    case 'last_month': {
      const prev = new Date(end.getFullYear(), end.getMonth() - 1, 1);
      from = startOfMonth(prev);
      to = endOfMonth(prev);
      label = 'Last month';
      resolved = 'last_month';
      break;
    }
    case 'current_month':
      from = startOfMonth(end);
      to = end;
      label = 'Current month';
      resolved = 'current_month';
      break;
    case 'previous_month': {
      const prev = new Date(end.getFullYear(), end.getMonth() - 1, 1);
      from = startOfMonth(prev);
      to = endOfMonth(prev);
      label = 'Previous month';
      resolved = 'previous_month';
      break;
    }
    case 'custom': {
      const cf = parseYmd(customFrom);
      const ct = parseYmd(customTo);
      if (cf && ct && cf <= ct) {
        from = cf;
        to = ct;
        label = 'Custom';
        resolved = 'custom';
        break;
      }
      // Invalid custom → fall through to last_30
    }
    // fallthrough
    case 'last_30':
    default:
      from = addDays(end, -29);
      label = 'Last 30 days';
      resolved = 'last_30';
      break;
  }

  const days = Math.round((to - from) / 86400000) + 1;
  const compareTo = addDays(from, -1);
  const compareFrom = addDays(compareTo, -(days - 1));

  return {
    preset: resolved,
    label,
    from: fmt(from),
    to: fmt(to),
    compareFrom: fmt(compareFrom),
    compareTo: fmt(compareTo),
    compareLabel: 'Previous period',
  };
}

const PRESETS = [
  { id: 'last_7', label: 'Last 7 days' },
  { id: 'last_14', label: 'Last 14 days' },
  { id: 'last_30', label: 'Last 30 days' },
  { id: 'last_month', label: 'Last month' },
  { id: 'current_month', label: 'Current month' },
  { id: 'previous_month', label: 'Previous month' },
  { id: 'custom', label: 'Custom' },
];

module.exports = { resolvePreset, PRESETS, fmt };

// Single source of truth for number/date formatting. Units are always explicit.

const MINUS = "−";

function sign(v: number, plus: boolean) {
  return v < 0 ? MINUS : plus && v > 0 ? "+" : "";
}

/** Compact currency: $842, $12.3k, $1.24M. */
export function fmtMoney(v: number | null | undefined, opts: { plus?: boolean } = {}) {
  if (v === null || v === undefined || Number.isNaN(v)) return "—";
  const abs = Math.abs(v);
  const s = sign(v, !!opts.plus);
  if (abs >= 1e6) return `${s}$${(abs / 1e6).toFixed(2)}M`;
  if (abs >= 1e3) return `${s}$${(abs / 1e3).toFixed(1)}k`;
  return `${s}$${abs.toFixed(0)}`;
}

/** Full-precision currency: $12,345. */
export function fmtMoneyFull(v: number | null | undefined, opts: { plus?: boolean } = {}) {
  if (v === null || v === undefined || Number.isNaN(v)) return "—";
  return `${sign(v, !!opts.plus)}$${Math.abs(v).toLocaleString(undefined, { maximumFractionDigits: 0 })}`;
}

export function fmtNum(v: number | null | undefined, digits = 0) {
  if (v === null || v === undefined || Number.isNaN(v)) return "—";
  return `${sign(v, false)}${Math.abs(v).toLocaleString(undefined, { minimumFractionDigits: digits, maximumFractionDigits: digits })}`;
}

export const fmtMW = (v: number | null | undefined, digits = 0) => (v == null ? "—" : `${fmtNum(v, digits)} MW`);
export const fmtMWh = (v: number | null | undefined, digits = 0) => (v == null ? "—" : `${fmtNum(v, digits)} MWh`);
export const fmtPct = (fraction: number | null | undefined, digits = 0) =>
  fraction == null ? "—" : `${(fraction * 100).toFixed(digits)}%`;
export const fmtPrice = (v: number | null | undefined, digits = 1) => (v == null ? "—" : `$${v.toFixed(digits)}/MWh`);

export function fmtDuration(seconds: number | null | undefined) {
  if (seconds === null || seconds === undefined) return "—";
  return seconds < 60 ? `${seconds.toFixed(1)} s` : `${Math.floor(seconds / 60)} m ${Math.round(seconds % 60)} s`;
}

export function fmtDate(iso: string | null | undefined) {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

export function fmtDateTime(iso: string | null | undefined) {
  if (!iso) return "—";
  return new Date(iso).toLocaleString(undefined, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
}

/** Elapsed-time label for step `i` of a horizon: "06:30", or "+1d 06:30" past 24 h. */
export function stepTimeLabel(i: number, stepHours: number) {
  const totalMin = Math.round(i * stepHours * 60);
  const day = Math.floor(totalMin / 1440);
  const m = totalMin % 1440;
  const hhmm = `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
  return day > 0 ? `+${day}d ${hhmm}` : hhmm;
}

export const stepLabels = (n: number, stepHours: number) => Array.from({ length: n }, (_, i) => stepTimeLabel(i, stepHours));

export function sum(values: number[]) {
  let s = 0;
  for (const v of values) s += v;
  return s;
}

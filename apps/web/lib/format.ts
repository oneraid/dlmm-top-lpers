export function shortAddress(addr: string, chars = 4): string {
  return addr.length > chars * 2 + 3 ? `${addr.slice(0, chars)}...${addr.slice(-chars)}` : addr;
}
export function fmtSol(v: number, digits = 2): string {
  const sign = v > 0 ? "+" : "";
  return `${sign}${v.toFixed(digits)} SOL`;
}
export function fmtPct(v: number): string { return `${Math.round(v * 100)}%`; }
export function fmtUsd(v: number): string {
  return v.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });
}
export function timeAgo(iso: string | null): string {
  if (!iso) return "-";
  const mins = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60000));
  if (mins < 60) return `${mins}m lalu`;
  if (mins < 1440) return `${Math.round(mins / 60)}j lalu`;
  return `${Math.round(mins / 1440)}h lalu`;
}
export function pnlClass(v: number): string { return v > 0 ? "text-emerald-400" : v < 0 ? "text-red-400" : "text-zinc-400"; }

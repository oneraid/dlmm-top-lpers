"use client";
// TODO(Sprint-2): replace with Recharts LineChart of cumulative PnL per closed position
// (data: GET /api/wallets/{address}/positions?status=closed). Spec: IMPLEMENTATION.md Bab 8.3.
export function PnlChart({ address }: { address: string }) {
  return (
    <div className="flex h-48 items-center justify-center rounded-xl border border-zinc-800 bg-zinc-900/40 text-sm text-zinc-500">
      Chart PnL kumulatif — wallet {address.slice(0, 8)}... (Sprint-2)
    </div>
  );
}

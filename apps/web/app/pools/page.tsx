import { EmptyState } from "@/components/EmptyState";
// Pools — IMPLEMENTATION.md Bab 8.4. TODO(Sprint-1): full table + per-pool top LPers drill-down.
export default async function PoolsPage() {
  const { getDb } = await import("@/lib/db");
  const db = await getDb();
  const pools = db ? await db.pool.findMany({ orderBy: { feeTvlRatio24h: "desc" }, take: 100 }) : [];
  if (!pools.length) return <EmptyState title="Belum ada pool" hint="Jalankan job poolDiscovery dulu: npm run job:pools" />;
  return (
    <div className="overflow-x-auto rounded-xl border border-zinc-800">
      <table className="w-full text-sm">
        <thead className="bg-zinc-900 text-left text-zinc-400"><tr>
          <th className="px-3 py-2">Pool</th><th className="px-3 py-2">Bin Step</th><th className="px-3 py-2">TVL</th>
          <th className="px-3 py-2">Volume 24h</th><th className="px-3 py-2">Fees 24h</th><th className="px-3 py-2">Fee/TVL 24h</th>
          <th className="px-3 py-2">Tracked</th><th className="px-3 py-2">Terakhir Scan</th>
        </tr></thead>
        <tbody>{pools.map((p) => (
          <tr key={p.address} className="border-t border-zinc-800">
            <td className="px-3 py-2 font-mono">{p.name}<span className="block text-xs text-zinc-500">{p.address.slice(0, 12)}...</span></td>
            <td className="px-3 py-2">{p.binStep}</td><td className="px-3 py-2">${Math.round(p.tvlUsd).toLocaleString()}</td>
            <td className="px-3 py-2">${Math.round(p.volume24hUsd).toLocaleString()}</td>
            <td className="px-3 py-2">${Math.round(p.fees24hUsd).toLocaleString()}</td>
            <td className="px-3 py-2">{(p.feeTvlRatio24h * 100).toFixed(2)}%</td>
            <td className="px-3 py-2">{p.isTracked ? "Ya" : "-"}</td>
            <td className="px-3 py-2 text-zinc-400">{p.lastScannedAt?.toLocaleString("id-ID") ?? "-"}</td>
          </tr>))}
        </tbody>
      </table>
    </div>
  );
}

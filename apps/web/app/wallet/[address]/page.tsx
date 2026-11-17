import { WalletStatCards } from "@/components/WalletStatCards";
import { PnlChart } from "@/components/PnlChart";
import { FlagBadges } from "@/components/FlagBadges";
import { EmptyState } from "@/components/EmptyState";

// Wallet Detail — IMPLEMENTATION.md Bab 8.3.
// TODO(Sprint-1): tab 7D/30D/90D switcher, per-pool breakdown table, position history table,
// open positions panel, copy-readiness checklist.
export default async function WalletPage({ params }: { params: Promise<{ address: string }> }) {
  const { address } = await params;
  const { getDb } = await import("@/lib/db");
  const db = await getDb();
  const wallet = db ? await db.wallet.findUnique({ where: { address }, include: { stats: true } }) : null;
  if (!wallet) return <EmptyState title="Wallet belum ter-profiling" hint="Tambahkan lewat POST /api/wallets/manual atau tunggu wallet discovery menemukannya." />;
  const s30 = wallet.stats.find((s) => s.windowDays === 30);
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="font-mono text-lg">{address}</h1>
        <FlagBadges flags={wallet.flags} />
        <a className="text-sm text-sky-300 hover:underline" href={`https://solscan.io/account/${address}`} target="_blank" rel="noreferrer">Solscan</a>
        <a className="text-sm text-sky-300 hover:underline" href={`https://app.meteora.ag/portfolio/${address}`} target="_blank" rel="noreferrer">Meteora</a>
      </div>
      {s30 && <WalletStatCards stats={{ closed: s30.closedCount, winRateRaw: s30.winRateRaw, winRateAdj: s30.winRateAdj,
        pnlSol: s30.pnlSol, feesEarnedSol: s30.feesEarnedSol, evPerPositionSol: s30.evPerPositionSol, medianHoldMinutes: s30.medianHoldMinutes }} />}
      <PnlChart address={address} />
      <EmptyState title="Breakdown per pool & riwayat posisi" hint="Tabel A/B sesuai Bab 8.3 — dikerjakan di Sprint-1/2." />
    </div>
  );
}

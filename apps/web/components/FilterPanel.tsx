"use client";
// TODO(Sprint-1): wire these controls to /api/leaderboard query params (Bab 8.2).
// Defaults mirror IMPLEMENTATION.md Bab 2.5 hard filters.
export function FilterPanel() {
  return (
    <aside className="w-full shrink-0 space-y-4 rounded-xl border border-zinc-800 bg-zinc-900/50 p-4 lg:w-60">
      <div>
        <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-zinc-400">Window</p>
        <label className="block text-sm"><input type="radio" name="win" defaultChecked /> 30D</label>
        <label className="block text-sm"><input type="radio" name="win" /> 7D</label>
      </div>
      <div>
        <label className="text-xs font-semibold uppercase tracking-wide text-zinc-400">Min. posisi 30D</label>
        <input type="number" defaultValue={20} className="mt-1 w-full rounded bg-zinc-800 px-2 py-1" />
      </div>
      <div>
        <label className="text-xs font-semibold uppercase tracking-wide text-zinc-400">Min. PnL 30D (SOL)</label>
        <input type="number" placeholder="0" className="mt-1 w-full rounded bg-zinc-800 px-2 py-1" />
      </div>
      <div>
        <label className="text-xs font-semibold uppercase tracking-wide text-zinc-400">Gaya pool</label>
        <select className="mt-1 w-full rounded bg-zinc-800 px-2 py-1" defaultValue="all">
          <option value="all">Semua</option><option value="bluechip">Bluechip</option><option value="memecoin">Memecoin</option>
        </select>
      </div>
      <button className="w-full rounded bg-sky-600 py-1.5 text-sm font-medium hover:bg-sky-500">Terapkan</button>
    </aside>
  );
}

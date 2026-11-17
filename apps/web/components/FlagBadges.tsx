const RED = new Set(["CREATOR_FLAG", "SNIPER_FLAG", "HIDDEN_LOSS_FLAG"]);
export function FlagBadges({ flags }: { flags: string[] }) {
  if (!flags.length) return null;
  return (
    <span className="inline-flex flex-wrap gap-1">
      {flags.map((f) => (
        <span key={f} className={`rounded px-1.5 py-0.5 text-[10px] font-medium ${
          RED.has(f) ? "bg-red-500/15 text-red-300" : "bg-amber-500/15 text-amber-300"}`}>{f}</span>
      ))}
    </span>
  );
}
export function ConsistentBadge({ winScore }: { winScore: number }) {
  if (winScore < 0.75) return null;
  return <span className="rounded bg-emerald-500/15 px-1.5 py-0.5 text-[10px] font-medium text-emerald-300">Consistent</span>;
}

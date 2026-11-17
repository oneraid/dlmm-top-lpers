import { EmptyState } from "@/components/EmptyState";
// Pipeline status — IMPLEMENTATION.md Bab 8.1 (/jobs). Reads job_runs.
export default async function JobsPage() {
  const { getDb } = await import("@/lib/db");
  const db = await getDb();
  const runs = db ? await db.jobRun.findMany({ orderBy: { startedAt: "desc" }, take: 50 }) : [];
  if (!runs.length) return <EmptyState title="Belum ada job run" hint="Pipeline belum pernah jalan. Lihat README untuk urutan menjalankan job manual." />;
  return (
    <div className="overflow-x-auto rounded-xl border border-zinc-800">
      <table className="w-full text-sm">
        <thead className="bg-zinc-900 text-left text-zinc-400"><tr>
          <th className="px-3 py-2">Job</th><th className="px-3 py-2">Status</th><th className="px-3 py-2">Mulai</th><th className="px-3 py-2">Selesai</th><th className="px-3 py-2">Detail</th>
        </tr></thead>
        <tbody>{runs.map((r) => (
          <tr key={String(r.id)} className="border-t border-zinc-800">
            <td className="px-3 py-2">{r.jobName}</td><td className="px-3 py-2">{r.status}</td>
            <td className="px-3 py-2">{r.startedAt.toLocaleString("id-ID")}</td>
            <td className="px-3 py-2">{r.finishedAt?.toLocaleString("id-ID") ?? "-"}</td>
            <td className="px-3 py-2 max-w-md truncate text-zinc-400">{r.detail ? JSON.stringify(r.detail) : "-"}</td>
          </tr>))}
        </tbody>
      </table>
    </div>
  );
}

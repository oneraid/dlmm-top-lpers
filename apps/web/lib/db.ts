// Server-side DB access for API routes. Returns null when DATABASE_URL is not configured,
// so the skeleton UI can run (empty states) before Postgres is up.
export async function getDb() {
  if (!process.env.DATABASE_URL) return null;
  try {
    const { prisma } = await import("@dlmm/db");
    return prisma;
  } catch {
    return null;
  }
}

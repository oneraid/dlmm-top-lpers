/**
 * Wilson score lower bound (95% confidence) for a binomial proportion.
 * Used as Adjusted Win Rate: small samples are discounted hard.
 * wilson(3,0) ~= 0.44  vs  wilson(156,44) ~= 0.72  -> consistency beats a tiny perfect streak.
 * Spec: IMPLEMENTATION.md Bab 2.2
 */
export function wilsonLowerBound(wins: number, losses: number, z = 1.96): number {
  const n = wins + losses;
  if (n === 0) return 0;
  const p = wins / n;
  const denom = 1 + (z * z) / n;
  const centre = p + (z * z) / (2 * n);
  const margin = z * Math.sqrt((p * (1 - p) + (z * z) / (4 * n)) / n);
  return Math.max(0, (centre - margin) / denom);
}

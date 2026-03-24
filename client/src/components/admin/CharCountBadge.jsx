const PLATFORM_LIMITS = {
  linkedin: 1300,
  instagram: 2200,
  facebook: 63206,
  twitter: 280,
  story: 150,
  reels: 150,
};

export default function CharCountBadge({ current, limit, platform }) {
  const effectiveLimit = limit ?? PLATFORM_LIMITS[platform] ?? 9999;
  const pct = current / effectiveLimit;

  let colorClass = "text-green-600 bg-green-50 border-green-200";
  if (pct >= 1) colorClass = "text-red-600 bg-red-50 border-red-300";
  else if (pct >= 0.8) colorClass = "text-yellow-700 bg-yellow-50 border-yellow-300";

  return (
    <span className={`inline-flex items-center text-xs font-mono px-1.5 py-0.5 rounded border ${colorClass}`}>
      {current}/{effectiveLimit}
    </span>
  );
}

export { PLATFORM_LIMITS };

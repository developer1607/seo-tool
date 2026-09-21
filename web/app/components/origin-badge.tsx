"use client";

export function originLabel(origin?: string | null) {
  const o = String(origin || "MANUAL").toUpperCase();
  if (o === "GOOGLE") return "Google";
  if (o === "META") return "Meta";
  if (o === "LINKEDIN") return "LinkedIn";
  if (o === "TIKTOK") return "TikTok";
  if (o === "MICROSOFT") return "Microsoft";
  if (o === "OTHER") return "Other";
  return "Manual";
}

export function OriginBadge({ origin }: { origin?: string | null }) {
  const o = String(origin || "MANUAL").toUpperCase();
  const slug = o.toLowerCase().replace(/[^a-z0-9]+/g, "-");
  return (
    <span className={`origin-badge origin-${slug}`} title={`Created via ${originLabel(origin)}`}>
      {originLabel(origin)}
    </span>
  );
}

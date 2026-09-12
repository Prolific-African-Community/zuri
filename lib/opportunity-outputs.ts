/**
 * What an opportunity has produced, in one line. The card shows counts and a
 * link; the drafts themselves belong to Content.
 */

export type OutputAsset = {
  id: string;
  title: string | null;
  status: string;
  archivedAt: Date | null;
  channel: string;
  type: string;
  createdAt: Date;
};

/** One readable word per channel, so the summary reads like a sentence. */
function label(asset: OutputAsset) {
  if (asset.channel === "WEBSITE") return "article";
  if (asset.channel === "LINKEDIN") return "LinkedIn";
  if (asset.channel === "GOOGLE_BUSINESS") return "Google Business";
  if (asset.channel === "FACEBOOK" || asset.channel === "INSTAGRAM") return "Meta";
  return asset.channel.toLowerCase().replace(/_/g, " ");
}

export type OutputSummary = {
  activeCount: number;
  archivedCount: number;
  /** "1 article · 2 Meta", already ordered and pluralised. */
  breakdown: string;
  /** The output worth opening first: the article, else the newest. */
  primary: OutputAsset | null;
  hasActiveArticle: boolean;
};

export function summarizeOutputs(assets: OutputAsset[]): OutputSummary {
  // An archived draft never counts as an output the brand still has.
  const active = assets.filter((asset) => asset.archivedAt === null);
  const archived = assets.length - active.length;

  const counts = new Map<string, number>();
  for (const asset of active) {
    const key = label(asset);
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }

  const article =
    active.find((asset) => asset.channel === "WEBSITE") ?? null;
  const newest = [...active].sort(
    (a, b) => b.createdAt.getTime() - a.createdAt.getTime(),
  )[0];

  return {
    activeCount: active.length,
    archivedCount: archived,
    breakdown: [...counts.entries()]
      .sort((a, b) => b[1] - a[1])
      .map(([name, count]) => `${count} ${name}`)
      .join(" · "),
    primary: article ?? newest ?? null,
    hasActiveArticle: Boolean(article),
  };
}

/**
 * Matches a brand's website to one of the Search Console properties the
 * connected Google account can actually read. Pure string work — no network,
 * no brand-specific rules.
 */

export type Property = { siteUrl: string; permission: string };

/** A property Google grants no data access to is not a candidate. */
function readable(property: Property) {
  return property.permission !== "siteUnverifiedUser";
}

function host(value: string) {
  try {
    return new URL(value).hostname.toLowerCase();
  } catch {
    return value.toLowerCase().replace(/^https?:\/\//, "").split("/")[0] ?? "";
  }
}

function bare(hostname: string) {
  return hostname.replace(/^www\./i, "");
}

function normalized(value: string) {
  return value.trim().toLowerCase().replace(/\/+$/, "");
}

export type Resolution = {
  property: string;
  /** Why it was picked, in the order the tiers are tried. */
  reason: string;
};

/**
 * Tiers, strongest first: exact URL-prefix, trailing-slash equivalence,
 * www/non-www equivalence, then the domain property. Anything looser would be
 * a guess, and a wrong property silently reports someone else's traffic.
 */
export function resolveProperty(
  websiteUrl: string | null,
  properties: Property[],
): Resolution | null {
  if (!websiteUrl?.trim()) return null;

  const candidates = properties.filter(readable);
  const site = websiteUrl.trim();
  const siteHost = host(site);
  if (!siteHost) return null;

  const exact = candidates.find((entry) => entry.siteUrl === site);
  if (exact) return { property: exact.siteUrl, reason: "exact URL-prefix match" };

  const slash = candidates.find(
    (entry) => normalized(entry.siteUrl) === normalized(site),
  );
  if (slash) return { property: slash.siteUrl, reason: "trailing-slash match" };

  const sameDomain = candidates.filter(
    (entry) =>
      !entry.siteUrl.startsWith("sc-domain:") &&
      bare(host(entry.siteUrl)) === bare(siteHost),
  );
  if (sameDomain.length === 1) {
    return { property: sameDomain[0].siteUrl, reason: "www/non-www match" };
  }
  if (sameDomain.length > 1) {
    // Prefer the one whose host is identical before falling back to ambiguity.
    const identical = sameDomain.find((entry) => host(entry.siteUrl) === siteHost);
    if (identical) return { property: identical.siteUrl, reason: "host match" };
    return null;
  }

  const domain = candidates.find(
    (entry) => entry.siteUrl === `sc-domain:${bare(siteHost)}`,
  );
  if (domain) return { property: domain.siteUrl, reason: "domain property match" };

  return null;
}

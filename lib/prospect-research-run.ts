/**
 * Executes one "Find prospects" run end to end, updating its counters as it
 * goes. Runs after the response via `after()`: no queue, no worker.
 *
 * The funnel, cheapest stage first:
 *   plan (one model call) → search, per strategy → pool domains, read listing
 *   pages for more → dedupe → read homepages and score them cheaply → research
 *   a shortlist (one model call each) → verify, score, rank → save the best.
 *
 * Nothing is persisted until a candidate is fully researched, verified, scored
 * and ranked. Each saved prospect is written together with its evidence and
 * contacts in one transaction, so a prospect never exists half-created.
 */

import { phoneKey } from "@/lib/phone";
import { getPrisma } from "@/lib/prisma";
import {
  STRATEGIES,
  classifyDomain,
  discoverCandidates,
  discoveryScore,
  extractDirectoryListings,
  fetchPage,
  identityKey,
  meetsThreshold,
  normalizeDomain,
  planQueries,
  prePoolScore,
  qualificationVerdict,
  reviewFlags,
  suggestDecisionGroup,
  researchCompany,
  type Candidate,
  type CampaignForResearch,
  type FetchedPage,
  type ResearchResult,
  type Strategy,
} from "@/lib/prospect-research";

/** Discover broadly, research a shortlist, save only the best. */
const MAX_POOL = 200;
const MAX_DIRECTORY_PAGES = 6;
const MAX_SHORTLIST = 20;
const MAX_RESEARCHED = 12;
const HOMEPAGE_CONCURRENCY = 12;
const RESEARCH_CONCURRENCY = 3;

/**
 * Splits candidates into new ones and ones that already exist, by canonical
 * domain first and by normalized name + country second.
 */
export function partitionDuplicates<C extends { domain: string }>(
  candidates: C[],
  existing: { id: string; name: string; country: string | null; website: string | null; normalizedDomain: string | null; companyPhone?: string | null }[],
) {
  const knownDomains = new Map<string, string>();
  const knownIdentities = new Map<string, string>();
  const knownPhones = new Map<string, string>();
  for (const prospect of existing) {
    const domain = prospect.normalizedDomain ?? normalizeDomain(prospect.website);
    if (domain) knownDomains.set(domain, prospect.id);
    const key = identityKey(prospect.name, prospect.country);
    if (key) knownIdentities.set(key, prospect.id);
    const phone = phoneKey(prospect.companyPhone);
    if (phone) knownPhones.set(phone, prospect.id);
  }
  const fresh: C[] = [];
  const duplicates: { candidate: C; prospectId: string }[] = [];
  const seen = new Set<string>();
  for (const candidate of candidates) {
    const domain = normalizeDomain(candidate.domain) ?? candidate.domain;
    const known = knownDomains.get(domain);
    if (known) duplicates.push({ candidate, prospectId: known });
    else if (!seen.has(domain)) {
      seen.add(domain);
      fresh.push(candidate);
    }
  }
  return { fresh, duplicates, knownIdentities, knownPhones };
}

// The same switchboard is the same operator, whatever brand or website it trades under.
export { phoneKey };

/**
 * Ranking weighs fit by how much of the rubric it rests on, so a score built
 * on a few favourable criteria does not outrank a well-evidenced one.
 */
export function rankingScore(result: { fitScore: number; coverage: number }) {
  return result.fitScore * (0.6 + 0.4 * result.coverage);
}

/** A run older than this that still says RUNNING died with its process. */
export const STALE_RUN_MS = 20 * 60 * 1000;

export function isRunStale(run: { status: string; startedAt: Date }) {
  return run.status === "RUNNING" && Date.now() - run.startedAt.getTime() > STALE_RUN_MS;
}

/** Why a candidate ended where it did — the categories the log reports. */
export const OUTCOMES = [
  "SAVED",
  "BELOW_THRESHOLD",
  "IRRELEVANT",
  "NON_OPERATOR",
  "MICRO_CARRIER",
  "OUTSIDE_GEOGRAPHY",
  "INSUFFICIENT_EVIDENCE",
  "EXCLUDED_STACK",
  "DUPLICATE",
  "UNREACHABLE",
  "NOT_SHORTLISTED",
  "FAILED",
] as const;
export type Outcome = (typeof OUTCOMES)[number];

export type CandidateLine = {
  domain: string;
  name: string | null;
  outcome: Outcome;
  strategies: Strategy[];
  channels: string[];
  listedOn: string[];
  discoveryScore: number | null;
  fitScore: number | null;
  fitConfidence: string | null;
  coverage?: number;
  reason: string;
  prospectId?: string;
  rejections?: string[];
};

type StrategyStats = {
  queries: number;
  raw: number;
  unique: number;
  shortlisted: number;
  researched: number;
  saved: number;
};

async function inBatches<T, R>(items: T[], size: number, run: (item: T) => Promise<R>) {
  const results: R[] = [];
  for (let index = 0; index < items.length; index += size) {
    results.push(...(await Promise.all(items.slice(index, index + size).map(run))));
  }
  return results;
}

/** The log category for a researched company that was not saved. */
function researchedOutcome(result: ResearchResult): { outcome: Outcome; reason: string } {
  if (!result.isTargetCompany) {
    const outcome: Outcome =
      result.rejectionKind === "MICRO_CARRIER"
        ? "MICRO_CARRIER"
        : result.rejectionKind === "IRRELEVANT"
          ? "IRRELEVANT"
          : "NON_OPERATOR";
    return { outcome, reason: result.rejectionReason || "Not a matching operating company" };
  }
  const verdict = qualificationVerdict({
    fitScore: result.fitScore,
    fitConfidence: result.fitConfidence,
    coverage: result.coverage,
    factors: result.factors,
    hasFact: result.evidence.some((item) => item.type === "FACT"),
    strongestReason: result.strongestReason,
  });
  const notMet = result.factors.filter((factor) => factor.assessment === "NOT_MET");
  if (notMet.some((factor) => factor.criterion?.startsWith("Operates in the target geography"))) {
    return { outcome: "OUTSIDE_GEOGRAPHY", reason: verdict.reason };
  }
  if (!result.evidence.some((item) => item.type === "FACT") || result.coverage < 0.4) {
    return { outcome: "INSUFFICIENT_EVIDENCE", reason: verdict.reason };
  }
  const micro = notMet.some(
    (factor) =>
      (factor.criterion && /size|vehicles|fleet/i.test(factor.criterion)) ||
      (!factor.criterion && /micro|too small|small fleet|petit/i.test(factor.label)),
  );
  if (micro && (result.fleetSize === null || result.fleetSize < 10)) {
    return { outcome: "MICRO_CARRIER", reason: "Below the target size on stated evidence." };
  }
  const stack = notMet.some(
    (factor) =>
      (factor.criterion && /tms|tooling|digital/i.test(factor.criterion)) ||
      (!factor.criterion && /digit|stack|tms|software|logiciel/i.test(factor.label)),
  );
  if (stack) return { outcome: "EXCLUDED_STACK", reason: "A modern stack already covering the workflow is stated." };
  return { outcome: "BELOW_THRESHOLD", reason: result.strongestReason || verdict.reason };
}

/** The qualification a saved prospect starts with: passes, with flags suggesting review. */
function researchQualification(result: ResearchResult, targetCompanySize: string | null) {
  const verdict = qualificationVerdict({
    fitScore: result.fitScore,
    fitConfidence: result.fitConfidence,
    coverage: result.coverage,
    factors: result.factors,
    hasFact: result.evidence.some((item) => item.type === "FACT"),
    strongestReason: result.strongestReason,
  });
  const flags = reviewFlags({
    targetCompanySize,
    fleetSize: result.fleetSize,
    employeeCount: result.employeeCount,
    industry: result.industry,
    activities: result.activities,
    fitScore: result.fitScore,
    coverage: result.coverage,
    factors: result.factors,
  });
  const suggestion = suggestDecisionGroup({
    verdict,
    coverage: result.coverage,
    fitConfidence: result.fitConfidence,
    factors: result.factors,
    flags,
  });
  return {
    passes: verdict.passes,
    reason: verdict.reason,
    flags,
    group: null,
    groupReason: null,
    suggestedGroup: suggestion.group,
    suggestedGroupReason: suggestion.reason,
    reviewedAt: new Date().toISOString(),
  };
}

/** Run health: a share of failed searches at which coverage stops being representative. */
const DEGRADED_RATIO = 0.25;
const FAILED_RATIO = 0.75;

function healthFields(health: { planned: number; succeeded: number; failed: number }) {
  return {
    plannedSearches: health.planned,
    successfulSearches: health.succeeded,
    failedSearches: health.failed,
    coverageRatio: health.planned ? Math.round((health.succeeded / health.planned) * 100) / 100 : null,
  };
}

/** A phone already visible before research: on Maps, or printed on the homepage. */
function reachability({ candidate, home }: { candidate: Candidate; home: FetchedPage }) {
  return (candidate.phone || home.phones.length ? 4 : 0) + (home.emails.length ? 1 : 0);
}

/**
 * The pool keeps the best candidates of every discovery route. Maps can return
 * hundreds of plausible local businesses; listing and organic-only finds are
 * fewer but often stronger, so the best of them are admitted first — only
 * when their own pre-pool score is positive, never as a fixed quota.
 */
function balancedPool(ordered: Candidate[]) {
  const RESERVED = Math.round(MAX_POOL * 0.3);
  const offMaps = ordered.filter((candidate) => !(candidate.channels.size === 1 && candidate.channels.has("MAPS")));
  const reserved = new Set(offMaps.filter((candidate) => prePoolScore(candidate) > 0).slice(0, RESERVED));
  const rest = ordered.filter((candidate) => !reserved.has(candidate)).slice(0, MAX_POOL - reserved.size);
  const chosen = new Set([...reserved, ...rest]);
  // Kept in pre-pool order, so later stages see the same ranking as before.
  return ordered.filter((candidate) => chosen.has(candidate));
}

export async function executeResearchRun(runId: string) {
  const prisma = getPrisma();
  const run = await prisma.salesResearchRun.findUnique({
    where: { id: runId },
    include: { campaign: { include: { brand: { select: { name: true } } } } },
  });
  if (!run || run.status !== "RUNNING") return;

  const { campaign } = run;
  const lines: CandidateLine[] = [];
  const progress = (data: Record<string, unknown>) =>
    prisma.salesResearchRun.update({ where: { id: runId }, data });
  const line = (candidate: Candidate, rest: Omit<CandidateLine, "domain" | "strategies" | "channels" | "listedOn" | "name"> & { name?: string | null }) =>
    lines.push({
      domain: candidate.domain,
      strategies: [...candidate.strategies],
      channels: [...candidate.channels],
      listedOn: [...candidate.listedOn],
      ...rest,
      name: rest.name ?? candidate.title,
    });

  try {
    const campaignInput: CampaignForResearch = {
      brandName: campaign.brand.name,
      name: campaign.name,
      offer: campaign.offer,
      description: campaign.description,
      geography: run.geographyOverride ? [run.geographyOverride] : campaign.geography,
      industries: run.industryOverride ? [run.industryOverride] : campaign.industries,
      targetCompanySize: campaign.targetCompanySize,
      idealCustomerProfile: campaign.idealCustomerProfile,
      painPoints: campaign.painPoints,
      valueProposition: campaign.valueProposition,
      primaryAngle: campaign.primaryAngle,
      targetTicketMin: campaign.targetTicketMin,
      targetTicketMax: campaign.targetTicketMax,
      currency: campaign.currency,
      preferredProfile: campaign.preferredProfile,
      exclusions: campaign.exclusions,
      scoringCriteria: campaign.scoringCriteria,
    };

    const existing = await prisma.prospect.findMany({
      where: { brandId: campaign.brandId },
      select: { id: true, name: true, country: true, city: true, website: true, normalizedDomain: true, companyPhone: true, fitExplanation: true, campaignId: true },
    });

    /* ---- 1. plan ----------------------------------------------------------- */
    await progress({ stage: "Planning searches" });
    // Related-company expansion is seeded with this campaign's own prospects
    // that still pass qualification — names to search around, never facts.
    const known = existing
      .filter((prospect) => prospect.campaignId === campaign.id)
      .filter((prospect) => (prospect.fitExplanation as { qualification?: { passes?: boolean } } | null)?.qualification?.passes !== false)
      .map((prospect) => ({ name: prospect.name, city: prospect.city, country: prospect.country }));
    const plan = await planQueries(campaignInput, { geography: run.geographyOverride, industry: run.industryOverride }, known);

    /* ---- 2. search, per strategy ------------------------------------------- */
    await progress({ stage: `Searching (${plan.queries.length} queries)` });
    let discovery: Awaited<ReturnType<typeof discoverCandidates>>;
    try {
      discovery = await discoverCandidates(plan);
    } catch (error) {
      const health = (error as { health?: { planned: number; succeeded: number; failed: number } }).health;
      if (health) await progress(healthFields(health));
      throw error;
    }
    const { byDomain, directoryPages, diagnostics, raw, health } = discovery;
    await progress(healthFields(health));
    // Too little of the planned coverage ran to call anything representative.
    if (health.planned && health.failed / health.planned >= FAILED_RATIO) {
      throw new Error(
        `${health.failed} of ${health.planned} discovery searches failed. ${diagnostics.find((d) => d.error)?.error ?? ""}`.trim(),
      );
    }

    /* ---- 3. listing pages: names and websites only ------------------------- */
    await progress({ stage: `Reading ${Math.min(directoryPages.length, MAX_DIRECTORY_PAGES)} listing pages` });
    const directoryLog: { url: string; readable: boolean; listed: number; added: number; detailPagesRead: number }[] = [];
    for (const page of directoryPages.slice(0, MAX_DIRECTORY_PAGES)) {
      const { listings, readable, detailPagesRead } = await extractDirectoryListings(page.url);
      let added = 0;
      const query = plan.queries[page.queryIndex];
      for (const listing of listings) {
        if (!listing.domain || classifyDomain(listing.domain, listing.name) !== "COMPANY") continue;
        const existingCandidate = byDomain.get(listing.domain);
        if (existingCandidate) {
          existingCandidate.listedOn.add(page.url);
          existingCandidate.strategies.add("DIRECTORY");
          existingCandidate.channels.add("LISTING");
          continue;
        }
        added++;
        byDomain.set(listing.domain, {
          domain: listing.domain,
          url: listing.website ?? `https://${listing.domain}`,
          title: listing.name,
          hits: 1,
          bestPosition: 20,
          locations: new Set(query ? [query.location] : []),
          strategies: new Set<Strategy>(["DIRECTORY"]),
          queryIndexes: new Set([page.queryIndex]),
          listedOn: new Set([page.url]),
          channels: new Set(["LISTING"]),
          category: null,
          phone: null,
        });
      }
      directoryLog.push({ url: page.url, readable, listed: listings.length, added, detailPagesRead });
    }

    // Ordered by what the search already says about each company — no fetch, no model.
    const ordered = [...byDomain.values()].sort((a, b) => prePoolScore(b) - prePoolScore(a));
    const pool = balancedPool(ordered);
    if (!pool.length) throw new Error("Discovery returned no usable candidates.");
    const pooled = new Set(pool);
    // Everything beyond the pool is logged too, so recall can always be measured.
    const unpooled = ordered.filter((candidate) => !pooled.has(candidate)).map((candidate) => ({
      domain: candidate.domain,
      title: candidate.title,
      strategies: [...candidate.strategies],
      channels: [...candidate.channels],
      bestPosition: candidate.bestPosition,
      prePoolScore: Math.round(prePoolScore(candidate)),
    }));
    await progress({ discoveredCount: pool.length, stage: "Checking duplicates" });

    /* ---- 4. dedupe against every prospect of this brand -------------------- */
    const partition = partitionDuplicates(pool, existing);
    const { fresh, knownIdentities, knownPhones } = partition;
    const seenPhones = new Map<string, string>();
    let duplicates = partition.duplicates.length;
    for (const { candidate, prospectId } of partition.duplicates) {
      line(candidate, {
        outcome: "DUPLICATE",
        discoveryScore: null,
        fitScore: null,
        fitConfidence: null,
        reason: "Already exists — resurfaced by this run; its evidence was not changed.",
        prospectId,
      });
    }

    /* ---- 5. homepages: a cheap discovery score, no model ------------------- */
    await progress({ duplicateCount: duplicates, stage: `Reading ${fresh.length} homepages` });
    const scored: { candidate: Candidate; home: FetchedPage; score: number }[] = [];
    await inBatches(fresh, HOMEPAGE_CONCURRENCY, async (candidate) => {
      const home = await fetchPage(candidate.url);
      if (!home) {
        line(candidate, { outcome: "UNREACHABLE", discoveryScore: null, fitScore: null, fitConfidence: null, reason: "Homepage could not be read." });
        return;
      }
      const result = discoveryScore(home, plan, candidate);
      if (!result.relevant) {
        line(candidate, {
          name: home.title,
          outcome: result.rejection ?? "IRRELEVANT",
          discoveryScore: result.score,
          fitScore: null,
          fitConfidence: null,
          reason:
            result.rejection === "MICRO_CARRIER"
              ? "The homepage states a very small fleet."
              : result.rejection === "NON_OPERATOR"
                ? "Federation, vendor or agency signals on the homepage."
                : "The homepage does not match the campaign.",
        });
        return;
      }
      scored.push({ candidate, home, score: result.score });
    });

    // Similar relevance: research first the company that can actually be called.
    // A research-order signal only; the fit score never sees it.
    scored.sort((a, b) => b.score + reachability(b) - (a.score + reachability(a)));
    const shortlist = scored.slice(0, MAX_SHORTLIST);
    const researchCount = Math.min(MAX_RESEARCHED, Math.max(run.requestedCount + 2, 8));
    const toResearch = shortlist.slice(0, researchCount);
    for (const { candidate, home, score } of [...scored.slice(researchCount)]) {
      line(candidate, {
        name: home.title,
        outcome: "NOT_SHORTLISTED",
        discoveryScore: score,
        fitScore: null,
        fitConfidence: null,
        reason: shortlist.some((entry) => entry.candidate === candidate)
          ? "Shortlisted, but beyond the research budget for this run."
          : "Lower discovery score than the shortlist.",
      });
    }

    /* ---- 6. research the shortlist: one model call per company ------------- */
    await progress({ stage: `Researching ${toResearch.length} companies` });
    let researched = 0;
    const researchedResults = await inBatches(toResearch, RESEARCH_CONCURRENCY, async ({ candidate, home, score }) => {
      try {
        return { candidate, score, result: await researchCompany(candidate, home, campaignInput) };
      } catch (error) {
        // One bad company never fails the run.
        line(candidate, { name: home.title, outcome: "FAILED", discoveryScore: score, fitScore: null, fitConfidence: null, reason: error instanceof Error ? error.message.slice(0, 160) : "Research failed" });
        return { candidate, score, result: null as ResearchResult | null };
      } finally {
        researched++;
        await progress({ researchedCount: researched });
      }
    });

    /* ---- 7. rank, dedupe by identity, keep the strong ones ----------------- */
    await progress({ stage: "Ranking" });
    const seenIdentities = new Set<string>();
    const qualified: { candidate: Candidate; score: number; result: ResearchResult }[] = [];
    const ranked = researchedResults
      .filter((entry): entry is { candidate: Candidate; score: number; result: ResearchResult } => Boolean(entry.result))
      .sort(
        (a, b) =>
          rankingScore(b.result) - rankingScore(a.result) ||
          ["LOW", "MEDIUM", "HIGH"].indexOf(b.result.fitConfidence) - ["LOW", "MEDIUM", "HIGH"].indexOf(a.result.fitConfidence),
      );

    for (const entry of ranked) {
      const { candidate, result, score } = entry;
      const base = {
        name: result.name,
        discoveryScore: score,
        fitScore: result.fitScore,
        fitConfidence: result.fitConfidence,
        coverage: Math.round(result.coverage * 100) / 100,
        rejections: result.rejections,
      };
      const key = identityKey(result.name, result.country);
      if (key && (knownIdentities.has(key) || seenIdentities.has(key))) {
        duplicates++;
        line(candidate, { ...base, outcome: "DUPLICATE", reason: "Already exists under another website.", prospectId: knownIdentities.get(key) });
        continue;
      }
      const phone = phoneKey(result.companyPhone);
      if (phone && (knownPhones.has(phone) || seenPhones.has(phone))) {
        duplicates++;
        line(candidate, { ...base, outcome: "DUPLICATE", reason: "Same company switchboard as an existing prospect.", prospectId: knownPhones.get(phone) });
        continue;
      }
      if (!meetsThreshold(result)) {
        line(candidate, { ...base, ...researchedOutcome(result) });
        continue;
      }
      if (qualified.length >= run.requestedCount) {
        line(candidate, { ...base, outcome: "BELOW_THRESHOLD", reason: "Qualified, but beyond the requested number." });
        continue;
      }
      if (key) seenIdentities.add(key);
      if (phone) seenPhones.set(phone, candidate.domain);
      qualified.push(entry);
    }

    /* ---- 8. persist: one transaction per prospect -------------------------- */
    await progress({ duplicateCount: duplicates, stage: "Saving qualified prospects" });
    let saved = 0;
    for (const { candidate, result, score } of qualified) {
      try {
        const now = new Date();
        const prospect = await prisma.$transaction(async (tx) => {
          const created = await tx.prospect.create({
            data: {
              campaignId: campaign.id,
              brandId: campaign.brandId,
              researchRunId: run.id,
              name: result.name,
              website: result.website,
              normalizedDomain: result.domain,
              country: result.country,
              city: result.city,
              industry: result.industry,
              description: result.description,
              employeeCount: result.employeeCount,
              fleetSize: result.fleetSize,
              revenue: result.revenue,
              linkedinUrl: result.linkedinUrl,
              companyPhone: result.companyPhone,
              companyPhoneSource: result.companyPhoneSource,
              companyPhoneSourceUrl: result.companyPhoneSourceUrl,
              companyEmail: result.companyEmail,
              contactPageUrl: result.contactPageUrl,
              activities: result.activities,
              locations: result.locations,
              fitScore: result.fitScore,
              fitConfidence: result.fitConfidence,
              fitExplanation: {
                factors: result.factors,
                confidenceNotes: result.confidenceNotes,
                coverage: result.coverage,
                strongestReason: result.strongestReason,
                source: "research",
                qualification: researchQualification(result, campaign.targetCompanySize),
              },
              researchStatus: "COMPLETE",
              researchedAt: now,
            },
          });
          if (result.evidence.length) {
            await tx.prospectEvidence.createMany({
              data: result.evidence.map((item) => ({
                prospectId: created.id,
                type: item.type,
                category: item.category,
                statement: item.statement,
                sourceUrl: item.sourceUrl,
                sourceName: item.sourceName,
                evidenceExcerpt: item.evidenceExcerpt,
                observedAt: item.type === "UNKNOWN" ? null : now,
                confidence: item.confidence,
                sourceQuality: item.sourceQuality,
              })),
            });
          }
          if (result.contacts.length) {
            await tx.prospectContact.createMany({
              data: result.contacts.map((contact, index) => ({
                prospectId: created.id,
                firstName: contact.firstName,
                lastName: contact.lastName,
                jobTitle: contact.jobTitle,
                decisionRole: contact.decisionRole as "UNKNOWN",
                email: contact.email,
                phone: contact.phone,
                sourceUrl: contact.sourceUrl,
                sourceName: contact.sourceName,
                // Ranked operations-first, so the first is the best entry point.
                isPrimary: index === 0,
                confidence: "MEDIUM",
              })),
            });
          }
          return created;
        });
        saved++;
        line(candidate, {
          name: result.name,
          outcome: "SAVED",
          discoveryScore: score,
          fitScore: result.fitScore,
          fitConfidence: result.fitConfidence,
          coverage: Math.round(result.coverage * 100) / 100,
          rejections: result.rejections,
          reason: result.strongestReason,
          prospectId: prospect.id,
        });
        await progress({ savedCount: saved });
      } catch (error) {
        line(candidate, { name: result.name, outcome: "FAILED", discoveryScore: score, fitScore: result.fitScore, fitConfidence: result.fitConfidence, reason: `Could not be saved: ${error instanceof Error ? error.message.slice(0, 120) : "unknown error"}` });
      }
    }

    /* ---- diagnostics -------------------------------------------------------- */
    const shortlistedDomains = new Set(shortlist.map((entry) => entry.candidate.domain));
    const researchedDomains = new Set(toResearch.map((entry) => entry.candidate.domain));
    const savedDomains = new Set(lines.filter((entry) => entry.outcome === "SAVED").map((entry) => entry.domain));
    const queryStats = diagnostics.map((diagnostic, index) => {
      const surfaced = pool.filter((candidate) => candidate.queryIndexes.has(index));
      return {
        ...diagnostic,
        shortlisted: surfaced.filter((candidate) => shortlistedDomains.has(candidate.domain)).length,
        researched: surfaced.filter((candidate) => researchedDomains.has(candidate.domain)).length,
        saved: surfaced.filter((candidate) => savedDomains.has(candidate.domain)).length,
      };
    });
    const byStrategy = Object.fromEntries(
      STRATEGIES.map((strategy) => {
        const surfaced = pool.filter((candidate) => candidate.strategies.has(strategy));
        const stats: StrategyStats = {
          queries: diagnostics.filter((diagnostic) => diagnostic.strategy === strategy).length,
          raw: diagnostics.filter((diagnostic) => diagnostic.strategy === strategy).reduce((sum, diagnostic) => sum + diagnostic.results, 0),
          unique: surfaced.length,
          shortlisted: surfaced.filter((candidate) => shortlistedDomains.has(candidate.domain)).length,
          researched: surfaced.filter((candidate) => researchedDomains.has(candidate.domain)).length,
          saved: surfaced.filter((candidate) => savedDomains.has(candidate.domain)).length,
        };
        return [strategy, stats];
      }),
    );

    const degraded = health.planned > 0 && health.failed / health.planned >= DEGRADED_RATIO;
    await progress({
      status: degraded ? "DEGRADED" : "COMPLETE",
      stage: saved ? `${saved} qualified prospect${saved === 1 ? "" : "s"} found` : "No prospect met the quality threshold",
      completedAt: new Date(),
      savedCount: saved,
      duplicateCount: duplicates,
      summary: {
        funnel: {
          raw,
          unique: byDomain.size,
          pool: pool.length,
          duplicates,
          homepagesRead: fresh.length,
          plausible: scored.length,
          shortlisted: shortlist.length,
          researched: toResearch.length,
          saved,
        },
        byStrategy,
        contactSignals: {
          mapsPhone: pool.filter((candidate) => candidate.phone).length,
          researched: {
            directPhone: ranked.filter((entry) => entry.result.contacts.some((contact) => contact.phone)).length,
            switchboard: ranked.filter((entry) => !entry.result.contacts.some((contact) => contact.phone) && entry.result.companyPhone).length,
            emailOnly: ranked.filter((entry) => !entry.result.contacts.some((contact) => contact.phone) && !entry.result.companyPhone && (entry.result.companyEmail || entry.result.contacts.some((contact) => contact.email))).length,
            none: ranked.filter((entry) => !entry.result.contacts.some((contact) => contact.phone || contact.email) && !entry.result.companyPhone && !entry.result.companyEmail).length,
          },
        },
        coverage: {
          areas: plan.areas.map((area) => `${area.name} (${area.country})`),
          coverageQueries: plan.queries.filter((query) => query.source === "COVERAGE").length,
          plannerQueries: plan.queries.filter((query) => query.source === "PLANNER").length,
          organicTasks: plan.queries.filter((query) => query.channels.includes("ORGANIC")).length,
          mapsTasks: plan.queries.filter((query) => query.channels.includes("MAPS")).length,
        },
        queries: queryStats,
        directories: directoryLog,
        candidates: lines,
        unpooled,
        channels: {
          organic: pool.filter((candidate) => candidate.channels.has("ORGANIC")).length,
          maps: pool.filter((candidate) => candidate.channels.has("MAPS")).length,
          listing: pool.filter((candidate) => candidate.channels.has("LISTING")).length,
        },
        rejectedClaims: ranked.reduce((sum, entry) => sum + entry.result.rejectedClaims, 0),
        sourcesNote:
          "Company facts come from each company's own website. Listing pages were used only to find company names and websites. Business registries were not queried: the Luxembourg, Belgian and French registries do not offer open programmatic access.",
      },
    });
  } catch (error) {
    // A global failure (planning, or search failing for every query) happens
    // before anything is persisted, so a failed run never leaves prospects.
    await progress({
      status: "FAILED",
      stage: "Failed",
      completedAt: new Date(),
      error: error instanceof Error ? error.message.slice(0, 300) : "Research failed",
      summary: { candidates: lines },
    }).catch(() => undefined);
  }
}

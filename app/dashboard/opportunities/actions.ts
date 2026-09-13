"use server";

import { requireSession } from "@/lib/session";

import { OpportunitySource, OpportunityStatus } from "@/lib/generated/prisma/enums";
import {
  generateLinkedInDrafts,
  generateOpportunities,
  hasSourceMaterial,
  type BrandContext,
  type GeneratedDraft,
} from "@/lib/openai";
import { getPrisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";

function refresh() {
  revalidatePath("/dashboard/opportunities");
}

function opportunityData(formData: FormData) {
  const brandId = String(formData.get("brandId") ?? "").trim();
  const title = String(formData.get("title") ?? "").trim();
  const description = String(formData.get("description") ?? "").trim();
  if (!brandId || !title) throw new Error("An opportunity needs a brand and a title.");

  const rawSource = String(formData.get("source") ?? OpportunitySource.MANUAL);
  const rawStatus = String(formData.get("status") ?? OpportunityStatus.NEW);
  if (!Object.values(OpportunitySource).includes(rawSource as OpportunitySource)) {
    throw new Error("Unknown opportunity source.");
  }
  if (!Object.values(OpportunityStatus).includes(rawStatus as OpportunityStatus)) {
    throw new Error("Unknown opportunity status.");
  }

  const rawScore = String(formData.get("score") ?? "").trim();
  const score = rawScore ? Number(rawScore) : null;
  if (score !== null && (!Number.isInteger(score) || score < 0 || score > 100)) {
    throw new Error("Score must be a whole number between 0 and 100.");
  }

  return {
    brandId,
    title,
    description,
    source: rawSource as OpportunitySource,
    status: rawStatus as OpportunityStatus,
    score,
  };
}

export async function createOpportunity(formData: FormData) {
  await requireSession();

  await getPrisma().opportunity.create({ data: opportunityData(formData) });
  refresh();
}

export async function updateOpportunity(
  opportunityId: string,
  formData: FormData,
) {
  await requireSession();

  await getPrisma().opportunity.update({
    where: { id: opportunityId },
    data: opportunityData(formData),
  });
  refresh();
}

export async function archiveOpportunity(opportunityId: string) {
  await requireSession();

  await getPrisma().opportunity.update({
    where: { id: opportunityId },
    data: { status: OpportunityStatus.ARCHIVED },
  });
  refresh();
}

export async function restoreOpportunity(opportunityId: string) {
  await requireSession();

  await getPrisma().opportunity.update({
    where: { id: opportunityId },
    data: { status: OpportunityStatus.NEW },
  });
  refresh();
}

export type DeleteOpportunityState = { status: "idle" | "error"; message: string };

/**
 * Permanent deletion. Content assets and proposed actions survive an
 * opportunity being deleted (the schema sets their link to null), but they
 * would lose the record of where they came from — so an opportunity that
 * produced anything is refused here and has to be archived instead. The SEO
 * brief is the opportunity's own output and goes with it.
 */
export async function deleteOpportunity(
  opportunityId: string,
  _prevState: DeleteOpportunityState,
  _formData: FormData,
): Promise<DeleteOpportunityState> {
  await requireSession();

  const prisma = getPrisma();
  const opportunity = await prisma.opportunity.findUnique({
    where: { id: opportunityId },
    select: {
      _count: { select: { contentAssets: true, proposedActions: true } },
    },
  });
  if (!opportunity) return { status: "error", message: "Opportunity not found." };

  if (
    opportunity._count.contentAssets > 0 ||
    opportunity._count.proposedActions > 0
  ) {
    return {
      status: "error",
      message:
        "This opportunity has linked content or actions. Archive it instead, or remove the linked outputs first.",
    };
  }

  await prisma.opportunity.delete({ where: { id: opportunityId } });
  refresh();
  return { status: "idle", message: "" };
}

/* -------------------------------------------------------------------------- */
/* Generation                                                                 */
/* -------------------------------------------------------------------------- */

export type GenerateState = {
  status: "idle" | "done" | "error";
  message: string;
};

/** Loose match so obvious restatements of an existing title are dropped. */
function normalizeTitle(value: string) {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

export async function generateOpportunitiesAction(
  _prevState: GenerateState,
  formData: FormData,
): Promise<GenerateState> {
  await requireSession();

  const brandId = String(formData.get("brandId") ?? "").trim();
  if (!brandId) return { status: "error", message: "Pick a brand first." };

  const prisma = getPrisma();

  try {
    const brand = await prisma.brand.findUnique({
      where: { id: brandId },
      include: {
        profile: true,
        audiences: { orderBy: { createdAt: "asc" } },
        voiceRules: { orderBy: { createdAt: "asc" } },
        observations: {
          where: { status: { not: "ARCHIVED" } },
          orderBy: { createdAt: "desc" },
          take: 30,
        },
        marketSignals: { orderBy: { observedAt: "desc" }, take: 20 },
        opportunities: { select: { title: true } },
      },
    });
    if (!brand) return { status: "error", message: "Brand not found." };

    const context: BrandContext = {
      brandName: brand.name,
      // The brand's current setting drives the output, not the old material.
      outputLanguage: brand.profile?.language?.trim() || "English",
      profile: brand.profile
        ? {
            mission: brand.profile.mission,
            manifesto: brand.profile.manifesto,
            positioning: brand.profile.positioning,
            valueProposition: brand.profile.valueProposition,
            voiceDescription: brand.profile.voiceDescription,
            language: brand.profile.language,
          }
        : null,
      audiences: brand.audiences.map((audience) => ({
        name: audience.name,
        description: audience.description,
        pains: audience.pains,
        motivations: audience.motivations,
        objections: audience.objections,
        vocabulary: audience.vocabulary,
      })),
      voiceRules: brand.voiceRules.map((rule) => ({
        type: rule.type,
        rule: rule.rule,
      })),
      observations: brand.observations.map((observation) => observation.content),
      marketSignals: brand.marketSignals.map((signal) => ({
        title: signal.title,
        summary: signal.summary,
        type: signal.type,
      })),
      existingOpportunityTitles: brand.opportunities.map((item) => item.title),
    };

    if (!hasSourceMaterial(context)) {
      return {
        status: "error",
        message:
          "Not enough brand data yet. Add a mission, an audience or an observation first.",
      };
    }

    const generated = await generateOpportunities(context);
    if (!generated.length) {
      return { status: "done", message: "The model returned no opportunity." };
    }

    const existing = new Set(context.existingOpportunityTitles.map(normalizeTitle));
    const fresh = generated.filter((item) => {
      const key = normalizeTitle(item.title);
      if (!key || existing.has(key)) return false;
      existing.add(key);
      return true;
    });

    if (!fresh.length) {
      return {
        status: "done",
        message: "Nothing new — every suggestion already exists.",
      };
    }

    await prisma.opportunity.createMany({
      data: fresh.map((item) => ({
        brandId,
        title: item.title,
        description: item.description,
        source: item.source as OpportunitySource,
        score: item.score,
        rationale: item.rationale,
      })),
    });

    refresh();
    const skipped = generated.length - fresh.length;
    return {
      status: "done",
      message:
        `Created ${fresh.length} opportunit${fresh.length === 1 ? "y" : "ies"}` +
        (skipped ? ` · ${skipped} skipped as duplicates.` : "."),
    };
  } catch (error) {
    return {
      status: "error",
      message: error instanceof Error ? error.message : "Generation failed.",
    };
  }
}

/* -------------------------------------------------------------------------- */
/* LinkedIn drafts                                                            */
/* -------------------------------------------------------------------------- */

export type DraftsState = {
  status: "idle" | "done" | "error";
  message: string;
  opportunityId: string | null;
  drafts: GeneratedDraft[];
};

const emptyDraftsState: DraftsState = {
  status: "idle",
  message: "",
  opportunityId: null,
  drafts: [],
};

export async function generateDraftsAction(
  _prevState: DraftsState,
  formData: FormData,
): Promise<DraftsState> {
  await requireSession();

  const opportunityId = String(formData.get("opportunityId") ?? "").trim();
  if (!opportunityId) {
    return { ...emptyDraftsState, status: "error", message: "Missing opportunity." };
  }

  try {
    const prisma = getPrisma();
    const opportunity = await prisma.opportunity.findUnique({
      where: { id: opportunityId },
      include: {
        brand: {
          include: {
            profile: true,
            audiences: { orderBy: { createdAt: "asc" } },
            voiceRules: { orderBy: { createdAt: "asc" } },
            goldenExamples: { orderBy: { createdAt: "asc" } },
            contentAssets: { orderBy: { createdAt: "desc" }, take: 10 },
          },
        },
      },
    });
    if (!opportunity) {
      return { ...emptyDraftsState, status: "error", message: "Opportunity not found." };
    }

    const { brand } = opportunity;
    const drafts = await generateLinkedInDrafts({
      brandName: brand.name,
      opportunity: {
        title: opportunity.title,
        description: opportunity.description,
        rationale: opportunity.rationale,
      },
      profile: brand.profile
        ? {
            mission: brand.profile.mission,
            manifesto: brand.profile.manifesto,
            positioning: brand.profile.positioning,
            valueProposition: brand.profile.valueProposition,
            voiceDescription: brand.profile.voiceDescription,
            language: brand.profile.language,
          }
        : null,
      audiences: brand.audiences.map((audience) => ({
        name: audience.name,
        description: audience.description,
        pains: audience.pains,
        motivations: audience.motivations,
        objections: audience.objections,
        vocabulary: audience.vocabulary,
      })),
      voiceRules: brand.voiceRules.map((rule) => ({
        type: rule.type,
        rule: rule.rule,
      })),
      goldenExamples: brand.goldenExamples.map((example) => ({
        title: example.title,
        content: example.content,
        notes: example.notes,
      })),
      recentDrafts: brand.contentAssets.map((asset) => ({
        title: asset.title,
        content: asset.content,
      })),
    });

    if (!drafts.length) {
      return {
        ...emptyDraftsState,
        status: "error",
        message: "The model returned no draft.",
        opportunityId,
      };
    }

    return {
      status: "done",
      message: `${drafts.length} draft${drafts.length === 1 ? "" : "s"} ready. Nothing is saved yet.`,
      opportunityId,
      drafts,
    };
  } catch (error) {
    return {
      ...emptyDraftsState,
      status: "error",
      opportunityId,
      message: error instanceof Error ? error.message : "Generation failed.",
    };
  }
}

export async function saveDraft(formData: FormData) {
  await requireSession();

  const opportunityId = String(formData.get("opportunityId") ?? "").trim();
  const content = String(formData.get("content") ?? "").trim();
  const title = String(formData.get("title") ?? "").trim();
  if (!opportunityId || !content) throw new Error("A draft needs content.");

  const prisma = getPrisma();
  const opportunity = await prisma.opportunity.findUniqueOrThrow({
    where: { id: opportunityId },
    select: { brandId: true },
  });

  await prisma.contentAsset.create({
    data: {
      brandId: opportunity.brandId,
      opportunityId,
      title: title || null,
      content,
    },
  });
  refresh();
}

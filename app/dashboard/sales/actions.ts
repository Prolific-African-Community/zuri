"use server";

import {
  ContactDecisionRole,
  EvidenceType,
  InteractionType,
  ProspectPriority,
  ProspectStatus,
  SalesCampaignStatus,
  SalesConfidence,
} from "@/lib/generated/prisma/enums";
import { Prisma } from "@/lib/generated/prisma/client";
import { getPrisma } from "@/lib/prisma";
import { normalizeDomain } from "@/lib/prospect-research";
import {
  CONFIDENCES,
  DECISION_ROLES,
  EVIDENCE_TYPES,
  INTERACTION_TYPES,
  PRIORITIES,
  PROSPECT_STATUSES,
  parseCriteria,
  parseList,
  readDate,
  readEnum,
  readInt,
  readText,
} from "@/lib/sales";
import { requireSession } from "@/lib/session";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

function refreshCampaign(campaignId: string) {
  revalidatePath("/dashboard/sales/campaigns");
  revalidatePath(`/dashboard/sales/campaigns/${campaignId}`);
  revalidatePath("/dashboard/sales/prospects");
}

function refreshProspect(prospectId: string, campaignId: string) {
  revalidatePath(`/dashboard/sales/prospects/${prospectId}`);
  refreshCampaign(campaignId);
}

/* -------------------------------------------------------------------------- */
/* Campaigns                                                                  */
/* -------------------------------------------------------------------------- */

function campaignData(formData: FormData) {
  const name = readText(formData, "name");
  const offer = readText(formData, "offer");
  if (!name) throw new Error("A campaign needs a name.");
  if (!offer) throw new Error("A campaign needs an offer.");

  return {
    name,
    offer,
    description: readText(formData, "description"),
    geography: parseList(formData.get("geography")),
    industries: parseList(formData.get("industries")),
    targetCompanySize: readText(formData, "targetCompanySize"),
    idealCustomerProfile: readText(formData, "idealCustomerProfile") ?? "",
    painPoints: parseList(formData.get("painPoints")),
    valueProposition: readText(formData, "valueProposition") ?? "",
    primaryAngle: readText(formData, "primaryAngle") ?? "",
    targetTicketMin: readInt(formData, "targetTicketMin"),
    targetTicketMax: readInt(formData, "targetTicketMax"),
    currency: readText(formData, "currency"),
    preferredProfile: parseList(formData.get("preferredProfile")),
    exclusions: parseList(formData.get("exclusions")),
    scoringCriteria: parseCriteria(formData.get("scoringCriteria")),
  };
}

export async function createCampaign(formData: FormData) {
  await requireSession();

  const brandId = readText(formData, "brandId");
  if (!brandId) throw new Error("Pick the brand this campaign sells for.");
  const brand = await getPrisma().brand.findUnique({ where: { id: brandId } });
  if (!brand) throw new Error("Brand not found.");

  const campaign = await getPrisma().salesCampaign.create({
    data: { brandId, ...campaignData(formData) },
  });
  refreshCampaign(campaign.id);
  redirect(`/dashboard/sales/campaigns/${campaign.id}`);
}

/** The Brand is never editable: moving a campaign would move its prospects. */
export async function updateCampaign(campaignId: string, formData: FormData) {
  await requireSession();

  await getPrisma().salesCampaign.update({
    where: { id: campaignId },
    data: campaignData(formData),
  });
  refreshCampaign(campaignId);
}

export async function setCampaignStatus(
  campaignId: string,
  status: SalesCampaignStatus,
) {
  await requireSession();

  await getPrisma().salesCampaign.update({
    where: { id: campaignId },
    data: { status },
  });
  refreshCampaign(campaignId);
}

export async function archiveCampaign(campaignId: string) {
  await setCampaignStatus(campaignId, SalesCampaignStatus.ARCHIVED);
}

export async function restoreCampaign(campaignId: string) {
  await setCampaignStatus(campaignId, SalesCampaignStatus.ACTIVE);
}

/* -------------------------------------------------------------------------- */
/* Prospects                                                                  */
/* -------------------------------------------------------------------------- */

function prospectData(formData: FormData) {
  const name = readText(formData, "name");
  if (!name) throw new Error("A prospect needs a company name.");

  return {
    name,
    website: readText(formData, "website"),
    country: readText(formData, "country"),
    city: readText(formData, "city"),
    industry: readText(formData, "industry"),
    description: readText(formData, "description"),
    employeeCount: readInt(formData, "employeeCount"),
    revenue: readText(formData, "revenue"),
    fleetSize: readInt(formData, "fleetSize"),
    activities: parseList(formData.get("activities")),
    locations: parseList(formData.get("locations")),
    linkedinUrl: readText(formData, "linkedinUrl"),
    companyPhone: readText(formData, "companyPhone"),
    companyEmail: readText(formData, "companyEmail"),
    contactPageUrl: readText(formData, "contactPageUrl"),
    // Kept in step with the website so research never re-creates this company.
    normalizedDomain: normalizeDomain(readText(formData, "website")),
    owner: readText(formData, "owner"),
    notes: readText(formData, "notes"),
    priority: readEnum(formData, "priority", PRIORITIES, ProspectPriority.MEDIUM),
  };
}

/** The Brand comes from the campaign, never from the form. */
export async function createProspect(formData: FormData) {
  await requireSession();

  const campaignId = readText(formData, "campaignId");
  if (!campaignId) throw new Error("Pick a campaign.");

  const prisma = getPrisma();
  const campaign = await prisma.salesCampaign.findUnique({ where: { id: campaignId } });
  if (!campaign) throw new Error("Campaign not found.");
  if (campaign.status === SalesCampaignStatus.ARCHIVED) {
    throw new Error("This campaign is archived. Restore it before adding prospects.");
  }

  const prospect = await prisma.prospect.create({
    data: {
      campaignId: campaign.id,
      brandId: campaign.brandId,
      ...prospectData(formData),
    },
  });
  refreshCampaign(campaign.id);
  redirect(`/dashboard/sales/prospects/${prospect.id}`);
}

export async function updateProspect(prospectId: string, formData: FormData) {
  await requireSession();

  const data = prospectData(formData);
  const before = await getPrisma().prospect.findUnique({ where: { id: prospectId }, select: { companyPhone: true } });
  // A phone typed by hand is recorded as such; an unchanged one keeps its web provenance.
  const phoneChanged = (before?.companyPhone ?? null) !== (data.companyPhone ?? null);
  const prospect = await getPrisma().prospect.update({
    where: { id: prospectId },
    data: phoneChanged
      ? { ...data, companyPhoneSource: data.companyPhone ? "MANUAL" : null, companyPhoneSourceUrl: null }
      : data,
  });
  refreshProspect(prospect.id, prospect.campaignId);
}

export async function updateDigitalMaturity(prospectId: string, formData: FormData) {
  await requireSession();

  const score = readInt(formData, "digitalMaturityScore");
  if (score !== null && (score < 0 || score > 100)) {
    throw new Error("Digital maturity is scored from 0 to 100.");
  }

  const prospect = await getPrisma().prospect.update({
    where: { id: prospectId },
    data: {
      digitalMaturityScore: score,
      detectedTools: parseList(formData.get("detectedTools")),
      tms: readText(formData, "tms"),
      erp: readText(formData, "erp"),
      crm: readText(formData, "crm"),
      telematics: readText(formData, "telematics"),
      clientPortal: readText(formData, "clientPortal"),
      driverApp: readText(formData, "driverApp"),
      visibleAutomations: parseList(formData.get("visibleAutomations")),
    },
  });
  refreshProspect(prospect.id, prospect.campaignId);
}

export async function updateQualification(prospectId: string, formData: FormData) {
  await requireSession();

  const fitScore = readInt(formData, "fitScore");
  if (fitScore !== null && (fitScore < 0 || fitScore > 100)) {
    throw new Error("Fit is scored from 0 to 100.");
  }
  const explanation = readText(formData, "fitExplanation");

  const prospect = await getPrisma().prospect.update({
    where: { id: prospectId },
    data: {
      fitScore,
      fitConfidence: readEnum(formData, "fitConfidence", CONFIDENCES, SalesConfidence.LOW),
      // Manual entry is stored as plain text; the research engine will write
      // structured explanations into the same field.
      fitExplanation: explanation ? { text: explanation } : Prisma.DbNull,
    },
  });
  refreshProspect(prospect.id, prospect.campaignId);
}

/** Pipeline status and the next step, changed together or apart. */
export async function updatePipeline(prospectId: string, formData: FormData) {
  await requireSession();

  const prospect = await getPrisma().prospect.update({
    where: { id: prospectId },
    data: {
      status: readEnum(formData, "status", PROSPECT_STATUSES, ProspectStatus.DISCOVERED),
      nextAction: readText(formData, "nextAction"),
      nextActionAt: readDate(formData, "nextActionAt"),
    },
  });
  refreshProspect(prospect.id, prospect.campaignId);
}

/**
 * A prospect with recorded interactions keeps its history: it can be
 * disqualified, never erased.
 */
export async function deleteProspect(prospectId: string) {
  await requireSession();

  const prisma = getPrisma();
  const prospect = await prisma.prospect.findUnique({
    where: { id: prospectId },
    select: { campaignId: true, _count: { select: { interactions: true } } },
  });
  if (!prospect) throw new Error("Prospect not found.");
  if (prospect._count.interactions > 0) {
    throw new Error(
      "This prospect has recorded interactions and cannot be deleted. Mark it disqualified instead.",
    );
  }

  await prisma.prospect.delete({ where: { id: prospectId } });
  refreshCampaign(prospect.campaignId);
  redirect(`/dashboard/sales/campaigns/${prospect.campaignId}`);
}

/* -------------------------------------------------------------------------- */
/* Evidence                                                                   */
/* -------------------------------------------------------------------------- */

function evidenceData(formData: FormData) {
  const statement = readText(formData, "statement");
  const category = readText(formData, "category");
  if (!statement) throw new Error("Evidence needs a statement.");
  if (!category) throw new Error("Evidence needs a category.");

  return {
    type: readEnum(formData, "type", EVIDENCE_TYPES, EvidenceType.UNKNOWN),
    category,
    statement,
    sourceUrl: readText(formData, "sourceUrl"),
    sourceName: readText(formData, "sourceName"),
    evidenceExcerpt: readText(formData, "evidenceExcerpt"),
    observedAt: readDate(formData, "observedAt"),
    confidence: readEnum(formData, "confidence", CONFIDENCES, SalesConfidence.MEDIUM),
  };
}

async function prospectRef(prospectId: string) {
  const prospect = await getPrisma().prospect.findUnique({
    where: { id: prospectId },
    select: { id: true, campaignId: true },
  });
  if (!prospect) throw new Error("Prospect not found.");
  return prospect;
}

export async function addEvidence(prospectId: string, formData: FormData) {
  await requireSession();

  const prospect = await prospectRef(prospectId);
  await getPrisma().prospectEvidence.create({
    data: { prospectId: prospect.id, ...evidenceData(formData) },
  });
  refreshProspect(prospect.id, prospect.campaignId);
}

/** Scoped to the prospect so an id from elsewhere can never be edited here. */
export async function updateEvidence(
  prospectId: string,
  evidenceId: string,
  formData: FormData,
) {
  await requireSession();

  const prospect = await prospectRef(prospectId);
  const { count } = await getPrisma().prospectEvidence.updateMany({
    where: { id: evidenceId, prospectId: prospect.id },
    data: evidenceData(formData),
  });
  if (!count) throw new Error("Evidence not found on this prospect.");
  refreshProspect(prospect.id, prospect.campaignId);
}

export async function removeEvidence(prospectId: string, evidenceId: string) {
  await requireSession();

  const prospect = await prospectRef(prospectId);
  await getPrisma().prospectEvidence.deleteMany({
    where: { id: evidenceId, prospectId: prospect.id },
  });
  refreshProspect(prospect.id, prospect.campaignId);
}

/* -------------------------------------------------------------------------- */
/* Contacts                                                                   */
/* -------------------------------------------------------------------------- */

function contactData(formData: FormData) {
  const data = {
    firstName: readText(formData, "firstName"),
    lastName: readText(formData, "lastName"),
    jobTitle: readText(formData, "jobTitle"),
    seniority: readText(formData, "seniority"),
    decisionRole: readEnum(
      formData,
      "decisionRole",
      DECISION_ROLES,
      ContactDecisionRole.UNKNOWN,
    ),
    phone: readText(formData, "phone"),
    mobile: readText(formData, "mobile"),
    email: readText(formData, "email"),
    linkedinUrl: readText(formData, "linkedinUrl"),
    sourceUrl: readText(formData, "sourceUrl"),
    sourceName: readText(formData, "sourceName"),
    confidence: readEnum(formData, "confidence", CONFIDENCES, SalesConfidence.MEDIUM),
  };
  if (!data.firstName && !data.lastName && !data.jobTitle) {
    throw new Error("A contact needs at least a name or a job title.");
  }
  return data;
}

export async function addContact(prospectId: string, formData: FormData) {
  await requireSession();

  const prospect = await prospectRef(prospectId);
  const prisma = getPrisma();
  // The first contact on a prospect is its primary one until told otherwise.
  const existing = await prisma.prospectContact.count({ where: { prospectId } });
  await prisma.prospectContact.create({
    data: { prospectId: prospect.id, isPrimary: existing === 0, ...contactData(formData) },
  });
  refreshProspect(prospect.id, prospect.campaignId);
}

export async function updateContact(
  prospectId: string,
  contactId: string,
  formData: FormData,
) {
  await requireSession();

  const prospect = await prospectRef(prospectId);
  const { count } = await getPrisma().prospectContact.updateMany({
    where: { id: contactId, prospectId: prospect.id },
    data: contactData(formData),
  });
  if (!count) throw new Error("Contact not found on this prospect.");
  refreshProspect(prospect.id, prospect.campaignId);
}

/** Interactions that named this contact keep their note; the link is cleared. */
export async function removeContact(prospectId: string, contactId: string) {
  await requireSession();

  const prospect = await prospectRef(prospectId);
  await getPrisma().prospectContact.deleteMany({
    where: { id: contactId, prospectId: prospect.id },
  });
  refreshProspect(prospect.id, prospect.campaignId);
}

export async function setPrimaryContact(prospectId: string, contactId: string) {
  await requireSession();

  const prospect = await prospectRef(prospectId);
  const prisma = getPrisma();
  await prisma.$transaction([
    prisma.prospectContact.updateMany({
      where: { prospectId: prospect.id },
      data: { isPrimary: false },
    }),
    prisma.prospectContact.updateMany({
      where: { id: contactId, prospectId: prospect.id },
      data: { isPrimary: true },
    }),
  ]);
  refreshProspect(prospect.id, prospect.campaignId);
}

/* -------------------------------------------------------------------------- */
/* Interactions                                                               */
/* -------------------------------------------------------------------------- */

/**
 * A manual note. It records the pipeline move it caused, so the history reads
 * correctly even after the status changes again.
 */
export async function addInteraction(prospectId: string, formData: FormData) {
  await requireSession();

  const rawNote = readText(formData, "rawNote");
  if (!rawNote) throw new Error("Write what happened.");

  const prisma = getPrisma();
  const prospect = await prisma.prospect.findUnique({ where: { id: prospectId } });
  if (!prospect) throw new Error("Prospect not found.");

  const contactId = readText(formData, "contactId");
  if (contactId) {
    const contact = await prisma.prospectContact.findFirst({
      where: { id: contactId, prospectId: prospect.id },
    });
    if (!contact) throw new Error("That contact does not belong to this prospect.");
  }

  const type = readEnum(formData, "type", INTERACTION_TYPES, InteractionType.NOTE);
  const occurredAt = readDate(formData, "occurredAt") ?? new Date();
  const rawStatus = String(formData.get("resultingStatus") ?? "");
  const resultingStatus = (PROSPECT_STATUSES as readonly string[]).includes(rawStatus)
    ? (rawStatus as ProspectStatus)
    : null;
  const nextAction = readText(formData, "nextAction");
  const nextActionAt = readDate(formData, "nextActionAt");

  await prisma.$transaction([
    prisma.prospectInteraction.create({
      data: {
        prospectId: prospect.id,
        contactId,
        type,
        occurredAt,
        rawNote,
        previousStatus: prospect.status,
        resultingStatus,
        nextAction,
        nextActionAt,
      },
    }),
    prisma.prospect.update({
      where: { id: prospect.id },
      data: {
        ...(resultingStatus ? { status: resultingStatus } : {}),
        // A note to self is not contact with the company.
        ...(type !== InteractionType.NOTE ? { lastContactAt: occurredAt } : {}),
        ...(nextAction || nextActionAt ? { nextAction, nextActionAt } : {}),
      },
    }),
  ]);
  refreshProspect(prospect.id, prospect.campaignId);
}

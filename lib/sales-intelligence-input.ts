import { getPrisma } from "@/lib/prisma";
import type { IntelligenceInput } from "@/lib/sales-intelligence";

/**
 * Everything the brief is built from, loaded in one place so the generator and
 * the page's staleness check always hash the same thing.
 */
export async function loadIntelligenceInput(
  prospectId: string,
): Promise<IntelligenceInput | null> {
  const prospect = await getPrisma().prospect.findUnique({
    where: { id: prospectId },
    include: {
      brand: {
        include: { profile: true, voiceRules: { orderBy: { createdAt: "asc" } } },
      },
      campaign: true,
      // Superseded and resolved statements are history: they never drive a
      // score, a brief, or the fingerprint that says a brief is stale.
      evidence: {
        where: { supersededAt: null, resolvedAt: null },
        orderBy: { createdAt: "asc" },
      },
      contacts: { orderBy: [{ isPrimary: "desc" }, { createdAt: "asc" }] },
      interactions: { orderBy: { occurredAt: "asc" } },
    },
  });
  if (!prospect) return null;

  const { brand, campaign } = prospect;

  return {
    brand: {
      name: brand.name,
      language: brand.profile?.language ?? "",
      positioning: brand.profile?.positioning ?? "",
      valueProposition: brand.profile?.valueProposition ?? "",
      voiceDescription: brand.profile?.voiceDescription ?? "",
      voiceRules: brand.voiceRules.map((rule) => ({ type: rule.type, rule: rule.rule })),
    },
    campaign: {
      name: campaign.name,
      offer: campaign.offer,
      description: campaign.description,
      geography: campaign.geography,
      industries: campaign.industries,
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
    },
    prospect: {
      name: prospect.name,
      website: prospect.website,
      country: prospect.country,
      city: prospect.city,
      industry: prospect.industry,
      description: prospect.description,
      employeeCount: prospect.employeeCount,
      revenue: prospect.revenue,
      fleetSize: prospect.fleetSize,
      activities: prospect.activities,
      locations: prospect.locations,
      digitalMaturityScore: prospect.digitalMaturityScore,
      detectedTools: prospect.detectedTools,
      tms: prospect.tms,
      erp: prospect.erp,
      crm: prospect.crm,
      telematics: prospect.telematics,
      clientPortal: prospect.clientPortal,
      driverApp: prospect.driverApp,
      visibleAutomations: prospect.visibleAutomations,
      priority: prospect.priority,
      status: prospect.status,
      nextAction: prospect.nextAction,
      nextActionAt: prospect.nextActionAt,
      lastContactAt: prospect.lastContactAt,
      notes: prospect.notes,
    },
    evidence: prospect.evidence.map((item) => ({
      id: item.id,
      type: item.type,
      category: item.category,
      statement: item.statement,
      sourceName: item.sourceName,
      sourceUrl: item.sourceUrl,
      confidence: item.confidence,
    })),
    // Contact details are summarised: the model needs to know a person is
    // reachable, never their phone number or email.
    contacts: prospect.contacts.map((contact) => ({
      id: contact.id,
      firstName: contact.firstName,
      lastName: contact.lastName,
      jobTitle: contact.jobTitle,
      seniority: contact.seniority,
      decisionRole: contact.decisionRole,
      isPrimary: contact.isPrimary,
      hasEmail: Boolean(contact.email),
      hasPhone: Boolean(contact.phone || contact.mobile),
    })),
    interactions: prospect.interactions.map((item) => ({
      type: item.type,
      occurredAt: item.occurredAt,
      rawNote: item.rawNote,
      contactId: item.contactId,
      previousStatus: item.previousStatus,
      resultingStatus: item.resultingStatus,
      nextAction: item.nextAction,
    })),
  };
}

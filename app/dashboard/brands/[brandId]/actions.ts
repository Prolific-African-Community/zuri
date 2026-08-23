"use server";

import { optionalText, textList } from "@/lib/brands";
import { VoiceRuleType } from "@/lib/generated/prisma/enums";
import { getPrisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";

function refresh(brandId: string) {
  revalidatePath(`/dashboard/brands/${brandId}`);
}

function text(formData: FormData, key: string) {
  return String(formData.get(key) ?? "").trim();
}

/* -------------------------------------------------------------------------- */
/* Brand profile                                                              */
/* -------------------------------------------------------------------------- */

export async function updateBrandProfile(brandId: string, formData: FormData) {
  const mission = text(formData, "mission");
  if (!mission) throw new Error("Mission is required.");

  const profile = {
    mission,
    manifesto: text(formData, "manifesto"),
    positioning: text(formData, "positioning"),
    valueProposition: text(formData, "valueProposition"),
    voiceDescription: text(formData, "voiceDescription"),
    language: text(formData, "language"),
  };

  await getPrisma().brandProfile.upsert({
    where: { brandId },
    update: profile,
    create: { brandId, ...profile },
  });

  revalidatePath("/dashboard");
  refresh(brandId);
}

/* -------------------------------------------------------------------------- */
/* Audiences                                                                  */
/* -------------------------------------------------------------------------- */

function audienceData(formData: FormData) {
  const name = text(formData, "name");
  if (!name) throw new Error("Audience name is required.");
  return {
    name,
    description: text(formData, "description"),
    pains: textList(formData.get("pains")),
    motivations: textList(formData.get("motivations")),
    objections: textList(formData.get("objections")),
    vocabulary: textList(formData.get("vocabulary")),
  };
}

export async function createAudience(brandId: string, formData: FormData) {
  await getPrisma().audience.create({
    data: { brandId, ...audienceData(formData) },
  });
  refresh(brandId);
}

export async function updateAudience(
  brandId: string,
  audienceId: string,
  formData: FormData,
) {
  await getPrisma().audience.update({
    where: { id: audienceId },
    data: audienceData(formData),
  });
  refresh(brandId);
}

export async function deleteAudience(brandId: string, audienceId: string) {
  await getPrisma().audience.delete({ where: { id: audienceId } });
  refresh(brandId);
}

/* -------------------------------------------------------------------------- */
/* Voice rules                                                                */
/* -------------------------------------------------------------------------- */

function voiceRuleType(formData: FormData) {
  const raw = text(formData, "type");
  if (!Object.values(VoiceRuleType).includes(raw as VoiceRuleType)) {
    throw new Error("A voice rule must be a DO or a DONT.");
  }
  return raw as VoiceRuleType;
}

export async function createVoiceRule(brandId: string, formData: FormData) {
  const rule = text(formData, "rule");
  if (!rule) throw new Error("A voice rule needs content.");

  await getPrisma().voiceRule.create({
    data: { brandId, type: voiceRuleType(formData), rule },
  });
  refresh(brandId);
}

export async function updateVoiceRule(
  brandId: string,
  voiceRuleId: string,
  formData: FormData,
) {
  const rule = text(formData, "rule");
  if (!rule) throw new Error("A voice rule needs content.");

  await getPrisma().voiceRule.update({
    where: { id: voiceRuleId },
    data: { type: voiceRuleType(formData), rule },
  });
  refresh(brandId);
}

export async function deleteVoiceRule(brandId: string, voiceRuleId: string) {
  await getPrisma().voiceRule.delete({ where: { id: voiceRuleId } });
  refresh(brandId);
}

/* -------------------------------------------------------------------------- */
/* Golden examples                                                            */
/* -------------------------------------------------------------------------- */

function goldenExampleData(formData: FormData) {
  const content = text(formData, "content");
  if (!content) throw new Error("A golden example needs content.");
  return {
    title: optionalText(formData.get("title")),
    content,
    notes: optionalText(formData.get("notes")),
  };
}

export async function createGoldenExample(brandId: string, formData: FormData) {
  await getPrisma().goldenExample.create({
    data: { brandId, ...goldenExampleData(formData) },
  });
  refresh(brandId);
}

export async function updateGoldenExample(
  brandId: string,
  goldenExampleId: string,
  formData: FormData,
) {
  await getPrisma().goldenExample.update({
    where: { id: goldenExampleId },
    data: goldenExampleData(formData),
  });
  refresh(brandId);
}

export async function deleteGoldenExample(
  brandId: string,
  goldenExampleId: string,
) {
  await getPrisma().goldenExample.delete({ where: { id: goldenExampleId } });
  refresh(brandId);
}

/* -------------------------------------------------------------------------- */
/* Competitors                                                                */
/* -------------------------------------------------------------------------- */

function competitorData(formData: FormData) {
  const name = text(formData, "name");
  const websiteUrl = text(formData, "websiteUrl");
  if (!name || !websiteUrl) throw new Error("A competitor needs a name and a URL.");
  return {
    name,
    websiteUrl,
    description: optionalText(formData.get("description")),
  };
}

export async function createCompetitor(brandId: string, formData: FormData) {
  await getPrisma().competitor.create({
    data: { brandId, ...competitorData(formData) },
  });
  refresh(brandId);
}

export async function updateCompetitor(
  brandId: string,
  competitorId: string,
  formData: FormData,
) {
  await getPrisma().competitor.update({
    where: { id: competitorId },
    data: competitorData(formData),
  });
  refresh(brandId);
}

export async function deleteCompetitor(brandId: string, competitorId: string) {
  await getPrisma().competitor.delete({ where: { id: competitorId } });
  refresh(brandId);
}

import "dotenv/config";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../lib/generated/prisma/client";
import { VoiceRuleType } from "../lib/generated/prisma/enums";

const connectionString = process.env.DATABASE_URL;
if (!connectionString) throw new Error("DATABASE_URL is required to seed the database.");

const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString }) });

/**
 * Seeded rows carry deterministic ids so re-running the seed updates them in
 * place instead of duplicating, and leaves anything created in the app alone.
 */
const proliquidProfile = {
  mission: "Make financial information clear, reliable and easier to act on.",
  positioning:
    "AI-native financial infrastructure designed to reduce fragmentation, manual repetition and unnecessary complexity across financial operations.",
  valueProposition:
    "Technology should absorb financial complexity so people can focus on understanding, deciding and acting.",
  voiceDescription:
    "Direct, intelligent, human, observational and occasionally provocative. Never generic, corporate or overloaded with AI buzzwords.",
  language: "en",
};

const proliquidVoiceRules = [
  { id: "proliquid-do-1", type: VoiceRuleType.DO, rule: "Start from real financial situations and frustrations." },
  { id: "proliquid-do-2", type: VoiceRuleType.DO, rule: "Prefer concrete language." },
  { id: "proliquid-do-3", type: VoiceRuleType.DO, rule: "Challenge practices the industry has normalised." },
  { id: "proliquid-do-4", type: VoiceRuleType.DO, rule: "Vary hooks, structures and endings." },
  { id: "proliquid-do-5", type: VoiceRuleType.DO, rule: "Prioritise trust, traceability and clarity." },
  { id: "proliquid-dont-1", type: VoiceRuleType.DONT, rule: "Do not systematically end with “Proliquid — Make value flow.”" },
  { id: "proliquid-dont-2", type: VoiceRuleType.DONT, rule: "Do not use forced engagement questions." },
  { id: "proliquid-dont-3", type: VoiceRuleType.DONT, rule: "Do not overuse “AI”." },
  { id: "proliquid-dont-4", type: VoiceRuleType.DONT, rule: "Do not write generic SaaS copy." },
  { id: "proliquid-dont-5", type: VoiceRuleType.DONT, rule: "Do not repeat the same hook structure." },
];

const proliquidGoldenExamples = [
  { id: "proliquid-golden-1", content: "Which Excel is the final one?" },
  { id: "proliquid-golden-2", content: "Ask Sarah." },
  {
    id: "proliquid-golden-3",
    content: "€50,000,000 of assets... one spreadsheet nobody is allowed to break.",
  },
];

async function main() {
  const workspace = await prisma.workspace.upsert({
    where: { id: "default-workspace" },
    update: { name: "Default Workspace" },
    create: { id: "default-workspace", name: "Default Workspace" },
  });

  const brand = await prisma.brand.upsert({
    where: { workspaceId_slug: { workspaceId: workspace.id, slug: "proliquid" } },
    update: { name: "Proliquid", websiteUrl: null },
    create: { workspaceId: workspace.id, name: "Proliquid", slug: "proliquid" },
  });

  // `manifesto` is deliberately absent from the update: whatever has been
  // written in the app is preserved across seeds.
  await prisma.brandProfile.upsert({
    where: { brandId: brand.id },
    update: proliquidProfile,
    create: { brandId: brand.id, ...proliquidProfile },
  });

  for (const rule of proliquidVoiceRules) {
    await prisma.voiceRule.upsert({
      where: { id: rule.id },
      update: { type: rule.type, rule: rule.rule },
      create: { id: rule.id, brandId: brand.id, type: rule.type, rule: rule.rule },
    });
  }

  for (const example of proliquidGoldenExamples) {
    await prisma.goldenExample.upsert({
      where: { id: example.id },
      update: { content: example.content },
      create: { id: example.id, brandId: brand.id, content: example.content },
    });
  }
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (error: unknown) => {
    console.error(error);
    await prisma.$disconnect();
    process.exit(1);
  });

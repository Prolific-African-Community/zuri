/**
 * Seeds the first Sales campaign. Idempotent: re-running updates the same
 * campaign instead of creating a second one. Prospects are deliberately not
 * seeded — they come from the research validation run.
 */
import "dotenv/config";
import { getPrisma } from "@/lib/prisma";

const prisma = getPrisma();
const NAME = "Transporteurs - NovoTralux";

const brand = await prisma.brand.findFirst({ where: { name: "Prolific" } });
if (!brand) throw new Error("Brand Prolific not found.");

const data = {
  name: NAME,
  offer: "Custom transport operations platform",
  geography: ["Luxembourg", "Belgium", "Grand Est"],
  industries: ["Road transport", "Logistics"],
  targetCompanySize: "30–200 vehicles",
  preferredProfile: [
    "Operational complexity",
    "Multiple vehicle/trailer types",
    "Several dispatchers",
    "Multiple sites/activities",
    "Fragmented digital tooling",
    "No apparent modern end-to-end TMS",
  ],
  exclusions: [
    "Micro carriers",
    "Strongly digitised groups whose stack already covers the workflow",
    "Companies with clearly insufficient budget",
  ],
};

const existing = await prisma.salesCampaign.findFirst({
  where: { brandId: brand.id, name: NAME },
});

const campaign = existing
  ? await prisma.salesCampaign.update({ where: { id: existing.id }, data })
  : await prisma.salesCampaign.create({ data: { brandId: brand.id, ...data } });

console.log(existing ? "UPDATED" : "CREATED", campaign.id, "brand", brand.name);
console.log("PROSPECTS", await prisma.prospect.count({ where: { campaignId: campaign.id } }));

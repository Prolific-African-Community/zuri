import { AudiencesSection } from "@/components/brand/audiences-section";
import { CompetitorsSection } from "@/components/brand/competitors-section";
import { GoldenExamplesSection } from "@/components/brand/golden-examples-section";
import { BrandProfileForm } from "@/components/brand/profile-form";
import { VoiceRulesSection } from "@/components/brand/voice-rules-section";
import { BrandForm } from "@/components/brand-form";
import { Badge } from "@/components/ui/badge";
import { Page, Panel, Section } from "@/components/ui/layout";
import { getPrisma } from "@/lib/prisma";
import Link from "next/link";
import { notFound } from "next/navigation";
import { updateBrand } from "../actions";
import { updateBrandProfile } from "./actions";

export const dynamic = "force-dynamic";

export default async function BrandPage({ params }: PageProps<"/dashboard/brands/[brandId]">) {
  const { brandId } = await params;
  const brand = await getPrisma().brand.findUnique({
    where: { id: brandId },
    include: {
      profile: true,
      workspace: { select: { name: true } },
      audiences: { orderBy: { createdAt: "asc" } },
      voiceRules: { orderBy: { createdAt: "asc" } },
      goldenExamples: { orderBy: { createdAt: "asc" } },
      competitors: { orderBy: { createdAt: "asc" } },
    },
  });
  if (!brand) notFound();

  return (
    <Page width="narrow">
      <Link
        href="/dashboard/brands"
        className="type-meta group inline-flex items-center gap-1.5 rounded-md transition-colors hover:text-ink"
      >
        <span
          aria-hidden
          className="transition-transform duration-200 group-hover:-translate-x-0.5"
        >
          ←
        </span>
        Brands
      </Link>

      <header className="mt-6 flex flex-wrap items-end justify-between gap-4">
        <div className="min-w-0">
          <p className="type-label">{brand.workspace.name}</p>
          <h1 className="type-page-title mt-3 truncate">{brand.name}</h1>
          <p className="type-meta mt-2">/{brand.slug}</p>
        </div>
        <Badge tone={brand.status === "ACTIVE" ? "accent" : "neutral"}>
          {brand.status.toLowerCase()}
        </Badge>
      </header>

      <Section title="Fundamental information" className="mt-12">
        <Panel>
          <BrandForm
            action={updateBrand.bind(null, brand.id)}
            brand={brand}
            submitLabel="Save changes"
            showMission={false}
          />
        </Panel>
      </Section>

      <Section
        title="Brand profile"
        hint="what this brand stands for"
      >
        <Panel>
          <BrandProfileForm
            action={updateBrandProfile.bind(null, brand.id)}
            profile={brand.profile}
          />
        </Panel>
      </Section>

      <Section
        title="Audiences"
        hint={
          brand.audiences.length === 1
            ? "1 audience"
            : `${brand.audiences.length} audiences`
        }
      >
        <AudiencesSection brandId={brand.id} audiences={brand.audiences} />
      </Section>

      <Section
        title="Voice rules"
        hint={
          brand.voiceRules.length === 1
            ? "1 rule"
            : `${brand.voiceRules.length} rules`
        }
      >
        <VoiceRulesSection brandId={brand.id} voiceRules={brand.voiceRules} />
      </Section>

      <Section
        title="Competitors"
        hint={
          brand.competitors.length === 1
            ? "1 competitor"
            : `${brand.competitors.length} competitors`
        }
      >
        <CompetitorsSection
          brandId={brand.id}
          competitors={brand.competitors}
        />
      </Section>

      <Section
        title="Golden examples"
        hint={
          brand.goldenExamples.length === 1
            ? "1 example"
            : `${brand.goldenExamples.length} examples`
        }
      >
        <GoldenExamplesSection
          brandId={brand.id}
          goldenExamples={brand.goldenExamples}
        />
      </Section>
    </Page>
  );
}

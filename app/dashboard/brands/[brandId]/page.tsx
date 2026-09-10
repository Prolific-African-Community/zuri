import { AudiencesSection } from "@/components/brand/audiences-section";
import { CompetitorsSection } from "@/components/brand/competitors-section";
import { GoldenExamplesSection } from "@/components/brand/golden-examples-section";
import { BrandProfileForm } from "@/components/brand/profile-form";
import { VoiceRulesSection } from "@/components/brand/voice-rules-section";
import { BrandForm } from "@/components/brand-form";
import { CrawlButton } from "@/components/search/crawl-button";
import { Badge } from "@/components/ui/badge";
import { Page, Panel, Section } from "@/components/ui/layout";
import { setGoogleBusinessLocation } from "@/app/dashboard/brands/google-business-actions";
import { setSearchConsoleProperty } from "@/app/dashboard/search/google-actions";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/field";
import { getConnection, hasBusinessScope, listProperties } from "@/lib/google";
import {
  listBusinessAccounts,
  listBusinessLocations,
  type BusinessLocation,
} from "@/lib/google-business";
import { getPrisma } from "@/lib/prisma";
import { resolveProperty } from "@/lib/search-console";
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

  const googleConnection = await getConnection();
  const googleConnected = Boolean(googleConnection);
  const properties = googleConnected
    ? await listProperties().catch(() => [])
    : [];
  // Locations the connected account can actually reach, per Business account.
  const businessScope = hasBusinessScope(googleConnection?.scope);
  const businessLocations: { accountName: string; location: BusinessLocation }[] = [];
  let businessError: string | null = null;
  if (googleConnected && businessScope) {
    try {
      for (const account of await listBusinessAccounts()) {
        for (const location of await listBusinessLocations(account.name)) {
          businessLocations.push({ accountName: account.name, location });
        }
      }
    } catch (error) {
      businessError = error instanceof Error ? error.message : "Could not read Google Business.";
    }
  }

  // Shown as a suggestion only — the sync is what persists an automatic match.
  const suggestion = brand.searchConsoleProperty
    ? null
    : resolveProperty(brand.websiteUrl, properties);

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

      <Section title="Search Console" hint="one property per brand">
        <Panel>
          {googleConnected ? (
            <>
              <p className="type-body text-ink-2">
                {brand.searchConsoleProperty
                  ? `Selected property: ${brand.searchConsoleProperty}`
                  : suggestion
                    ? `Google Search Console is connected, but no property is selected for this brand. Zuri would use ${suggestion.property} (${suggestion.reason}).`
                    : properties.length
                      ? "No verified Search Console property found for this brand URL. Pick one below."
                      : "Google Search Console is connected, but this account has no properties."}
              </p>

              {properties.length ? (
                <form
                  action={setSearchConsoleProperty.bind(null, brand.id)}
                  className="mt-5 grid max-w-xl gap-4"
                >
                  <Select
                    label="Property"
                    name="property"
                    defaultValue={
                      brand.searchConsoleProperty ?? suggestion?.property ?? ""
                    }
                  >
                    <option value="">No property</option>
                    {properties.map((entry) => (
                      <option key={entry.siteUrl} value={entry.siteUrl}>
                        {entry.siteUrl}
                      </option>
                    ))}
                  </Select>
                  <div>
                    <Button type="submit" variant="secondary" size="sm">
                      Save property
                    </Button>
                  </div>
                </form>
              ) : null}
            </>
          ) : (
            <p className="type-body text-ink-2">
              No Google account is connected. Connect one from{" "}
              <Link
                href={`/dashboard/search?brand=${brand.id}`}
                className="rounded-md text-accent-ink transition-colors hover:text-accent-strong"
              >
                Search
              </Link>
              .
            </p>
          )}
        </Panel>
      </Section>

      <Section title="Google Business Profile" hint="one location per brand">
        <Panel>
          {!googleConnected ? (
            <p className="type-body text-ink-2">
              No Google account is connected.
            </p>
          ) : !businessScope ? (
            <p className="type-body text-ink-2">
              The Google connection predates the Business Profile scope. Disconnect
              and connect again from Search to select a location.
            </p>
          ) : businessError ? (
            <p className="type-body text-ink-2">{businessError}</p>
          ) : (
            <>
              <p className="type-body text-ink-2">
                {brand.googleBusinessLocationName
                  ? `Selected location: ${brand.googleBusinessLocationName}`
                  : "No Google Business Profile location selected for this brand."}
              </p>

              {businessLocations.length ? (
                <form
                  action={setGoogleBusinessLocation.bind(null, brand.id)}
                  className="mt-5 grid max-w-xl gap-4"
                >
                  <Select
                    label="Location"
                    name="location"
                    defaultValue={
                      brand.googleBusinessAccountId && brand.googleBusinessLocationId
                        ? `${brand.googleBusinessAccountId}|${brand.googleBusinessLocationId}|${brand.googleBusinessLocationName ?? ""}`
                        : ""
                    }
                  >
                    <option value="">No location</option>
                    {businessLocations.map((entry) => {
                      const label = [entry.location.title, entry.location.address]
                        .filter(Boolean)
                        .join(" — ");
                      return (
                        <option
                          key={entry.location.name}
                          value={`${entry.accountName}|${entry.location.name}|${label}`}
                        >
                          {label || entry.location.name}
                        </option>
                      );
                    })}
                  </Select>
                  <div>
                    <Button type="submit" variant="secondary" size="sm">
                      Save location
                    </Button>
                  </div>
                </form>
              ) : (
                <p className="type-meta mt-3">
                  This Google account manages no Business Profile location.
                </p>
              )}
            </>
          )}
        </Panel>
      </Section>

      <Section title="Website audit" hint="basic technical crawl">
        <CrawlButton brandId={brand.id} websiteUrl={brand.websiteUrl} />
        <p className="type-meta mt-3">
          Results appear under{" "}
          <Link
            href={`/dashboard/search?brand=${brand.id}`}
            className="rounded-md text-accent-ink transition-colors hover:text-accent-strong"
          >
            Search
          </Link>
          .
        </p>
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

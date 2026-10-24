import { billingWorkspace } from "@/lib/billing/access";
import { getPrisma } from "@/lib/prisma";
import { parseCompany } from "@/lib/billing/domain";
import { Page, PageHeader, Section } from "@/components/ui/layout";
import { ButtonLink } from "@/components/ui/button";
import { CompanyEditor } from "@/components/billing/company-editor";
export const dynamic = "force-dynamic";
export default async function CompaniesPage({
  searchParams,
}: {
  searchParams: Promise<{ company?: string }>;
}) {
  const w = await billingWorkspace();
  const p = await searchParams;
  const companies = await getPrisma().billingCompany.findMany({
    where: { workspaceId: w.id },
    orderBy: { name: "asc" },
  });
  const company = companies.find((c) => c.id === p.company);
  return (
    <Page>
      <PageHeader
        eyebrow="Facturation"
        title="Sociétés émettrices"
        description="Un profil juridique permanent, partagé par toutes les marques qui utilisent cette société."
        actions={
          <ButtonLink href="/dashboard/billing" variant="secondary">
            Documents
          </ButtonLink>
        }
      />
      <Section>
        <div className="flex flex-wrap gap-2">
          {companies.map((c) => (
            <ButtonLink
              key={c.id}
              href={`/dashboard/billing/companies?company=${c.id}`}
              variant={c.id === company?.id ? "primary" : "secondary"}
            >
              {c.name}
            </ButtonLink>
          ))}
          <ButtonLink href="/dashboard/billing/companies" variant="ghost">
            Nouvelle société
          </ButtonLink>
        </div>
      </Section>
      <CompanyEditor
        key={company?.id ?? "new"}
        initial={company ? parseCompany(company.profile) : undefined}
        id={company?.id}
        revision={company?.revision}
        prefix={company?.prefix}
      />
    </Page>
  );
}

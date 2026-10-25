import { billingWorkspace } from "@/lib/billing/access";
import { getPrisma } from "@/lib/prisma";
import {
  parseCompany,
  parseParty,
  parseDraft,
  type Draft,
} from "@/lib/billing/domain";
import { Page, PageHeader, EmptyState, Section } from "@/components/ui/layout";
import { ButtonLink } from "@/components/ui/button";
import { DocumentEditor } from "@/components/billing/document-editor";
import { notFound } from "next/navigation";
export async function BillingEditorPage({ id }: { id?: string }) {
  const w = await billingWorkspace();
  const db = getPrisma();
  const [companies, brands, customers, document] = await Promise.all([
    db.billingCompany.findMany({
      where: { workspaceId: w.id },
      orderBy: { name: "asc" },
    }),
    db.brand.findMany({
      where: { workspaceId: w.id },
      select: { id: true, name: true },
      orderBy: { name: "asc" },
    }),
    db.billingCustomer.findMany({
      where: { workspaceId: w.id },
      orderBy: { name: "asc" },
    }),
    id
      ? db.billingDocument.findFirst({ where: { id, workspaceId: w.id } })
      : null,
  ]);
  if (id && !document) notFound();
  if (!companies.length || !brands.length)
    return (
      <Page>
        <PageHeader title="Nouveau document" />
        <Section>
          <EmptyState
            title={
              !companies.length
                ? "Configurez votre société émettrice"
                : "Créez une marque dans ce workspace"
            }
            description="La société fournit les mentions légales ; la marque apporte l’identité commerciale."
            action={
              <ButtonLink
                href={
                  !companies.length
                    ? "/dashboard/billing/companies"
                    : "/dashboard/brands"
                }
              >
                Configurer
              </ButtonLink>
            }
          />
        </Section>
      </Page>
    );
  const today = new Date().toISOString().slice(0, 10);
  const profile = parseCompany(companies[0].profile);
  const initial: Draft = document
    ? parseDraft(document.payload)
    : {
        type: "INVOICE",
        brandId: brands[0].id,
        companyId: companies[0].id,
        customer: {
          kind: "BUSINESS",
          name: "",
          address: "",
          country: "Luxembourg",
          email: "",
          phone: "",
          vatNumber: "",
        },
        issueDate: today,
        serviceDate: today,
        dueDate: today,
        currency: "EUR",
        subject: "",
        notes: "",
        vatMode: profile.vatStatus,
        reverseBasis: "",
        reverseConfirmed: false,
        lines: [
          {
            description: "",
            quantity: "1",
            unit: "service",
            unitPrice: "0",
            vatRate: profile.vatStatus === "EXEMPT" ? "0" : "17",
          },
        ],
      };
  return (
    <Page>
      <PageHeader
        eyebrow="Facturation"
        title={document?.number ?? (id ? "Brouillon" : "Nouveau document")}
        description="Factures et devis, de la première ligne au document final."
        actions={
          <ButtonLink href="/dashboard/billing" variant="secondary">
            Tous les documents
          </ButtonLink>
        }
      />
      <DocumentEditor
        key={document?.id ?? "new"}
        brands={brands}
        companies={companies.map((c) => ({
          id: c.id,
          name: c.name,
          profile: parseCompany(c.profile),
        }))}
        customers={customers.map((c) => ({
          id: c.id,
          name: c.name,
          details: parseParty(c.details),
        }))}
        initial={initial}
        id={document?.id}
        revision={document?.revision}
        status={document?.status}
        number={document?.number}
      />
    </Page>
  );
}

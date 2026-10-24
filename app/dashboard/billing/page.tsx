import { billingWorkspace } from "@/lib/billing/access";
import { getPrisma } from "@/lib/prisma";
import { Page, PageHeader, EmptyState, Section } from "@/components/ui/layout";
import { Button, ButtonLink } from "@/components/ui/button";
import { Field, Select } from "@/components/ui/field";
import Link from "next/link";
export const dynamic = "force-dynamic";
export const metadata = { title: "Facturation" };
const labels: Record<string, string> = {
  DRAFT: "Brouillon",
  ISSUED: "Émis",
  PAID: "Payé",
  SENT: "Envoyé",
  ACCEPTED: "Accepté",
  REFUSED: "Refusé",
};
export default async function BillingPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const w = await billingWorkspace(),
    p = await searchParams,
    db = getPrisma();
  const [brands, companies] = await Promise.all([
    db.brand.findMany({
      where: { workspaceId: w.id },
      select: { id: true, name: true },
      orderBy: { name: "asc" },
    }),
    db.billingCompany.findMany({
      where: { workspaceId: w.id },
      select: { id: true, name: true },
      orderBy: { name: "asc" },
    }),
  ]);
  const docs = await db.billingDocument.findMany({
    where: {
      workspaceId: w.id,
      ...(p.brand ? { brandId: p.brand } : {}),
      ...(p.company ? { companyId: p.company } : {}),
      ...(p.type && ["INVOICE", "QUOTE"].includes(p.type)
        ? { type: p.type }
        : {}),
      ...(p.status && labels[p.status] ? { status: p.status } : {}),
      ...(p.client
        ? { customerName: { contains: p.client, mode: "insensitive" } }
        : {}),
      ...(/^\d{4}-\d{2}-\d{2}$/.test(p.from ?? "") ||
      /^\d{4}-\d{2}-\d{2}$/.test(p.to ?? "")
        ? {
            issueDate: {
              ...(/^\d{4}-\d{2}-\d{2}$/.test(p.from ?? "")
                ? { gte: p.from }
                : {}),
              ...(/^\d{4}-\d{2}-\d{2}$/.test(p.to ?? "") ? { lte: p.to } : {}),
            },
          }
        : {}),
    },
    select: {
      id: true,
      number: true,
      type: true,
      status: true,
      customerName: true,
      issueDate: true,
      brand: { select: { name: true } },
      company: { select: { name: true } },
    },
    orderBy: [{ issueDate: "desc" }, { createdAt: "desc" }],
  });
  return (
    <Page>
      <PageHeader
        eyebrow={w.name}
        title="Facturation"
        description="Des documents clairs, une identité soignée. Vos factures et devis réunis dans Zuri."
        actions={
          <>
            <ButtonLink href="/dashboard/billing/companies" variant="secondary">
              Sociétés
            </ButtonLink>
            <ButtonLink href="/dashboard/billing/new">
              Nouveau document
            </ButtonLink>
          </>
        }
      />
      <Section>
        <form className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Select label="Brand" name="brand" defaultValue={p.brand ?? ""}>
            <option value="">Toutes les marques</option>
            {brands.map((b) => (
              <option key={b.id} value={b.id}>
                {b.name}
              </option>
            ))}
          </Select>
          <Select label="Société" name="company" defaultValue={p.company ?? ""}>
            <option value="">Toutes les sociétés</option>
            {companies.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </Select>
          <Select label="Type" name="type" defaultValue={p.type ?? ""}>
            <option value="">Tous les types</option>
            <option value="INVOICE">Factures</option>
            <option value="QUOTE">Devis</option>
          </Select>
          <Select label="Statut" name="status" defaultValue={p.status ?? ""}>
            <option value="">Tous les statuts</option>
            {Object.entries(labels).map(([key, label]) => (
              <option key={key} value={key}>
                {label}
              </option>
            ))}
          </Select>
          <Field label="Client" name="client" defaultValue={p.client} />
          <Field label="Depuis" name="from" type="date" defaultValue={p.from} />
          <Field label="Jusqu’au" name="to" type="date" defaultValue={p.to} />
          <div className="flex items-end gap-2">
            <Button type="submit" variant="secondary">
              Filtrer
            </Button>
            <Link
              className="type-meta pb-3 text-accent-ink"
              href="/dashboard/billing"
            >
              Réinitialiser
            </Link>
          </div>
        </form>
      </Section>
      <Section title="Documents" hint={`${docs.length}`}>
        {docs.length ? (
          <div className="divide-y divide-line">
            {docs.map((d) => (
              <Link
                key={d.id}
                href={`/dashboard/billing/${d.id}`}
                className="flex flex-col gap-3 rounded-lg px-3 py-5 transition-colors hover:bg-subtle sm:flex-row sm:items-center sm:justify-between"
              >
                <div>
                  <div className="flex flex-wrap items-center gap-3">
                    <span className="font-medium">
                      {d.number ?? "Brouillon"}
                    </span>
                    <span className="type-meta">
                      {d.type === "INVOICE" ? "Facture" : "Devis"}
                    </span>
                  </div>
                  <p className="mt-1 text-sm text-ink-2">{d.customerName}</p>
                  <p className="type-meta mt-1">
                    {d.brand.name} · {d.company.name}
                  </p>
                </div>
                <div className="flex items-center gap-4">
                  <span className="type-meta">{d.issueDate}</span>
                  <span className="rounded-full bg-accent-soft px-3 py-1 text-xs text-accent-ink">
                    {labels[d.status]}
                  </span>
                </div>
              </Link>
            ))}
          </div>
        ) : (
          <EmptyState
            title="Aucun document"
            description="Créez votre premier devis ou votre première facture, ou ajustez les filtres."
            action={
              <ButtonLink href="/dashboard/billing/new">
                Créer un document
              </ButtonLink>
            }
          />
        )}
      </Section>
    </Page>
  );
}

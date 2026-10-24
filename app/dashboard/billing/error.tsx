"use client";
import { Button } from "@/components/ui/button";
import { Page, PageHeader, Panel } from "@/components/ui/layout";
export default function BillingError({ reset }: { reset: () => void }) {
  return (
    <Page>
      <PageHeader
        title="Facturation indisponible"
        description="Vérifiez que le workspace de facturation est configuré et que la migration a été appliquée."
      />
      <Panel className="mt-8">
        <p className="type-body text-ink-3">
          L’administrateur peut consulter le guide de configuration de la
          facturation. Aucune opération en attente n’a été confirmée.
        </p>
        <Button className="mt-5" onClick={reset}>
          Réessayer
        </Button>
      </Panel>
    </Page>
  );
}

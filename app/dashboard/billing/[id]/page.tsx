import { BillingEditorPage } from "@/components/billing/editor-page";
export const dynamic = "force-dynamic";
export default async function DocumentPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <BillingEditorPage id={id} />;
}

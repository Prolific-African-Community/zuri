import { billingWorkspace } from "@/lib/billing/access";
import { previewDocument } from "@/lib/billing/service";
import { BillingError } from "@/lib/billing/domain";
export const runtime = "nodejs";
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const workspace = await billingWorkspace();
  const { id } = await params;
  try {
    const bytes = await previewDocument(workspace.id, id);
    const download = new URL(request.url).searchParams.has("download");
    return new Response(new Uint8Array(bytes), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `${download ? "attachment" : "inline"}; filename="zuri-${id}.pdf"`,
        "Cache-Control": "private, no-store",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (e) {
    return Response.json(
      {
        error:
          e instanceof BillingError
            ? e.message
            : "Génération du PDF indisponible.",
      },
      { status: e instanceof BillingError ? 422 : 500 },
    );
  }
}

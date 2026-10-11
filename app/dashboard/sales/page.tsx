import { redirect } from "next/navigation";

/** Sales opens on its campaigns: every prospect belongs to one. */
export default function SalesPage() {
  redirect("/dashboard/sales/campaigns");
}

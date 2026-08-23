import { DashboardSidebar } from "@/components/dashboard-sidebar";

export default function DashboardLayout({
  children,
}: LayoutProps<"/dashboard">) {
  return (
    <div className="flex min-h-svh flex-col lg:flex-row">
      <DashboardSidebar />
      <main className="min-w-0 flex-1 px-5 py-8 sm:px-10 sm:py-12 lg:px-14 lg:py-16">
        {children}
      </main>
    </div>
  );
}

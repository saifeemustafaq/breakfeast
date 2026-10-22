import { Suspense } from "react";
import { AdminLogin } from "@/components/admin/login";
import { OverviewPage } from "@/components/admin/overview";
import { AdminShell } from "@/components/admin/shell";
import { getAdminPage } from "@/lib/auth/guards";
import { AdminLoading } from "./gate";

export default function AdminHome() {
  return (
    <Suspense fallback={<AdminLoading />}>
      <Home />
    </Suspense>
  );
}

async function Home() {
  const auth = await getAdminPage();
  if (!auth) return <AdminLogin />;
  return (
    <AdminShell adminId={auth.admin.adminId}>
      <OverviewPage />
    </AdminShell>
  );
}

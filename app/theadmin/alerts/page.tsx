import { Suspense } from "react";
import { AlertsPage } from "@/components/admin/alerts";
import { AdminGate, AdminLoading } from "../gate";

export const metadata = { title: "Alerts" };

export default function Page({ searchParams }: PageProps<"/theadmin/alerts">) {
  return (
    <Suspense fallback={<AdminLoading />}>
      <AdminGate path="/theadmin/alerts" searchParams={searchParams}>
        <AlertsPage />
      </AdminGate>
    </Suspense>
  );
}

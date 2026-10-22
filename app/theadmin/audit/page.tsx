import { Suspense } from "react";
import { AuditLogPage } from "@/components/admin/audit-log";
import { AdminGate, AdminLoading } from "../gate";

export const metadata = { title: "Audit log" };

export default function Page({ searchParams }: PageProps<"/theadmin/audit">) {
  return (
    <Suspense fallback={<AdminLoading />}>
      <AdminGate path="/theadmin/audit" searchParams={searchParams}>
        <AuditLogPage />
      </AdminGate>
    </Suspense>
  );
}

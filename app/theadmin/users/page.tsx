import { Suspense } from "react";
import { UsersListPage } from "@/components/admin/users-list";
import { AdminGate, AdminLoading } from "../gate";

export const metadata = { title: "Users" };

export default function Page({ searchParams }: PageProps<"/theadmin/users">) {
  return (
    <Suspense fallback={<AdminLoading />}>
      <AdminGate path="/theadmin/users" searchParams={searchParams}>
        <UsersListPage />
      </AdminGate>
    </Suspense>
  );
}

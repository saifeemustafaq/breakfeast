import { Suspense } from "react";
import { UserCreatePage } from "@/components/admin/user-create";
import { AdminGate, AdminLoading } from "../../gate";

export const metadata = { title: "Create user" };

export default function Page() {
  return (
    <Suspense fallback={<AdminLoading />}>
      <AdminGate path="/theadmin/users/new">
        <UserCreatePage />
      </AdminGate>
    </Suspense>
  );
}

import { Suspense } from "react";
import { UserDetailPage } from "@/components/admin/user-detail";
import { AdminGate, AdminLoading } from "../../gate";

export const metadata = { title: "User" };

export default function Page({ params, searchParams }: PageProps<"/theadmin/users/[id]">) {
  return (
    <Suspense fallback={<AdminLoading />}>
      <UserPage params={params} searchParams={searchParams} />
    </Suspense>
  );
}

async function UserPage({ params, searchParams }: PageProps<"/theadmin/users/[id]">) {
  const { id } = await params;
  return (
    <AdminGate path={`/theadmin/users/${encodeURIComponent(id)}`} searchParams={searchParams}>
      <UserDetailPage id={id} />
    </AdminGate>
  );
}

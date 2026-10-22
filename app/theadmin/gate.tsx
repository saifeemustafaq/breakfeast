import { AdminShell } from "@/components/admin/shell";
import { requireAdminPage } from "@/lib/auth/guards";

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

/** Server-side admin guard for a page; signed-out visitors are sent to sign in with ?next=. */
export async function AdminGate({
  path,
  searchParams,
  children,
}: {
  path: string;
  searchParams?: SearchParams;
  children: React.ReactNode;
}) {
  const params = new URLSearchParams();
  for (const [k, v] of Object.entries((await searchParams) ?? {})) {
    if (typeof v === "string") params.set(k, v);
  }
  const qs = params.toString();
  const { admin } = await requireAdminPage(qs ? `${path}?${qs}` : path);
  return <AdminShell adminId={admin.adminId}>{children}</AdminShell>;
}

export function AdminLoading() {
  return (
    <div style={{ padding: 32 }} aria-busy="true" aria-label="Loading">
      <span className="adm-skeleton" style={{ width: 200, height: 28 }} />
    </div>
  );
}

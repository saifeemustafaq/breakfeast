import { Suspense } from "react";
import { LiveActivityPage } from "@/components/admin/live-activity";
import { AdminGate, AdminLoading } from "../gate";

export const metadata = { title: "Live activity" };

export default function Page() {
  return (
    <Suspense fallback={<AdminLoading />}>
      <AdminGate path="/theadmin/activity">
        <LiveActivityPage />
      </AdminGate>
    </Suspense>
  );
}

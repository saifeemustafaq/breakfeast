import type { Metadata, Viewport } from "next";
import { AdminRoot } from "@/components/admin/root";
import "./admin.css";

export const metadata: Metadata = {
  title: { default: "Admin · Breakfeast", template: "%s · Breakfeast admin" },
  robots: { index: false, follow: false },
};

export const viewport: Viewport = { themeColor: "#ffffff" };

export default function AdminLayout({ children }: LayoutProps<"/theadmin">) {
  return <AdminRoot>{children}</AdminRoot>;
}

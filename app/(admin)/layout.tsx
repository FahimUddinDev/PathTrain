import type { ReactNode } from "react";
import { LogoutButton } from "@/components/admin/logout-button";
import { SidebarNav } from "@/components/admin/sidebar-nav";

export default function AdminLayout({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-screen">
      <aside className="flex w-56 flex-col border-r bg-card p-4">
        <p className="mb-6 px-3 text-base font-semibold">PathTrain</p>
        <SidebarNav />
        <div className="mt-auto pt-4">
          <LogoutButton />
        </div>
      </aside>
      <main className="flex-1 p-6">{children}</main>
    </div>
  );
}

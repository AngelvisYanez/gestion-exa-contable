"use client";

import Sidebar from "@/components/layout/Sidebar";
import { useSidebar } from "@/contexts/SidebarContext";

export default function LayoutShell({ children }: { children: React.ReactNode }) {
  const { collapsed } = useSidebar();

  return (
    <div className="flex h-dvh overflow-hidden bg-background text-foreground">
      <Sidebar />
      <div
        id="main-content"
        className={`flex h-dvh min-h-0 min-w-0 max-w-full flex-1 flex-col overflow-x-hidden overflow-y-auto pb-[env(safe-area-inset-bottom)] transition-[padding] duration-200 ease-out
          ${collapsed ? "md:pl-14" : "md:pl-60"} pl-0`}
      >
        {children}
      </div>
    </div>
  );
}

"use client";

import Sidebar from "@/components/layout/Sidebar";
import { useSidebar } from "@/contexts/SidebarContext";

export default function LayoutShell({ children }: { children: React.ReactNode }) {
  const { collapsed } = useSidebar();

  return (
    <div className="flex h-dvh overflow-hidden text-brand-gray-800 bg-brand-gray-50">
      <Sidebar />
      <div
        id="main-content"
        className={`flex h-dvh min-h-0 min-w-0 flex-1 flex-col overflow-x-hidden overflow-y-auto transition-[padding] duration-200 ease-out
          ${collapsed ? "md:pl-14" : "md:pl-60"} pl-0`}
      >
        {children}
      </div>
    </div>
  );
}

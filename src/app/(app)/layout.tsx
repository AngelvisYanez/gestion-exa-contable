"use client";

import { AuthProvider } from "@/contexts/AuthContext";
import { NotificationsProvider } from "@/contexts/NotificationsContext";
import { SidebarProvider } from "@/contexts/SidebarContext";
import LayoutShell from "@/components/layout/LayoutShell";
import { NotificationToast } from "@/components/notifications/NotificationBell";

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <AuthProvider>
      <NotificationsProvider>
        <SidebarProvider>
          <LayoutShell>{children}</LayoutShell>
          <NotificationToast />
        </SidebarProvider>
      </NotificationsProvider>
    </AuthProvider>
  );
}

"use client";

import Link from "next/link";
import Image from "next/image";
import { useEffect } from "react";
import { usePathname } from "next/navigation";
import {
  Activity,
  AlertTriangle,
  Building2,
  ChevronLeft,
  ChevronRight,
  ClipboardList,
  LayoutGrid,
  ListTodo,
  LogOut,
  Monitor,
  Settings,
  Ticket,
  Users,
} from "lucide-react";
import { type UserRole } from "@/lib/auth/users";
import { useAuth } from "@/contexts/AuthContext";
import { useSidebar } from "@/contexts/SidebarContext";

type NavLeaf = {
  href: string;
  label: string;
  roles?: UserRole[];
  icon: React.ReactNode;
};

type NavGroup = {
  group: string;
  items: NavLeaf[];
};

const navGroups: NavGroup[] = [
  {
    group: "PRINCIPAL",
    items: [
      {
        href: "/",
        label: "Dashboard",
        icon: <LayoutGrid className="w-[17px] h-[17px]" strokeWidth={1.8} />,
      },
      {
        href: "/tareas",
        label: "Tareas",
        roles: ["manager", "atencion"],
        icon: <ClipboardList className="w-[17px] h-[17px]" strokeWidth={1.8} />,
      },
      {
        href: "/tickets",
        label: "Tickets",
        icon: <Ticket className="w-[17px] h-[17px]" strokeWidth={1.8} />,
      },
      {
        href: "/mis-tareas",
        label: "Mis tareas",
        icon: <ListTodo className="w-[17px] h-[17px]" strokeWidth={1.8} />,
      },
    ],
  },
  {
    group: "GESTION",
    items: [
      {
        href: "/monitoreo",
        label: "Monitoreo",
        roles: ["manager"],
        icon: <Activity className="w-[17px] h-[17px]" strokeWidth={1.8} />,
      },
    ],
  },
  {
    group: "ADMINISTRACION",
    items: [
      {
        href: "/configuracion",
        label: "Configuracion",
        roles: ["manager"],
        icon: <Settings className="w-[17px] h-[17px]" strokeWidth={1.8} />,
      },
      {
        href: "/configuracion/general",
        label: "General",
        roles: ["manager"],
        icon: <Building2 className="w-[17px] h-[17px]" strokeWidth={1.8} />,
      },
      {
        href: "/configuracion/usuarios",
        label: "Usuarios",
        roles: ["manager"],
        icon: <Users className="w-[17px] h-[17px]" strokeWidth={1.8} />,
      },
      {
        href: "/configuracion/incidencias",
        label: "Incidencias",
        roles: ["manager"],
        icon: <AlertTriangle className="w-[17px] h-[17px]" strokeWidth={1.8} />,
      },
      {
        href: "/configuracion/examonitor",
        label: "ExaMonitor",
        roles: ["manager"],
        icon: <Monitor className="w-[17px] h-[17px]" strokeWidth={1.8} />,
      },
    ],
  },
];

function isAllowed(role: string | undefined, item: NavLeaf) {
  if (!item.roles) return true;
  return !!role && item.roles.includes(role as UserRole);
}

function isActive(pathname: string | null, href: string) {
  if (!pathname) return false;
  if (href === "/") return pathname === "/";
  if (href === "/configuracion") return pathname === "/configuracion";
  return pathname === href || pathname.startsWith(`${href}/`);
}

function SidebarWordmark({ className = "" }: { className?: string }) {
  return (
    <span className={`flex w-full items-center justify-center ${className}`}>
      <Image
        src="/logo-1.png"
        alt="EXA Contable"
        width={1024}
        height={486}
        quality={100}
        priority
        className="h-12 w-auto max-w-[11.5rem] object-contain object-center dark:hidden"
      />
      <Image
        src="/logo-2.png"
        alt="EXA Contable"
        width={1024}
        height={486}
        quality={100}
        priority
        className="hidden h-12 w-auto max-w-[11.5rem] object-contain object-center dark:block"
      />
    </span>
  );
}

export default function Sidebar() {
  const pathname = usePathname();
  const { user, logout } = useAuth();
  const { collapsed, setCollapsed, mobileOpen, setMobileOpen } = useSidebar();

  const groups = navGroups
    .map((g) => ({
      ...g,
      items: g.items.filter((item) => isAllowed(user?.role, item)),
    }))
    .filter((g) => g.items.length > 0);

  const sidebarWidth = collapsed
    ? "w-[min(18rem,86vw)] md:w-14"
    : "w-[min(18rem,86vw)] md:w-60";

  useEffect(() => {
    if (!mobileOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setMobileOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [mobileOpen, setMobileOpen]);

  return (
    <>
      <aside
        className={`
          ${sidebarWidth} overflow-x-hidden bg-sidebar border-r border-sidebar-border
          h-dvh max-h-dvh flex flex-col fixed top-0 left-0 z-[60]
          transition-all duration-200 ease-in-out select-none
          md:translate-x-0 ${mobileOpen ? "translate-x-0" : "-translate-x-full"}
        `}
      >
        <div
          className={`relative flex h-16 shrink-0 items-center justify-center border-b border-sidebar-border bg-sidebar ${
            collapsed ? "px-2" : "px-3"
          }`}
        >
          {collapsed ? (
            <>
              <Image
                src="/favicon.png"
                alt="EXA"
                width={36}
                height={36}
                priority
                className="hidden h-9 w-9 rounded-full object-cover ring-1 ring-sidebar-border/80 md:block"
              />
              <SidebarWordmark className="md:hidden" />
            </>
          ) : (
            <SidebarWordmark />
          )}
        </div>

        <nav className="flex-1 py-2 flex flex-col overflow-y-auto overflow-x-hidden">
          {groups.map((group, gi) => (
            <div key={group.group} className="flex flex-col">
              <span
                className={`px-4 pt-4 pb-1 text-[9px] font-bold text-muted-foreground tracking-widest uppercase ${
                  collapsed ? "md:hidden" : ""
                }`}
              >
                {group.group}
              </span>
              {collapsed && gi > 0 && (
                <div className="mx-3 my-2 hidden h-px bg-sidebar-border md:block" />
              )}
              <div className="flex flex-col gap-0.5 px-1.5">
                {group.items.map((item) => {
                  const active = isActive(pathname, item.href);
                  return (
                    <Link
                      key={item.href}
                      href={item.href}
                      onClick={() => setMobileOpen(false)}
                      title={collapsed ? item.label : undefined}
                      className={`
                        flex min-h-11 items-center gap-2.5 rounded-lg transition-all duration-150 group relative
                        ${collapsed ? "justify-start px-2.5 py-2.5 md:justify-center md:px-0" : "px-2.5 py-2.5"}
                        ${
                          active
                            ? "bg-brand-red text-white font-semibold shadow-xs hover:bg-brand-red-mid"
                            : "text-sidebar-foreground/75 hover:bg-sidebar-accent hover:text-sidebar-foreground font-medium"
                        }
                      `}
                    >
                      <span className="shrink-0">{item.icon}</span>
                      <span
                        className={`min-w-0 flex-1 truncate text-[13px] font-medium md:text-[12.5px] ${
                          collapsed ? "md:hidden" : ""
                        }`}
                      >
                        {item.label}
                      </span>
                      {collapsed && (
                        <div className="pointer-events-none absolute left-full top-1/2 z-50 ml-2 hidden -translate-y-1/2 whitespace-nowrap rounded-md bg-popover px-2 py-1 text-xs font-medium text-popover-foreground opacity-0 transition-opacity group-hover:opacity-100 md:block">
                          {item.label}
                        </div>
                      )}
                    </Link>
                  );
                })}
              </div>
            </div>
          ))}
        </nav>

        <div className="shrink-0 border-t border-sidebar-border p-2">
          <button
            type="button"
            onClick={() => void logout()}
            className={`flex min-h-11 w-full cursor-pointer items-center gap-2.5 rounded-lg text-sidebar-foreground/70 transition-all duration-150 hover:bg-brand-red-subtle hover:text-brand-red
              ${collapsed ? "justify-start px-2.5 py-2.5 md:justify-center md:px-0" : "px-2.5 py-2.5"}
            `}
            title="Cerrar sesion"
          >
            <LogOut className="w-4 h-4 shrink-0" strokeWidth={2} />
            <span className={`text-[13px] font-medium ${collapsed ? "md:hidden" : ""}`}>
              Cerrar sesion
            </span>
          </button>
        </div>
      </aside>

      <button
        type="button"
        onClick={() => setCollapsed(!collapsed)}
        className={`fixed top-8 z-[70] hidden h-7 w-5 -translate-y-1/2 cursor-pointer items-center justify-center rounded-r-md border border-sidebar-border bg-sidebar text-muted-foreground shadow-sm transition-[left,color] duration-200 ease-in-out hover:text-sidebar-foreground md:flex ${
          collapsed ? "left-12" : "left-[14.5rem]"
        }`}
        title={collapsed ? "Expandir menu" : "Colapsar menu"}
      >
        {collapsed ? (
          <ChevronRight className="h-2.5 w-2.5" strokeWidth={2.5} />
        ) : (
          <ChevronLeft className="h-2.5 w-2.5" strokeWidth={2.5} />
        )}
      </button>

      {mobileOpen && (
        <div
          onClick={() => setMobileOpen(false)}
          className="fixed inset-0 z-[55] bg-black/40 md:hidden"
        />
      )}
    </>
  );
}

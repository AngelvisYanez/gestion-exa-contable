"use client";

import Link from "next/link";
import Image from "next/image";
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
        roles: ["manager", "atencion"],
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

  const sidebarWidth = collapsed ? "w-14" : "w-60";

  return (
    <>
      <aside
        className={`
          ${sidebarWidth} bg-sidebar border-r border-sidebar-border
          h-screen flex flex-col fixed top-0 left-0 z-50
          transition-all duration-200 ease-in-out select-none
          md:translate-x-0 ${mobileOpen ? "translate-x-0" : "-translate-x-full"}
        `}
      >
        <div
          className={`h-16 shrink-0 relative flex items-center border-b border-sidebar-border bg-sidebar ${
            collapsed ? "justify-center px-2" : "justify-start px-4"
          }`}
        >
          {collapsed ? (
            <Image
              src="/favicon.png"
              alt="EXA"
              width={36}
              height={36}
              priority
              className="h-9 w-9 rounded-full object-cover ring-1 ring-sidebar-border/80"
            />
          ) : (
            <Image
              src="/exa-logo-dark-transparent.png"
              alt="EXA"
              width={168}
              height={52}
              quality={100}
              priority
              className="h-11 w-auto max-w-[152px] object-contain object-left"
            />
          )}
          <button
            type="button"
            onClick={() => setCollapsed(!collapsed)}
            className="hidden md:flex absolute -right-3 top-1/2 -translate-y-1/2 w-5 h-7 bg-sidebar border border-sidebar-border rounded-r-md text-muted-foreground hover:text-sidebar-foreground items-center justify-center transition-colors duration-150 cursor-pointer shadow-sm z-10"
            title={collapsed ? "Expandir menu" : "Colapsar menu"}
          >
            {collapsed ? (
              <ChevronRight className="w-2.5 h-2.5" strokeWidth={2.5} />
            ) : (
              <ChevronLeft className="w-2.5 h-2.5" strokeWidth={2.5} />
            )}
          </button>
        </div>

        <nav className="flex-1 py-2 flex flex-col overflow-y-auto overflow-x-hidden">
          {groups.map((group, gi) => (
            <div key={group.group} className="flex flex-col">
              {!collapsed && (
                <span className="px-4 pt-4 pb-1 text-[9px] font-bold text-muted-foreground tracking-widest uppercase">
                  {group.group}
                </span>
              )}
              {collapsed && gi > 0 && <div className="mx-3 my-2 h-px bg-sidebar-border" />}
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
                        flex items-center gap-2.5 rounded-lg transition-all duration-150 group relative
                        ${collapsed ? "px-0 py-2.5 justify-center" : "px-2.5 py-2"}
                        ${
                          active
                            ? "bg-brand-red text-white font-semibold shadow-xs hover:bg-brand-red-mid"
                            : "text-sidebar-foreground/75 hover:bg-sidebar-accent hover:text-sidebar-foreground font-medium"
                        }
                      `}
                    >
                      <span className="shrink-0">{item.icon}</span>
                      {!collapsed && (
                        <span className="text-[12.5px] font-medium truncate flex-1">{item.label}</span>
                      )}
                      {collapsed && (
                        <div className="absolute left-full ml-2 top-1/2 -translate-y-1/2 bg-popover text-popover-foreground text-xs font-medium px-2 py-1 rounded-md whitespace-nowrap opacity-0 group-hover:opacity-100 pointer-events-none transition-opacity z-50">
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
            className={`flex items-center gap-2.5 rounded-lg transition-all duration-150 w-full cursor-pointer text-sidebar-foreground/70 hover:text-brand-red hover:bg-brand-red-subtle
              ${collapsed ? "justify-center px-0 py-2.5" : "px-2.5 py-2"}
            `}
            title="Cerrar sesion"
          >
            <LogOut className="w-4 h-4 shrink-0" strokeWidth={2} />
            {!collapsed && <span className="text-[12.5px] font-medium">Cerrar sesion</span>}
          </button>
        </div>
      </aside>

      {mobileOpen && (
        <div
          onClick={() => setMobileOpen(false)}
          className="fixed inset-0 bg-black/30 z-40 md:hidden"
        />
      )}
    </>
  );
}

"use client";

import Link from "next/link";
import { AlertTriangle, Bell, Building2, Monitor, Settings, Users } from "lucide-react";
import Topbar from "@/components/layout/Topbar";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

const sections = [
  {
    href: "/configuracion/general",
    title: "General",
    description:
      "Empresa MATRIZ, proyectos, equipo autorizado, notificaciones del navegador y catalogos del dominio.",
    icon: Settings,
    cta: "Abrir configuracion →",
  },
  {
    href: "/configuracion/usuarios",
    title: "Usuarios",
    description:
      "Lista de la empresa EXA. Agrega o quita quien trabaja en la gestion y asigna encargado, desarrollador o atencion al cliente.",
    icon: Users,
    cta: "Administrar usuarios →",
  },
  {
    href: "/configuracion/general#notificaciones",
    title: "Notificaciones",
    description:
      "Toasts, permiso de escritorio y tipos de evento SSE (asignaciones, avances, estados).",
    icon: Bell,
    cta: "Ajustar alertas →",
  },
  {
    href: "/configuracion/general#proyecto",
    title: "Proyecto",
    description: "Emp_Cod, sucursal MATRIZ, bases permitidas y alcance operativo del panel.",
    icon: Building2,
    cta: "Ver proyecto →",
  },
  {
    href: "/configuracion/incidencias",
    title: "Incidencias",
    description:
      "Monitor de errores del log EXA: evalua fallos, genera tareas y asignalas al equipo.",
    icon: AlertTriangle,
    cta: "Abrir monitor →",
  },
  {
    href: "/configuracion/examonitor",
    title: "ExaMonitor",
    description:
      "Activa monitoreo, intervalo, capturas, bandeja, horario laboral automatico (Guayaquil), pausa de almuerzo (1 h), retencion de screenshots y politicas en lote.",
    icon: Monitor,
    cta: "Abrir configuracion →",
  },
] as const;

export default function ConfiguracionPage() {
  return (
    <>
      <Topbar title="Configuracion" subtitle="Administracion" />
      <main className="mx-auto w-full min-w-0 max-w-5xl animate-fade-in px-4 py-6 sm:px-6">
        <p className="mb-5 max-w-2xl text-sm text-brand-gray-600">
          Centro de administracion del panel: alcance del proyecto, equipo, alertas, incidencias y
          politicas de ExaMonitor.
        </p>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {sections.map((s) => {
            const Icon = s.icon;
            return (
              <Link key={s.href} href={s.href} className="block">
                <Card className="h-full transition-colors hover:border-brand-red/40 hover:bg-brand-red-subtle/40">
                  <CardHeader>
                    <div className="mb-2 flex h-10 w-10 items-center justify-center rounded-lg bg-brand-red text-white">
                      <Icon className="size-5" />
                    </div>
                    <CardTitle>{s.title}</CardTitle>
                    <CardDescription>{s.description}</CardDescription>
                  </CardHeader>
                  <CardContent className="text-sm font-semibold text-brand-red">{s.cta}</CardContent>
                </Card>
              </Link>
            );
          })}
        </div>
      </main>
    </>
  );
}

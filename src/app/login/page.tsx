"use client";

import { FormEvent, Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert } from "@/components/ui/alert";
import { ThemeToggle } from "@/components/theme/theme-toggle";

function LoginForm() {
  const router = useRouter();
  const params = useSearchParams();
  const [cedula, setCedula] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ cedula: cedula.trim(), password }),
      });
      const j = await res.json();
      if (!j.success) throw new Error(j.message || "Login fallido");
      const next = params.get("next");
      const dest =
        next && next.startsWith("/")
          ? next
          : j.redirect || "/";
      router.replace(dest);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error");
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="relative flex min-h-screen items-center justify-center bg-background px-4 py-10">
      <div className="absolute right-4 top-4 z-20">
        <ThemeToggle />
      </div>
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="absolute -left-24 top-10 h-72 w-72 rounded-full bg-primary/15 blur-3xl" />
        <div className="absolute -right-16 bottom-10 h-80 w-80 rounded-full bg-sky-400/20 blur-3xl" />
      </div>

      <Card className="relative z-10 w-full max-w-md animate-fade-in overflow-hidden border-border/80 shadow-xl">
        <CardHeader className="space-y-4 pt-8 text-center">
          <div className="flex flex-col items-center gap-3">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src="/favicon.png"
              alt="EXA"
              className="h-20 w-20 object-contain"
            />
            <p className="text-[11px] text-muted-foreground">Tareas y monitoreo</p>
          </div>
          <CardTitle className="font-display text-2xl">Iniciar sesion</CardTitle>
          <CardDescription>
            Ingresa con tu <strong className="text-foreground">cedula</strong> y contraseña de EXA.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4 p-6 pt-2">
          <form onSubmit={onSubmit} className="space-y-4">
            {error && <Alert variant="destructive">{error}</Alert>}
            <div className="space-y-2">
              <Label htmlFor="cedula">Cedula</Label>
              <Input
                id="cedula"
                autoFocus
                inputMode="numeric"
                autoComplete="username"
                value={cedula}
                onChange={(e) => setCedula(e.target.value.replace(/[^\d]/g, ""))}
                placeholder="Ej. 1712345678"
                maxLength={13}
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="password">Contraseña</Label>
              <Input
                id="password"
                type="password"
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
              />
            </div>
            <Button type="submit" className="w-full" size="lg" disabled={loading}>
              {loading ? (
                <>
                  <Loader2 className="animate-spin" />
                  Validando...
                </>
              ) : (
                "Entrar"
              )}
            </Button>
          </form>
        </CardContent>
      </Card>
    </main>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={<div className="p-10 text-center text-muted-foreground">Cargando...</div>}>
      <LoginForm />
    </Suspense>
  );
}

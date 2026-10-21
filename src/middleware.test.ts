import assert from "node:assert/strict";
import { it } from "node:test";
import { NextRequest } from "next/server";
import { middleware } from "./middleware";
import { createSessionToken, SESSION_COOKIE } from "./lib/auth/session";
import type { ExaAuthUser } from "./lib/auth/exaLogin";

async function requestConSesion(url: string, rol: ExaAuthUser["role"]) {
  const token = await createSessionToken({
    username: "1712345678",
    cedula: "1712345678",
    name: "Dev Uno",
    role: rol,
    projects: ["exa"],
    perCod: 42,
    usuCod: 10,
    prsCod: 5,
    empCod: 96,
    dbDis: "exa",
    teamName: "Dev Uno",
  });
  return new NextRequest(`https://gestion.exacontable.com${url}`, {
    headers: { cookie: `${SESSION_COOKIE}=${token}` },
  });
}

it("conserva el destino completo de un enlace compartido al pedir inicio de sesión", async () => {
  const request = new NextRequest("https://gestion.exacontable.com/tickets?detalle=42&db=servicios");
  const response = await middleware(request);
  assert.equal(response.status, 307);
  const destination = new URL(response.headers.get("location") || "");
  assert.equal(destination.pathname, "/login");
  assert.equal(destination.searchParams.get("next"), "/tickets?detalle=42&db=servicios");
  assert.equal(destination.searchParams.has("detalle"), false);
});

it("deja listar el equipo al desarrollador que registra avances", async () => {
  const request = await requestConSesion(
    "/api/devs?view=colaboradores&asignables=1&Ses_Dat_Dis=exa",
    "developer"
  );
  const response = await middleware(request);
  assert.equal(response.status, 200);
});

it("sigue reservando el monitoreo al encargado", async () => {
  const request = await requestConSesion("/api/devs?view=devs&Ses_Dat_Dis=exa", "developer");
  const response = await middleware(request);
  assert.equal(response.status, 403);
});

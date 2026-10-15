import assert from "node:assert/strict";
import { it } from "node:test";
import { NextRequest } from "next/server";
import { middleware } from "./middleware";

it("conserva el destino completo de un enlace compartido al pedir inicio de sesión", async () => {
  const request = new NextRequest("https://gestion.exacontable.com/tickets?detalle=42&db=servicios");
  const response = await middleware(request);
  assert.equal(response.status, 307);
  const destination = new URL(response.headers.get("location") || "");
  assert.equal(destination.pathname, "/login");
  assert.equal(destination.searchParams.get("next"), "/tickets?detalle=42&db=servicios");
  assert.equal(destination.searchParams.has("detalle"), false);
});

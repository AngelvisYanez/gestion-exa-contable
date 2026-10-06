import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { allowedDatabases, sanitizeDbDis, sharesServer } from "./db";
import { ticketEstadoToKanban } from "./ticket-view";
import type { Ticket } from "./ticket-view";
import { kanbanToTicketEstado, pickTicketByOrigen, resumirTickets, ticketPerteneceA } from "./tickets";

function ticket(partial: Partial<Ticket> & Pick<Ticket, "Tic_Cod" | "Db_Origen">): Ticket {
  return {
    Tic_Titulo: "t",
    Tic_Descripcion: null,
    Tic_Prioridad: "Media",
    Tic_Estado: "Asignado",
    Tic_Estado_Cod: "2",
    Tic_Origen: "panel",
    Per_Cod_Asignado: null,
    Asignado_Nombre: null,
    Asignado_Usu_Cod: null,
    Tar_Cod: null,
    Emp_Cod: 1,
    Emp_Nom: null,
    Usu_Creador: null,
    Creador_Nombre: null,
    Tic_Fecha_Llegada: "2026-10-06",
    Tic_Fecha_Asignacion: null,
    Tic_Tel: null,
    Tic_Obs: null,
    Enviado_Por: null,
    Proceso: null,
    Evidencias: [],
    ...partial,
  };
}

describe("cruce de tickets entre bases", () => {
  it("sin origen pedido solo acepta un candidato", () => {
    const exa = ticket({ Tic_Cod: 10, Db_Origen: "exa" });
    const servicios = ticket({ Tic_Cod: 10, Db_Origen: "servicios" });
    assert.equal(pickTicketByOrigen([exa]), exa);
    assert.equal(pickTicketByOrigen([exa, servicios]), null);
  });

  it("con origen pedido no adivina otra base", () => {
    const exa = ticket({ Tic_Cod: 10, Db_Origen: "exa" });
    const relavera = ticket({ Tic_Cod: 10, Db_Origen: "relavera" });
    assert.equal(pickTicketByOrigen([exa, relavera], "relavera"), relavera);
    assert.equal(pickTicketByOrigen([exa, relavera], "servicios"), null);
    assert.equal(pickTicketByOrigen([exa], "relavera_empresa"), null);
  });

  it("reconoce al asignado por usuario, ficha o lista", () => {
    const mio = ticket({
      Tic_Cod: 1,
      Db_Origen: "servicios",
      Asignado_Usu_Cod: 20,
      Per_Cod_Asignado: 7,
      Asignados: [{ Usu_Cod: 99, Per_Cod: 7, Nombre: "N" }],
    });
    assert.equal(ticketPerteneceA(mio, [20]), true);
    assert.equal(ticketPerteneceA(mio, [1], 7), true);
    assert.equal(ticketPerteneceA(mio, [1], 8), false);
  });

  it("resume estados sin mezclar cerrados con asignados", () => {
    const rows = [
      ticket({ Tic_Cod: 1, Db_Origen: "exa", Tic_Estado: "Cerrado" }),
      ticket({ Tic_Cod: 2, Db_Origen: "servicios", Tic_Estado: "En Proceso" }),
      ticket({ Tic_Cod: 3, Db_Origen: "relavera", Tic_Estado: "Nuevo" }),
    ];
    const k = resumirTickets(rows);
    assert.equal(k.total, 3);
    assert.equal(k.resueltos, 1);
    assert.equal(k.proceso, 1);
    assert.equal(k.nuevos, 1);
    assert.equal(k.asignados, 1);
  });
});

describe("estados de ticket", () => {
  it("traduce kanban y ticket en los dos sentidos", () => {
    assert.equal(kanbanToTicketEstado("Finalizada"), "Cerrado");
    assert.equal(kanbanToTicketEstado("Pendiente"), "Nuevo");
    assert.equal(ticketEstadoToKanban("Cerrado"), "Finalizada");
    assert.equal(ticketEstadoToKanban("Nuevo"), "Pendiente");
  });
});

describe("bases permitidas", () => {
  it("sin host de Relavera no la ofrece y EXA comparte servidor con Servicios", () => {
    delete process.env.RELAVERA_DB_HOST;
    process.env.DATABASE_NAMES = "exa,servicios,relavera";
    process.env.DATABASE_HOST = "127.0.0.1";
    process.env.DATABASE_PORT = "3306";
    assert.deepEqual(allowedDatabases(), ["exa", "servicios"]);
    assert.equal(sanitizeDbDis("servicios"), "servicios");
    assert.equal(sanitizeDbDis("relavera"), "exa");
    assert.equal(sharesServer("exa", "servicios"), true);
    assert.equal(sharesServer("exa", "relavera"), false);
  });
});

describe("registro de ExaMonitor", () => {
  it("la version del agente esta en el registro del repo", () => {
    const agent = readFileSync("agente_monitoreo/exa_agent.py", "utf8");
    const match = agent.match(/AGENT_VERSION = "([^"]+)"/);
    assert.ok(match);
    const registro = readFileSync("agente_monitoreo/VERSIONES.md", "utf8");
    assert.ok(registro.includes(match[1]));
  });
});

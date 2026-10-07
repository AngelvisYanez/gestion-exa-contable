import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { armarBandejaMesa, bandejaAsignadaDev } from "./monitoreo-bandeja";
import { parseAsignadosTicket, parsePerCodsTarea } from "./monitoreo-asignacion";
import type { TrabajoMonitorItem } from "./monitoreo";

function item(
  partial: Partial<TrabajoMonitorItem> & Pick<TrabajoMonitorItem, "Tar_Cod" | "tipo">
): TrabajoMonitorItem {
  return {
    Tar_Titulo: "t",
    Tar_Titulo_Plain: "t",
    Tar_Prioridad: "Media",
    Tar_Estado: "Pendiente",
    Tar_Fecha_Fin: null,
    Ava_Porcentaje: 0,
    Ava_Ultima_Fecha: null,
    label: "t",
    ...partial,
  };
}

describe("bandeja de ExaMonitor", () => {
  const tareasSin = [item({ Tar_Cod: 1, tipo: "tarea", Tar_Titulo_Plain: "libre" })];
  const ticketsSin = [
    item({ Tar_Cod: 10, tipo: "ticket", Tic_Cod: 10, Db_Origen: "exa" }),
  ];
  const tareasMias = [item({ Tar_Cod: 2, tipo: "tarea" }), item({ Tar_Cod: 1, tipo: "tarea" })];
  const ticketsMios = [
    item({ Tar_Cod: 11, tipo: "ticket", Tic_Cod: 11, Db_Origen: "servicios" }),
    item({ Tar_Cod: 10, tipo: "ticket", Tic_Cod: 10, Db_Origen: "exa" }),
  ];

  it("encargado ve tareas y tickets por asignar y asignados", () => {
    const out = armarBandejaMesa({
      tareasSinAsignar: tareasSin,
      ticketsSinAsignar: ticketsSin,
      tareasMias,
      ticketsMios,
    });
    const porAsignar = out.filter((t) => t.por_asignar);
    const mios = out.filter((t) => !t.por_asignar);
    assert.deepEqual(
      porAsignar.map((t) => `${t.tipo}:${t.Tar_Cod}`),
      ["tarea:1", "ticket:10"]
    );
    assert.deepEqual(
      mios.map((t) => `${t.tipo}:${t.Tar_Cod}`),
      ["tarea:2", "ticket:11"]
    );
  });

  it("el desarrollador no recibe la cola por asignar", () => {
    const mezclado = [
      item({ Tar_Cod: 1, tipo: "tarea", por_asignar: true }),
      item({ Tar_Cod: 2, tipo: "tarea" }),
      item({ Tar_Cod: 3, tipo: "ticket", por_asignar: false }),
    ];
    const out = bandejaAsignadaDev(mezclado);
    assert.deepEqual(
      out.map((t) => t.Tar_Cod),
      [2, 3]
    );
    assert.equal(out.every((t) => t.por_asignar === false), true);
  });
});

describe("asignacion multiple desde ExaMonitor", () => {
  it("acepta varias personas en un ticket y un solo Usu_Cod de respaldo", () => {
    const varias = parseAsignadosTicket(
      JSON.stringify([
        { Usu_Cod: 4, Per_Cod: 9 },
        { Usu_Cod: 4, Per_Cod: 9 },
        { usuCod: 7 },
      ])
    );
    assert.deepEqual(varias, [
      { usuCod: 4, perCod: 9 },
      { usuCod: 7 },
    ]);
    assert.deepEqual(parseAsignadosTicket("", 15), [{ usuCod: 15 }]);
    assert.deepEqual(parseAsignadosTicket("no-json", 0), []);
    assert.deepEqual(parseAsignadosTicket("4,7", 0), [{ usuCod: 4 }, { usuCod: 7 }]);
  });

  it("acepta varios Per_Cod en una tarea", () => {
    assert.deepEqual(parsePerCodsTarea(JSON.stringify([3, 3, { Per_Cod: 8 }])), [3, 8]);
    assert.deepEqual(parsePerCodsTarea("5, 6, 0, x"), [5, 6]);
    assert.deepEqual(parsePerCodsTarea(""), []);
  });
});

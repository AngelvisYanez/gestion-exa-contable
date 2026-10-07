import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { estadoTrasAvance } from "./ticket-avances";
import { ticketAsTarea, type Ticket } from "./ticket-view";
import { parseAsignadosTicket } from "./monitoreo-asignacion";

function base(partial: Partial<Ticket> = {}): Ticket {
  return {
    Tic_Cod: 1,
    Tic_Titulo: "t",
    Tic_Descripcion: null,
    Tic_Prioridad: "Media",
    Tic_Estado: "Asignado",
    Tic_Estado_Cod: "2",
    Tic_Origen: "panel",
    Per_Cod_Asignado: 1,
    Asignado_Nombre: "Ana",
    Asignado_Usu_Cod: 4,
    Tar_Cod: null,
    Emp_Cod: 1,
    Emp_Nom: null,
    Usu_Creador: null,
    Creador_Nombre: null,
    Tic_Fecha_Llegada: "2026-10-01T12:00:00.000Z",
    Tic_Fecha_Asignacion: "2026-10-08T12:00:00.000Z",
    Tic_Tel: null,
    Tic_Obs: null,
    Enviado_Por: null,
    Proceso: null,
    Evidencias: [],
    ...partial,
  };
}

describe("cierre del ticket por avance", () => {
  it("100% cierra y un porcentaje menor no", () => {
    assert.equal(estadoTrasAvance(100), "Cerrado");
    assert.equal(estadoTrasAvance(40), "En Proceso");
    assert.equal(estadoTrasAvance(0), null);
  });

  it("el porcentaje vigente no se inventa por el estado", () => {
    const asignado = ticketAsTarea(base({ Ava_Porcentaje: 25, Fecha_Asignacion: "2026-10-06T15:00:00.000Z" }));
    assert.equal(asignado.Ava_Porcentaje, 25);
    assert.equal(asignado.Fecha_Asignacion, "2026-10-06T15:00:00.000Z");
    assert.notEqual(asignado.Fecha_Asignacion, asignado.Tar_Fecha_Culminacion);

    const sinAvance = ticketAsTarea(base({ Ava_Porcentaje: null }));
    assert.equal(sinAvance.Ava_Porcentaje, 0);

    const cerrado = ticketAsTarea(base({ Tic_Estado: "Cerrado", Ava_Porcentaje: null }));
    assert.equal(cerrado.Ava_Porcentaje, 100);
  });

  it("cada registro de asignacion multiple trae quien lo hizo", () => {
    const varias = parseAsignadosTicket("4,7", 0);
    assert.deepEqual(varias, [{ usuCod: 4 }, { usuCod: 7 }]);
    const compacto = parseAsignadosTicket('[{"Usu_Cod":9,"Per_Cod":3}]', 0);
    assert.deepEqual(compacto, [{ usuCod: 9, perCod: 3 }]);
  });
});

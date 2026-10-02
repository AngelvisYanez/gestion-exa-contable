import { scanOfsercontModule, type OfsercontScan } from "./ofsercont-scan";

export type BriefTipo = "mejora" | "creacion";

export type BriefInput = {
  tarCod: number;
  titulo: string;
  descripcion: string;
  proceso: string;
  modulo: string;
  directorio: string;
  tipo: BriefTipo;
  asignados?: string[];
  fecha?: Date;
};

function plainText(htmlOrText: string): string {
  return String(htmlOrText || "")
    .replace(/<\s*br\s*\/?>/gi, "\n")
    .replace(/<\/(p|div|li|h[1-6])>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .replace(/[ \t]{2,}/g, " ")
    .trim();
}

function fechaEs(d: Date): string {
  return d.toLocaleDateString("es-EC", {
    timeZone: "America/Guayaquil",
    day: "2-digit",
    month: "long",
    year: "numeric",
  });
}

function tipoLabel(tipo: BriefTipo): string {
  return tipo === "creacion" ? "BRIEF DE CREACIÓN DE MÓDULO" : "BRIEF DE MEJORA DE MÓDULOS";
}

function tipoCorto(tipo: BriefTipo): string {
  return tipo === "creacion" ? "creacion de modulo" : "mejora de modulos";
}

export function buildBriefMarkdown(input: BriefInput, scan?: OfsercontScan): string {
  const fecha = input.fecha || new Date();
  const desc = plainText(input.descripcion) || "(Sin descripcion)";
  const proceso = input.proceso.trim() || "—";
  const modulo = input.modulo.trim() || "—";
  const directorio = input.directorio.trim() || "—";
  const asignados =
    input.asignados && input.asignados.length
      ? input.asignados.join(", ")
      : "Equipo de desarrollo";
  const inventory = scan || scanOfsercontModule({ directorio: input.directorio, modulo: input.modulo });

  const fileLines = inventory.files.length
    ? inventory.files.map((f) => `- \`${f.rel}\``).join("\n")
    : "- (Sin archivos listados en el alcance indicado)";

  const esMejora = input.tipo !== "creacion";

  return `# EXA OFSERCONT

# ${tipoLabel(input.tipo)}

## ${input.titulo}

**Tarea:** #${input.tarCod}  
**Proceso:** ${proceso}  
**Módulo:** ${modulo}  
**Directorio:** ${directorio}  
**Audiencia:** ${asignados}  
**Fecha:** ${fechaEs(fecha)} | Uso interno

---

## 1. Qué tiene que quedar resuelto

${desc}

### Mensaje para el equipo

Este brief define el alcance de **${tipoCorto(input.tipo)}** a partir de la tarea #${input.tarCod}.
${
  esMejora
    ? "Las correcciones deben caber en las pantallas, la lógica y el SQL que ya existen. No se abre un módulo paralelo salvo que el alcance lo exija explícitamente."
    : "Se define un módulo/flujo nuevo anclado al directorio y convenciones EXA existentes (FRONT / LOGICA / VALIDACIONES)."
}

### Tres hechos que el equipo debe tener claros

1. El alcance parte del **proceso** \`${proceso}\` y del **módulo** \`${modulo}\`.
2. El código a revisar vive bajo **directorio** \`${directorio}\` en el sistema EXA OFSERCONT.
3. Primero se corta el alta/edición incorrecta (o se entrega el alta del módulo); el histórico se trata en un pase aparte si aplica.

### Orden de trabajo

| Orden | Entrega | Para qué |
|------:|---------|----------|
| 1 | Confirmar pantallas y casos SQL del directorio | Anclar el cambio al código real |
| 2 | ${esMejora ? "Diagnosticar causa raíz y huecos de validación" : "Diseñar esquema de datos y pantallas FRONT/LOGICA"} | Evitar trabajo paralelo o inventado |
| 3 | Implementar en cliente y servidor | Paridad UI + persistencia |
| 4 | Prueba operativa / corte | Verificar el criterio de hecho de la tarea |
| 5 | Documentar fuera de alcance | Separar histórico y deuda |

### Fuera de este cambio

No rehacer el histórico en el mismo cambio salvo que la tarea lo pida. Los casos ya grabados se listan y corrigen en un pase aparte, documento por documento.

---

## 2. Esquema y módulo actual

| Campo | Valor |
|-------|-------|
| Proceso | ${proceso} |
| Módulo | ${modulo} |
| Directorio | ${directorio} |
| Raíz OFSERCONT | \`${inventory.root}\` |
| Subruta resuelta | ${inventory.resolvedDir ? `\`${inventory.resolvedDir}\`` : "(no resuelta)"} |

${inventory.note}

### Archivos relevantes detectados

${fileLines}

${
  esMejora
    ? `### Qué valida hoy y qué no valida

| Sí entra hoy (a confirmar en código) | No entra hoy (hueco a cerrar) |
|--------------------------------------|-------------------------------|
| Flujos FRONT/LOGICA listados arriba | Reglas de negocio de la descripción de la tarea |
| Persistencia existente del módulo | Revalidación servidor si solo hay JS |
| Consultas/reportes del proceso | Paridad en pantallas de modificación |

`
    : `### Piezas a crear (plantilla)

| Pieza | Ubicación sugerida |
|-------|--------------------|
| Pantalla FRONT | \`${directorio}/FRONT/\` |
| Lógica / SQL | \`${directorio}/LOGICA/\` |
| Validaciones JS | \`${directorio}/VALIDACIONES/\` |
| Menú / permisos | Según proceso \`${proceso}\` |

`
}

---

## 3. Causa raíz / alcance funcional

Partir de la descripción de la tarea y del inventario de archivos. Completar en implementación:

1. ¿Qué pantalla o caso SQL reproduce el problema (o el alta del módulo)?
2. ¿Qué campo/tabla guarda el estado incorrecto o el nuevo dato?
3. ¿Hay validación solo en cliente, solo en servidor, o en ninguno?

---

## 4. Impacto

- Operativo: proceso **${proceso}**, módulo **${modulo}**.
- Técnico: directorio \`${directorio}\` en EXA OFSERCONT.
- Riesgo si no se cierra: la tarea #${input.tarCod} queda sin criterio de hecho documentado.

---

## 5. Alcance de la corrección / entrega

1. Actualizar o crear pantallas y lógica bajo \`${directorio}\`.
2. Validar en cliente y servidor según el tipo de brief.
3. Probar el caso descrito en la tarea #${input.tarCod}.
4. Dejar evidencia (avance + brief en \`docs/\`).

---

## 6. Criterio de hecho

- [ ] Brief revisado por encargado
- [ ] Cambios en el directorio indicado
- [ ] Prueba del caso de la descripción
- [ ] Avance registrado en el panel de gestión

---

*Generado desde EXA Tareas (gestion) · Tar_Cod ${input.tarCod}*
`;
}

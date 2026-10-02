import fs from "fs";
import { writeBriefPdf } from "../src/lib/brief/pdf";

const md = fs.readFileSync("docs/Brief_GESTION_163_20261001.md", "utf8");
const out = "docs/Brief_GESTION_163_DISENO.pdf";
const r = writeBriefPdf(out, {
  titulo: "Validacion de anticipos en cancelacion por lotes",
  tipoLabel: "BRIEF DE MEJORA DE MODULOS",
  subtitulo: "Anticipo debe ser anterior a la factura que se da de baja en CxPP.",
  resumen: "Diagnostico, causa raiz, impacto en el corte y plan de correccion.",
  audiencia: "Para el equipo de tesoreria, contabilidad y cuentas por pagar.",
  fecha: "01 de octubre de 2026",
  proceso: "Tesoreria",
  modulo: "Cancelacion por lotes",
  directorio: "tesoreria",
  chips: [
    "Tesoreria",
    "Cancelacion por lotes",
    "tes_alt_ccpp_lotes_2.0",
    "Anticipos",
    "Atp_Fec <= Cop_Fec",
    "Corte CxPP",
  ],
  markdown: md,
});
const st = fs.statSync(out);
console.log(JSON.stringify({ engine: r.engine, bytes: st.size, out }));

> **Nota:** No se pudo completar con Gemini (This model is currently experiencing high demand. Spikes in demand are usually temporary. Please try again later.). Brief plantilla + inventario.

# EXA OFSERCONT

# BRIEF DE MEJORA DE MÓDULOS

## GESTION - prueba brief UI local

**Tarea:** #163  
**Proceso:** Tesoreria  
**Módulo:** Cancelacion por lotes  
**Directorio:** tesoreria  
**Audiencia:** Yanez Angelvis  
**Fecha:** 01 de octubre de 2026 | Uso interno

---

## 1. Qué tiene que quedar resuelto

Prueba E2E: brief de mejora para cancelacion por lotes / anticipos. Validar Gemini y docs/.

### Mensaje para el equipo

Este brief define el alcance de **mejora de modulos** a partir de la tarea #163.
Las correcciones deben caber en las pantallas, la lógica y el SQL que ya existen. No se abre un módulo paralelo salvo que el alcance lo exija explícitamente.

### Tres hechos que el equipo debe tener claros

1. El alcance parte del **proceso** `Tesoreria` y del **módulo** `Cancelacion por lotes`.
2. El código a revisar vive bajo **directorio** `tesoreria` en el sistema EXA OFSERCONT.
3. Primero se corta el alta/edición incorrecta (o se entrega el alta del módulo); el histórico se trata en un pase aparte si aplica.

### Orden de trabajo

| Orden | Entrega | Para qué |
|------:|---------|----------|
| 1 | Confirmar pantallas y casos SQL del directorio | Anclar el cambio al código real |
| 2 | Diagnosticar causa raíz y huecos de validación | Evitar trabajo paralelo o inventado |
| 3 | Implementar en cliente y servidor | Paridad UI + persistencia |
| 4 | Prueba operativa / corte | Verificar el criterio de hecho de la tarea |
| 5 | Documentar fuera de alcance | Separar histórico y deuda |

### Fuera de este cambio

No rehacer el histórico en el mismo cambio salvo que la tarea lo pida. Los casos ya grabados se listan y corrigen en un pase aparte, documento por documento.

---

## 2. Esquema y módulo actual

| Campo | Valor |
|-------|-------|
| Proceso | Tesoreria |
| Módulo | Cancelacion por lotes |
| Directorio | tesoreria |
| Raíz OFSERCONT | `C:\Users\ismaa\OneDrive\Documentos\GitHub\exa-ofsercont` |
| Subruta resuelta | `tesoreria` |

Inventario bajo tesoreria (max 80).

### Archivos relevantes detectados

- `tesoreria/backend/tes_alt_cliente_1.0.php`
- `tesoreria/COMPONENTES/ajax_com_bus_renta_iva.php`
- `tesoreria/COMPONENTES/ajax_com_con_numcom.php`
- `tesoreria/COMPONENTES/ajax_com_con_numret.php`
- `tesoreria/COMPONENTES/ajax_com_deudas_est.php`
- `tesoreria/COMPONENTES/ajax_com_deudas.php`
- `tesoreria/COMPONENTES/ajax_com_matriculactual.php`
- `tesoreria/COMPONENTES/ajax_com_mod_numret.php`
- `tesoreria/COMPONENTES/ajax_com_producto.php`
- `tesoreria/COMPONENTES/ajax_com_suc_mod_eta_per_car_all.php`
- `tesoreria/COMPONENTES/ajax_con_ctaAjuste.php`
- `tesoreria/COMPONENTES/ajax_con_ctaCajaChica_1.0.php`
- `tesoreria/COMPONENTES/ajax_con_ctaCajaChica.php`
- `tesoreria/COMPONENTES/ajax_con_ctaguia.php`
- `tesoreria/COMPONENTES/ajaxComBusRentaIva.php`
- `tesoreria/COMPONENTES/ajaxComConNumCom.php`
- `tesoreria/COMPONENTES/ajaxComConNumRet.php`
- `tesoreria/COMPONENTES/com_con_cta_compras_2.0.php`
- `tesoreria/COMPONENTES/com_con_ctaAjuste.php`
- `tesoreria/COMPONENTES/com_con_ctaCajaChica_1.0.php`
- `tesoreria/COMPONENTES/com_con_ctaCajaChica.php`
- `tesoreria/COMPONENTES/com_con_numcom.php`
- `tesoreria/COMPONENTES/comConNumcom.php`
- `tesoreria/COMPONENTES/con_con_anio_mes_fecha.php`
- `tesoreria/COMPONENTES/con_con_detalleCompr.php`
- `tesoreria/COMPONENTES/fac_alt_fac_ven_2.0.php`
- `tesoreria/COMPONENTES/index.php`
- `tesoreria/COMPONENTES/tes_com_ann_mes_ven.php`
- `tesoreria/COMPONENTES/tes_com_bus_renta_iva_2.0.php`
- `tesoreria/COMPONENTES/tes_com_bus_renta_iva.php`
- `tesoreria/COMPONENTES/tes_com_cheques_compra.php`
- `tesoreria/COMPONENTES/tes_com_cheques.php`
- `tesoreria/COMPONENTES/tes_com_con_cheque.php`
- `tesoreria/COMPONENTES/tes_com_det_rolpagos_1.0.php`
- `tesoreria/COMPONENTES/tes_com_det_rolpagos_2.0.php`
- `tesoreria/COMPONENTES/tes_com_det_rolpagos_2.1.php`
- `tesoreria/COMPONENTES/tes_com_det_rolpagos_3.0.php`
- `tesoreria/COMPONENTES/tes_com_det_rolpagos.php`
- `tesoreria/COMPONENTES/tes_com_detalle_com.php`
- `tesoreria/COMPONENTES/tes_com_detalle_ven.php`
- `tesoreria/COMPONENTES/tes_com_deudas.php`
- `tesoreria/COMPONENTES/tes_com_fac_consulta.php`
- `tesoreria/COMPONENTES/tes_com_fac_credito.php`
- `tesoreria/COMPONENTES/tes_com_fac_pagos.php`
- `tesoreria/COMPONENTES/tes_com_fact_proveedor.php`
- `tesoreria/COMPONENTES/tes_com_fec_corte.php`
- `tesoreria/COMPONENTES/tes_com_mod_cheques.php`
- `tesoreria/COMPONENTES/tes_com_mod_numret.php`
- `tesoreria/COMPONENTES/tes_com_numret.php`
- `tesoreria/COMPONENTES/tes_com_proyeccion.php`
- `tesoreria/COMPONENTES/tes_com_suc_mod_eta_per_car.php`
- `tesoreria/COMPONENTES/tes_com_tip_venc.php`
- `tesoreria/COMPONENTES/tes_con_anio_mes_fecha.php`
- `tesoreria/COMPONENTES/tesComAnnMesPrf.php`
- `tesoreria/COMPONENTES/tesComAnnMesVen.php`
- `tesoreria/COMPONENTES/tesComBusRentaIva.php`
- `tesoreria/COMPONENTES/tesComChequesCompra.php`
- `tesoreria/COMPONENTES/tesComConCheque.php`
- `tesoreria/COMPONENTES/tesComDetalleCom.php`
- `tesoreria/COMPONENTES/tesComDetalleCompr.php`
- `tesoreria/COMPONENTES/tesComDetalleVen.php`
- `tesoreria/COMPONENTES/tesComNumRet.php`
- `tesoreria/COMPONENTES/tesComRubrosConsulta_2.0.php`
- `tesoreria/COMPONENTES/tesComRubrosConsulta.php`
- `tesoreria/COMPONENTES/tesComRubrosConsulta1.php`
- `tesoreria/COMPONENTES/tesComRubrosConsulta2.php`
- `tesoreria/COMPONENTES/tesComRubrosConsultaCompras.php`
- `tesoreria/COMPONENTES/tesComRubrosFac.php`
- `tesoreria/COMPONENTES/tesComRubrosFac1.php`
- `tesoreria/COMPONENTES/tesComRubrosFac2.php`
- `tesoreria/COMPONENTES/tesConCtaCompras.php`
- `tesoreria/FRONT/cheques/1/index.php`
- `tesoreria/FRONT/cheques/1/tes_pri_cheque_gua_1.0.php`
- `tesoreria/FRONT/cheques/1/tes_pri_cheque_int_1.0.php`
- `tesoreria/FRONT/cheques/1/tes_pri_cheque_loj_1.0.php`
- `tesoreria/FRONT/cheques/1/tes_pri_cheque_mac_1.0.php`
- `tesoreria/FRONT/cheques/1/tes_pri_cheque_pac_1.0.php`
- `tesoreria/FRONT/cheques/1/tes_pri_cheque_pch_1.0.php`
- `tesoreria/FRONT/cheques/1/tes_pri_cheque_rum_1.0.php`
- `tesoreria/FRONT/cheques/10/index.php`

### Qué valida hoy y qué no valida

| Sí entra hoy (a confirmar en código) | No entra hoy (hueco a cerrar) |
|--------------------------------------|-------------------------------|
| Flujos FRONT/LOGICA listados arriba | Reglas de negocio de la descripción de la tarea |
| Persistencia existente del módulo | Revalidación servidor si solo hay JS |
| Consultas/reportes del proceso | Paridad en pantallas de modificación |



---

## 3. Causa raíz / alcance funcional

Partir de la descripción de la tarea y del inventario de archivos. Completar en implementación:

1. ¿Qué pantalla o caso SQL reproduce el problema (o el alta del módulo)?
2. ¿Qué campo/tabla guarda el estado incorrecto o el nuevo dato?
3. ¿Hay validación solo en cliente, solo en servidor, o en ninguno?

---

## 4. Impacto

- Operativo: proceso **Tesoreria**, módulo **Cancelacion por lotes**.
- Técnico: directorio `tesoreria` en EXA OFSERCONT.
- Riesgo si no se cierra: la tarea #163 queda sin criterio de hecho documentado.

---

## 5. Alcance de la corrección / entrega

1. Actualizar o crear pantallas y lógica bajo `tesoreria`.
2. Validar en cliente y servidor según el tipo de brief.
3. Probar el caso descrito en la tarea #163.
4. Dejar evidencia (avance + brief en `docs/`).

---

## 6. Criterio de hecho

- [ ] Brief revisado por encargado
- [ ] Cambios en el directorio indicado
- [ ] Prueba del caso de la descripción
- [ ] Avance registrado en el panel de gestión

---

*Generado desde EXA Tareas (gestion) · Tar_Cod 163*

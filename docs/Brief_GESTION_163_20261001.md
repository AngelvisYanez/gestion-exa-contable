# EXA OFSERCONT
**BRIEF DE MEJORA DE MÓDULOS**

- **Título:** GESTION (Cancelación por lotes)
- **Proceso:** Tesorería
- **Módulo:** Cancelación por lotes
- **Directorio:** `tesoreria`
- **Asignado a:** Yanez Angelvis
- **Audiencia:** Equipo de Desarrollo / Analistas Funcionales / QA
- **Fecha:** 2025-03-30 (America/Guayaquil)

---

### 1. Qué tiene que quedar resuelto
El requerimiento funcional bajo el módulo de **Cancelación por lotes** (tarea #163: "GESTION") carece de descripción detallada en metadatos. Debe quedar formalizado, estructurado y técnicamente alineado el flujo de gestión operativa de pagos/cancelaciones masivas dentro del subsistema de tesorería, asegurando que:
- Se identifiquen y unifiquen las pantallas reales de carga, selección y procesamiento de documentos por lote (facturas de proveedores/deudas pendientes).
- Se garantice el soporte de validación de comprobantes, asignación de medios de pago (transferencias, cheques, ajustes de caja chica) y generación de movimientos asociados sin romper la compatibilidad de variables globales (`register_globals.php`) y conexiones legacy (`@$obBD_conexion`).
- Queden delimitados los componentes AJAX auxiliares utilizados en la consulta de deudas y números de comprobante frente a la dispersión de versiones identificada en el inventario.

---

### 2. Esquema y módulo actual (o flujo)
El proceso de tesorería en EXA OFSERCONT opera mediante un esquema transaccional legacy dividido entre componentes asíncronos y scripts directos:

```
[ FRONT / Interfaz Usuario ]
           │
           ├─► Selección/Filtro por Proveedor/Período
           │        │
           │        ▼
           ├─► tesoreria/COMPONENTES/ajax_com_deudas.php (o tes_com_deudas.php)
           │   Consultas de saldos, deudas y facturas por cancelar
           │        │
           │        ▼
           ├─► tesoreria/COMPONENTES/com_con_numcom.php / ajax_com_con_numcom.php
           │   Validación de formato de documento (999-999-9999999) vía JS/AJAX
           │        │
           │        ▼
[ LÓGICA DE PROCESAMIENTO ]
           │
           ├─► Asignación de Pagos / Cheques / Ajustes
           │   - Emisión de cheques parametrizados por banco:
           │     `tesoreria/FRONT/cheques/1/tes_pri_cheque_*.1.0.php`
           │   - Cuentas de ajuste y caja chica:
           │     `tesoreria/COMPONENTES/ajax_con_ctaAjuste.php`
           │     `tesoreria/COMPONENTES/com_con_ctaCajaChica.php`
           │        │
           │        ▼
[ CIERRE DE LOTE ]
           └─► Actualización de estado de cuentas por pagar y retenciones
               (`tesoreria/COMPONENTES/tes_com_fac_pagos.php` / `tesComNumRet.php`)
```

---

### 3. Causa raíz / alcance funcional
1. **Falta de especificación inicial:** La tarea #163 fue registrada sin descripción ("(sin descripcion)"), lo que requiere delimitar de inmediato la operativa asignada para no introducir código redundante o aislado.
2. **Duplicidad y disparidad de versiones de componentes:** Existen múltiples archivos concurrentes para la misma función dentro de `tesoreria/COMPONENTES/` (por ejemplo: `tes_com_det_rolpagos_1.0.php` hasta `3.0.php`, `ajax_com_bus_renta_iva.php` vs `tes_com_bus_renta_iva_2.0.php`, `com_con_numcom.php` vs `comConNumcom.php`).
3. **Inconsistencias en validación de entradas:** Componentes como `tesoreria/COMPONENTES/com_con_numcom.php` ejecutan validaciones puramente en el evento `onblur` de JavaScript sin estandarización de manejo de respuestas asíncronas para procesamiento masivo/por lotes.
4. **Dependencias del entorno legacy:** El código depende de directivas obsoletas como `split('[/.-]', $fecha)` (PHP 5.x) y variables extraídas del entorno mediante `register_globals.php`, propensas a fallos bajo actualizaciones del motor PHP.

---

### 4. Impacto
- **Operativo:** Riesgo de descuadres en carteras de proveedores por duplicidad en la afectación de pagos cuando se cancelan lotes sin bloqueos de concurrencia adecuados.
- **Técnico:** Dispersión y deuda técnica acumulada por coexistencia de archivos camelCase y snake_case con versiones numéricas flotantes (`_1.0.php`, `_2.0.php`).
- **Mantenibilidad:** Imposibilidad de trazabilidad si la cancelación por lotes ejecuta scripts enrutados a diferentes versiones de componentes de pago/cheques.

---

### 5. Alcance de la corrección / entrega (orden de trabajo numerado)
1. **Confirmación de alcance funcional en código:**
   - Levantar la pantalla principal que invoca la "Cancelación por lotes" (*a confirmar en código: verificar si corresponde a `tesoreria/COMPONENTES/tes_com_fac_pagos.php` o una vista contenedora en `FRONT`*).
   - Validar con el asignado (Yanez Angelvis) si "GESTION" abarca la conciliación masiva, el cambio de estado de lotes de cheques o la cancelación masiva de facturas comerciales.
2. **Estandarización de componentes de consulta:**
   - Fijar el punto de entrada oficial para la validación de comprobantes, unificando el consumo sobre `tesoreria/COMPONENTES/com_con_numcom.php` y su endpoint AJAX asociado `tesoreria/COMPONENTES/ajax_com_con_numcom.php`.
   - Homogeneizar la consulta de deudas pendientes sobre `tesoreria/COMPONENTES/ajax_com_deudas.php`.
3. **Control de datos y reglas de negocio en la gestión de lotes:**
   - Asegurar que la lógica de cancelación por lotes aplique sumatorias exactas con dos decimales (`number_format(..., 2)`) coincidiendo con los formatos bancarios definidos en `tesoreria/FRONT/cheques/1/`.
   - Depurar llamados a funciones obsoletas detectadas en reportes auxiliares (`split()` a reemplazar por `explode()` o expresiones compatibles cuando se intervenga el flujo).
4. **Verificación de cierre de conexión:**
   - Garantizar que todo script del lote contemple la liberación de punteros y cierre de conexiones (`@$obBD_con1->liberar()` y `@$obBD_conexion->cerrar()`) para evitar saturación del pool de base de datos durante procesamientos masivos.

---

### 6. Fuera de este cambio
- Modificación del diseño físico de los formatos de cheques bancarios (`tesoreria/FRONT/cheques/1/tes_pri_cheque_*.php`).
- Refactorización de módulos de liquidación de sueldos / roles de pago (`tesoreria/COMPONENTES/tes_com_det_rolpagos_*.php`).
- Migración general de la librería `register_globals.php` en todo el ERP.
- Creación de nuevos reportes imprimibles fuera de los formatos ya existentes en el repositorio.

---

### 7. Criterio de hecho (checklist)
- [ ] Alcance funcional específico de "GESTION" aclarado y confirmado con el desarrollador asignado (*a confirmar en código/requerimiento*).
- [ ] Vista o script de cancelación por lotes identificada y apuntando exclusivamente a componentes vigentes del inventario.
- [ ] Validación de número de comprobante ejecutada correctamente en lotes respetando la máscara `999-999-9999999`.
- [ ] Ningún warning/deprecated generado por funciones de división de cadenas en el flujo intervenido.
- [ ] Integridad referencial de comprobantes y deudas canceladas verificada en base de datos.
- [ ] Conexiones a base de datos liberadas y cerradas adecuadamente tras procesar transacciones por lote.
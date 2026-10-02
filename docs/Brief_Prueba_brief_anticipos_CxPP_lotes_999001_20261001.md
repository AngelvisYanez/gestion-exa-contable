# EXA OFSERCONT
## BRIEF DE MEJORA DE MÓDULOS

- **Título:** Prueba brief anticipos CxPP lotes (Tarea #999001)
- **Proceso:** Tesorería
- **Módulo:** Cancelación por lotes
- **Directorio:** `tesoreria`
- **Audiencia:** Equipo de desarrollo
- **Fecha:** 18 de mayo de 2025 (America/Guayaquil)

---

### 1. Qué tiene que quedar resuelto
En el proceso de cancelación por lotes a proveedores (cuentas por pagar - CxP), se debe impedir y validar que no se crucen ni apliquen anticipos cuya fecha (`Atp_Fec`) sea posterior a la fecha del comprobante o factura de compra (`Cop_Fec`). La regla de negocio estricta a exigir es:
$$\text{Atp\_Fec} \le \text{Cop\_Fec}$$
Cualquier intento de liquidar o cruzar un anticipo con fecha posterior a la fecha del documento por pagar debe ser bloqueado con un mensaje de validación claro para el usuario antes y durante el procesamiento.

---

### 2. Esquema y módulo actual (o flujo)
- **FRONT / Interfaz:** Pantalla del flujo de cancelación por lotes a proveedores (ruta exacta a confirmar en código dentro del módulo de Tesorería).
- **COMPONENTES / AJAX:** Componentes de consulta de deudas y cruces en `tesoreria/COMPONENTES/` (tales como `tes_com_deudas.php`, `ajax_com_deudas.php` o afines de cruce por lotes, a confirmar en código).
- **LOGICA / Backend:** Rutinas de procesamiento y validación SQL/PHP de cancelación masiva o cruce de anticipos de proveedores (rutas de backend/lógica a confirmar en código).
- **Flujo operativo:**
  1. El operador selecciona el lote de facturas pendientes a proveedores (`Cop_Fec`).
  2. Se seleccionan o asignan los anticipos registrados (`Atp_Fec`).
  3. Actualmente, el flujo permite procesar el cruce sin validar la cronología contable entre la emisión del anticipo y la emisión de la obligación.

---

### 3. Causa raíz / alcance funcional
- **Causa raíz:** Ausencia de validación lógica y de frontend que compare temporalmente `Atp_Fec` contra `Cop_Fec` previo a consolidar la transacción de cancelación en lote. Esto genera inconsistencias cronológicas y distorsión en la antigüedad de saldos y reportes tributarios/contables de CxP.
- **Alcance funcional:**
  - Control de consistencia en el formulario de selección/asignación del lote.
  - Validación de servidor (PHP) al momento de ejecutar la sentencia o procedimiento de cancelación por lotes.
  - Rechazo transaccional si `Atp_Fec > Cop_Fec`.

---

### 4. Impacto
- **Impacto funcional:** Garantiza coherencia contable y evita cruces indebidos de anticipos creados en fechas posteriores a las compras que pretenden cancelar.
- **Impacto técnico:** Modificación puntual en capas de validación (JS/FRONT) y control previo en controlador/lógica (PHP). No altera esquemas de base de datos ni afecta tablas maestras.
- **Riesgo:** Bajo. Si la validación no se maneja adecuadamente, podría bloquear cruces legítimos de misma fecha; por ende, se debe permitir explícitamente la igualdad (`Atp_Fec == Cop_Fec`).

---

### 5. Alcance de la corrección / entrega (orden de trabajo numerado)
1. **Identificación de scripts afectados:** Localizar en el repositorio los scripts exactos de FRONT y LOGICA correspondientes a la cancelación por lotes a proveedores (a confirmar en código bajo `tesoreria/`).
2. **Validación en capa FRONT / Cliente:**
   - Incorporar control JavaScript en la grilla/formulario de asignación de lotes para verificar que, por cada registro vinculado, `Atp_Fec <= Cop_Fec`.
   - Mostrar alerta descriptiva y deshabilitar el botón de procesamiento si se detecta un anticipo con fecha posterior a la factura.
3. **Validación en capa LOGICA / Backend:**
   - En el script receptor de la transacción (a confirmar en código), agregar validación estricta previa a la inserción/actualización:
     ```php
     if (strtotime($Atp_Fec) > strtotime($Cop_Fec)) {
         // Denegar procesamiento y retornar mensaje de error
     }
     ```
   - Abortar la transacción mediante rollback en caso de inconsistencia temporal.
4. **Respuesta visual:** Retornar notificación estándar mediante las clases de alerta del ERP (`Alertas3` / `gtk-no.gif`) indicando la imposibilidad de aplicar anticipos con fecha mayor a la fecha del comprobante.

---

### 6. Fuera de este cambio
- Modificaciones en la estructura de tablas de anticipos o compras.
- Cancelaciones individuales o pagos directos fuera del flujo de cancelación por lotes.
- Modificaciones en cheques o retenciones (`tesoreria/COMPONENTES/tes_com_cheques.php`, `ajax_com_con_numret.php`, etc.).

---

### 7. Criterio de hecho (checklist)
- [ ] Scripts de FRONT y LOGICA de cancelación por lotes identificados formalmente en el árbol de archivos.
- [ ] Validación en cliente implementada impidiendo el envío cuando `Atp_Fec > Cop_Fec`.
- [ ] Validación en backend implementada rechazando la solicitud si `strtotime($Atp_Fec) > strtotime($Cop_Fec)`.
- [ ] Verificado que registros con `Atp_Fec == Cop_Fec` procesen correctamente sin bloqueos indebidos.
- [ ] Verificado que registros con `Atp_Fec < Cop_Fec` procesen con normalidad.
- [ ] No se introducen errores de sintaxis ni incompatibilidades con PHP legacy.
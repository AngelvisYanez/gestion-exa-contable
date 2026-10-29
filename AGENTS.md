# Instrucciones de despliegue de exa-tareas-app

Esta instrucción se aplica solo a este repositorio y a `gestion.exacontable.com`. Antes de hacer un commit, push o despliegue, lee y sigue íntegramente [la regla de despliegue](.cursor/rules/despliegue-produccion.mdc). Su contenido es obligatorio aunque la tarea no mencione explícitamente el despliegue.

Después de un **commit solicitado por el usuario** y un **push exitoso a `origin/main`**, despliega ese mismo commit en producción y realiza todas las verificaciones indicadas en la regla. No hagas un commit o push solo para activar el despliegue. No despliegues un branch distinto, un commit que no llegó a `origin/main` ni cambios locales ajenos al commit publicado. Respeta cualquier instrucción explícita del usuario de no desplegar.

Si no puedes completar una comprobación o encuentras un bloqueo de seguridad de los descritos en la regla, detente antes del siguiente paso que dependa de ella e informa el SHA, el estado alcanzado y lo pendiente. No omitas silenciosamente el despliegue tras un push que cumpla las condiciones.

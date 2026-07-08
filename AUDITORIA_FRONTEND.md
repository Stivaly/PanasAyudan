# Auditoria frontend - modelo de nodos

Fecha: 2026-07-07

Base revisada con grafo `codebase_memory`, captura adjunta del panel de punto y
archivos frontend principales.

## Diagnostico corto

El frontend esta en un estado intermedio entre el modelo viejo
`aportes/recogidas` y el modelo nuevo de nodos. La separacion tecnica por rol
existe parcialmente en `/voluntarios`, pero las pantallas privilegiadas no
validan rol antes de renderizar UI sensible y el panel de voluntario todavia
mezcla flujos viejos con solicitudes nuevas.

El problema de duplicacion visto en la captura viene de que `/nodo` renderiza
la tarjeta operativa completa dentro de `nodos.map(...)`. Si un token administra
mas de un punto, se repiten verificacion, edicion, pausas, inventario y
solicitudes como si fueran bloques independientes completos. Para el usuario
parece que el formulario se duplico por error.

## Matriz de responsabilidades esperada

| Rol | Pantalla principal | Debe poder hacer | No debe ver |
| --- | --- | --- | --- |
| superadmin | `/superadmin` | Aprobar/rechazar solicitudes de nodo, cerrar nodos, crear admins asociados a un nodo | Inventario operativo diario del nodo |
| admin | `/nodo` | Gestionar su punto: datos, verificacion, pausas, inventario, solicitudes de insumos, envio/recepcion de compromisos | Pantalla de superadmin, flujos del voluntario |
| colaborador | `/nodo/colaborador` | Marcar inventario como agotado/no disponible y solicitar reposicion | Crear items estructurales, editar datos del nodo, pausar/cerrar |
| voluntario | `/voluntarios` | Ver solicitudes que requieren voluntario, responder con capacidad y tiempo estimado, solo dentro de zona/rango permitido | Inventario del punto, crear/editar nodos, panel admin, aportes viejos |
| publico | `/`, `/buscar`, `/registrar-nodo` | Consultar disponibilidad publica, pedir registro de nodo | Contactos privados, paneles operativos |

## Hallazgos por pantalla

### `/voluntarios`

Archivo: `src/app/voluntarios/page.tsx`.

Lo correcto:
- `resolverYRedirigir` obtiene el rol y manda `superadmin` a `/superadmin`,
  `admin` a `/nodo`, `colaborador` a `/nodo/colaborador` y deja
  `voluntario` en el panel.

Problemas:
- El panel de voluntario que se monta en esta ruta no es puro del modelo de
  nodos. `PanelVoluntario` todavia muestra "Mis aportes" y "Recogidas
  pendientes" del modelo viejo.
- El copy dice que el voluntario vera "aportes publicados" y "recogidas",
  cuando el objetivo nuevo es mostrar solo traslados/solicitudes que requieren
  voluntario.

Decision UI:
- Mantener `/voluntarios` como entrada/token/registro.
- Para rol `voluntario`, mostrar un panel dedicado a "Solicitudes para ayudar",
  no una mezcla de aportes, recogidas y administracion.

### `PanelVoluntario`

Archivo: `src/components/PanelVoluntario.tsx`.

Problemas:
- Carga aportes viejos con `getAportesVoluntario`.
- Se suscribe a tablas viejas `aportes` y `aporte_items`.
- Renderiza `Mis aportes`.
- Renderiza `Recogidas pendientes`.
- Renderiza `SolicitudesDisponibles`, que si pertenece al flujo nuevo, pero
  queda enterrado entre flujos viejos.

Decision UI:
- Reemplazar el cuerpo del panel por una sola experiencia:
  1. Estado de verificacion de ubicacion.
  2. Lista de solicitudes disponibles que requieren voluntario.
  3. Compromisos propios del voluntario, si el backend ya los expone.
  4. Historial minimo opcional, solo si existe issue.
- Eliminar del panel voluntario: "Mis aportes", link a `/dar`, gestion de
  lugares viejos y recogidas viejas.

### `/nodo`

Archivo: `src/app/nodo/page.tsx`.

Problemas:
- No hay guard de rol antes de renderizar. La pantalla lee token y renderiza
  formulario de crear punto aunque el token no sea admin.
- Renderiza `Crear punto` dentro del panel de admin, pero segun el flujo actual
  de migracion el alta publica debe pasar por solicitud/aprobacion y la
  creacion administrativa debe estar claramente separada.
- Renderiza la operacion completa dentro de `nodos.map(...)`: verificacion,
  editar datos, pausas, inventario y solicitudes. Con varios nodos asociados se
  duplica toda la UI, como en la captura.
- No existe seleccion de "punto activo". El usuario no entiende si esta
  editando un punto o varios.

Decision UI:
- Convertir `/nodo` en un panel de administracion de un punto activo:
  1. Encabezado con selector de punto si el admin administra mas de uno.
  2. Resumen del punto activo: nombre, estado operativo, tipo, direccion.
  3. Acciones operativas: verificar, pausar recepcion, pausar entrega,
     reactivar.
  4. Tabs o secciones del punto activo:
     - Inventario
     - Solicitudes que necesita este punto
     - Compromisos/entradas/salidas
     - Datos del punto
- No repetir formularios por cada nodo. La lista de nodos debe ser selector,
  no contenedor de toda la operacion.

### `InventarioNodo`

Archivo: `src/components/InventarioNodo.tsx`.

Problemas:
- El formulario de alta vive en cada instancia de `InventarioNodo`; como
  `/nodo` instancia uno por nodo, se repite.
- Despues de guardar solo limpia condicion y magnitud; no limpia categoria,
  subcategoria ni disponibilidad.
- Si falla una operacion, el error aparece dentro de una UI ya duplicada, lo
  que refuerza la percepcion de que se agrego otro formulario.
- El boton no evita reenvios rapidos mas alla de `guardando`; falta feedback de
  exito y cierre/limpieza completa del formulario.

Decision UI:
- Mostrar un unico formulario de inventario para el punto activo.
- Despues de guardar correctamente:
  - refrescar inventario,
  - limpiar categoria, subcategoria, magnitud, condicion y disponible,
  - mostrar confirmacion breve,
  - mantener el scroll/posicion sin duplicar bloques.
- Si hay error, mantener el mismo formulario y mostrar error inline.

### `SolicitudesNodo`

Archivo: `src/components/SolicitudesNodo.tsx`.

Problemas:
- La creacion de solicitudes esta acoplada al bloque completo del nodo dentro
  de `/nodo`, por lo que tambien se duplica con varios nodos.
- El texto "Solicitudes del punto" no diferencia claramente entre:
  - pedir insumos,
  - recibir compromisos de otros nodos,
  - recibir compromisos de voluntarios,
  - confirmar llegada/no llegada.

Decision UI:
- En el panel admin, convertirlo en seccion "Pedir insumos".
- Separar la lista en estados visuales:
  - Abiertas
  - Con compromiso
  - En camino
  - Recibidas/cerradas
- Los compromisos de voluntarios deben mostrar acciones de llegada/no llegada
  solo donde corresponda.

### `/nodo/colaborador`

Archivo: `src/app/nodo/colaborador/page.tsx`.

Lo correcto:
- Usa `InventarioNodo` con `soloColaborador`, ocultando el alta/edicion de
  items.

Problemas:
- Tampoco valida rol antes de renderizar.
- Si el colaborador pertenece a varios puntos, repite tarjetas completas.

Decision UI:
- Agregar guard de rol `colaborador`.
- Usar selector de punto activo si hay varios.
- Mantener solo tareas operativas: marcar "no hay" y solicitar reposicion.

### `/superadmin`

Archivo: `src/app/superadmin/page.tsx`.

Lo correcto:
- Contiene solicitudes de registro de nodo.
- Contiene crear admin asociado opcionalmente a centro/nodo.
- Contiene cierre permanente de punto.

Problemas:
- No valida rol antes de renderizar.
- "Crear administrador" permite centro opcional; si el objetivo funcional es
  que todo admin este asociado a un centro/zona, la UI debe hacerlo obligatorio
  cuando el backend ya lo soporte.
- "Cerrar punto" por ID manual es riesgoso como UI principal; deberia operar
  sobre una lista/buscador de nodos.

Decision UI:
- Guard estricto de rol `superadmin`.
- Hacer que crear admin sea flujo guiado:
  estado -> nodo -> datos del admin -> token.
- Reemplazar cierre por ID con lista/buscador de nodos y confirmacion fuerte.

### Pantallas publicas y legado

Archivos: `/`, `/buscar`, `/dar`, `/lugar/[id]`, `/mis-recogidas`,
`/voluntarios/gestionar/[id]`.

Estado:
- Pertenecen principalmente al modelo viejo y siguen vivos hasta los issues
  #25, #26 y #27.

Decision UI:
- No invertir en redisenar estos flujos salvo bugs vigentes fuera de los
  issues marcados como descartables.
- Evitar que el panel voluntario nuevo siga enlazando a `/dar` o a
  `/voluntarios/gestionar/[id]`.
- Mantenerlos funcionales hasta que sus reemplazos existan y recien entonces
  eliminarlos.

## Secuencia recomendada de implementacion

1. Agregar guard de rol reutilizable en cliente.
   - Entrada: token local.
   - Consulta: `obtenerRol(token)`.
   - Resultado: loading, permitido, redireccion a `/voluntarios`.
   - Aplicar en `/superadmin`, `/nodo` y `/nodo/colaborador`.

2. Reescribir `PanelVoluntario` como panel puro de voluntario.
   - Quitar dependencias de `getAportesVoluntario`, `useRecogidasPendientes`,
     `aportes`, `aporte_items`, `AccionesRecogidaVoluntario` y `Countdown`.
   - Dejar `SolicitudesDisponibles` como contenido principal.
   - Cambiar texto a "Solicitudes para ayudar".

3. Redisenar `/nodo` alrededor de un punto activo.
   - Cargar nodos admin.
   - Si hay uno, seleccionarlo automaticamente.
   - Si hay varios, mostrar selector compacto.
   - Renderizar una sola instancia de `VerificarNodo`, `EditarNodo`,
     `InventarioNodo` y `SolicitudesNodo`.

4. Corregir `InventarioNodo`.
   - Refrescar inventario despues de `upsertInventario`.
   - Limpiar todo el formulario al guardar.
   - Mostrar confirmacion de exito.
   - Mantener error inline sin duplicar UI.

5. Reorganizar `SolicitudesNodo`.
   - Renombrar seccion a "Pedir insumos".
   - Separar formulario de lista.
   - Separar compromisos de voluntarios y compromisos de nodos.

6. Ajustar `/nodo/colaborador`.
   - Aplicar guard de rol.
   - Usar punto activo si hay varios.
   - Mantener solo inventario operativo, sin controles de admin.

7. Ajustar `/superadmin`.
   - Aplicar guard de rol.
   - Hacer obligatoria la asociacion admin -> nodo si esa es la regla final.
   - Cambiar cierre por ID a seleccion desde lista/buscador.

8. QA visual y de permisos.
   - Probar token de superadmin en `/superadmin`, `/nodo`,
     `/nodo/colaborador`, `/voluntarios`.
   - Probar token admin en las mismas rutas.
   - Probar token colaborador.
   - Probar token voluntario.
   - Probar acceso directo por URL sin token.
   - Probar admin con dos nodos para confirmar que no se duplica la UI.

## Criterios de aceptacion

- Un voluntario no ve inventario, edicion de nodos, crear punto ni paneles de
  admin.
- Un admin no ve herramientas de superadmin.
- Un colaborador no puede configurar items ni editar datos del nodo.
- `/nodo` muestra un solo punto activo a la vez.
- Agregar un insumo no duplica tarjetas ni formularios.
- Los errores se muestran inline en el formulario actual.
- El snapshot viejo de aportes/recogidas no aparece en el panel voluntario.
- Las pantallas publicas no exponen contacto privado.

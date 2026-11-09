# 05 · Interfaz (frontend)

## Principios

- **Sin frameworks ni compilación:** HTML, CSS y JavaScript estándar. Lo que está en `site/` es exactamente lo que se publica.
- **Compatible con una CSP estricta:** no hay scripts ni manejadores en línea; todo el comportamiento se conecta desde `app.js` y `tema.js`.
- **Responsiva:** sin desplazamiento horizontal en ninguna pantalla; el perfil siempre visible. Cortes principales en 1440, 1400, 1200, 1180, 1000, 900 y 680 px; respeta `prefers-reduced-motion`.
- **Identidad propia:** tipografías Manrope (texto) y JetBrains Mono (cifras y códigos), paleta Sermaluc definida como variables CSS, modo claro y oscuro.

## Archivos

| Archivo | Rol |
|---|---|
| `site/index.html` | Carga `styles.css`, `tema.js` y `app.js` con un parámetro `?v=N`. **Al publicar cambios en CSS o JS hay que subir ese número** para que los navegadores no usen la versión en caché. |
| `site/tema.js` | Aplica el tema guardado (claro/oscuro) antes de pintar la página para evitar parpadeos. |
| `site/app.js` | Toda la aplicación, encapsulada en una función autoejecutable. |
| `site/styles.css` | Estilos y tokens (`--brand`, `--ink`, `--bg`, etc.), modo oscuro y diseño responsivo. |
| `site/linea/` | Línea de tiempo pública ("carrera de licitaciones"): `index.html` + `linea.js`. Usa los estilos de `styles.css`. |
| `site/assets/` | Logos e íconos. |

## Organización de `app.js`

| Bloque | Funciones principales |
|---|---|
| Utilidades | `esc` (escapa HTML), `parseLocal` (fechas en hora de Chile), `money`, `rel`, `urg` (nivel de urgencia), `alerts` |
| Datos | `api()` (fetch con manejo de errores y sesión vencida), `reload()`, `apply()` (normaliza `/api/datos`), `act()` (acciones sobre una licitación) |
| Esqueleto | `shell()` (barra superior, pestañas, campana, perfil), `paintTop()` |
| Vistas | `vRadar`, `vLista`, `vFicha` (resumen, documentos, fechas, bitácora), `vTablero`, `vEquipo`, `vConfig` (palabras, usuarios, registro) |
| Enrutador | `render()` según `location.hash`: `#/`, `#/licitaciones`, `#/licitacion/<código>`, `#/tablero`, `#/equipo`, `#/configuracion` |
| Ingreso | `showLogin()` con las pestañas "Ingresar" y "Activar mi cuenta", botón de Google (si `/api/config` lo habilita) y botón "🏇 Ver la carrera de licitaciones" hacia `/linea/` |
| Actualización | `startPolling()` / `sync()`: cada 15 s consulta `/api/version`; si cambió, vuelve a pedir `/api/datos` y repinta conservando la posición |

Cada vista es una función que devuelve HTML (texto escapado con `esc`) seguida de una función `bind*` que conecta los eventos.

## Vistas

| Vista | Contenido |
|---|---|
| **Radar** | SVG animado: cada punto es una licitación abierta; la distancia al centro representa los días al cierre. Tarjeta flotante al pasar el mouse (se desplaza el grupo exterior para evitar parpadeo). Resumen del día, novedades, hitos de la semana. |
| **Licitaciones** | Tabla filtrable por texto, estado, responsable, palabra clave y urgencia. |
| **Ficha** | Reloj en vivo al cierre, estado, responsable, resumen, criterios, garantías, checklist de documentos con carga de archivos (arrastrar y soltar), fechas, bitácora y notas. Botón "Abrir adjuntos en Mercado Público" (`/api/licitaciones/:cod/adjuntos`). |
| **Tablero** | Una tarjeta por licitación con estado editable y reloj (días, horas, minutos, segundos). |
| **Equipo** | Carga de trabajo y próximo cierre de cada persona. |
| **Configuración** | Palabras clave (peso, pausa, eliminación), usuarios (crear, editar, restablecer, eliminar) y registro de actividad con búsqueda, filtros, paginación y botón "Detalle técnico". Solo la administración ve los controles de edición. |

## Alertas de plazo

| Color | Días al cierre |
|---|---|
| Rojo | 2 o menos |
| Naranja | 5 o menos |
| Azul | 10 o menos |

Además: campana con plazos, franja con licitaciones que cierran en menos de 48 h, aviso al ingresar, y advertencias por licitaciones sin responsable o con documentos obligatorios pendientes.

## Línea de tiempo pública (`/linea/`)

- Accesible sin sesión desde el botón de la pantalla de ingreso.
- Cada licitación es un carril de pista con un caballo 🏇 que avanza desde la publicación hasta el cierre; los hitos (preguntas, respuestas, aperturas, adjudicación) aparecen como marcas con emoji.
- Muestra el nombre de la persona asignada; filtros por estado y responsable; se actualiza cada 5 minutos.
- Usa solo `GET /api/publico/linea` (sin datos sensibles).

## Fechas y zona horaria

Todas las fechas de Mercado Público se manejan en **hora de Chile** (`AAAA-MM-DDTHH:MM`). Los relojes calculan la diferencia con la hora del navegador. El contenedor Docker usa `TZ=America/Santiago`.

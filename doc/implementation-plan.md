# SpecForge · Plan de implementación

## Secuencia propuesta

### ✅ Paso 1. Fijar el workflow canónico

Entregables:

- ✅ fases iniciales
- ✅ contratos de entrada y salida por fase
- ✅ checkpoints obligatorios
- ✅ criterios de regresión
- ✅ reglas de versionado de artefactos
- ✅ regla de inmutabilidad práctica de la fuente tras arrancar `refinement`
- ✅ momento de creación de rama de trabajo

### ✅ Paso 2. Definir persistencia mínima

Entregables:

- ✅ estructura de carpetas de `doc/` y del estado runtime persistido en repo
- ✅ formato de `state.yaml`
- ✅ formato de `branch.yaml`
- ✅ formato de timeline o eventos
- ✅ plantillas markdown esenciales
- ✅ regla de inferencia de entradas entre fases para evitar `input.md` redundantes

### ✅ Paso 3. Diseñar el contrato MCP inicial

Entregables:

- ✅ `create_us_from_chat`
- ✅ `import_us_from_markdown`
- ✅ `list_user_stories`
- ✅ `get_user_story_summary`
- ✅ `get_current_phase`
- ✅ `generate_next_phase`
- ✅ `approve_phase`
- ✅ `request_regression`
- ✅ `restart_user_story_from_source`
- ✅ integración de creación de rama dentro de `approve_phase`

### ✅ Paso 4. Implementar el núcleo del workflow engine

Entregables:

- ✅ modelo de dominio
- ✅ validación de transiciones
- ✅ persistencia local
- ✅ tests del dominio

### ✅ Paso 5. Añadir una extensión VS Code mínima

Entregables:

- ✅ vista de USs
- ✅ comando crear/importar
- ✅ comando continuar fase
- ✅ apertura de artefacto principal

Notas:

- la extensión mínima ya está creada y compilando
- el core de automatización ya existe mediante un workflow runner
- `continue phase` en la extensión sigue pendiente de cableado con ese runner o con el backend MCP definitivo

### ✅ Paso 5.1. Cablear la extensión al workflow runner local

Entregables:

- ✅ invocar `WorkflowRunner` desde los comandos de la extensión
- ✅ hacer que `continue phase` ejecute avance real de workflow
- ✅ refrescar el árbol tras cambios de estado y artefactos
- ✅ abrir el artefacto generado cuando aplique

### ✅ Paso 5.2. Introducir una capa de aplicación/MCP estable

Entregables:

- ✅ definir boundary estable entre extensión y backend
- ✅ encapsular `WorkflowRunner` detrás de servicios de aplicación
- ✅ alinear operaciones reales con `mcp-contract-fase-1.md`
- ✅ preparar sustitución del runner local por backend MCP sin romper la UI

### ✅ Paso 5.3. Sustituir generación placeholder por ejecución de fases real

Entregables:

- ✅ reemplazar artefactos de ejemplo por ejecución basada en artefactos previos y reglas de workflow
- ✅ persistir resultados reales de fase
- ✅ registrar fallos, bloqueos y regresiones en timeline y estado
- ✅ mantener trazabilidad entre artefactos y decisiones

### ✅ Paso 5.4. Enriquecer la UX mínima

Entregables:

- ✅ detalle de fase seleccionada
- ✅ acciones contextuales por fase
- ✅ feedback claro de errores y bloqueos
- ✅ base mínima para futura graph view del workflow

## Orden recomendado después de esta US

1. ✅ concretar el workflow canónico de fase 1
2. ✅ concretar la estructura real de `doc/` y de los artefactos runtime
3. ✅ concretar el contrato MCP mínimo
4. ✅ arrancar implementación del dominio y persistencia
5. ✅ fijar la estrategia de branch naming y reinicio seguro de una US
6. ✅ introducir backend MCP real detrás del boundary actual
7. ✅ enriquecer ejecución de fases con providers/agents reales
8. ✅ materializar prompts versionados por fase en `.specs/prompts/`
9. ✅ inicializar el repo con prompts obligatorios y `config.yaml`
10. ✅ exigir prompts requeridos en la ejecución de fases reales
11. ✅ componer prompts efectivos por fase usando contexto runtime
12. ✅ exponer `request_regression` de punta a punta en dominio, MCP y extensión
13. ✅ implementar reinicio seguro desde fuente
14. ✅ cerrar estrategia base de branch naming para fase 1
15. ✅ introducir categoría explícita de US con catálogo configurable del repo
16. ✅ agrupar el explorer de VS Code por categoría de US
17. ✅ introducir un proyecto mínimo de tests TypeScript para la extensión
18. [ ] ampliar UX con graph view y detalle de fase más rico
19. [ ] añadir editor/inspector de prompts más rico desde la extensión
20. [ ] enriquecer el ciclo de vida de ramas con integración Git/PR real

## Riesgos a vigilar

- sobrediseñar workflows antes de validar el flujo base
- introducir demasiadas entidades de dominio al inicio
- mezclar estado humano, estado técnico y prompts sin límites claros
- hacer la extensión demasiado lista y el backend demasiado débil

## Decisiones aplazadas

- edición visual completa de workflows
- slicing paralelo intra-US
- integración real de PR
- integración real con issues
- estrategias avanzadas multi-proveedor

## Estado actual

La fase 5 queda resuelta en su alcance mínimo:

1. la extensión ya invoca el backend local
2. existe un boundary estable entre UI y backend
3. la ejecución de fases ya genera artefactos reales derivados del estado
4. la UX mínima ya ofrece detalle, acciones contextuales y feedback básico

El siguiente salto no es introducir más infraestructura base. El backend MCP mínimo ya existe y el provider OpenAI-compatible con prompts versionados por repo ya está operativo. Lo pendiente para alcanzar un MVP utilizable es cerrar los huecos del workflow explícito y hacer visible ese alcance real en la documentación y la UX.

## Roadmap MVP

Objetivo:

- entregar un MVP funcional para ejecutar un workflow SDD secuencial dentro de VS Code con estado persistido, checkpoints humanos y backend local interoperable

Incluye en el MVP:

- ✅ creación e importación de US
- ✅ avance lineal de fases con aprobación donde aplica
- ✅ persistencia local en `.specs/`
- ✅ backend MCP mínimo
- ✅ prompts versionados por repo y provider OpenAI-compatible
- ✅ regresión explícita de fase desde UI y backend
- ✅ reinicio seguro de una US desde la fuente
- ✅ branch naming explícito por `kind` con formato `<kind>/us-xxxx-short-slug`
- ✅ categoría explícita de US con catálogo configurable desde `.specs/config.yaml`
- ✅ roadmap operativo coherente entre `doc/` y `README`
- ✅ proyecto mínimo de tests TypeScript para lógica pura de la extensión
- ✅ vista principal de workflow abierta desde el explorer con detalle por fase y auditoría
- ✅ settings de extensión para provider, conexión y watcher
- ✅ watcher opcional con notificaciones de atención y controles `play/pause/stop`
- ✅ sidebar de extensión con CTA único en vacío y formulario embebido para crear US
- ✅ distinción visible en la UI y en la documentación entre fases automáticas y checkpoints del usuario
- ✅ affordance visible en la sidebar para inicializar y abrir los prompts versionados del repo

No bloquea el MVP:

- [ ] graph view del workflow
- [ ] panel de detalle rico con diff, timeline navegable o inspección de prompt efectivo
- [ ] integración real con PR/issues
- [ ] workflows personalizables y perfiles avanzados de agentes

Subtarea recién resuelta:

- ✅ añadir en la extensión comandos y affordances para inicializar `.specs/prompts/`, detectar repos no inicializados y abrir los templates desde la UI
- ✅ hacer explícito en `README` y roadmap qué fases son automáticas y cuáles requieren intervención humana

Subtareas recién resueltas:

- ✅ añadir una tool MCP de inicialización que exporte `.specs/prompts/` y `.specs/config.yaml`
- ✅ fijar el set mínimo de prompts por fase: `execute` y `approve` cuando aplique
- ✅ hacer que el engine falle si el repo no está inicializado o faltan prompts requeridos
- ✅ cargar y componer el prompt efectivo desde artefactos versionados del repo
- ✅ usar ese prompt efectivo desde el provider OpenAI-compatible para OpenAI y Ollama
- ✅ exponer `request_regression` en dominio, aplicación, MCP y extensión
- ✅ invalidar aprobaciones obsoletas al regresar a una fase anterior
- ✅ implementar `restart_user_story_from_source` con archivo de artefactos y rama previa supersedida
- ✅ fijar `kind` explícito en la US y naming de rama `<kind>/us-xxxx-short-slug`
- ✅ introducir `category` explícita en la US y validarla contra el catálogo global del repo
- ✅ agrupar el explorer de VS Code por categoría de US
- ✅ añadir tests TypeScript mínimos para parsing, agrupación y render seguro del panel de detalle
- ✅ ampliar los tests TypeScript a agrupación del explorer y payload/parsing del cliente MCP
- ✅ añadir un harness ligero de integración para el wiring de comandos de la extensión
- ✅ abrir cada US del explorer en una workflow view central con detalle por fase y auditoría visible
- ✅ exponer settings de extensión para provider, conexión OpenAI-compatible, API key, modelo y watcher
- ✅ refrescar automáticamente desde cambios en `.specs/us/**` cuando el watcher está habilitado
- ✅ añadir controles `play/pause/stop` con `stop` best-effort sobre el backend MCP local
- ✅ reemplazar la botonera lateral por una sidebar webview con formulario de creación embebido

Subtareas pendientes de cerrar antes de considerar el MVP completo:

- [ ] enriquecer el ciclo de vida de `branch.yaml` con metadatos Git/PR reales

Artefactos de persistencia ya concretados o en concreción:

- ✅ `state.yaml`
- ✅ `branch.yaml`
- ✅ `timeline.md`
- ✅ plantillas markdown esenciales

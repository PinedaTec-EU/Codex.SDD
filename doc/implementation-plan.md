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

### [ ] Paso 5. Añadir una extensión VS Code mínima

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

### [ ] Paso 5.3. Sustituir generación placeholder por ejecución de fases real

Entregables:

- [ ] reemplazar artefactos de ejemplo por ejecución basada en prompts/agents
- [ ] persistir resultados reales de fase
- [ ] registrar fallos, bloqueos y regresiones en timeline y estado
- [ ] mantener trazabilidad entre artefactos y decisiones

### [ ] Paso 5.4. Enriquecer la UX mínima

Entregables:

- [ ] detalle de fase seleccionada
- [ ] acciones contextuales por fase
- [ ] feedback claro de errores y bloqueos
- [ ] base para futura graph view del workflow

## Orden recomendado después de esta US

1. ✅ concretar el workflow canónico de fase 1
2. ✅ concretar la estructura real de `doc/` y de los artefactos runtime
3. ✅ concretar el contrato MCP mínimo
4. ✅ arrancar implementación del dominio y persistencia
5. [ ] fijar la estrategia de branch naming y reinicio seguro de una US
6. [ ] cablear la extensión al runner local
7. [ ] introducir boundary MCP estable
8. [ ] sustituir placeholders por ejecución real de fases

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

El siguiente paso útil ya no es “hacer el wire” como bloque único. Ahora queda dividido en:

1. cablear la extensión al runner local
2. introducir boundary MCP estable
3. sustituir placeholders por ejecución real
4. enriquecer la UX mínima

Artefactos de persistencia ya concretados o en concreción:

- ✅ `state.yaml`
- ✅ `branch.yaml`
- ✅ `timeline.md`
- ✅ plantillas markdown esenciales

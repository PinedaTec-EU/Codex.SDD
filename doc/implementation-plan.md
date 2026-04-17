# SpecForge · Plan de implementación

## Secuencia propuesta

### Paso 1. Fijar el workflow canónico

Entregables:

- fases iniciales
- contratos de entrada y salida por fase
- checkpoints obligatorios
- criterios de regresión
- reglas de versionado de artefactos
- regla de inmutabilidad práctica de la fuente tras arrancar `refinement`
- momento de creación de rama de trabajo

### Paso 2. Definir persistencia mínima

Entregables:

- estructura de carpetas de `doc/` y del estado runtime persistido en repo
- formato de `state.yaml`
- formato de `branch.yaml`
- formato de timeline o eventos
- plantillas markdown esenciales
- regla de inferencia de entradas entre fases para evitar `input.md` redundantes

### Paso 3. Diseñar el contrato MCP inicial

Entregables:

- `create_us_from_chat`
- `import_us_from_markdown`
- `list_user_stories`
- `get_user_story_summary`
- `get_current_phase`
- `generate_next_phase`
- `approve_phase`
- `request_regression`
- `restart_user_story_from_source`
- `create_work_branch`

### Paso 4. Implementar el núcleo del workflow engine

Entregables:

- modelo de dominio
- validación de transiciones
- persistencia local
- tests del dominio

### Paso 5. Añadir una extensión VS Code mínima

Entregables:

- vista de USs
- comando crear/importar
- comando continuar fase
- apertura de artefacto principal

## Orden recomendado después de esta US

1. concretar el workflow canónico de fase 1
2. concretar la estructura real de `doc/` y de los artefactos runtime
3. concretar el contrato MCP mínimo
4. arrancar implementación del dominio y persistencia
5. fijar la estrategia de branch naming y reinicio seguro de una US

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

El siguiente artefacto SDD de fase 1 es `workflow-canonico-fase-1.md`, porque convierte esta US en trabajo implementable y permite fijar persistencia y contrato MCP sobre un flujo estable.

Artefactos de persistencia ya concretados o en concreción:

- `state.yaml`
- `branch.yaml`

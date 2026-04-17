# SpecForge · Plan de implementación

## Secuencia propuesta

### Paso 1. Fijar el workflow canónico

Entregables:

- fases iniciales
- contratos de entrada y salida por fase
- checkpoints obligatorios
- criterios de regresión

### Paso 2. Definir persistencia mínima

Entregables:

- estructura de carpetas de `.sdd/`
- formato de `state.json`
- formato de timeline o eventos
- plantillas markdown esenciales

### Paso 3. Diseñar el contrato MCP inicial

Entregables:

- `create_uh_from_chat`
- `import_uh_from_markdown`
- `list_uhs`
- `get_uh_summary`
- `get_current_phase`
- `generate_next_phase`
- `approve_phase`
- `request_regression`

### Paso 4. Implementar el núcleo del workflow engine

Entregables:

- modelo de dominio
- validación de transiciones
- persistencia local
- tests del dominio

### Paso 5. Añadir una extensión VS Code mínima

Entregables:

- vista de UHs
- comando crear/importar
- comando continuar fase
- apertura de artefacto principal

## Orden recomendado después de esta US

1. concretar el workflow canónico de fase 1
2. concretar la estructura real de `.sdd/`
3. concretar el contrato MCP mínimo
4. arrancar implementación del dominio y persistencia

## Riesgos a vigilar

- sobrediseñar workflows antes de validar el flujo base
- introducir demasiadas entidades de dominio al inicio
- mezclar estado humano, estado técnico y prompts sin límites claros
- hacer la extensión demasiado lista y el backend demasiado débil

## Decisiones aplazadas

- edición visual completa de workflows
- slicing paralelo intra-UH
- integración real de PR
- integración real con issues
- estrategias avanzadas multi-proveedor

## Siguiente documento recomendado

El siguiente artefacto SDD debería ser `workflow-canonico-fase-1.md`, porque es la pieza que convierte esta US en trabajo implementable.

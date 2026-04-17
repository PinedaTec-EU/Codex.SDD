# SpecForge · Arquitectura objetivo

## Componentes

### 1. Extensión de VS Code

Responsabilidades:

- presentar UHs y su estado
- lanzar acciones del usuario
- abrir artefactos markdown
- observar cambios manuales en artefactos relevantes
- mostrar el flujo actual y la fase activa
- actuar como cliente del backend MCP

No responsabilidades:

- decidir transiciones
- ejecutar lógica de workflow
- persistir reglas de dominio fuera de contratos definidos

### 2. MCP Server

Responsabilidades:

- gobernar el workflow SDD
- validar transiciones y regresiones
- aplicar políticas de aprobación
- invocar proveedores LLM mediante abstracción
- persistir y recuperar estado técnico
- emitir resultados y eventos trazables

### 3. Repo como fuente de verdad

Responsabilidades:

- almacenar artefactos humanos en markdown
- almacenar estado técnico mínimo
- versionar workflows, plantillas y decisiones
- permitir reconstrucción del contexto en otro entorno

## Regla de diseño principal

La extensión orquesta interacción. El MCP decide ciclo de vida. El repo preserva trazabilidad.

## Workflow canónico inicial

1. Crear o importar UH.
2. Generar refinement.
3. Aprobar refinement.
4. Generar diseño técnico.
5. Aprobar diseño técnico.
6. Implementar.
7. Revisar.
8. Regresar o avanzar según findings.

## Persistencia mínima recomendada

- markdown para artefactos legibles por humanos
- `state.json` para estado transaccional de la UH
- `timeline.md` o `events.ndjson` para auditoría

## Decisión abierta de stack

Opciones viables para el MCP:

- `TypeScript`: menor fricción inicial y alineación con la extensión
- `C#`: mejor soporte para dominio complejo y contratos fuertes

Para una base seria de producto, la opción preferible es `C#` en el backend y `TypeScript` en la extensión, manteniendo desacoplamiento por contrato MCP.

# SpecForge · US inicial

Esta US define la intención de producto para SpecForge y referencia los artefactos SDD que concretan su alcance.

## Objetivo

Construir una herramienta para VS Code que gobierne workflows SDD asistidos por IA con:

- persistencia en repo
- checkpoints humanos
- trazabilidad por fases
- regresión controlada
- métricas operativas

## Artefactos derivados

- [Visión de producto](./product-vision.md)
- [Arquitectura objetivo](./architecture.md)
- [Modelo de dominio inicial](./domain-model.md)
- [Plan de implementación](./implementation-plan.md)

## Estado de la US

- Estado: `draft`
- Prioridad: `alta`
- Tipo: `foundation`
- Fuente principal de verdad: esta carpeta `.sdd/`

## Decisión de trabajo actual

Esta US ya no intenta describir todo en un único fichero. El trabajo se divide en:

1. visión y valor de producto
2. arquitectura y límites de componentes
3. dominio mínimo ejecutable
4. plan incremental de construcción

## Criterios de aceptación de esta concreción

- La visión de producto queda separada de la solución técnica.
- La arquitectura define responsabilidades y límites explícitos.
- El dominio inicial contiene solo el núcleo necesario para fase 1.
- El plan siguiente prioriza un workflow canónico antes de personalización avanzada.

## Notas

- La persistencia en repo sigue siendo un principio central.
- La personalización de workflows y la ejecución paralela permanecen como capacidades futuras, no como complejidad obligatoria de fase 1.

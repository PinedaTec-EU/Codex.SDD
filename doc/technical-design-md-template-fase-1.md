# SpecForge · Plantilla `02-technical-design.md` fase 1

## Objetivo

Definir la plantilla mínima del diseño técnico que sirve de entrada directa a implementación.

## Principios

- debe ser práctico y ejecutable
- debe identificar impacto real sobre componentes
- debe documentar alternativas, riesgos y estrategia de validación
- no debe convertirse en un documento académico

## Plantilla propuesta

```md
# Technical Design · US-0001 · v01

## Estado
- Estado: `pending_approval`
- Basado en: `01-refinement.md`

## Resumen técnico
Qué solución se propone y por qué.

## Objetivo técnico
Qué debe cambiar en el sistema para satisfacer el refinement aprobado.

## Componentes afectados
- ...
- ...
- ...

## Diseño propuesto
### Arquitectura
Describe piezas, responsabilidades y límites.

### Flujo principal
1. ...
2. ...
3. ...

### Persistencia
- ...
- ...

### Contratos e interfaces
- ...
- ...

## Alternativas consideradas
- Opción A:
  - Pros:
  - Contras:
- Opción B:
  - Pros:
  - Contras:

## Riesgos técnicos
- ...
- ...

## Impacto esperado
- Código:
  - ...
- Documentación:
  - ...
- Tests:
  - ...

## Estrategia de implementación
1. ...
2. ...
3. ...

## Estrategia de validación
- Tests unitarios:
  - ...
- Tests de integración:
  - ...
- Validación manual:
  - ...

## Decisiones abiertas
- ...
- ...

## Aprobación requerida
- [ ] Diseño validado para implementar
```

## Notas de uso

- si la fase se rehace tras regresión, debe generarse una nueva versión
- la salida debe permitir implementar sin reinterpretar funcionalidad básica

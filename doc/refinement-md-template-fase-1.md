# SpecForge · Plantilla `01-refinement.md` fase 1

## Objetivo

Definir la plantilla de refinement como artefacto funcional consolidado después de análisis crítico `red-team` y reconstrucción `blue-team`.

## Principios

- debe contener la mejor versión operativa de la US
- debe hacer explícitas ambigüedades y riesgos
- debe incluir `history log` al inicio cuando el agente lo modifique
- debe dejar claros los puntos pendientes de aprobación humana

## Plantilla propuesta

```md
# Refinement · US-0001 · v01

## History Log
- `2026-04-18T10:15:00Z` · Creación inicial del refinement.

## Estado
- Estado: `pending_approval`
- Basado en: `us.md`

## Resumen ejecutivo
Versión condensada de la US ya refinada.

## Objetivo refinado
Qué debe conseguir exactamente el sistema al finalizar esta US.

## Alcance refinado
- Incluye:
  - ...
- No incluye:
  - ...

## Reglas funcionales
- ...
- ...
- ...

## Restricciones
- Técnicas:
  - ...
- Operativas:
  - ...
- De proceso:
  - ...

## Ambigüedades detectadas
- ...
- ...

## Red Team
### Riesgos
- ...
- ...

### Objeciones
- ...
- ...

### Puntos débiles
- ...
- ...

## Blue Team
### Ajustes recomendados
- ...
- ...

### Decisiones de refuerzo
- ...
- ...

### Refinement consolidado
Explica cómo cambia o mejora la propuesta tras red-team y blue-team.

## Criterios de aceptación refinados
- [ ] ...
- [ ] ...
- [ ] ...

## Preguntas para aprobación humana
- ...
- ...
```

## Notas de uso

- este fichero es la baseline funcional de la US tras aprobación
- si ya hubo una versión aprobada y se rehace, debe versionarse
- el detalle debe ser accionable, no narrativo

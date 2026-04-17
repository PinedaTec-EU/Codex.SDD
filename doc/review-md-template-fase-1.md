# SpecForge · Plantilla `04-review.md` fase 1

## Objetivo

Definir la plantilla de review como artefacto de validación final antes de aprobación humana de release.

## Principios

- debe ser clara y accionable
- debe priorizar findings y veredicto
- debe referenciar US, refinement, diseño e implementación
- no debe esconder riesgos residuales

## Plantilla propuesta

```md
# Review · US-0001 · v01

## Estado
- Resultado: `pass` | `fail`
- Basado en:
  - `us.md`
  - `01-refinement.md`
  - `02-technical-design.md`
  - `03-implementation.md`

## Resumen
Conclusión breve de la revisión.

## Verificaciones realizadas
- [ ] Cumple la US
- [ ] Cumple el refinement
- [ ] Respeta el diseño técnico
- [ ] Respeta restricciones del repo
- [ ] Tiene validación suficiente

## Findings
### Finding 1
- Severidad: `high` | `medium` | `low`
- Tipo: `functional` | `technical` | `process`
- Descripción: ...
- Evidencia: ...
- Fase objetivo de corrección: `refinement` | `technical_design` | `implementation`

### Finding 2
- Severidad: ...
- Tipo: ...
- Descripción: ...
- Evidencia: ...
- Fase objetivo de corrección: ...

## Riesgos residuales
- ...
- ...

## Veredicto
- Resultado final: `pass` | `fail`
- Motivo principal: ...

## Recomendación
- Si `pass`: avanzar a `release_approval`
- Si `fail`: regresar a `<fase>`
```

## Notas de uso

- los findings deben ser estructurados y no ambiguos
- si la review falla, debe quedar clara la fase objetivo de regresión
- si pasa, debe quedar preparado el salto a `release_approval`

# Nexa token source

The JSON files in this directory are the canonical source for the executable
Design Lab token layers. SCSS artifacts under `src/styles/` are generated with
`npm run validate:tokens` and must not be edited by
hand.

## Layers

- `primitive.tokens.json`: raw palette, spacing, radius, typography and shadow
  decisions.
- `semantic.tokens.json`: product roles such as text, surface, status, focus,
  and increased-contrast overrides.
- `component.tokens.json`: reusable control and layout geometry aliases.
- `data-visualization.tokens.json`: categorical, sequential and chart-support
  roles. These are not interchangeable with semantic status colors.

Use aliases for references (`{nexa-color-primary-600}`); the generator emits
CSS custom-property references. New roles require a description and must be
consumed by a documented component or evidence route.

Run `npm run validate:tokens` after changing a source file. The check verifies
generated parity, unknown references, duplicate declarations and cycles.

# Nexa UI

`nexa-ui` is the reusable Angular UI boundary extracted from the Nexa Design
Lab. It contains stable primitives and compositions only. Documentation pages,
Lab evaluation, State Sequence simulation and visual evidence utilities remain
application-owned.

## Public contract

Import from `nexa-ui`:

- `NexaButton`
- `NexaTextField`
- `NexaActionMenu`
- `NexaSegmentedControl`
- `NexaLocaleSwitcher`
- `NexaStatusChip`
- `NexaToggle`
- `NexaTooltip`
- `NexaLogo`
- `NexaLoadingSkeleton`
- `NexaNumericStepper`
- `NexaRangeSlider`
- `NexaSurface`

The consuming application supplies Nexa token CSS variables. Deep imports are
not part of the supported contract.

`NexaLoadingSkeleton` accepts optional CSS `width` and `height` values (numeric
values are interpreted as pixels), a
`shape` (`rect`, `rounded` or `circle`), and a localized `ariaLabel`. Its
decorative shape is hidden from assistive technology while the component
exposes one labeled `status` announcement. The default label is Spanish
(`Cargando contenido`); set `ariaLabel` to match the consuming screen's locale.
For `circle`, `width` takes precedence as the diameter; `height` supplies the
diameter when `width` is omitted, and the default diameter is `2.5rem`.

## Build and tests

```bash
npm run build:library
npm run test:library
```

The package is not published by this repository. Distribution is a separate
release decision.

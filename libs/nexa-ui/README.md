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
- `NexaNumericStepper`
- `NexaRangeSlider`
- `NexaSurface`

The consuming application supplies Nexa token CSS variables. Deep imports are
not part of the supported contract.

## Build and tests

```bash
npm run build:library
npm run test:library
```

The package is not published by this repository. Distribution is a separate
release decision.

# Design Lab adoption

Source baseline: Design Lab commit ec590abd4c3c6fae97dd7c14d866443e3f67e1e0.

## Adopted

- The Angular UI library under projects/nexa-ui was copied into libs/nexa-ui with its implementation, tests, public API entry point, package metadata, and ng-packagr configuration preserved.
- Token source JSON files were copied into tokens. The generated SCSS layers and runtime typography, motion, and Material theme styles were copied into src/styles. Production focus-visible and skip-link rules were retained from the accessibility stylesheet.
- The root token generator and validator keep the generated SCSS synchronized with the adopted token JSON.
- The canonical logo-nexa SVG assets are copied as static files by each app's independent Angular build into brand/canonical.
- PrimeIcons 8.0.0 and the audited Angular package versions are pinned in the shared package manifest and lockfile.

## Not adopted

- Design Lab documentation, demo routes, synthetic auth specimen behavior, and lab-only application shell are not part of either app.
- Lab-specific accessibility evaluation selectors for documentation reflow, text-spacing demos, and target overlays were removed from the production stylesheet.
- Deferred navigation and dialog patterns are not promoted into the shared library.
- UI components remain imported through the library public API; application code must not depend on implementation paths.

This manifest records technical source adoption only. It does not mark product acceptance criteria complete.

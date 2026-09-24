# Nexa web clients

This repository owns the shared Angular foundation and the separate Platform and Portal web applications.

## Workspace

- apps/platform and apps/portal are standalone Angular applications with independent bootstrap, routes, tests, builds, and Docker images.
- libs/nexa-ui is the adopted shared component library.
- libs/nexa-api owns browser API transport primitives and contracts.
- tokens and src/styles contain the shared design-token sources and runtime styles.

## Commands

- npm ci installs the checked-in dependency lock.
- npm run validate:design checks generated token layers and architecture boundaries.
- npm run build:all builds both libraries and both applications.
- npm test runs library and app unit tests.
- docker compose up --build serves Platform on port 4200 and Portal on port 4300.

The applications are neutral route skeletons. Product routes, authentication screens, role navigation, and context-switch flows are outside this technical foundation checkpoint.

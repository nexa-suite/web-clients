# Dependency audit evidence

On 2026-09-24, the locked web-client dependency tree was checked with `npm audit --json` after upgrading Vitest from 4.0.8 to the compatible patched version 4.1.11 and regenerating `package-lock.json`.

The audit returned zero vulnerabilities: 0 info, 0 low, 0 moderate, 0 high, and 0 critical across 581 dependencies (16 production, 566 development, and 196 optional dependency entries; npm reports overlapping dependency categories).

The earlier audit of Vitest 4.0.8 had reported one critical and one moderate finding. This record captures the post-fix audit snapshot; dependency advisories can change, so CI and maintainers should rerun `npm audit` when dependencies change.

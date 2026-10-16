# Nexa Web: trazabilidad US/AC y cierre funcional

## Estado

**Estado de cierre funcional: abierto.** El catálogo `origin/main` congela 133 historias `CONFIRMED / V1`, pero deja los criterios de aceptación detallados pendientes en cada historia. No hay base aceptada para declarar cerrada alguna historia por criterios; el código y las pruebas de cliente solo documentan evidencia AS-IS.

La evaluación separa las historias Website (`WEB-US-001..006`), que son externas a `web-clients`, de Platform y Portal. El formulario `/register` visible en este repo no demuestra el cierre del sitio de adquisición.

## Fuentes y alcance

- Blueprint canónico consultado desde `origin/main`, SHA `27e7ea8f7d8a671500039d33e1a4bbab62464691`: `02-web/requirements/user-stories/user-story-catalog.md`, sus 15 épicas y `01-shared/product/current-decisions.md`. El checkout Blueprint local está en otro SHA; este informe usa explícitamente la referencia live `origin/main`.
- Implementación Web: branch `feature/role-focused-workspace`, HEAD `0bd3add8214651ccdeab73ab14976730fd7ef85d`; cambios de esta auditoría siguen sin commit.
- Se revisaron rutas Platform/Portal, formularios, adaptadores, fuentes vigentes de permisos y pruebas. Se reconstruyeron y arrancaron los contenedores Web; se ejecutó E2E con Playwright en el entorno local ICISA. Capturas, video y trace permanecieron desactivados. El smoke inicial de inventario usó Logistics y no vio la fixture Warehouse; tras seleccionar la identidad Warehouse ya autorizada, el smoke de lectura pasó.
- `AC pendiente` significa que Blueprint aún no publica criterios finales; no es un resultado de prueba ni un fallo de implementación.

## Decisiones aplicadas y cambios focales

- Catálogo: Owner confirmó `tipo = categoría`; variedad es independiente. Web conecta `brand` y `category` a los parámetros server-side de `/catalog/products` y `/product-families`, conservando búsqueda, estado y paginación. Buyer `/requests/new` ya puede cargar catálogo al abrir directamente, filtrar por producto/marca/tipo y cambiar páginas sin perder la selección de SKU. El API aplica el filtro antes de paginar; no se filtra solo la página visible. No se añadió filtro de variedad, familia de almacenamiento ni sustitución de la taxonomía aceptada.
- Referencias de catálogo: Platform `/catalog` y `/catalog/manage`, Portal `/catalog` y Buyer `/requests/new` exponen selectores server-backed para marca y categoría/tipo. Los selectores administrativos recorren todas las páginas de `/catalog/categories` y `/catalog/brands`; el Portal consulta todas las páginas de `/catalog-items/filter-options` con el scope Buyer visible. Formularios de producto/familia guardan IDs de referencias; no derivan opciones de la primera página ni de la lista de resultados actual.
- Direcciones de Cliente: el API ya modelaba tipo de dirección, tipo de vía, vía, número, interior, código postal, país, división/provincia/distrito, referencia y coordenadas. El formulario Platform permitía editar línea, referencia, geografía, coordenadas y destinatario, pero no capturar/ver los campos enriquecidos; ahora los muestra, preserva al editar y los incluye al guardar.
- Geografía de dirección: departamento, provincia y distrito usan referencias de geografía; tipo de vía usa `GET /reference/road-types`. Valores guardados que ya no aparecen en referencias activas se preservan al editar, sin convertirlos en opciones nuevas.
- Actualización de actividad visible: Platform fulfillment/órdenes y Portal órdenes/entregas consultan modelos de lectura API al volver a primer plano y cada 30 segundos mientras la pestaña tenga foco. Polling conserva página/filtros y formularios locales; cada ciclo queda ligado a su sesión y ruta, se cancela al destruir vista o cambiar contexto y termina limpiando datos ante `401`/`403`. No crea comandos de negocio.
- Mapa de entrega Buyer: detalle consulta `GET /buyer/deliveries/{id}/live-location` solo con estado `DISPATCHED` o `IN_TRANSIT`. Renderiza únicamente la muestra API no vencida; `location: null`, `404`, estado terminal y cambio de scope borran/ocultan la posición. `deliveryMapTileUrlTemplate`, `deliveryMapAttribution` y `deliveryMapAttributionUrl` habilitan proveedor de tiles y atribución explícitos; por defecto no hay peticiones externas. No se consulta geocoder ni se carga script de mapa externo.
- Permisos de catálogo: Platform evalúa `catalog.taxonomy.manage`, `catalog.product.manage` y `catalog.price.manage` por separado y muestra comandos solo con el grant server-issued correspondiente. La etiqueta/rol BOM no concede autoridad localmente.
- Inventario/recepción Web: Platform expone `/inventory` con lotes paginados por almacén, filtros de catálogo server-backed y recepción normal mediante el endpoint API canónico. Los grants de lectura, catálogo y recepción se evalúan por separado; la solicitud conserva clave idempotente y payload congelado ante resultado de transporte desconocido, y exige respuesta `201` con `ETag`. Warehouse/zona e ítem/unidad se resuelven desde API. La pantalla permite adjuntar evidencia fotográfica opcional, la liga al Warehouse seleccionado y espera el estado tipado `AVAILABLE` antes de incluir su ID en la recepción; la clave y hash de reintento se guardan sin bytes del archivo. La política de temperatura sigue siendo autoridad de API; disponibilidad de escaneo solo confirma tipo/seguridad del archivo, no lo que representa la imagen.
- No se encontró una pantalla de alta/edición de dirección de Warehouse en Web; la interfaz Platform existente cubre trabajo de fulfillment/warehouse, no configuración de su dirección física.
- Dispatch: el Web Platform muestra y sella POD ya capturado. La captura de intento/POD pertenece al Driver/Mobile según la decisión de Owner; no se convirtió la Web en autoridad del Driver.

## Brechas concretas observadas

1. **Refinamiento bloqueante:** 133/133 historias indican `CATALOG FROZEN — ACCEPTANCE CRITERIA PENDING`. Falta autoridad de producto para criterios finales y evidencias de aceptación por criterio.
2. **Límite de repositorio:** WEB-US-001..006 identifica la superficie Website y queda fuera de este repo/revisión.
3. **Onboarding interno:** no se encontró superficie Web para que personal Nexa revise y autorice/rechace solicitudes ni para suspender/reactivar/exportar/cerrar Tenants. `/register` es el flujo público de solicitud.
4. **Inventario/Warehouse:** `/inventory` cubre lectura paginada de lotes, recepción normal y carga de evidencia del Warehouse (evidencia parcial de WEB-US-071..073), con permisos y scope del API. No cubre ajustes/HOLD, transferencias, ni configuración de ubicación física del Warehouse. El E2E térmico enfocado pasó con una zona local creada por `POST /warehouses/{warehouseId}/zones`: `DEMO-THERMAL`, tipo `CHILLED`, límites de zona `0..8 °C`. Usó un SKU activo `REFRIGERATED` existente y confirmó evidencia `AVAILABLE` antes de la recepción, lote `HOLD` y disponible `0`. No modificó catálogo ni grants; esto verifica el flujo enfocado, no cierra historias ni gates de Producto/Sistema.
5. **Identidad propia:** el API OwnProfile se extendió en el slice separado autorizado, pero Platform/Portal no ofrece formulario propio para nombres/apellidos/documento en este repo.
6. **Mapa de entrega:** Buyer Portal presenta estado, eventos y muestra vigente autorizada en detalle mientras Delivery está `DISPATCHED` o `IN_TRANSIT`. El mapa requiere URL de tiles y atribución configuradas explícitamente; sin configuración, no envía coordenadas a proveedor externo y muestra hora de la muestra sin mapa. No se ejecutó E2E del mapa ni aceptación de Sistema; la cobertura de esta superficie es parcial. Coordenadas guardadas en borrador solo afectan preview de ruta y no son tracking en vivo.
7. **Notificaciones y auditoría:** no se encontraron rutas Web para Notification Center/preferencias ni para consulta general de Business Traceability o Security Audit. El panel `operations/overview` presenta métricas agregadas, no navegación de excepciones a detalle de trazabilidad.
8. **Cobertura funcional de otros flujos:** que exista una ruta de Epic no demuestra todos los comportamientos del catálogo. Cada control de negocio sigue requiriendo AC aceptados y pruebas enfocadas por actor, permiso, tenant/workspace, concurrencia y estados.

## Evidencia de verificación ejecutada

`npm test` en `web-clients` pasó antes del slice de mapa:

- nexa-ui: 14 archivos, 25 pruebas.
- nexa-api (cliente Web): 23 archivos, 84 pruebas.
- Platform: 27 archivos, 158 pruebas.
- Portal: 24 archivos, 118 pruebas.
- runtime-security: 4 pruebas.

Para el slice de mapa, `npm run build:api`, `npm run test:api`, `npm run test:portal` y `npm run build:portal` pasaron después de los cambios: API client 23 archivos/85 pruebas; Portal 26 archivos/132 pruebas. Pruebas focales cubren ruta y DTO live-location, lectura solo en estados activos, ausencia de muestra, expiración, tile config opt-in/URL segura, 404 terminal, 401/403, salida a estado terminal y limpieza por cambio de scope. No se ejecutó suite completa después de este slice.

Las pruebas del slice anterior verifican que selectores Buyer/admin cargan más de una página, la propagación de referencias elegidas a filtros server-side, parada del refresco visible ante respuesta terminal y cancelación por cambio de scope. La prueba de Buyer Draft también comprueba retención de SKU al cambiar página. Las pruebas de API Web verifican parámetros `brand`/`category`, filtros vacíos y `/reference/road-types`.

`npm run build:portal` pasó después del slice de mapa. `npm run build:platform`, `npm run validate:design` y `git diff --check` corresponden a validación anterior al slice. `validate:design` confirmó 301 declaraciones y 188 referencias de tokens, sin desconocidos, duplicados ni ciclos, y límites de arquitectura válidos. En esta reanudación, `npm run build:all` pasó para `nexa-ui`, `nexa-api`, Platform producción y Portal producción. El flujo integrado Buyer→Sales→Warehouse→documento se reejecutó y pasó; no se ejecutó E2E propio del mapa ni aceptación de Producto/Sistema.

Para la verificación integrada local se ejecutó `docker compose -p nexa-web-clients -f compose.yaml up -d --build --no-deps platform portal`: los builds de producción de ambos clientes finalizaron y los contenedores quedaron `healthy`, Platform en `http://127.0.0.1:4200` y Portal en `http://127.0.0.1:4300`; sus rutas `/healthz` respondieron HTTP 200. El preflight Playwright comprobó el OpenAPI del API local y el readiness respondió HTTP 200.

`npm run test:e2e` ejecutó 10 pruebas: 7 pasaron, 2 se omitieron y 1 falló. La prueba opcional de BOM no tenía identidad configurada; la lectura de detalle de Delivery se omitió porque el Buyer no tenía una entrega previa. El primer intento del flujo Buyer→Sales→Warehouse seleccionó la dirección predeterminada antigua sin coordenadas y la UI deshabilitó correctamente `Preview route`; se ajustó el test existente para elegir una dirección activa con coordenadas sintéticas, o saltar antes de crear el borrador si la fixture carece de una.

Después se ejecutó `npx playwright test e2e/portal/real-buyer-order-flow.spec.mjs --project=portal-chromium`. El flujo pasó creación y revisión del borrador, preview de ruta, envío, conversión a Sales Order y fulfillment; falló al esperar 60 segundos la generación del PDF de resumen, que no llegó a `GENERATED` con `storageObjectKey`. El test dejó registros sintéticos locales (borrador, pedido/fulfillment y solicitud de documento); no modificó el catálogo. El equipo responsable del runtime confirmó y corrigió permisos de escritura del volumen local de objetos; no se alteró la solicitud histórica fallida.

Tras esa corrección se ejecutó `npm run test:e2e -- --project=portal-chromium e2e/portal/real-buyer-order-flow.spec.mjs --reporter=line`: 1/1 pasó en 12.7 segundos. La nueva solicitud recibió `202 PENDING`; el nuevo documento llegó a `GENERATED` con `storageObjectKey`; Buyer listó y abrió el documento y descargó el PDF con HTTP 200. La solicitud y documento anteriores permanecen como evidencia histórica fallida, sin restauración. No se repitió la suite E2E completa después de la corrección. Captura, video y trace siguieron desactivados.

Con el flujo E2E extendido se ejecutó `npx playwright test e2e/portal/real-buyer-order-flow.spec.mjs --project=portal-chromium`: 1/1 pasó en 47.9 segundos. Verificó picking con cantidades, lote y Warehouse de la asignación vigente; packing, staging y ready-for-dispatch; ventana y Driver assignment con Logistics; outgoing check actual; dispatch; refresh Buyer al volver al tab y estado `DISPATCHED`; generación PDF y descarga Buyer HTTP 200. `GET /buyer/deliveries` usa la proyección Buyer-safe (`id`, `salesOrderNumber`, `status`) sin `salesOrderId`; el E2E correlaciona por `deliveryId`. La ejecución dejó Delivery sintética activa; no cerró deliveries ni amplió grants. La suite E2E completa no se repitió. Captura, video y trace permanecieron desactivados.

Para el slice Web de inventario, `npm run build:shared` y `npm run build:platform` pasaron. `npm run test:api -- --include=libs/nexa-api/src/lib/http/command-retry-store.spec.ts --include=libs/nexa-api/src/lib/contexts/inventory-availability/infrastructure/warehouse-inventory-api.spec.ts` pasó con 2 archivos y 16 pruebas. `npm run test:platform -- --include=apps/platform/src/app/contexts/inventory-availability/application/platform-inventory-receiving.store.spec.ts --include=apps/platform/src/app/contexts/inventory-availability/presentation/platform-inventory-page.component.spec.ts --include=apps/platform/src/app/core/platform-access-policy.spec.ts` pasó con 3 archivos y 9 pruebas; incluye scope read-only y timeout con reintento de la misma clave/payload. `git diff --check` pasó.

El primer `npm run test:e2e -- --project=platform-chromium --grep "reads the seeded warehouse receipt through scoped inventory UI"` falló antes de leer lotes: la identidad Logistics solo veía el Warehouse ya autorizado `ICISA-COLD-01`, así que `WH-DEMO-E2E` no estaba disponible. El aislamiento funcionó y no se amplió el grant. El mismo comando pasó 1/1 al usar `warehouseOperator`, ya configurado y autorizado para la fixture; la pantalla leyó `DEMO-RECEIVING-001`. No se escribió inventario en este smoke. Capturas, video y trace permanecieron desactivados.

Se reconstruyó solo Platform con `docker compose --project-name nexa-web-clients -f compose.yaml up -d --build --no-deps platform`. `docker compose --project-name nexa-web-clients -f compose.yaml ps platform` reportó `Up (healthy)` y `curl --silent --show-error --fail --output /dev/null --write-out 'HTTP %{http_code}\n' http://127.0.0.1:4200/` devolvió HTTP 200. API y Portal no se recrearon durante este slice.

Se añadió `e2e/platform/real-inventory-thermal-receipt.spec.mjs`. La primera ejecución detectó que `DEMO-STOCK` devolvía límites `null` y se detuvo antes de cargar evidencia. Después se creó `DEMO-THERMAL` mediante el Warehouse API real para `WH-DEMO-E2E`, con tipo `CHILLED` y límites `0..8 °C`; el fixture existente `DEMO-STOCK`, el catálogo y los grants no se modificaron. El test ahora selecciona un SKU activo `REFRIGERATED` desde el catálogo API. `npm run test:e2e -- --project=platform-chromium e2e/platform/real-inventory-thermal-receipt.spec.mjs` pasó `1/1`: carga de foto, transición de evidencia a `AVAILABLE` antes de `POST /inventory/inbound-receipts`, respuesta `201` con `ETag`, lote `HOLD` y disponible `0`. Capturas, video y trace estuvieron desactivados.

## Claves de evidencia por épica


| Código | Épica / historias | Evidencia AS-IS y límite observado |
|---|---|---|
| E01 | WEB-EPIC-01 — Website acquisition and interest (`WEB-US-001..006`) | External Website scope; not audited in `web-clients`. The separate `website/` repository owns these stories. |
| E02 | WEB-EPIC-02 — Tenant onboarding and lifecycle (`WEB-US-007..015`) | Only public `/register` route is present here. No internal onboarding review, authorization/rejection, tenant lifecycle, export, or closure route was found. |
| E03 | WEB-EPIC-03 — Workforce and access governance (`WEB-US-016..024`) | Sign-in/recovery, active context, memberships/invitations, roles, warehouse grants, and support consents have routes. No ownership-transfer route was found. |
| E04 | WEB-EPIC-04 — Customer and Buyer relationships (`WEB-US-025..032`) | Platform `/clients` supports account/address management and Buyer association. The address form now exposes accepted rich address fields; Portal selects an authorized supplier relationship. |
| E05 | WEB-EPIC-05 — Catalog and commercial policy (`WEB-US-033..042`) | Platform `/catalog` and `/catalog/manage`, plus Portal `/catalog`. Product search, brand and type/category filters use server query parameters; category remains distinct from variant and storage family. |
| E06 | WEB-EPIC-06 — Buyer shopping and request draft (`WEB-US-043..049`) | Portal `/catalog` and `/requests/new` draft flow; saved address and payment preference selection are present. |
| E07 | WEB-EPIC-07 — Purchase Request (`WEB-US-050..060`) | Portal request list/detail and Platform review inbox, review, and material-change pages are present. |
| E08 | WEB-EPIC-08 — Sales Orders and offline sales (`WEB-US-061..069`) | Platform `/sales/orders` list/detail workbench is present. The route inventory does not establish every order-creation, cancellation, amendment, and follow-up criterion. |
| E09 | WEB-EPIC-09 — Inventory and Warehouse (`WEB-US-070..081`) | Platform `/inventory` lists scoped lots and supports normal inbound receiving; the service enforces read/catalog/receive grants, and retry after an unknown transport outcome reuses the frozen key/body. This is partial implementation evidence for WEB-US-071..073, not story closure. Adjustments/HOLD and transfer workflows remain absent from this surface. The Web form can upload Warehouse-bound photo evidence and waits for API status `AVAILABLE`; the API remains authoritative about temperature policy, and scanner availability does not establish what the image depicts. Focused thermal E2E passed against local API zone `DEMO-THERMAL` (`CHILLED`, `0..8 °C`): it observed evidence `AVAILABLE` before receipt creation and a resulting lot in `HOLD` with zero available quantity. |
| E10 | WEB-EPIC-10 — Fulfillment (`WEB-US-082..089`) | Platform `/fulfillment-delivery` has server-backed fulfillment work, picking, discrepancy, packing, staging, and dispatch-readiness actions. |
| E11 | WEB-EPIC-11 — Dispatch, Delivery and cold chain (`WEB-US-090..103`) | Platform dispatch planner and captured-POD sealing, plus Portal delivery status/detail/events and conditional Buyer live-location map. Driver attempt/POD capture belongs to Mobile by Owner decision. No POD-addendum UI was found. |
| E12 | WEB-EPIC-12 — Credit, receivables and payments (`WEB-US-104..115`) | Platform credit configuration and wallet-refund surfaces; Portal wallet, credit exposure, receivables/payment history, and payment-reporting surfaces exist. Story-level criterion coverage remains unverified. |
| E13 | WEB-EPIC-13 — Business Documents (`WEB-US-116..122`) | Platform and Portal authorized document list/detail/download surfaces; Platform has order-summary generation routes. |
| E14 | WEB-EPIC-14 — Notifications (`WEB-US-123..126`) | No in-app Notification Center or notification-preference route/component was found in Platform or Portal. |
| E15 | WEB-EPIC-15 — Traceability and operational visibility (`WEB-US-127..133`) | Platform operations overview displays API-returned aggregate metrics; Portal delivery detail shows delivery events. No general Business Traceability search/detail or Security Audit review screen was found. |

## Matriz de historias individuales

Cada renglón conserva el título y la superficie canónicos, enlaza con la evidencia por épica y declara el estado de AC visible en Blueprint. La columna no afirma que el código satisfaga una historia: eso requiere criterios aceptados, prueba funcional por criterio y el gate correspondiente.

| ID | Historia (título canónico) | Superficie | Evidencia | AC / aceptación |
|---|---|---|---|---|
| WEB-US-001 | Understand Nexa's value proposition | Website | E01 | PENDING en Blueprint; sin cierre por criterio |
| WEB-US-002 | Explore Nexa capabilities and use cases | Website | E01 | PENDING en Blueprint; sin cierre por criterio |
| WEB-US-003 | Review service trust, privacy and terms information | Website | E01 | PENDING en Blueprint; sin cierre por criterio |
| WEB-US-004 | Contact Nexa or request a demonstration | Website | E01 | PENDING en Blueprint; sin cierre por criterio |
| WEB-US-005 | Start a company onboarding request | Website | E01 | PENDING en Blueprint; sin cierre por criterio |
| WEB-US-006 | Resume an incomplete onboarding request | Website | E01 | PENDING en Blueprint; sin cierre por criterio |
| WEB-US-007 | Review a company onboarding request | Platform | E02 | PENDING en Blueprint; sin cierre por criterio |
| WEB-US-008 | Authorize or reject a company | Platform | E02 | PENDING en Blueprint; sin cierre por criterio |
| WEB-US-009 | Complete required company information | Platform | E02 | PENDING en Blueprint; sin cierre por criterio |
| WEB-US-010 | Establish the initial Company Owner | Platform | E02 | PENDING en Blueprint; sin cierre por criterio |
| WEB-US-011 | Configure the initial operational Workspace | Platform | E02 | PENDING en Blueprint; sin cierre por criterio |
| WEB-US-012 | Review company configuration before activation | Platform | E02 | PENDING en Blueprint; sin cierre por criterio |
| WEB-US-013 | Bring the Tenant to operational state | Platform | E02 | PENDING en Blueprint; sin cierre por criterio |
| WEB-US-014 | Suspend or reactivate a Tenant | Platform | E02 | PENDING en Blueprint; sin cierre por criterio |
| WEB-US-015 | Export information and close a Tenant in a governed manner | Platform | E02 | PENDING en Blueprint; sin cierre por criterio |
| WEB-US-016 | Sign in to Nexa | Platform | E03 | PENDING en Blueprint; sin cierre por criterio |
| WEB-US-017 | Recover account access | Platform | E03 | PENDING en Blueprint; sin cierre por criterio |
| WEB-US-018 | Select an active business context | Platform | E03 | PENDING en Blueprint; sin cierre por criterio |
| WEB-US-019 | Invite a workforce member | Platform | E03 | PENDING en Blueprint; sin cierre por criterio |
| WEB-US-020 | Accept a Workforce Membership | Platform | E03 | PENDING en Blueprint; sin cierre por criterio |
| WEB-US-021 | Assign roles and capabilities | Platform | E03 | PENDING en Blueprint; sin cierre por criterio |
| WEB-US-022 | Create and maintain custom roles | Platform | E03 | PENDING en Blueprint; sin cierre por criterio |
| WEB-US-023 | Suspend or revoke a Workforce Membership | Platform | E03 | PENDING en Blueprint; sin cierre por criterio |
| WEB-US-024 | Transfer company ownership | Platform | E03 | PENDING en Blueprint; sin cierre por criterio |
| WEB-US-025 | Create a Customer Account | Platform | E04 | PENDING en Blueprint; sin cierre por criterio |
| WEB-US-026 | Maintain Customer Account information | Platform | E04 | PENDING en Blueprint; sin cierre por criterio |
| WEB-US-027 | Manage Customer contacts and addresses | Platform | E04 | PENDING en Blueprint; sin cierre por criterio |
| WEB-US-028 | Initiate a Buyer Relationship | Platform | E04 | PENDING en Blueprint; sin cierre por criterio |
| WEB-US-029 | Approve a Buyer Relationship | Platform | E04 | PENDING en Blueprint; sin cierre por criterio |
| WEB-US-030 | Suspend or revoke a Buyer Relationship | Platform | E04 | PENDING en Blueprint; sin cierre por criterio |
| WEB-US-031 | Transfer the principal Buyer for a Customer Account | Platform | E04 | PENDING en Blueprint; sin cierre por criterio |
| WEB-US-032 | Switch between authorized supplier relationships | Buyer Portal | E04 | PENDING en Blueprint; sin cierre por criterio |
| WEB-US-033 | Create a Product | Platform | E05 | PENDING en Blueprint; sin cierre por criterio |
| WEB-US-034 | Create a SKU | Platform | E05 | PENDING en Blueprint; sin cierre por criterio |
| WEB-US-035 | Maintain Product and SKU information | Platform | E05 | PENDING en Blueprint; sin cierre por criterio |
| WEB-US-036 | Manage SKU lifecycle and Buyer visibility | Platform | E05 | PENDING en Blueprint; sin cierre por criterio |
| WEB-US-037 | Manage catalog media | Platform | E05 | PENDING en Blueprint; sin cierre por criterio |
| WEB-US-038 | Configure SKU cold-chain requirements | Platform | E05 | PENDING en Blueprint; sin cierre por criterio |
| WEB-US-039 | Configure Base Price | Platform | E05 | PENDING en Blueprint; sin cierre por criterio |
| WEB-US-040 | Manage Price Lists | Platform | E05 | PENDING en Blueprint; sin cierre por criterio |
| WEB-US-041 | Manage Customer Terms | Platform | E05 | PENDING en Blueprint; sin cierre por criterio |
| WEB-US-042 | Manage Promotions | Platform | E05 | PENDING en Blueprint; sin cierre por criterio |
| WEB-US-043 | Browse and search available SKUs | Buyer Portal | E06 | PENDING en Blueprint; sin cierre por criterio |
| WEB-US-044 | Review SKU details, price and commercial availability | Buyer Portal | E06 | PENDING en Blueprint; sin cierre por criterio |
| WEB-US-045 | Build a purchase request draft | Buyer Portal | E06 | PENDING en Blueprint; sin cierre por criterio |
| WEB-US-046 | Change quantities or remove items from a draft | Buyer Portal | E06 | PENDING en Blueprint; sin cierre por criterio |
| WEB-US-047 | Resume a saved draft | Buyer Portal | E06 | PENDING en Blueprint; sin cierre por criterio |
| WEB-US-048 | Provide Delivery and Payment Terms information | Buyer Portal | E06 | PENDING en Blueprint; sin cierre por criterio |
| WEB-US-049 | Review the complete commercial intention before submission | Buyer Portal | E06 | PENDING en Blueprint; sin cierre por criterio |
| WEB-US-050 | Submit a Purchase Request | Buyer Portal | E07 | PENDING en Blueprint; sin cierre por criterio |
| WEB-US-051 | Resolve insufficient Sellable Availability | Buyer Portal | E07 | PENDING en Blueprint; sin cierre por criterio |
| WEB-US-052 | Resolve insufficient Available Credit | Buyer Portal | E07 | PENDING en Blueprint; sin cierre por criterio |
| WEB-US-053 | Track Purchase Request status | Buyer Portal | E07 | PENDING en Blueprint; sin cierre por criterio |
| WEB-US-054 | Review a submitted Purchase Request | Platform | E07 | PENDING en Blueprint; sin cierre por criterio |
| WEB-US-055 | Propose material Purchase Request changes | Platform | E07 | PENDING en Blueprint; sin cierre por criterio |
| WEB-US-056 | Accept or reject proposed material changes | Buyer Portal | E07 | PENDING en Blueprint; sin cierre por criterio |
| WEB-US-057 | Withdraw an active Purchase Request | Buyer Portal | E07 | PENDING en Blueprint; sin cierre por criterio |
| WEB-US-058 | Reject a Purchase Request | Platform | E07 | PENDING en Blueprint; sin cierre por criterio |
| WEB-US-059 | Expire an overdue Purchase Request | Buyer Portal | E07 | PENDING en Blueprint; sin cierre por criterio |
| WEB-US-060 | Convert an accepted Purchase Request into a Sales Order | Platform | E07 | PENDING en Blueprint; sin cierre por criterio |
| WEB-US-061 | Confirm a DIRECT_ORDER | Buyer Portal | E08 | PENDING en Blueprint; sin cierre por criterio |
| WEB-US-062 | Capture an order received through phone, WhatsApp or another external channel | Platform | E08 | PENDING en Blueprint; sin cierre por criterio |
| WEB-US-063 | Review a Sales Order | Buyer Portal | E08 | PENDING en Blueprint; sin cierre por criterio |
| WEB-US-064 | Manage Sales Order commercial follow-up | Platform | E08 | PENDING en Blueprint; sin cierre por criterio |
| WEB-US-065 | Cancel an eligible Sales Order | Platform | E08 | PENDING en Blueprint; sin cierre por criterio |
| WEB-US-066 | Cancel only the unresolved Sales Order remainder | Platform | E08 | PENDING en Blueprint; sin cierre por criterio |
| WEB-US-067 | Replace or amend a materially changed commercial obligation | Platform | E08 | PENDING en Blueprint; sin cierre por criterio |
| WEB-US-068 | Review aggregate Sales Order fulfillment progress | Platform | E08 | PENDING en Blueprint; sin cierre por criterio |
| WEB-US-069 | Complete a Sales Order when all committed quantities are resolved | Platform | E08 | PENDING en Blueprint; sin cierre por criterio |
| WEB-US-070 | Review authoritative Sellable Availability | Platform | E09 | PENDING en Blueprint; sin cierre por criterio |
| WEB-US-071 | Record inventory receiving | Platform | E09 | PENDING en Blueprint; sin cierre por criterio |
| WEB-US-072 | Record Lot, expiry and traceability information | Platform | E09 | PENDING en Blueprint; sin cierre por criterio |
| WEB-US-073 | Review inventory and Lots by SKU and Warehouse | Platform | E09 | PENDING en Blueprint; sin cierre por criterio |
| WEB-US-074 | Configure Safety Stock | Platform | E09 | PENDING en Blueprint; sin cierre por criterio |
| WEB-US-075 | Record an Inventory Adjustment | Platform | E09 | PENDING en Blueprint; sin cierre por criterio |
| WEB-US-076 | Place, maintain or release inventory under HOLD | Platform | E09 | PENDING en Blueprint; sin cierre por criterio |
| WEB-US-077 | Request a Warehouse Transfer | Platform | E09 | PENDING en Blueprint; sin cierre por criterio |
| WEB-US-078 | Confirm Warehouse Transfer dispatch | Platform | E09 | PENDING en Blueprint; sin cierre por criterio |
| WEB-US-079 | Confirm Warehouse Transfer receipt | Platform | E09 | PENDING en Blueprint; sin cierre por criterio |
| WEB-US-080 | Perform Physical Allocation using FEFO | Platform | E09 | PENDING en Blueprint; sin cierre por criterio |
| WEB-US-081 | Reallocate inventory or justify an allocation override | Platform | E09 | PENDING en Blueprint; sin cierre por criterio |
| WEB-US-082 | Plan Fulfillment work | Platform | E10 | PENDING en Blueprint; sin cierre por criterio |
| WEB-US-083 | Perform Picking | Platform | E10 | PENDING en Blueprint; sin cierre por criterio |
| WEB-US-084 | Record Picking discrepancy | Platform | E10 | PENDING en Blueprint; sin cierre por criterio |
| WEB-US-085 | Confirm Packing | Platform | E10 | PENDING en Blueprint; sin cierre por criterio |
| WEB-US-086 | Record Staging | Platform | E10 | PENDING en Blueprint; sin cierre por criterio |
| WEB-US-087 | Mark Fulfillment Ready for Dispatch | Platform | E10 | PENDING en Blueprint; sin cierre por criterio |
| WEB-US-088 | Hand responsibility to Dispatch | Platform | E10 | PENDING en Blueprint; sin cierre por criterio |
| WEB-US-089 | Resolve Fulfillment shortage and operational exceptions | Platform | E10 | PENDING en Blueprint; sin cierre por criterio |
| WEB-US-090 | Plan a Delivery | Platform | E11 | PENDING en Blueprint; sin cierre por criterio |
| WEB-US-091 | Schedule a Delivery | Platform | E11 | PENDING en Blueprint; sin cierre por criterio |
| WEB-US-092 | Assign a Driver | Platform | E11 | PENDING en Blueprint; sin cierre por criterio |
| WEB-US-093 | Reschedule a Delivery | Platform | E11 | PENDING en Blueprint; sin cierre por criterio |
| WEB-US-094 | Confirm Dispatch handoff | Platform | E11 | PENDING en Blueprint; sin cierre por criterio |
| WEB-US-095 | Record a Delivery Attempt | Platform | E11 | PENDING en Blueprint; sin cierre por criterio |
| WEB-US-096 | Handle a failed Delivery Attempt | Platform | E11 | PENDING en Blueprint; sin cierre por criterio |
| WEB-US-097 | Record a Partial Delivery | Platform | E11 | PENDING en Blueprint; sin cierre por criterio |
| WEB-US-098 | Create a Continuation Delivery | Platform | E11 | PENDING en Blueprint; sin cierre por criterio |
| WEB-US-099 | Record Proof of Delivery | Platform | E11 | PENDING en Blueprint; sin cierre por criterio |
| WEB-US-100 | Correct POD using an addendum without overwriting historical evidence | Platform | E11 | PENDING en Blueprint; sin cierre por criterio |
| WEB-US-101 | Track an active Delivery on Web | Buyer Portal | E11 | PENDING en Blueprint; sin cierre por criterio |
| WEB-US-102 | Record temperature evidence | Platform | E11 | PENDING en Blueprint; sin cierre por criterio |
| WEB-US-103 | Resolve a Temperature Excursion and disposition | Platform | E11 | PENDING en Blueprint; sin cierre por criterio |
| WEB-US-104 | Configure Credit Limit | Platform | E12 | PENDING en Blueprint; sin cierre por criterio |
| WEB-US-105 | Review Customer credit exposure | Platform | E12 | PENDING en Blueprint; sin cierre por criterio |
| WEB-US-106 | Review supplier-specific credit position | Buyer Portal | E12 | PENDING en Blueprint; sin cierre por criterio |
| WEB-US-107 | Receive credit validation during a commercial operation | Buyer Portal | E12 | PENDING en Blueprint; sin cierre por criterio |
| WEB-US-108 | Review Receivables | Platform | E12 | PENDING en Blueprint; sin cierre por criterio |
| WEB-US-109 | Record a Financial Adjustment | Platform | E12 | PENDING en Blueprint; sin cierre por criterio |
| WEB-US-110 | Report an external payment | Buyer Portal | E12 | PENDING en Blueprint; sin cierre por criterio |
| WEB-US-111 | Confirm or reject a reported payment | Platform | E12 | PENDING en Blueprint; sin cierre por criterio |
| WEB-US-112 | Initiate an online payment | Buyer Portal | E12 | PENDING en Blueprint; sin cierre por criterio |
| WEB-US-113 | Handle pending, failed and retryable payment states without duplicate charge | Buyer Portal | E12 | PENDING en Blueprint; sin cierre por criterio |
| WEB-US-114 | Record refund or payment correction | Platform | E12 | PENDING en Blueprint; sin cierre por criterio |
| WEB-US-115 | Review Payment history | Buyer Portal | E12 | PENDING en Blueprint; sin cierre por criterio |
| WEB-US-116 | Issue a Sales Order Document | Platform | E13 | PENDING en Blueprint; sin cierre por criterio |
| WEB-US-117 | Issue a Delivery Note | Platform | E13 | PENDING en Blueprint; sin cierre por criterio |
| WEB-US-118 | Issue a Commercial Invoice | Platform | E13 | PENDING en Blueprint; sin cierre por criterio |
| WEB-US-119 | Issue a Payment Receipt | Platform | E13 | PENDING en Blueprint; sin cierre por criterio |
| WEB-US-120 | Issue a Financial Adjustment | Platform | E13 | PENDING en Blueprint; sin cierre por criterio |
| WEB-US-121 | Access authorized Business Documents | Buyer Portal | E13 | PENDING en Blueprint; sin cierre por criterio |
| WEB-US-122 | Correct or replace an issued Business Document while preserving the original | Platform | E13 | PENDING en Blueprint; sin cierre por criterio |
| WEB-US-123 | Receive in-app notifications | Platform; Buyer Portal | E14 | PENDING en Blueprint; sin cierre por criterio |
| WEB-US-124 | Receive transactional email notifications | Platform; Buyer Portal | E14 | PENDING en Blueprint; sin cierre por criterio |
| WEB-US-125 | Manage optional informational notification preferences | Platform; Buyer Portal | E14 | PENDING en Blueprint; sin cierre por criterio |
| WEB-US-126 | Review and manage the Notification Center | Platform; Buyer Portal | E14 | PENDING en Blueprint; sin cierre por criterio |
| WEB-US-127 | Review Business Traceability | Platform | E15 | PENDING en Blueprint; sin cierre por criterio |
| WEB-US-128 | Review a reduced timeline of their own business operations | Buyer Portal | E15 | PENDING en Blueprint; sin cierre por criterio |
| WEB-US-129 | Review the overall operational picture | Platform | E15 | PENDING en Blueprint; sin cierre por criterio |
| WEB-US-130 | Identify critical operational exceptions | Platform | E15 | PENDING en Blueprint; sin cierre por criterio |
| WEB-US-131 | Navigate from an operational exception to the responsible business process | Platform | E15 | PENDING en Blueprint; sin cierre por criterio |
| WEB-US-132 | Search and filter operational information | Platform | E15 | PENDING en Blueprint; sin cierre por criterio |
| WEB-US-133 | Review authorized Security Audit evidence | Platform | E15 | PENDING en Blueprint; sin cierre por criterio |


## Referencias de implementación

- Rutas principales: `apps/platform/src/app/app.routes.ts`, `apps/portal/src/app/app.routes.ts`.
- Catálogo Platform: `apps/platform/src/app/contexts/catalog-commercial-policy/presentation/platform-catalog-page.component.ts`, `platform-catalog-management-page.component.ts` y sus templates/spec.
- Catálogo/draft Portal: `apps/portal/src/app/contexts/catalog-commercial-policy/application/catalog-api.adapter.ts`, `catalog.store.ts`, `catalog-page.component.html`, `buyer-purchase-request-draft-page.component.ts` y `.html`.
- Contrato Web de filtros y referencias: `libs/nexa-api/src/lib/contexts/catalog-commercial-policy/infrastructure/platform-catalog-api.ts`, `catalog-management-api.ts`, `buyer-catalog-api.ts`; `libs/nexa-api/src/lib/queries/reference-data/infrastructure/peru-geography-api.ts`.
- Refresco foreground/live map: `libs/nexa-ui/src/lib/foreground-refresh.ts`, `apps/platform/src/app/contexts/sales-commitment/presentation/platform-sales-orders-page.component.ts`, `apps/platform/src/app/contexts/fulfillment-delivery/application/platform-fulfillment-workbench.store.ts`, `apps/portal/src/app/contexts/sales-commitment/presentation/buyer-sales-orders-page.component.ts`, `apps/portal/src/app/contexts/fulfillment-delivery/application/buyer-deliveries.store.ts`, `buyer-delivery-detail-page.component.ts`, `buyer-delivery-live-map.ts` y `apps/portal/src/app/core/portal-delivery-map-configuration.ts`.
- E2E local: `e2e/platform/real-authenticated-context.spec.mjs`, `e2e/portal/real-buyer-catalog.spec.mjs`, `e2e/portal/real-buyer-order-flow.spec.mjs` y `playwright.config.ts`.
- Dirección cliente: `apps/platform/src/app/contexts/customer-buyer-relationships/presentation/platform-clients-page.component.ts` y `.html`; contrato `libs/nexa-api/src/lib/contexts/customer-buyer-relationships/infrastructure/platform-client-accounts-api.ts`.
- Registro de cambios owner-scoped y workbench: `apps/platform/src/app/contexts/tenant-access-governance/presentation/governance/`, `apps/platform/src/app/contexts/fulfillment-delivery/presentation/platform-fulfillment-delivery.component.html`, `apps/portal/src/app/contexts/fulfillment-delivery/presentation/`.

## Gates pendientes

- **Implementación:** evidencia parcial por las superficies enumeradas; no equivale a cierre de historias.
- **Verificación técnica:** pruebas unitarias/builds Web anteriores y builds Docker Platform/Portal registrados arriba; `npm run build:all` pasó en la reanudación. Suite E2E completa anterior tuvo una falla y dos escenarios omitidos. E2E enfocado pasó tras corrección runtime y nuevamente con flujo extendido hasta dispatch, refresh Buyer y descarga PDF. Suite completa no se repitió; esto no equivale a gate de Sistema.
- **Aceptación de Producto/UX:** abierta hasta que Owner/producto publique AC y se evalúe cada criterio.
- **Aceptación de Sistema:** abierta; este trabajo no ejecutó el gate integrado.
- **Preparación de producción:** no evaluada.

No modificar el catálogo ni convertir TARGET en AS-IS para reducir estas brechas. El siguiente paso mínimo para el cierre por historia es aprobar/refinar los AC del catálogo congelado y luego asociar a cada criterio un flujo verificable.

## Corrección de cantidad durante carga de catálogo

El SKU inicial se establece antes de esperar al catálogo; una respuesta tardía ya no reemplaza la cantidad editada por Buyer. Prueba enfocada del componente: 5 pasaron. `NEXA_E2E_REQUEST_QUANTITY=2 npx playwright test e2e/portal/real-buyer-order-flow.spec.mjs --project=portal-chromium`: 1 pasó, con cantidad dos conservada hasta despacho y descarga PDF. Verificación técnica local; no constituye aceptación por historia.

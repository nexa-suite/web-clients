import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join, posix, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const ts = require('typescript');
const apiSourceRoot = 'libs/nexa-api/src';
const appSourceRoots = ['apps/platform/src', 'apps/portal/src'];
const contextRoots = [
  'libs/nexa-api/src/lib/contexts',
  'apps/platform/src/app/contexts',
  'apps/portal/src/app/contexts',
];
// Names come from blueprint/01-shared/domain/bounded-contexts/README.md.
// Keep this as a guard allowlist rather than a second context catalog.
const canonicalContexts = new Set([
  'tenant-access-governance',
  'customer-buyer-relationships',
  'catalog-commercial-policy',
  'sales-commitment',
  'inventory-availability',
  'fulfillment-delivery',
  'credit-receivables',
  'payments',
  'business-documents',
  'notifications',
  'business-traceability',
]);
const businessRoute = /^(?:\/api\/v[0-9]+)?\/(?:auth(?:entication)?|session|me|tenants?|workspaces?|memberships?|access|identity|authorization|customers?|buyers?|relationships?|buyer-relationships|catalog|offers?|prices?|products?|skus?|sales|purchase-requests|sales-orders|orders?|inventory|warehouses?|fulfillment|dispatch|deliveries|credit|receivables?|payments?|documents?|notifications?|traceability|business-facts|logistics)(?:\/|$)/i;

function walk(directory) {
  const files = [];
  for (const entry of readdirSync(directory)) {
    const path = join(directory, entry);
    if (statSync(path).isDirectory()) {
      files.push(...walk(path));
    } else {
      files.push(path);
    }
  }
  return files;
}

function toPosix(path) {
  return path.split(sep).join('/');
}

function isWithin(path, prefix) {
  return path === prefix || path.startsWith(prefix + '/');
}

function readRepositorySources(root) {
  const roots = [...appSourceRoots, apiSourceRoot].map((path) => join(root, path));
  const sources = new Map();
  for (const sourceRoot of roots) {
    for (const file of walk(sourceRoot)) {
      if (!/\.tsx?$/.test(file)) continue;
      const relativePath = toPosix(relative(root, file));
      sources.set(relativePath, readFileSync(file, 'utf8'));
    }
  }
  return sources;
}

function moduleSpecifiers(source, fileName) {
  const sourceFile = ts.createSourceFile(fileName, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
  const specifiers = [];

  function add(node) {
    if (node && ts.isStringLiteralLike(node)) specifiers.push(node.text);
  }

  function visit(node) {
    if ((ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) && node.moduleSpecifier) {
      add(node.moduleSpecifier);
    } else if (ts.isImportEqualsDeclaration(node) && ts.isExternalModuleReference(node.moduleReference)) {
      add(node.moduleReference.expression);
    } else if (ts.isImportTypeNode(node) && ts.isLiteralTypeNode(node.argument)) {
      add(node.argument.literal);
    } else if (ts.isCallExpression(node) && node.arguments.length > 0) {
      if (node.expression.kind === ts.SyntaxKind.ImportKeyword) {
        add(node.arguments[0]);
      } else if (ts.isIdentifier(node.expression) && node.expression.text === 'require') {
        add(node.arguments[0]);
      }
    }
    ts.forEachChild(node, visit);
  }

  visit(sourceFile);
  return specifiers;
}

function importsNamedExport(source, fileName, specifier, expectedExport) {
  const sourceFile = ts.createSourceFile(fileName, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
  const hasStaticNamedImport = sourceFile.statements.some((statement) => {
    if (!ts.isImportDeclaration(statement) || !ts.isStringLiteralLike(statement.moduleSpecifier) || statement.moduleSpecifier.text !== specifier) {
      return false;
    }
    const bindings = statement.importClause?.namedBindings;
    if (!bindings || !ts.isNamedImports(bindings)) return false;
    return bindings.elements.some((element) => (element.propertyName?.text ?? element.name.text) === expectedExport);
  });
  if (hasStaticNamedImport) return true;

  function callbackReturnsNamedExport(callback) {
    if (!ts.isArrowFunction(callback) && !ts.isFunctionExpression(callback)) return false;
    const parameter = callback.parameters[0]?.name;
    if (!parameter || !ts.isIdentifier(parameter)) return false;
    const expressions = ts.isBlock(callback.body)
      ? callback.body.statements.filter(ts.isReturnStatement).map((statement) => statement.expression).filter(Boolean)
      : [callback.body];
    return expressions.some((expression) =>
      ts.isPropertyAccessExpression(expression) &&
      expression.name.text === expectedExport &&
      ts.isIdentifier(expression.expression) &&
      expression.expression.text === parameter.text,
    );
  }

  let found = false;
  function visit(node) {
    if (ts.isCallExpression(node) && ts.isPropertyAccessExpression(node.expression) && node.expression.name.text === 'then') {
      const imported = node.expression.expression;
      const callback = node.arguments[0];
      if (
        ts.isCallExpression(imported) &&
        imported.expression.kind === ts.SyntaxKind.ImportKeyword &&
        imported.arguments.length > 0 &&
        ts.isStringLiteralLike(imported.arguments[0]) &&
        imported.arguments[0].text === specifier &&
        callback && callbackReturnsNamedExport(callback)
      ) {
        found = true;
      }
    }
    if (!found) ts.forEachChild(node, visit);
  }
  visit(sourceFile);
  return found;
}

function hasNonLiteralModuleSpecifier(source, fileName) {
  const sourceFile = ts.createSourceFile(fileName, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
  let found = false;

  function visit(node) {
    if (ts.isCallExpression(node) && node.arguments.length > 0) {
      const isDynamicImport = node.expression.kind === ts.SyntaxKind.ImportKeyword;
      const isRequire = ts.isIdentifier(node.expression) && node.expression.text === 'require';
      if ((isDynamicImport || isRequire) && !ts.isStringLiteralLike(node.arguments[0])) found = true;
    }
    if (!found) ts.forEachChild(node, visit);
  }

  visit(sourceFile);
  return found;
}

function resolveLocalImport(importer, specifier, sources) {
  if (!specifier.startsWith('.')) return null;
  const base = posix.normalize(posix.join(posix.dirname(importer), specifier));
  const candidates = [base];
  if (/\.(?:js|mjs|cjs)$/.test(base)) candidates.push(base.replace(/\.(?:js|mjs|cjs)$/, '.ts'));
  if (!/\.(?:[cm]?[jt]sx?)$/i.test(base)) {
    candidates.push(base + '.ts', base + '.tsx', base + '.d.ts', base + '.js');
  }
  candidates.push(base + '/index.ts', base + '/index.tsx');
  return candidates.find((candidate) => sources.has(candidate)) ?? null;
}

function resolveRepositoryImport(specifier, sources) {
  if (!specifier.startsWith('apps/') && !specifier.startsWith('libs/nexa-api/src/')) return null;
  return resolveLocalImport('', `./${specifier}`, sources);
}

function resolveApiPrivateSpecifier(specifier) {
  const match = specifier.match(/^@nexa\/api\/(src\/.*)$/);
  return match ? `libs/nexa-api/${match[1]}` : null;
}

function contextLocation(path) {
  const match = path.match(/^libs\/nexa-api\/src\/lib\/contexts\/([^/]+)\/([^/]+)\//);
  return match ? { context: match[1], layer: match[2] } : null;
}

function applicationLocation(path) {
  const match = path.match(/^(apps\/(?:platform|portal)\/src)\//);
  return match ? match[1] : null;
}

function applicationContextLocation(path) {
  const match = path.match(/^apps\/(platform|portal)\/src\/app\/contexts\/([^/]+)\/(.+)$/);
  return match ? { application: match[1], context: match[2], implementation: match[3] } : null;
}

function hasDirectFetchCall(source, fileName) {
  const sourceFile = ts.createSourceFile(fileName, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
  let found = false;

  function visit(node) {
    if (ts.isCallExpression(node)) {
      const expression = node.expression;
      if (ts.isIdentifier(expression) && expression.text === 'fetch') found = true;
      if (
        ts.isPropertyAccessExpression(expression) &&
        expression.name.text === 'fetch' &&
        ts.isIdentifier(expression.expression) &&
        ['globalThis', 'window', 'self'].includes(expression.expression.text)
      ) {
        found = true;
      }
    }
    if (!found) ts.forEachChild(node, visit);
  }

  visit(sourceFile);
  return found;
}

function queryLocation(path) {
  const match = path.match(/^libs\/nexa-api\/src\/lib\/queries\/([^/]+)\/([^/]+)\//);
  return match ? { query: match[1], layer: match[2] } : null;
}

function record(violations, code, file, message) {
  violations.push({ code, file, message });
}

export function inspectImportBoundaries(sources) {
  const violations = [];

  for (const [file, source] of sources) {
    const isApp = appSourceRoots.some((root) => isWithin(file, root));
    const isApiSource = isWithin(file, apiSourceRoot);
    const isTransport = isWithin(file, 'libs/nexa-api/src/lib/http');
    const sourceContext = contextLocation(file);
    const sourceApplicationContext = applicationContextLocation(file);
    const sourceQuery = queryLocation(file);
    const sourceFile = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);

    const sourceContextSlug = sourceContext?.context ?? sourceApplicationContext?.context;
    if (sourceContextSlug && !canonicalContexts.has(sourceContextSlug)) {
      record(violations, 'unknown-context-slug', file, `context slug ${JSON.stringify(sourceContextSlug)} is not in the canonical bounded-context vocabulary`);
    }

    if ((isApp || isApiSource) && hasNonLiteralModuleSpecifier(source, file)) {
      record(violations, 'dynamic-module-import', file, 'dynamic import and require paths must be static so dependency boundaries remain checkable');
    }
    if (isApp && hasDirectFetchCall(source, file)) {
      record(violations, 'application-direct-fetch', file, 'application code must use the shared @nexa/api client boundary instead of fetch');
    }

    if ((isTransport || isApp) && !/\.(spec|test)\.ts$/.test(file)) {
      function inspectRouteLiteral(node) {
        const isBusinessApiRoute = (value) => isTransport
          ? businessRoute.test(value)
          : /^\/api\/v[0-9]+\//.test(value) && businessRoute.test(value);
        if (ts.isStringLiteralLike(node) && isBusinessApiRoute(node.text)) {
          record(violations, isTransport ? 'transport-business-route' : 'application-business-route', file, `source outside an API adapter contains business route ${JSON.stringify(node.text)}`);
        }
        if (ts.isTemplateExpression(node) && isBusinessApiRoute(node.head.text)) {
          record(violations, isTransport ? 'transport-business-route' : 'application-business-route', file, `source outside an API adapter contains business route template ${JSON.stringify(node.head.text)}`);
        }
        ts.forEachChild(node, inspectRouteLiteral);
      }
      inspectRouteLiteral(sourceFile);
    }

    for (const specifier of moduleSpecifiers(source, file)) {
      const target = resolveLocalImport(file, specifier, sources) ??
        resolveApiPrivateSpecifier(specifier) ??
        resolveRepositoryImport(specifier, sources);

      if (isApp) {
        if (specifier.startsWith('@nexa/api/') && specifier !== '@nexa/api') {
          record(violations, 'application-private-api', file, `import ${JSON.stringify(specifier)} bypasses the @nexa/api public entrypoint`);
        }
        if (specifier === '@angular/common/http') {
          record(violations, 'application-direct-http', file, 'application code must use the shared @nexa/api client boundary');
        }
        if (target && isWithin(target, 'libs/nexa-api/src')) {
          record(violations, 'application-private-api', file, `relative import ${JSON.stringify(specifier)} reaches ${target} instead of @nexa/api`);
        }
        const targetApplication = target ? applicationLocation(target) : null;
        const sourceApplication = applicationLocation(file);
        if (targetApplication && sourceApplication && targetApplication !== sourceApplication) {
          record(violations, 'application-cross-app-import', file, `application imports source owned by ${targetApplication}: ${target}`);
        }

        const targetApplicationContext = target ? applicationContextLocation(target) : null;
        if (targetApplicationContext) {
          const sameContext = sourceApplicationContext &&
            sourceApplicationContext.application === targetApplicationContext.application &&
            sourceApplicationContext.context === targetApplicationContext.context;
          const isPortalAppRoutes = file === 'apps/portal/src/app/app.routes.ts';
          const isPublicApi = targetApplicationContext.implementation === 'application/public-api.ts' && !isPortalAppRoutes;
          const isOwnRouteComposition = ['apps/platform/src/app/app.routes.ts', 'apps/platform/src/app/app.routes.spec.ts'].includes(file) &&
            target === 'apps/platform/src/app/contexts/tenant-access-governance/presentation/public-api.ts';
          const portalRouteEntrypoints = new Map([
            ['apps/portal/src/app/contexts/tenant-access-governance/presentation/public-api.ts', 'PORTAL_ACCESS_ROUTES'],
            ['apps/portal/src/app/contexts/customer-buyer-relationships/presentation/public-api.ts', 'requirePortalBuyer'],
            ['apps/portal/src/app/contexts/catalog-commercial-policy/application/public-api.ts', 'PORTAL_CATALOG_ROUTES'],
            ['apps/portal/src/app/contexts/sales-commitment/application/public-api.ts', 'PORTAL_SALES_COMMITMENT_ROUTES'],
            ['apps/portal/src/app/contexts/business-documents/application/public-api.ts', 'PORTAL_BUSINESS_DOCUMENT_ROUTES'],
          ]);
          const expectedPortalExport = portalRouteEntrypoints.get(target);
          const isPortalRouteComposition = isPortalAppRoutes && targetApplicationContext.application === 'portal' && expectedPortalExport !== undefined;
          const portalRouteSpecifier = `./${target.slice('apps/portal/src/app/'.length)}`.replace(/\.tsx?$/, '');
          if (isPortalRouteComposition && !importsNamedExport(source, file, portalRouteSpecifier, expectedPortalExport)) {
            record(violations, 'application-context-route-entrypoint', file, `Portal route composition must import ${expectedPortalExport} from ${target}`);
          }
          if (!sameContext && !isPublicApi && !isOwnRouteComposition && !isPortalRouteComposition) {
            record(
              violations,
              'application-context-private-import',
              file,
              `application import reaches private ${targetApplicationContext.context} implementation ${target}`,
            );
          }
        }
      }

      if (isApiSource && specifier.startsWith('@nexa/api/')) {
        record(violations, 'library-private-api-import', file, `library implementation must use relative internal imports, not ${JSON.stringify(specifier)}`);
      }

      if (isTransport && target && isWithin(target, 'libs/nexa-api/src/lib') && !isWithin(target, 'libs/nexa-api/src/lib/http')) {
        record(violations, 'transport-business-import', file, `generic transport imports non-transport source ${target}`);
      }

      const targetContext = target ? contextLocation(target) : null;
      if (sourceContext && targetContext && sourceContext.context !== targetContext.context && targetContext.layer !== 'contracts') {
        record(
          violations,
          'context-private-import',
          file,
          `${sourceContext.context} imports private ${targetContext.context}/${targetContext.layer} source ${target}`,
        );
      }
      if (sourceContext?.layer === 'contracts' && targetContext?.context === sourceContext.context && targetContext.layer !== 'contracts') {
        record(violations, 'contract-layer-import', file, `context contract imports implementation source ${target}`);
      }
      if (sourceContext && target && isWithin(target, 'libs/nexa-api/src/lib/queries')) {
        record(violations, 'context-query-import', file, `context adapter imports application query source ${target}`);
      }
      if (sourceQuery && targetContext && targetContext.layer !== 'contracts') {
        record(violations, 'query-private-context-import', file, `composite query imports private ${targetContext.context}/${targetContext.layer} source ${target}`);
      }
      if (isWithin(file, 'libs/nexa-api/src/lib') && specifier === '@nexa/api') {
        record(violations, 'library-public-api-cycle', file, 'library implementation must not import its own public package entrypoint');
      }
    }
  }

  return violations;
}

function fixture(name, sources, expectedCode) {
  const violations = inspectImportBoundaries(new Map(Object.entries(sources)));
  if (expectedCode === null) {
    return violations.length === 0
      ? null
      : `${name}: expected no violations, got ${violations.map(({ code }) => code).join(', ')}`;
  }
  if (!violations.some(({ code }) => code === expectedCode)) {
    return `${name}: expected ${expectedCode}, got ${violations.map(({ code }) => code).join(', ') || 'no violations'}`;
  }
  return null;
}

export function runImportBoundaryProbes() {
  const failures = [];
  const probes = [
    fixture('transport cannot import a context adapter', {
      'libs/nexa-api/src/lib/http/client.ts': "import { AuthenticationApi } from '../contexts/tenant-access-governance/infrastructure/authentication-api';",
      'libs/nexa-api/src/lib/contexts/tenant-access-governance/infrastructure/authentication-api.ts': 'export class AuthenticationApi {}',
    }, 'transport-business-import'),
    fixture('an app cannot embed a versioned API business route', {
      'apps/platform/src/app/feature.ts': "const endpoint = '/api/v1/me/access-contexts';",
    }, 'application-business-route'),
    fixture('Portal local UrlTrees may preserve access and catalog routes', {
      'apps/portal/src/app/contexts/customer-buyer-relationships/presentation/portal-buyer.guard.ts': "return router.createUrlTree(['/access/denied']);",
      'apps/portal/src/app/contexts/tenant-access-governance/presentation/access/access-page.component.ts': "return router.navigate(['/catalog']);",
    }, null),
    fixture('transport cannot embed a business route', {
      'libs/nexa-api/src/lib/http/client.ts': "const refreshRoute = '/authentication/refresh';",
    }, 'transport-business-route'),
    fixture('transport cannot build a business route with a template expression', {
      'libs/nexa-api/src/lib/http/client.ts': 'const route = `/authentication/${operation}`;',
    }, 'transport-business-route'),
    fixture('a context cannot import another context implementation', {
      'libs/nexa-api/src/lib/contexts/fulfillment-delivery/infrastructure/client.ts': "import { InventoryApi } from '../../inventory-availability/infrastructure/inventory-api';",
      'libs/nexa-api/src/lib/contexts/inventory-availability/infrastructure/inventory-api.ts': 'export class InventoryApi {}',
    }, 'context-private-import'),
    fixture('a context cannot bypass ownership with a private package subpath', {
      'libs/nexa-api/src/lib/contexts/fulfillment-delivery/infrastructure/client.ts': "import { InventoryApi } from '@nexa/api/src/lib/contexts/inventory-availability/infrastructure/inventory-api';",
      'libs/nexa-api/src/lib/contexts/inventory-availability/infrastructure/inventory-api.ts': 'export class InventoryApi {}',
    }, 'context-private-import'),
    fixture('a composite query cannot reach into a context adapter', {
      'libs/nexa-api/src/lib/queries/operations/infrastructure/dashboard-api.ts': "import { InventoryApi } from '../../../contexts/inventory-availability/infrastructure/inventory-api';",
      'libs/nexa-api/src/lib/contexts/inventory-availability/infrastructure/inventory-api.ts': 'export class InventoryApi {}',
    }, 'query-private-context-import'),
    fixture('an app cannot import a private API subpath', {
      'apps/platform/src/app/feature.ts': "import { AuthenticationApi } from '@nexa/api/src/lib/contexts/tenant-access-governance/infrastructure/authentication-api';",
    }, 'application-private-api'),
    fixture('an app cannot reach API internals by relative path', {
      'apps/platform/src/app/feature.ts': "import { provideNexaHttp } from '../../../../libs/nexa-api/src/lib/http/nexa-http';",
      'libs/nexa-api/src/lib/http/nexa-http.ts': 'export function provideNexaHttp() {}',
    }, 'application-private-api'),
    fixture('an app cannot bypass the shared HTTP client', {
      'apps/platform/src/app/feature.ts': "import { HttpClient } from '@angular/common/http';",
    }, 'application-direct-http'),
    fixture('an app cannot issue an unmediated fetch request', {
      'apps/platform/src/app/feature.ts': "const response = await fetch('/api/v1/session');",
    }, 'application-direct-fetch'),
    fixture('an app cannot use a computed dynamic import to bypass boundaries', {
      'apps/platform/src/app/feature.ts': "const path = '@nexa/api/src/lib/private'; import(path);",
    }, 'dynamic-module-import'),
    fixture('library code cannot self-import through a private package subpath', {
      'libs/nexa-api/src/lib/http/api-error.ts': "import { NexaApiError } from '@nexa/api/src/lib/http/api-error';",
    }, 'library-private-api-import'),
    fixture('one app cannot import another app source tree', {
      'apps/platform/src/app/feature.ts': "import { PortalComponent } from '../../../portal/src/app/app.component';",
      'apps/portal/src/app/app.component.ts': 'export class PortalComponent {}',
    }, 'application-cross-app-import'),
    fixture('one app cannot use a repository-root path to reach another app', {
      'apps/platform/src/app/feature.ts': "import { PortalComponent } from 'apps/portal/src/app/app.component';",
      'apps/portal/src/app/app.component.ts': 'export class PortalComponent {}',
    }, 'application-cross-app-import'),
    fixture('an app cannot import another context private implementation', {
      'apps/platform/src/app/features/operations/overview.ts': "import { store } from '../../contexts/tenant-access-governance/application/platform-session.store';",
      'apps/platform/src/app/contexts/tenant-access-governance/application/platform-session.store.ts': 'export const store = {};',
    }, 'application-context-private-import'),
    fixture('Portal route composition cannot import a context implementation directly', {
      'apps/portal/src/app/app.routes.ts': "import { routes } from './contexts/customer-buyer-relationships/presentation/customer-relationships.routes';",
      'apps/portal/src/app/contexts/customer-buyer-relationships/presentation/customer-relationships.routes.ts': 'export const routes = [];',
    }, 'application-context-private-import'),
    fixture('Portal app route composition cannot import the Buyer guard implementation directly', {
      'apps/portal/src/app/app.routes.ts': "import { requirePortalBuyer } from './contexts/customer-buyer-relationships/presentation/portal-buyer.guard';",
      'apps/portal/src/app/contexts/customer-buyer-relationships/presentation/portal-buyer.guard.ts': 'export const requirePortalBuyer = () => true;',
    }, 'application-context-private-import'),
    fixture('Portal app route composition cannot import the access route implementation directly', {
      'apps/portal/src/app/app.routes.ts': "import { PORTAL_ACCESS_ROUTES } from './contexts/tenant-access-governance/presentation/access.routes';",
      'apps/portal/src/app/contexts/tenant-access-governance/presentation/access.routes.ts': 'export const PORTAL_ACCESS_ROUTES = [];',
    }, 'application-context-private-import'),
    fixture('Portal app route composition can only use explicit context route entrypoints', {
      'apps/portal/src/app/app.routes.ts': "import { eligibility } from './contexts/customer-buyer-relationships/application/public-api';",
      'apps/portal/src/app/contexts/customer-buyer-relationships/application/public-api.ts': 'export const eligibility = {};',
    }, 'application-context-private-import'),
    fixture('Portal route entrypoints may only be imported by their public route export', {
      'apps/portal/src/app/app.routes.ts': "import { CatalogStore } from './contexts/catalog-commercial-policy/application/public-api';",
      'apps/portal/src/app/contexts/catalog-commercial-policy/application/public-api.ts': 'export const PORTAL_CATALOG_ROUTES = []; export class CatalogStore {}',
    }, 'application-context-route-entrypoint'),
    fixture('context directories must use the canonical bounded-context vocabulary', {
      'libs/nexa-api/src/lib/contexts/customer-accounts/infrastructure/client.ts': 'export class Client {}',
    }, 'unknown-context-slug'),
    fixture('app context directories must use the canonical bounded-context vocabulary', {
      'apps/platform/src/app/contexts/customer-accounts/application/public-api.ts': 'export {};',
    }, 'unknown-context-slug'),
  ];
  failures.push(...probes.filter(Boolean));

  const allowedSources = new Map(Object.entries({
    'apps/platform/src/app/feature.ts': "import { NexaAuthenticationApi } from '@nexa/api';",
    'apps/platform/src/app/app.routes.ts': "import { PLATFORM_ACCESS_ROUTES } from './contexts/tenant-access-governance/presentation/public-api';",
    'apps/portal/src/app/app.routes.ts': "import { PORTAL_ACCESS_ROUTES } from './contexts/tenant-access-governance/presentation/public-api'; import { requirePortalBuyer } from './contexts/customer-buyer-relationships/presentation/public-api'; export const routes = [{ children: PORTAL_ACCESS_ROUTES }, { canActivate: [requirePortalBuyer], loadChildren: () => import('./contexts/catalog-commercial-policy/application/public-api').then((module) => module.PORTAL_CATALOG_ROUTES) }];",
    'apps/portal/src/app/contexts/customer-buyer-relationships/presentation/public-api.ts': 'export const routes = [];',
    'apps/portal/src/app/contexts/tenant-access-governance/presentation/public-api.ts': 'export const PORTAL_ACCESS_ROUTES = [];',
    'apps/portal/src/app/contexts/catalog-commercial-policy/application/public-api.ts': 'export const PORTAL_CATALOG_ROUTES = [];',
    'apps/portal/src/app/contexts/customer-buyer-relationships/presentation/portal-buyer.guard.ts': "return router.createUrlTree(['/access/denied']);",
    'apps/portal/src/app/contexts/tenant-access-governance/presentation/access/access-page.component.ts': "return router.navigate(['/catalog']);",
    'libs/nexa-api/src/lib/http/api-error.ts': 'export class NexaApiError {}',
    'libs/nexa-api/src/lib/contexts/tenant-access-governance/contracts/authentication.contracts.ts': 'export interface SessionResponse {}',
    'libs/nexa-api/src/lib/contexts/tenant-access-governance/infrastructure/authentication-api.ts': "import type { SessionResponse } from '../contracts/authentication.contracts'; import { NexaApiError } from '../../../http/api-error';",
  }));
  const allowedViolations = inspectImportBoundaries(allowedSources);
  if (allowedViolations.length > 0) {
    failures.push(`valid public API and same-context imports were rejected: ${allowedViolations.map(({ code }) => code).join(', ')}`);
  }

  return failures;
}

export function validateRepositoryImportBoundaries(root = resolve(dirname(fileURLToPath(import.meta.url)), '../..')) {
  const sources = readRepositorySources(root);
  const violations = inspectImportBoundaries(sources);
  const contextDirectoryViolations = [];
  for (const contextRoot of contextRoots) {
    const directory = join(root, contextRoot);
    if (!existsSync(directory)) continue;
    for (const entry of readdirSync(directory)) {
      if (!statSync(join(directory, entry)).isDirectory() || canonicalContexts.has(entry)) continue;
      contextDirectoryViolations.push(`${contextRoot}/${entry}: context slug ${JSON.stringify(entry)} is not in the canonical bounded-context vocabulary`);
    }
  }
  const probeFailures = runImportBoundaryProbes();
  return [
    ...violations.map(({ file, message }) => `${file}: ${message}`),
    ...contextDirectoryViolations,
    ...probeFailures.map((message) => `negative probe failed: ${message}`),
  ];
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const errors = validateRepositoryImportBoundaries();
  if (errors.length > 0) {
    console.error('Architecture import boundaries failed:\n' + errors.map((error) => '- ' + error).join('\n'));
    process.exitCode = 1;
  } else {
    console.log('Architecture import boundaries and negative probes are valid.');
  }
}

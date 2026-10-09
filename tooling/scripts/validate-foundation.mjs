import { readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { validateRepositoryImportBoundaries } from './validate-import-boundaries.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const errors = [];

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

function assert(condition, message) {
  if (!condition) errors.push(message);
}

function read(path) {
  return readFileSync(join(root, path), 'utf8');
}

function readRequired(path, message) {
  if (!statSync(join(root, path), { throwIfNoEntry: false })?.isFile()) {
    assert(false, message);
    return '';
  }
  return read(path);
}

function inspectPortalBuyerEligibility(guardSource, eligibilitySource) {
  const findings = [];
  if (!/CurrentBuyerAccountResponse/.test(eligibilitySource)) {
    findings.push({ code: 'portal-buyer-response-type', message: 'Buyer eligibility must consume the typed current-account API response.' });
  }
  if (!/\.surface\s*===\s*['"]PORTAL['"]/.test(eligibilitySource)) {
    findings.push({ code: 'portal-api-surface', message: 'Buyer eligibility must require an API session scoped to PORTAL.' });
  }
  if (!/buyerMembershipId[\s\S]{0,120}(?:===|!==)[\s\S]{0,120}membershipId|membershipId[\s\S]{0,120}(?:===|!==)[\s\S]{0,120}buyerMembershipId/.test(eligibilitySource)) {
    findings.push({ code: 'portal-buyer-relationship-equality', message: 'Portal eligibility must require equality between the API Buyer relationship and current API membership.' });
  }
  if (/\b(?:roles|permissions|capabilities)\b/.test(guardSource + eligibilitySource)) {
    findings.push({ code: 'portal-role-authorization', message: 'Portal route eligibility must not authorize from role, permission, or capability labels.' });
  }
  return findings;
}

function verifyPortalEligibilityProbes() {
  const validGuard = 'export const requirePortalBuyer = inject(PortalBuyerEligibilityService);';
  const validEligibility = "const session: SessionResponse = await api.session(); const account: CurrentBuyerAccountResponse = await api.currentAccount(); return session.surface === 'PORTAL' && account.buyerMembershipId === session.membership.membershipId;";
  const roleGrantFindings = inspectPortalBuyerEligibility(
    "return session.membership.roles.includes('BUYER');",
    validEligibility,
  );
  const missingRelationshipFindings = inspectPortalBuyerEligibility(
    validGuard,
    "const session: SessionResponse = await api.session(); const account: CurrentBuyerAccountResponse = await api.currentAccount(); return session.surface === 'PORTAL' && Boolean(account);",
  );
  const validFindings = inspectPortalBuyerEligibility(validGuard, validEligibility);
  const failures = [];
  if (validFindings.length > 0) {
    failures.push(`valid API-scoped Buyer relationship source was rejected: ${validFindings.map(({ code }) => code).join(', ')}`);
  }
  if (!roleGrantFindings.some(({ code }) => code === 'portal-role-authorization')) {
    failures.push('role-based authorization negative probe was not rejected');
  }
  if (!missingRelationshipFindings.some(({ code }) => code === 'portal-buyer-relationship-equality')) {
    failures.push('missing Buyer relationship equality negative probe was not rejected');
  }
  return failures;
}

const angular = JSON.parse(read('angular.json'));
const platform = angular.projects.platform;
const portal = angular.projects.portal;
assert(platform?.projectType === 'application', 'Platform must be an Angular application.');
assert(portal?.projectType === 'application', 'Portal must be an Angular application.');
assert(platform?.root !== portal?.root, 'Platform and Portal must have independent roots.');
assert(
  platform?.architect?.build?.options?.outputPath !== portal?.architect?.build?.options?.outputPath,
  'Platform and Portal must have independent build outputs.',
);
assert(
  platform?.architect?.build?.builder === '@angular/build:application' &&
    portal?.architect?.build?.builder === '@angular/build:application',
  'Both applications must use the Angular application builder.',
);
assert(
  platform?.architect?.test?.builder === '@angular/build:unit-test' &&
    portal?.architect?.test?.builder === '@angular/build:unit-test',
  'Both applications must have independent Angular unit-test targets.',
);

const platformRoutes = read(platform.sourceRoot + '/app/app.routes.ts');
const accessRoutes = read('apps/platform/src/app/contexts/tenant-access-governance/presentation/access/access.routes.ts');
const authenticationGuard = read('apps/platform/src/app/contexts/tenant-access-governance/presentation/platform-authentication.guard.ts');
const portalRoutes = read(portal.sourceRoot + '/app/app.routes.ts');
const portalBuyerGuard = readRequired(
  'apps/portal/src/app/contexts/customer-buyer-relationships/presentation/portal-buyer.guard.ts',
  'Portal must provide the Customer & Buyer Relationships route guard.',
);
const portalBuyerGuardPublicApi = readRequired(
  'apps/portal/src/app/contexts/customer-buyer-relationships/presentation/public-api.ts',
  'Portal must expose the Buyer route guard through its presentation public API.',
);
const portalBuyerEligibility = readRequired(
  'apps/portal/src/app/contexts/customer-buyer-relationships/application/portal-buyer-eligibility.service.ts',
  'Portal must provide the Customer & Buyer Relationships eligibility service.',
);
assert(/accessRoutes/.test(platformRoutes), 'Platform must mount its access feature routes.');
assert(/path:\s*'sign-in'/.test(accessRoutes), 'Platform must provide its public sign-in route.');
assert(/canActivate:\s*\[requirePlatformAuthentication\]/.test(accessRoutes), 'Platform protected routes must require an authenticated session.');
assert(/canActivateChild:\s*\[requirePlatformAuthenticationForChild\]/.test(accessRoutes), 'Platform protected child routes must require an authenticated session.');
assert(/state\.status\s*===\s*'authenticated'/.test(authenticationGuard), 'Platform route guards must use authenticated session state.');
assert(!/\b(?:roles|permissions|capabilities)\b/.test(authenticationGuard), 'Platform UI roles and capabilities must not authorize routes.');
assert(/PORTAL_ACCESS_ROUTES/.test(portalRoutes), 'Portal must compose its Tenant & Access Governance routes through the context route entrypoint.');
assert(/PORTAL_CATALOG_ROUTES/.test(portalRoutes), 'Portal must compose its catalog projection through the Catalog & Commercial Policy public entrypoint.');
assert(/requirePortalBuyer/.test(portalRoutes), 'Portal protected routes must use the Buyer Relationship guard.');
assert(/requirePortalBuyerChild/.test(portalRoutes), 'Portal protected child routes must use the Buyer Relationship guard.');
assert(/from\s*['"]\.\/contexts\/tenant-access-governance\/presentation\/public-api['"]/.test(portalRoutes), 'Portal must import access routes from the Tenant & Access Governance presentation public API.');
assert(/from\s*['"]\.\/contexts\/customer-buyer-relationships\/presentation\/public-api['"]/.test(portalRoutes), 'Portal must import Buyer Relationship route policy from its presentation public API.');
assert(/import\(['"]\.\/contexts\/catalog-commercial-policy\/application\/public-api['"]\)/.test(portalRoutes), 'Portal must lazy-load catalog routes through the owning context public API.');
assert(/canActivate:\s*\[[^\]]*requirePortalBuyer/.test(portalRoutes), 'Portal business routes must be gated by Buyer Relationship eligibility.');
assert(/canActivateChild:\s*\[[^\]]*requirePortalBuyerChild/.test(portalRoutes), 'Portal protected child routes must be gated by Buyer Relationship eligibility.');
assert(/requirePortalBuyer/.test(portalBuyerGuardPublicApi), 'The Buyer Relationship presentation public API must export the Portal route guard.');
assert(/requirePortalBuyerChild/.test(portalBuyerGuardPublicApi), 'The Buyer Relationship presentation public API must export the Portal child-route guard.');
assert(/PortalBuyerEligibilityService/.test(portalBuyerGuard), 'The Portal Buyer guard must delegate eligibility to the Buyer Relationship application service.');
errors.push(...inspectPortalBuyerEligibility(portalBuyerGuard, portalBuyerEligibility).map(({ message }) => message));
errors.push(...verifyPortalEligibilityProbes().map((message) => 'Portal scope negative probe failed: ' + message));

const uiPublicApi = read('libs/nexa-ui/src/public-api.ts');
const uiPackage = JSON.parse(read('libs/nexa-ui/ng-package.json'));
assert(uiPublicApi.length > 0, 'The shared UI public API must be present.');
assert(uiPackage.lib?.entryFile === 'src/public-api.ts', 'The shared UI package must build from its public API.');
const apiPublicApi = read('libs/nexa-api/src/public-api.ts');
const apiPackage = JSON.parse(read('libs/nexa-api/ng-package.json'));
assert(apiPublicApi.length > 0, 'The shared API public API must be present.');
assert(apiPackage.lib?.entryFile === 'src/public-api.ts', 'Applications must consume the shared API public entrypoint.');

for (const file of [
  'tokens/primitive.tokens.json',
  'tokens/semantic.tokens.json',
  'tokens/component.tokens.json',
  'tokens/data-visualization.tokens.json',
  'src/styles/_tokens-primitives.scss',
  'src/styles/_tokens-semantic.scss',
  'src/styles/_tokens-components.scss',
  'src/styles/_tokens-data-visualization.scss',
  'logo-nexa/logo-nexa.svg',
  'logo-nexa/Documento.svg',
]) {
  assert(statSync(join(root, file), { throwIfNoEntry: false })?.isFile(), 'Required design source is missing: ' + file);
}

const accessibilityStyles = read('src/styles/_accessibility.scss');
assert(/:focus-visible/.test(accessibilityStyles), 'Production focus-visible styling must be retained.');
assert(/\.skip-link/.test(accessibilityStyles), 'Production skip-link styling must be retained.');
assert(
  !/documentation-page|data-reflow-mode|data-text-spacing|data-target-overlay/.test(accessibilityStyles),
  'Design Lab accessibility evaluation selectors must not ship in the production stylesheet.',
);

const appFiles = ['apps/platform', 'apps/portal'].flatMap((directory) => walk(join(root, directory)));
const appText = appFiles
  .filter((file) => /\.(ts|html|scss)$/.test(file))
  .map((file) => ({ file, source: readFileSync(file, 'utf8') }));

for (const { file, source } of appText) {
  const name = relative(root, file);
  assert(!/localStorage|sessionStorage|indexedDB|document\.cookie/.test(source), name + ' must not persist auth state in browser storage.');
  assert(!/@angular\/common\/http/.test(source), name + ' must use the shared API transport boundary.');
  assert(
    !/(?:from\s*|import\s*\(\s*)['"][^'"]*(?:libs\/nexa-ui\/src\/lib|nexa-ui\/src\/lib|@nexa\/ui\/)/.test(source),
    name + ' must not deep-import the shared UI implementation.',
  );
  assert(!/apps\/(?:platform|portal)\//.test(source), name + ' must not import an application by path.');
}

const primitiveSelector = /selector\s*:\s*['"]nexa-(?:button|logo|text-field|toggle|status-chip|tooltip|segmented-control|range-slider|numeric-stepper)['"]/;
for (const { file, source } of appText.filter(({ file }) => file.endsWith('.ts'))) {
  assert(!primitiveSelector.test(source), relative(root, file) + ' must not define a duplicate shared primitive.');
}

const authContracts = read('libs/nexa-api/src/lib/contexts/tenant-access-governance/contracts/authentication.contracts.ts');
for (const path of [
  "workspacePreview: '/auth/workspace-previews'",
  "signIn: '/authentication/sign-in'",
  "refresh: '/authentication/refresh'",
  "signOut: '/authentication/sign-out'",
  "session: '/session'",
]) {
  assert(authContracts.includes(path), 'An audited auth/session API path is missing: ' + path);
}
assert(
  !/localStorage|sessionStorage|indexedDB|document\.cookie/.test(read('libs/nexa-api/src/lib/http/access-token.store.ts')),
  'The access token store must remain in memory.',
);

errors.push(...validateRepositoryImportBoundaries(root));

if (errors.length) {
  console.error('Foundation architecture check failed:\n' + errors.map((error) => '- ' + error).join('\n'));
  process.exitCode = 1;
} else {
  console.log('Foundation architecture boundaries are valid.');
}

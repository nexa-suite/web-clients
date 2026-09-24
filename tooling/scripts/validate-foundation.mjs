import { readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

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

for (const [name, project] of [
  ['Platform', platform],
  ['Portal', portal],
]) {
  const routes = read(project.sourceRoot + '/app/app.routes.ts');
  assert(/export const routes:\s*Routes\s*=\s*\[\s*\]/.test(routes), name + ' must remain a neutral route skeleton.');
}

const uiPublicApi = read('libs/nexa-ui/src/public-api.ts');
const uiPackage = JSON.parse(read('libs/nexa-ui/ng-package.json'));
assert(uiPublicApi.length > 0, 'The shared UI public API must be present.');
assert(uiPackage.lib?.entryFile === 'src/public-api.ts', 'The shared UI package must build from its public API.');

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

const authContracts = read('libs/nexa-api/src/lib/contracts/authentication.contracts.ts');
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

if (errors.length) {
  console.error('Foundation architecture check failed:\n' + errors.map((error) => '- ' + error).join('\n'));
  process.exitCode = 1;
} else {
  console.log('Foundation architecture boundaries are valid.');
}

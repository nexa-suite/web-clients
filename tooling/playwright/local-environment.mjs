import { existsSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const clientRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const apiRepositoryRoot = process.env.NEXA_API_REPOSITORY_PATH
  ? resolve(process.env.NEXA_API_REPOSITORY_PATH)
  : resolve(clientRoot, '../api');
const apiEnvironmentPath = resolve(apiRepositoryRoot, '.env.local');
export const platformApiBaseUrl = 'http://127.0.0.1:8080/api/v1';

const platformEnvironmentKeys = [
  'NEXA_DEV_WORKSPACE_SLUG',
  'NEXA_DEV_OWNER_EMAIL',
  'NEXA_DEV_OWNER_PASSWORD',
  'NEXA_DEV_TENANT_ADMIN_EMAIL',
  'NEXA_DEV_TENANT_ADMIN_PASSWORD',
  'NEXA_DEV_SALES_EMAIL',
  'NEXA_DEV_SALES_PASSWORD',
  'NEXA_DEV_WAREHOUSE_EMAIL',
  'NEXA_DEV_WAREHOUSE_PASSWORD',
  'NEXA_DEV_LOGISTICS_EMAIL',
  'NEXA_DEV_LOGISTICS_PASSWORD',
];

const platformEnvironmentKeySet = new Set(platformEnvironmentKeys);

function readAllowedLocalEnvironment() {
  if (process.env.CI) {
    return {};
  }

  if (!existsSync(apiEnvironmentPath)) {
    return {};
  }

  const compose = spawnSync('docker', [
    'compose', '--env-file', '.env.local', '-f', 'ops/compose/modern.compose.yml',
    'config', '--format', 'json',
  ], { cwd: apiRepositoryRoot, encoding: 'utf8', windowsHide: true });
  if (compose.error || compose.status !== 0) {
    throw new Error('Could not resolve the local API Compose environment for Platform browser checks.');
  }

  let configuration;
  try {
    configuration = JSON.parse(compose.stdout);
  } catch {
    throw new Error('The local API Compose configuration could not be read for Platform browser checks.');
  }

  const configuredApiEnvironment = configuration.services?.['modern-api']?.environment;
  if (!configuredApiEnvironment) {
    throw new Error('The current API Compose file does not define modern-api.');
  }

  const container = spawnSync('docker', [
    'compose', '--env-file', '.env.local', '-f', 'ops/compose/modern.compose.yml', 'ps', '-q', 'modern-api',
  ], { cwd: apiRepositoryRoot, encoding: 'utf8', windowsHide: true });
  const containerId = container.stdout?.trim();
  if (container.error || container.status !== 0 || !containerId) {
    throw new Error('The local modern-api container must be running for Platform browser checks.');
  }

  const inspection = spawnSync('docker', [
    'inspect', '--format', '{{json .Config.Env}}', containerId,
  ], { encoding: 'utf8', windowsHide: true });
  if (inspection.error || inspection.status !== 0) {
    throw new Error('The local modern-api container environment could not be verified.');
  }

  let containerEnvironment;
  try {
    containerEnvironment = new Map(JSON.parse(inspection.stdout.trim()).map((entry) => {
      const separator = entry.indexOf('=');
      return [entry.slice(0, separator), entry.slice(separator + 1)];
    }));
  } catch {
    throw new Error('The local modern-api container environment could not be read.');
  }

  for (const key of platformEnvironmentKeys) {
    if (containerEnvironment.get(key) !== configuredApiEnvironment[key]) {
      throw new Error('The local modern-api container does not match its resolved Compose environment.');
    }
  }

  return Object.fromEntries([...platformEnvironmentKeySet]
    .filter((key) => typeof configuredApiEnvironment[key] === 'string')
    .map((key) => [key, configuredApiEnvironment[key]]));
}

let localEnvironment;

function valueFor(name) {
  if (!platformEnvironmentKeySet.has(name)) {
    throw new Error(`Unsupported Platform browser-check environment key: ${name}`);
  }

  localEnvironment ??= readAllowedLocalEnvironment();
  return localEnvironment[name] || process.env[name] || undefined;
}

function missingEnvironmentMessage(names) {
  return `Missing required Platform browser-check environment variables: ${names.join(', ')}. Provide them in the Playwright process environment or api/.env.local.`;
}

export function requirePlatformIntegrationEnvironment() {
  const required = [
    'NEXA_DEV_WORKSPACE_SLUG',
    'NEXA_DEV_OWNER_EMAIL',
    'NEXA_DEV_OWNER_PASSWORD',
  ];
  const missing = required.filter((name) => !valueFor(name));
  if (missing.length) {
    throw new Error(missingEnvironmentMessage(missing));
  }
}

export function getPlatformWorkspaceSlug() {
  const workspaceSlug = valueFor('NEXA_DEV_WORKSPACE_SLUG');
  if (!workspaceSlug) {
    throw new Error(missingEnvironmentMessage(['NEXA_DEV_WORKSPACE_SLUG']));
  }
  return workspaceSlug;
}

export const platformAccountDefinitions = [
  {
    key: 'companyOwner',
    label: 'Company Owner',
    emailVariable: 'NEXA_DEV_OWNER_EMAIL',
    passwordVariable: 'NEXA_DEV_OWNER_PASSWORD',
    required: true,
  },
  {
    key: 'tenantAdministrator',
    label: 'Tenant Administrator',
    emailVariable: 'NEXA_DEV_TENANT_ADMIN_EMAIL',
    passwordVariable: 'NEXA_DEV_TENANT_ADMIN_PASSWORD',
  },
  {
    key: 'salesRepresentative',
    label: 'Sales Representative',
    emailVariable: 'NEXA_DEV_SALES_EMAIL',
    passwordVariable: 'NEXA_DEV_SALES_PASSWORD',
  },
  {
    key: 'warehouseOperator',
    label: 'Warehouse Operator',
    emailVariable: 'NEXA_DEV_WAREHOUSE_EMAIL',
    passwordVariable: 'NEXA_DEV_WAREHOUSE_PASSWORD',
  },
  {
    key: 'apiLogisticsIdentity',
    label: 'API logistics identity',
    emailVariable: 'NEXA_DEV_LOGISTICS_EMAIL',
    passwordVariable: 'NEXA_DEV_LOGISTICS_PASSWORD',
  },
];

export function getPlatformAccountCredentials(definition) {
  const identifier = valueFor(definition.emailVariable);
  const password = valueFor(definition.passwordVariable);

  if (!identifier && !password && !definition.required) {
    return undefined;
  }

  const missing = [];
  if (!identifier) missing.push(definition.emailVariable);
  if (!password) missing.push(definition.passwordVariable);
  if (missing.length) {
    throw new Error(missingEnvironmentMessage(missing));
  }

  return { identifier, password };
}

import {
  platformApiBaseUrl,
  requirePlatformIntegrationEnvironment,
} from './local-environment.mjs';

export default async function globalSetup() {
  requirePlatformIntegrationEnvironment();

  const apiBase = new URL(platformApiBaseUrl);
  if (apiBase.protocol !== 'http:' || apiBase.hostname !== '127.0.0.1' || apiBase.port !== '8080') {
    throw new Error('Platform browser checks must target the local Nexa API.');
  }

  let response;
  try {
    response = await fetch(new URL('/v3/api-docs', apiBase));
  } catch {
    throw new Error('The local Nexa API runtime is unavailable at localhost:8080.');
  }

  if (!response.ok) {
    throw new Error(`The local Nexa API OpenAPI endpoint returned HTTP ${response.status}.`);
  }

  const contract = await response.json();
  const requiredOperations = [
    ['/api/v1/auth/workspace-previews', 'post'],
    ['/api/v1/authentication/sign-in', 'post'],
    ['/api/v1/session', 'get'],
    ['/api/v1/authentication/refresh', 'post'],
    ['/api/v1/authentication/sign-out', 'post'],
  ];
  const missingOperations = requiredOperations
    .filter(([path, method]) => !contract.paths?.[path]?.[method])
    .map(([path, method]) => `${method.toUpperCase()} ${path}`);

  if (missingOperations.length) {
    throw new Error(
      `The local Nexa API runtime is missing required browser-check operations: ${missingOperations.join(', ')}.`,
    );
  }
}

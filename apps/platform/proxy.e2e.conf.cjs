const configuredPort = process.env.NEXA_E2E_API_PORT ?? '8080';
if (!/^\d+$/.test(configuredPort)) {
  throw new Error('NEXA_E2E_API_PORT must be a local TCP port between 1 and 65535.');
}

const port = Number(configuredPort);
if (!Number.isInteger(port) || port < 1 || port > 65535) {
  throw new Error('NEXA_E2E_API_PORT must be a local TCP port between 1 and 65535.');
}

module.exports = {
  '/api/v1/**': {
    target: `http://127.0.0.1:${port}`,
    secure: false,
  },
};

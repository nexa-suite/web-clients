import {
  DEFAULT_PLATFORM_API_BASE_URL,
  readPlatformRuntimeConfiguration,
  type PlatformWindow,
} from './platform-runtime-config';

describe('readPlatformRuntimeConfiguration', () => {
  it('defaults to the same-origin API prefix when deployment config is absent', () => {
    expect(readPlatformRuntimeConfiguration(null)).toEqual({
      apiBaseUrl: DEFAULT_PLATFORM_API_BASE_URL,
    });
  });

  it('normalizes a deployment supplied API origin and the supported API path', () => {
    const browserWindow = {
      __NEXA_PLATFORM_CONFIG__: { apiBaseUrl: 'https://api.example.test/api/v1///' },
    } as PlatformWindow;

    expect(readPlatformRuntimeConfiguration(browserWindow).apiBaseUrl)
      .toBe('https://api.example.test/api/v1');
  });

  it('accepts the current root-relative API path', () => {
    const browserWindow = {
      __NEXA_PLATFORM_CONFIG__: { apiBaseUrl: '/api/v1/' },
    } as PlatformWindow;

    expect(readPlatformRuntimeConfiguration(browserWindow).apiBaseUrl).toBe('/api/v1');
  });

  it('allows HTTP only for local loopback API runtimes', () => {
    for (const apiBaseUrl of [
      'http://localhost:8080/api/v1',
      'http://127.0.0.1:8080/api/v1',
      'http://[::1]:8080/api/v1',
    ]) {
      const browserWindow = {
        __NEXA_PLATFORM_CONFIG__: { apiBaseUrl },
      } as PlatformWindow;

      expect(readPlatformRuntimeConfiguration(browserWindow).apiBaseUrl).toBe(apiBaseUrl);
    }

    const remoteHttpConfig = {
      __NEXA_PLATFORM_CONFIG__: { apiBaseUrl: 'http://api.example.test/api/v1' },
    } as PlatformWindow;
    expect(() => readPlatformRuntimeConfiguration(remoteHttpConfig)).toThrow(/loopback.*HTTPS/);
  });

  it('rejects protocol-relative URLs, unsupported path prefixes, and unsafe URL data', () => {
    for (const apiBaseUrl of [
      'javascript:alert(1)',
      '//evil.example/api/v1',
      '/gateway/api/v1',
      '/api/v1?tenant=other',
      '/api/v1#fragment',
      'https://user:secret@api.example.test/api/v1',
      'https://api.example.test/api/v1?token=value',
      'https://api.example.test/gateway/api/v1',
      'https://api.example.test:65536/api/v1',
      'https://api.example.test:abc/api/v1',
      'https://api.example.test:0/api/v1',
      'https://[:::]/api/v1',
      'https://999.999.999.999/api/v1',
      'https://[0:0:0:0:0:0:0:1]/api/v1',
      'http://127.example.test/api/v1',
      'http://localhost:0/api/v1',
    ]) {
      const browserWindow = {
        __NEXA_PLATFORM_CONFIG__: { apiBaseUrl },
      } as PlatformWindow;

      expect(() => readPlatformRuntimeConfiguration(browserWindow)).toThrow();
    }
  });
});

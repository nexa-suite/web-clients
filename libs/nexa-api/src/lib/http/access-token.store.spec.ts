import { NexaAccessTokenStore } from './access-token.store';

describe('NexaAccessTokenStore', () => {
  it('keeps the current access token in memory and clears it', () => {
    const store = new NexaAccessTokenStore();

    expect(store.read()).toBeNull();
    expect(store.hasAccessToken()).toBe(false);

    store.set('access-token');

    expect(store.read()).toBe('access-token');
    expect(store.hasAccessToken()).toBe(true);

    store.clear();

    expect(store.read()).toBeNull();
    expect(store.hasAccessToken()).toBe(false);
  });

  it('rejects an empty token', () => {
    const store = new NexaAccessTokenStore();

    expect(() => store.set('   ')).toThrow();
  });
});

import { Injectable, computed, signal } from '@angular/core';

@Injectable({ providedIn: 'root' })
export class NexaAccessTokenStore {
  private readonly tokenValue = signal<string | null>(null);

  readonly hasAccessToken = computed(() => this.tokenValue() !== null);

  read(): string | null {
    return this.tokenValue();
  }

  set(accessToken: string): void {
    const value = accessToken.trim();
    if (!value) {
      throw new Error('An access token must contain a non-whitespace character.');
    }
    this.tokenValue.set(value);
  }

  clear(): void {
    this.tokenValue.set(null);
  }
}

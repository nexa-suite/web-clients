import { ApplicationConfig, inject, provideAppInitializer, provideZonelessChangeDetection } from '@angular/core';
import { provideRouter } from '@angular/router';
import { provideNexaHttp } from '@nexa/api';
import { routes } from './app.routes';
import { PlatformSessionStore } from './core/platform-session.store';
import { readPlatformRuntimeConfiguration } from './core/platform-runtime-config';

const platformRuntime = readPlatformRuntimeConfiguration();

export const appConfig: ApplicationConfig = {
  providers: [
    provideZonelessChangeDetection(),
    provideRouter(routes),
    provideAppInitializer(() => {
      void inject(PlatformSessionStore).restoreSession().subscribe();
    }),
    provideNexaHttp({
      apiBaseUrl: platformRuntime.apiBaseUrl,
      surface: 'PLATFORM',
    }),
  ],
};

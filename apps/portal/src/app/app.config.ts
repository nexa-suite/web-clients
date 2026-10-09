import {
  ApplicationConfig,
  provideZonelessChangeDetection,
} from "@angular/core";
import { provideRouter } from "@angular/router";
import { provideNexaHttp } from "@nexa/api";
import { readPortalRuntimeConfiguration } from "./core/portal-runtime-config";
import { routes } from "./app.routes";

export const appConfig: ApplicationConfig = {
  providers: [
    provideZonelessChangeDetection(),
    provideRouter(routes),
    provideNexaHttp({
      apiBaseUrl: readPortalRuntimeConfiguration().apiBaseUrl,
      surface: "PORTAL",
    }),
  ],
};

import {
  ApplicationConfig,
  provideZonelessChangeDetection,
} from "@angular/core";
import { provideRouter } from "@angular/router";
import { provideNexaHttp } from "@nexa/api";
import { readPortalRuntimeConfiguration } from "./core/portal-runtime-config";
import { BUYER_WALLET_CAPABILITIES_PORT, BuyerWalletStore } from "./contexts/payments/application/public-api";
import { routes } from "./app.routes";

export const appConfig: ApplicationConfig = {
  providers: [
    provideZonelessChangeDetection(),
    provideRouter(routes),
    { provide: BUYER_WALLET_CAPABILITIES_PORT, useExisting: BuyerWalletStore },
    provideNexaHttp({
      apiBaseUrl: readPortalRuntimeConfiguration().apiBaseUrl,
      surface: "PORTAL",
    }),
  ],
};

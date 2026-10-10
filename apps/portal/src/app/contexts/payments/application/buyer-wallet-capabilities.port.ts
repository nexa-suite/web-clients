import { InjectionToken } from "@angular/core";

/** Narrow BC-08 capability query used by Buyer purchase-request coordination. */
export interface BuyerWalletCapabilitiesPort {
  canRead(): boolean;
  orderPaymentSupported(): boolean;
  loadCapabilities(): Promise<void>;
  clear(): void;
}

export const BUYER_WALLET_CAPABILITIES_PORT =
  new InjectionToken<BuyerWalletCapabilitiesPort>("BUYER_WALLET_CAPABILITIES_PORT");

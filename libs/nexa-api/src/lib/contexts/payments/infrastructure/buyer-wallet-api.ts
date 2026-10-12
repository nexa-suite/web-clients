import { HttpClient, HttpHeaders } from "@angular/common/http";
import { inject, Injectable } from "@angular/core";
import { NEXA_API_HTTP_CONFIGURATION } from "../../../http/nexa-http";
import type {
  BuyerWalletRechargeCreatedResponse,
  BuyerWalletRechargeStatusResponse,
  BuyerWalletResponse,
} from "../contracts/buyer-wallet.contracts";

@Injectable({ providedIn: "root" })
export class NexaBuyerWalletApi {
  private readonly http = inject(HttpClient);
  private readonly config = inject(NEXA_API_HTTP_CONFIGURATION);

  read(page = 0, size = 25) {
    if (!Number.isInteger(page) || page < 0) {
      throw new Error("Wallet movement page must be a non-negative integer.");
    }
    if (!Number.isInteger(size) || size < 1 || size > 100) {
      throw new Error("Wallet movement page size must be between 1 and 100.");
    }
    return this.http.get<BuyerWalletResponse>(
      `${this.config.apiBaseUrl}/buyer/wallet`,
      { params: { page, size } },
    );
  }

  createRecharge(amount: number, idempotencyKey: string) {
    if (!Number.isFinite(amount) || amount <= 0 || Math.round(amount * 100) / 100 !== amount) {
      throw new Error("Wallet recharge amount must be positive and use no more than two decimals.");
    }
    if (!idempotencyKey.trim()) {
      throw new Error("Wallet recharge idempotency key is required.");
    }
    return this.http.post<BuyerWalletRechargeCreatedResponse>(
      `${this.config.apiBaseUrl}/buyer/wallet/recharges`,
      { amount },
      { headers: new HttpHeaders({ "Idempotency-Key": idempotencyKey }) },
    );
  }

  readRecharge(rechargeId: string) {
    if (!rechargeId.trim()) throw new Error("Wallet recharge id is required.");
    return this.http.get<BuyerWalletRechargeStatusResponse>(
      `${this.config.apiBaseUrl}/buyer/wallet/recharges/${encodeURIComponent(rechargeId)}`,
    );
  }
}

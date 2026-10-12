import { ChangeDetectionStrategy, Component, effect, inject, OnDestroy, signal } from "@angular/core";
import { DatePipe, DecimalPipe } from "@angular/common";
import { NexaButton, NexaSurface } from "nexa-ui";
import { readPortalStripePublishableKey } from "../../core/portal-runtime-config";
import { BuyerWalletStripeCheckoutComponent } from "./buyer-wallet-stripe-checkout.component";
import {
  BuyerReceivablesStore,
  BuyerCreditStore,
} from "../../contexts/credit-receivables/application/public-api";
import {
  BuyerPaymentHistoryStore,
  BuyerBankTransferStore,
  BuyerWalletStore,
} from "../../contexts/payments/application/public-api";
@Component({
  selector: "portal-buyer-wallet",
  imports: [DatePipe, DecimalPipe, NexaButton, NexaSurface, BuyerWalletStripeCheckoutComponent],
  templateUrl: "./buyer-wallet-page.component.html",
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class BuyerWalletPageComponent implements OnDestroy {
  protected readonly rechargeAmount = signal("50.00");
  protected readonly stripeCheckout = signal<{
    readonly rechargeId: string;
    readonly clientSecret: string;
    readonly publishableKey: string;
  } | null>(null);
  private readonly stripePublishableKey = readPortalStripePublishableKey();
  protected readonly credit = inject(BuyerCreditStore);
  protected readonly receivables = inject(BuyerReceivablesStore);
  protected readonly payments = inject(BuyerPaymentHistoryStore);
  protected readonly transfer = inject(BuyerBankTransferStore);
  protected readonly wallet = inject(BuyerWalletStore);
  private disposed = false;
  constructor() {
    effect(() => {
      const checkout = this.stripeCheckout();
      const recharge = this.wallet.rechargeState();
      if (recharge?.status === "error" && recharge.operation === "create" && recharge.retryAllowed) {
        this.rechargeAmount.set(recharge.amount.toFixed(2));
      }
      if (
        checkout &&
        (!this.wallet.canRecharge() || !recharge || recharge.status !== "pending" || recharge.recharge.id !== checkout.rechargeId)
      ) {
        this.stripeCheckout.set(null);
      }
    });
    void this.credit.load();
    this.payments.clear();
    this.transfer.clear();
    void this.receivables.load();
    if (this.wallet.canRead()) void this.wallet.load();
    if (this.wallet.canRecharge()) void this.wallet.loadLastRecharge();
  }
  ngOnDestroy(): void {
    this.disposed = true;
    this.stripeCheckout.set(null);
  }
  protected refresh(): void {
    this.payments.clear();
    void this.receivables.load();
    void this.credit.load();
    if (this.wallet.canRead()) void this.wallet.load(this.walletPage());
    if (this.wallet.canRead()) void this.wallet.readRechargeStatus();
  }

  protected async createRecharge(): Promise<void> {
    const amount = Number(this.rechargeAmount().trim().replace(",", "."));
    const intent = await this.wallet.createRecharge(amount);
    const currentRecharge = this.wallet.rechargeState();
    if (
      !intent ||
      this.disposed ||
      !this.wallet.canRecharge() ||
      (currentRecharge?.status !== "pending" && currentRecharge?.status !== "final") ||
      currentRecharge.recharge.id !== intent.id
    ) return;
    if (
      intent.provider.toLowerCase() === "stripe" &&
      intent.status === "AWAITING_PAYMENT" &&
      typeof intent.clientSecret === "string" &&
      intent.clientSecret.length > 0 &&
      this.stripePublishableKey
    ) {
      this.stripeCheckout.set({
        rechargeId: intent.id,
        clientSecret: intent.clientSecret,
        publishableKey: this.stripePublishableKey,
      });
      return;
    }
    this.stripeCheckout.set(null);
  }

  protected paymentSubmitted(): void {
    const checkout = this.stripeCheckout();
    this.stripeCheckout.set(null);
    if (checkout && this.wallet.canRead()) void this.wallet.readRechargeStatus(checkout.rechargeId);
  }

  protected statusLabel(status: string): string {
    switch (status) {
      case "PREPARING": return "Preparing payment";
      case "AWAITING_PAYMENT": return "Awaiting provider confirmation";
      case "SUCCEEDED": return "Confirmed by payment provider";
      case "FAILED": return "Payment failed";
      case "CANCELLED": return "Payment cancelled";
      case "REJECTED": return "Payment rejected";
      default: return "Status unavailable";
    }
  }
  protected walletPageBy(delta: number): void {
    const page = this.walletPage() + delta;
    if (page >= 0) void this.wallet.load(page);
  }
  protected paymentPageBy(delta: number): void {
    const state = this.payments.state();
    if (!state?.data) return;
    void this.payments.load(state.receivableId, state.data.page + delta);
  }
  protected pageBy(delta: number): void {
    this.payments.clear();
    void this.receivables.load(
      (this.receivables.state()?.data?.page ?? 0) + delta,
    );
  }
  private walletPage(): number {
    const state = this.wallet.state();
    return state?.status === "ready" ? state.wallet.movements.page : 0;
  }
}

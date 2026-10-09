import { ChangeDetectionStrategy, Component, inject } from "@angular/core";
import { DatePipe } from "@angular/common";
import { NexaButton, NexaSurface } from "nexa-ui";
import {
  BuyerReceivablesStore,
  BuyerCreditStore,
} from "../../contexts/credit-receivables/application/public-api";
import { BuyerPaymentHistoryStore } from "../../contexts/payments/application/public-api";
@Component({
  selector: "portal-buyer-wallet",
  imports: [DatePipe, NexaButton, NexaSurface],
  templateUrl: "./buyer-wallet-page.component.html",
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class BuyerWalletPageComponent {
  protected readonly credit = inject(BuyerCreditStore);
  protected readonly receivables = inject(BuyerReceivablesStore);
  protected readonly payments = inject(BuyerPaymentHistoryStore);
  constructor() {
    void this.credit.load();
    this.payments.clear();
    void this.receivables.load();
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
}

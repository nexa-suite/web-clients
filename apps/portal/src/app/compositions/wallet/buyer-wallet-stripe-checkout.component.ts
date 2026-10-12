import {
  AfterViewInit,
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  OnChanges,
  OnDestroy,
  SimpleChanges,
  input,
  output,
  signal,
  viewChild,
} from "@angular/core";
import { loadStripe, type Stripe, type StripeElements, type StripePaymentElement } from "@stripe/stripe-js";
import { NexaButton } from "nexa-ui";

@Component({
  selector: "portal-wallet-stripe-checkout",
  imports: [NexaButton],
  template: `
    <section aria-labelledby="stripe-wallet-heading">
      <h3 id="stripe-wallet-heading">Pay securely with Stripe</h3>
      <p>Your wallet balance changes only after the payment provider confirms this recharge.</p>
      <div #paymentHost aria-label="Stripe payment details"></div>
      @if (error(); as message) {
        <p role="alert">{{ message }}</p>
      }
      @if (submitted()) {
        <p role="status">Payment submitted. Waiting for provider confirmation.</p>
      } @else {
        <nexa-button [disabled]="!ready() || busy()" (click)="submit()">
          {{ busy() ? "Submitting…" : "Submit payment" }}
        </nexa-button>
      }
    </section>
  `,
  styles: `
    :host { display: block; margin-block: 1rem; }
    section { display: grid; gap: 0.75rem; }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class BuyerWalletStripeCheckoutComponent implements AfterViewInit, OnChanges, OnDestroy {
  readonly publishableKey = input.required<string>();
  readonly clientSecret = input.required<string>();
  readonly paymentSubmitted = output<void>();

  private readonly paymentHost = viewChild.required<ElementRef<HTMLDivElement>>("paymentHost");
  private stripe: Stripe | null = null;
  private elements: StripeElements | null = null;
  private paymentElement: StripePaymentElement | null = null;
  private generation = 0;
  private viewReady = false;
  private disposed = false;

  protected readonly ready = signal(false);
  protected readonly busy = signal(false);
  protected readonly submitted = signal(false);
  protected readonly error = signal("");

  async ngAfterViewInit(): Promise<void> {
    this.viewReady = true;
    await this.initializeCheckout();
  }

  ngOnChanges(_changes: SimpleChanges): void {
    if (!this.viewReady || this.disposed) return;
    this.disposeCheckout();
    this.ready.set(false);
    this.busy.set(false);
    this.submitted.set(false);
    this.error.set("");
    void this.initializeCheckout();
  }

  ngOnDestroy(): void {
    this.disposed = true;
    this.disposeCheckout();
  }

  private async initializeCheckout(): Promise<void> {
    const generation = ++this.generation;
    const publishableKey = this.publishableKey();
    const clientSecret = this.clientSecret();
    if (!isValidPublishableKey(publishableKey) || !clientSecret.trim()) {
      this.error.set("Stripe checkout configuration is incomplete. This recharge remains pending.");
      return;
    }
    try {
      const stripe = await loadStripe(publishableKey);
      if (!this.isCurrent(generation)) return;
      if (!stripe) throw new Error("Stripe.js could not load.");
      const elements = stripe.elements({ clientSecret });
      const paymentElement = elements.create("payment");
      if (!this.isCurrent(generation)) {
        paymentElement.destroy();
        return;
      }
      this.stripe = stripe;
      this.elements = elements;
      this.paymentElement = paymentElement;
      paymentElement.mount(this.paymentHost().nativeElement);
      this.ready.set(true);
    } catch {
      if (this.isCurrent(generation)) {
        this.error.set("Stripe checkout could not be loaded. This recharge remains pending.");
      }
    }
  }

  private disposeCheckout(): void {
    ++this.generation;
    this.paymentElement?.unmount();
    this.paymentElement?.destroy();
    this.paymentElement = null;
    this.elements = null;
    this.stripe = null;
  }

  private isCurrent(generation: number): boolean {
    return !this.disposed && generation === this.generation;
  }

  protected async submit(): Promise<void> {
    const stripe = this.stripe;
    const elements = this.elements;
    if (!stripe || !elements || !this.ready() || this.busy() || this.submitted()) return;
    this.busy.set(true);
    this.error.set("");
    const generation = this.generation;
    try {
      const submission = await elements.submit();
      if (!this.isCurrent(generation)) return;
      if (submission.error) {
        this.error.set("Check the payment details and try again.");
        return;
      }
      const result = await stripe.confirmPayment({
        elements,
        clientSecret: this.clientSecret(),
        confirmParams: {
          return_url: `${window.location.origin}${window.location.pathname}`,
        },
        redirect: "if_required",
      });
      if (!this.isCurrent(generation)) return;
      if (result.error) {
        this.error.set("Stripe could not submit this payment. Review the payment details or try again.");
        return;
      }
      this.submitted.set(true);
      this.paymentSubmitted.emit();
    } catch {
      if (this.isCurrent(generation)) {
        this.error.set("Stripe payment status is uncertain. Check the recharge status before retrying.");
      }
    } finally {
      if (this.isCurrent(generation)) this.busy.set(false);
    }
  }
}

function isValidPublishableKey(value: string): boolean {
  return /^pk_(test|live)_[A-Za-z0-9]+$/.test(value);
}

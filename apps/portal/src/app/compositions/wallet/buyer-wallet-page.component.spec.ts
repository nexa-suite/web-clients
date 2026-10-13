import { signal } from "@angular/core";
import { TestBed } from "@angular/core/testing";
import { provideRouter } from "@angular/router";
import {
  BuyerBankTransferStore,
  BuyerPaymentHistoryStore,
  BuyerWalletStore,
} from "../../contexts/payments/application/public-api";
import {
  BuyerCreditStore,
  BuyerReceivablesStore,
} from "../../contexts/credit-receivables/application/public-api";
import { BuyerWalletPageComponent } from "./buyer-wallet-page.component";

describe("BuyerWalletPageComponent", () => {
  function setup(options: {
    canRead?: boolean;
    canReport?: boolean;
    transferState?: unknown;
    walletState?: unknown;
  } = {}) {
    const wallet = {
      canRead: signal(options.canRead ?? true),
      canRecharge: signal(false),
      state: signal(options.walletState ?? null),
      rechargeState: signal(null),
      load: vi.fn(),
      loadLastRecharge: vi.fn(),
      readRechargeStatus: vi.fn(),
      createRecharge: vi.fn(),
      retryRecharge: vi.fn(),
    };
    const credit = { load: vi.fn(), state: signal(null) };
    const receivables = { load: vi.fn(), state: signal(null) };
    const payments = { clear: vi.fn(), state: signal(null) };
    const transfer = {
      canReport: signal(options.canReport ?? false),
      clear: vi.fn(),
      state: signal(options.transferState ?? null),
    };
    TestBed.configureTestingModule({
      imports: [BuyerWalletPageComponent],
      providers: [
        provideRouter([]),
        { provide: BuyerWalletStore, useValue: wallet },
        { provide: BuyerCreditStore, useValue: credit },
        { provide: BuyerReceivablesStore, useValue: receivables },
        { provide: BuyerPaymentHistoryStore, useValue: payments },
        { provide: BuyerBankTransferStore, useValue: transfer },
      ],
    });
    const fixture = TestBed.createComponent(BuyerWalletPageComponent);
    fixture.detectChanges();
    return { fixture, transfer, wallet };
  }

  it("shows that the membership needs payment.read and does not request wallet data", () => {
    const { fixture, wallet } = setup({ canRead: false });

    expect(fixture.nativeElement.textContent).toContain(
      "Wallet balance requires the payment.read permission",
    );
    expect(wallet.load).not.toHaveBeenCalled();
  });

  it("shows an uninitialized wallet without rendering null balances as zero", () => {
    const { fixture } = setup({
      walletState: {
        status: "ready",
        lease: {},
        wallet: {
          status: "NOT_INITIALIZED",
          currency: "PEN",
          postedBalance: null,
          reservedBalance: null,
          availableBalance: null,
          movements: { items: [], page: 0, size: 25, total: 0 },
        },
      },
    });

    expect(fixture.nativeElement.textContent).toContain(
      "This wallet is not initialized.",
    );
    expect(fixture.nativeElement.textContent).not.toContain("PEN 0.00");
    expect(fixture.nativeElement.textContent).not.toContain("Available balance");
  });

  it("renders the API-provided active balances and movement facts", () => {
    const { fixture } = setup({
      walletState: {
        status: "ready",
        lease: {},
        wallet: {
          status: "ACTIVE",
          currency: "PEN",
          postedBalance: 100,
          reservedBalance: 20,
          availableBalance: 80,
          movements: {
            items: [
              {
                type: "CREDIT_POSTED",
                amountDelta: 100,
                occurredAt: "2026-10-09T12:00:00Z",
              },
            ],
            page: 0,
            size: 25,
            total: 1,
          },
        },
      },
    });

    expect(fixture.nativeElement.textContent).toContain("PEN 100.00");
    expect(fixture.nativeElement.textContent).toContain("PEN 20.00");
    expect(fixture.nativeElement.textContent).toContain("PEN 80.00");
    expect(fixture.nativeElement.textContent).toContain("CREDIT_POSTED");
  });

  it("labels a 503 capability state as unavailable without showing a balance", () => {
    const { fixture } = setup({
      walletState: {
        status: "unavailable",
        lease: {},
        message: "Wallet reading is currently unavailable. Try again later.",
      },
    });

    expect(fixture.nativeElement.textContent).toContain(
      "Wallet reading is currently unavailable",
    );
    expect(fixture.nativeElement.textContent).not.toContain("Available balance");
  });

  it("hides bank transfer reporting when payment.create is revoked", () => {
    const { fixture, transfer } = setup({
      canReport: true,
      transferState: {
        receivableId: "receivable-1",
        reference: "",
        busy: false,
        error: null,
        payment: null,
      },
    });

    expect(fixture.nativeElement.textContent).toContain("Report a bank transfer");
    transfer.canReport.set(false);
    fixture.detectChanges();

    expect(fixture.nativeElement.textContent).not.toContain("Report a bank transfer");
    expect(fixture.nativeElement.querySelector("#transfer-reference")).toBeNull();
  });
});

import { provideHttpClient } from "@angular/common/http";
import {
  HttpTestingController,
  provideHttpClientTesting,
} from "@angular/common/http/testing";
import { TestBed } from "@angular/core/testing";
import { NEXA_API_HTTP_CONFIGURATION } from "../../../http/nexa-http";
import { NexaCreditAccountConfigurationApi } from "./credit-account-configuration-api";

describe("NexaCreditAccountConfigurationApi", () => {
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        {
          provide: NEXA_API_HTTP_CONFIGURATION,
          useValue: { apiBaseUrl: "/api/v1" },
        },
      ],
    });
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  it("uses the narrow tenant customer-account search projection", () => {
    TestBed.inject(NexaCreditAccountConfigurationApi)
      .listCustomerAccounts("north", "ACTIVE", 1, 25)
      .subscribe();
    const request = http.expectOne(
      "/api/v1/credit-account-configurations/customer-accounts?search=north&status=ACTIVE&page=1&size=25",
    );
    expect(request.request.method).toBe("GET");
    request.flush({ items: [], page: 1, size: 25, total: 0 });
  });

  it("reads explicit currency and retains the response ETag", () => {
    let etag: string | null = null;
    TestBed.inject(NexaCreditAccountConfigurationApi)
      .read("account-1", "PEN")
      .subscribe((response) => (etag = response.headers.get("ETag")));
    const request = http.expectOne(
      "/api/v1/client-accounts/account-1/credit-account?currency=PEN",
    );
    expect(request.request.method).toBe("GET");
    request.flush({
      clientAccountId: "account-1",
      currency: "PEN",
      status: "NOT_CONFIGURED",
      creditLimit: null,
      financedExposure: null,
      outstandingReceivables: null,
      reservedExposure: null,
      used: null,
      availableCredit: null,
      version: null,
    });
    expect(etag).toBeNull();
  });

  it("sends create and update preconditions with a stable idempotency key", () => {
    const api = TestBed.inject(NexaCreditAccountConfigurationApi);
    const requestBody = { currency: "PEN", creditLimit: 500, active: true };
    api
      .configure(
        "account-1",
        requestBody,
        { ifNoneMatch: "*" },
        "123e4567-e89b-42d3-a456-426614174000",
      )
      .subscribe();
    const create = http.expectOne(
      "/api/v1/client-accounts/account-1/credit-account",
    );
    expect(create.request.method).toBe("PUT");
    expect(create.request.headers.get("If-None-Match")).toBe("*");
    expect(create.request.headers.get("If-Match")).toBeNull();
    expect(create.request.headers.get("Idempotency-Key")).toBe(
      "123e4567-e89b-42d3-a456-426614174000",
    );
    expect(create.request.body).toEqual(requestBody);
    create.flush(
      {
        clientAccountId: "account-1",
        currency: "PEN",
        status: "ACTIVE",
        creditLimit: 500,
        financedExposure: 0,
        outstandingReceivables: 0,
        reservedExposure: 0,
        used: 0,
        availableCredit: 500,
        version: 0,
      },
      { headers: { ETag: '"0"' }, status: 201, statusText: "Created" },
    );

    api
      .configure(
        "account-1",
        requestBody,
        { ifMatch: '"0"' },
        "123e4567-e89b-42d3-a456-426614174000",
      )
      .subscribe();
    const update = http.expectOne(
      "/api/v1/client-accounts/account-1/credit-account",
    );
    expect(update.request.headers.get("If-Match")).toBe('"0"');
    expect(update.request.headers.get("If-None-Match")).toBeNull();
    expect(update.request.headers.get("Idempotency-Key")).toBe(
      "123e4567-e89b-42d3-a456-426614174000",
    );
    update.flush(
      {
        clientAccountId: "account-1",
        currency: "PEN",
        status: "ACTIVE",
        creditLimit: 500,
        financedExposure: 0,
        outstandingReceivables: 0,
        reservedExposure: 0,
        used: 0,
        availableCredit: 500,
        version: 1,
      },
      { headers: { ETag: '"1"' } },
    );
  });
});

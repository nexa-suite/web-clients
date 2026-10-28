import { signal } from "@angular/core";
import { TestBed } from "@angular/core/testing";
import {
  ActivatedRoute,
  convertToParamMap,
  provideRouter,
} from "@angular/router";
import { of } from "rxjs";
import {
  PortalSessionStore,
  type PortalSessionLease,
  type PortalSessionState,
} from "../../tenant-access-governance/application/public-api";
import type {
  BuyerCatalogItem,
  CatalogDetailState,
} from "../application/catalog.models";
import { CatalogStore } from "../application/catalog.store";
import { BuyerRequestSelectionStore } from "../../sales-commitment/application/public-api";
import { CatalogDetailPageComponent } from "./catalog-detail-page.component";

describe("CatalogDetailPageComponent", () => {
  const item: BuyerCatalogItem = {
    catalogItemId: "CAT-1001",
    skuCode: "SKU-1001",
    itemName: "Ambient item",
    brandName: "Nexa brand",
    categoryName: "Grocery",
    presentation: "Box of 10",
    productFamilyName: "Family",
    unitOfMeasure: "EA",
    packagingType: "BOX",
    coldChainRequirement: "None",
    status: "ACTIVE",
    currentOfferPrice: { amount: "238.50", currency: "PEN" },
    sellableAvailability: 6.5,
    availabilityStatus: "AVAILABLE",
    pricingAsOf: "2026-10-09T10:15:00Z",
    availabilityAsOf: "2026-10-09T10:14:00Z",
  };

  function createFixture(detail: CatalogDetailState) {
    const store = {
      detail: () => detail,
      loadDetail: vi.fn(),
      refreshDetail: vi.fn(),
    };
    const lease: PortalSessionLease = {
      epoch: 1,
      scope: {
        userId: "user-1",
        tenantId: "tenant-1",
        workspaceId: "workspace-1",
        membershipId: "membership-1",
        surface: "PORTAL",
      },
    };
    const sessions = {
      state: signal<PortalSessionState>({ status: "idle" }),
      captureSessionLease: () => lease,
      isSessionLeaseCurrent: () => true,
    };
    TestBed.configureTestingModule({
      imports: [CatalogDetailPageComponent],
      providers: [
        provideRouter([]),
        {
          provide: ActivatedRoute,
          useValue: {
            snapshot: { paramMap: { get: () => "CAT-1001" } },
            paramMap: of(convertToParamMap({ catalogItemId: "CAT-1001" })),
          },
        },
        { provide: CatalogStore, useValue: store },
        { provide: PortalSessionStore, useValue: sessions },
        {
          provide: BuyerRequestSelectionStore,
          useValue: {
            add: vi.fn(),
            has: vi.fn(() => false),
            quantityFor: vi.fn(() => 0),
            productCount: () => 0,
          },
        },
      ],
    });
    const fixture = TestBed.createComponent(CatalogDetailPageComponent);
    fixture.detectChanges();
    return { fixture, store };
  }

  it("renders Buyer price, availability, status, and server timestamps as received", () => {
    const { fixture, store } = createFixture({
      kind: "loaded",
      item,
      errorMessage: null,
    });
    const content = fixture.nativeElement.textContent as string;

    expect(store.loadDetail).toHaveBeenCalledWith("CAT-1001");
    expect(content).toContain("PEN 238.50");
    expect(content).toContain("6.5 EA");
    expect(content).toContain("Available");
    expect(content).toContain("ACTIVE");
    expect(content).toContain("2026-10-09T10:15:00Z");
    expect(content).toContain("2026-10-09T10:14:00Z");
  });

  it("labels missing commercial values unavailable", () => {
    const { fixture } = createFixture({
      kind: "loaded",
      item: {
        ...item,
        currentOfferPrice: null,
        sellableAvailability: null,
        availabilityStatus: null,
        pricingAsOf: null,
        availabilityAsOf: null,
      },
      errorMessage: null,
    });
    const content = fixture.nativeElement.textContent as string;

    expect(content.match(/Unavailable/g)).toHaveLength(4);
    expect(content).toContain("To be confirmed");
  });
});

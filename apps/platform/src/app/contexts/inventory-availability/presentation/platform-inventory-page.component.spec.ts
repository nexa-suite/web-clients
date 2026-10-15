import { signal } from "@angular/core";
import { ComponentFixture, TestBed } from "@angular/core/testing";
import { PlatformSessionStore } from "../../tenant-access-governance/application/public-api";
import { PlatformInventoryReceivingStore } from "../application/platform-inventory-receiving.store";
import { PlatformInventoryPageComponent } from "./platform-inventory-page.component";

describe("PlatformInventoryPageComponent", () => {
  let fixture: ComponentFixture<PlatformInventoryPageComponent>;

  beforeEach(async () => {
    const store = {
      canRead: signal(true),
      canReceive: signal(false),
      canReadCatalog: signal(true),
      receiptLocked: signal(false),
      filters: signal({ warehouseId: "", zoneId: "", catalogItemId: "", status: "" }),
      receiptDraft: signal({ warehouseId: "", zoneId: "", catalogItemId: "", unit: "" }),
      warehouses: signal([]),
      zones: signal([]),
      lotsPage: signal(null),
      catalogPage: signal(null),
      selectedCatalogItem: signal(null),
      brandOptions: signal([]),
      categoryOptions: signal([]),
      catalogQuery: signal(""),
      selectedBrand: signal(""),
      selectedCategory: signal(""),
      pendingReceipt: signal(null),
      warehousesLoading: signal(false),
      zonesLoading: signal(false),
      lotsLoading: signal(false),
      catalogLoading: signal(false),
      filterOptionsLoading: signal(false),
      receiving: signal(false),
      warehouseError: signal(""),
      zonesError: signal(""),
      lotsError: signal(""),
      catalogError: signal(""),
      filterOptionsError: signal(""),
      receiptError: signal(""),
      receiptNotice: signal(""),
      refreshLots: vi.fn(),
      setWarehouse: vi.fn(),
      setZone: vi.fn(),
      setStatus: vi.fn(),
      updateCatalogSearch: vi.fn(),
      searchCatalog: vi.fn(),
      changeCatalogPage: vi.fn(),
      setCatalogFilter: vi.fn(),
      changeLotsPage: vi.fn(),
      submitReceipt: vi.fn(),
      retryPendingReceipt: vi.fn(),
    };
    await TestBed.configureTestingModule({
      imports: [PlatformInventoryPageComponent],
      providers: [{ provide: PlatformSessionStore, useValue: { captureSessionLease: () => null } }],
    })
      .overrideComponent(PlatformInventoryPageComponent, {
        set: { providers: [{ provide: PlatformInventoryReceivingStore, useValue: store }] },
      })
      .compileComponents();

    fixture = TestBed.createComponent(PlatformInventoryPageComponent);
    fixture.detectChanges();
  });

  afterEach(() => TestBed.resetTestingModule());

  it("shows stock catalog filters to read-only members and hides receipt controls", () => {
    const element: HTMLElement = fixture.nativeElement;
    expect(element.querySelector(".catalog-picker")).not.toBeNull();
    expect(element.querySelector(".receipt-fields")).toBeNull();
    expect(element.textContent).toContain("This membership can view stock but cannot record receipts.");
  });
});

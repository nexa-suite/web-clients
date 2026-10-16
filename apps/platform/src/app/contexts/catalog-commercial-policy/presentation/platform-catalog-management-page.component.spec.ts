import { signal } from "@angular/core";
import { TestBed } from "@angular/core/testing";
import { provideRouter } from "@angular/router";
import { NexaCommandRetryStore, NexaPlatformCatalogManagementApi } from "@nexa/api";
import { of } from "rxjs";
import { PlatformSessionStore } from "../../tenant-access-governance/application/public-api";
import { PlatformCatalogManagementPageComponent } from "./platform-catalog-management-page.component";

describe("PlatformCatalogManagementPageComponent", () => {
  it("loads all pages of active brand and category references for family selectors", async () => {
    const lease = { epoch: 1, scope: { userId: "user-1", tenantId: "tenant-1", workspaceId: "workspace-1", membershipId: "member-1", surface: "PLATFORM" } };
    const session = {
      state: signal({
        status: "authenticated",
        session: {
          surface: "PLATFORM",
          user: { userId: "user-1" },
          tenant: { tenantId: "tenant-1" },
          workspace: { workspaceId: "workspace-1" },
          membership: {
            membershipId: "member-1",
            permissions: ["catalog.read", "catalog.taxonomy.manage", "catalog.product.manage", "catalog.price.manage"],
          },
        },
      }),
      captureSessionLease: vi.fn(() => lease),
      isSessionLeaseCurrent: vi.fn(() => true),
    };
    const optionPages = {
      categories: [
        { id: "category-1", name: "Grocery", description: null, status: "ACTIVE" },
        { id: "category-2", name: "Produce", description: null, status: "ACTIVE" },
        { id: "category-3", name: "Inactive category", description: null, status: "INACTIVE" },
      ],
      brands: [
        { id: "brand-1", name: "Northwind", description: null, status: "ACTIVE" },
        { id: "brand-2", name: "Harbor Foods", description: null, status: "ACTIVE" },
        { id: "brand-3", name: "Inactive brand", description: null, status: "INACTIVE" },
      ],
    } as const;
    const pageFor = (items: readonly unknown[], page: number) => ({
      items: items.slice(page * 2, page * 2 + 2),
      page,
      size: 2,
      total: items.length,
    });
    const managementApi = {
      categories: vi.fn((_search = "", page = 0) => of(pageFor(optionPages.categories, page))),
      brands: vi.fn((_search = "", page = 0) => of(pageFor(optionPages.brands, page))),
      families: vi.fn(() => of({ items: [], page: 0, size: 25, total: 0 })),
    };

    TestBed.configureTestingModule({
      imports: [PlatformCatalogManagementPageComponent],
      providers: [
        provideRouter([]),
        { provide: PlatformSessionStore, useValue: session },
        { provide: NexaPlatformCatalogManagementApi, useValue: managementApi },
        { provide: NexaCommandRetryStore, useValue: {} },
      ],
    });
    const fixture = TestBed.createComponent(PlatformCatalogManagementPageComponent);
    fixture.detectChanges();

    await vi.waitFor(() => {
      expect(managementApi.categories).toHaveBeenCalledWith("", 1);
      expect(managementApi.brands).toHaveBeenCalledWith("", 1);
    });
    fixture.detectChanges();

    const brandFilter = fixture.nativeElement.querySelector('select[name="familyBrandSearch"]') as HTMLSelectElement;
    const categoryFilter = fixture.nativeElement.querySelector('select[name="familyCategorySearch"]') as HTMLSelectElement;
    expect([...brandFilter.options].map((option) => option.textContent?.trim())).toEqual([
      "All brands",
      "Northwind",
      "Harbor Foods",
    ]);
    expect([...categoryFilter.options].map((option) => option.textContent?.trim())).toEqual([
      "All categories",
      "Grocery",
      "Produce",
    ]);
  });
});

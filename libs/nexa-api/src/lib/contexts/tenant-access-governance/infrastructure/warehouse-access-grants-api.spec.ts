import {
  HttpTestingController,
  provideHttpClientTesting,
} from "@angular/common/http/testing";
import { TestBed } from "@angular/core/testing";
import { provideNexaHttp } from "../../../http/nexa-http";
import { NexaWarehouseAccessGrantsApi } from "./warehouse-access-grants-api";

describe("NexaWarehouseAccessGrantsApi", () => {
  let api: NexaWarehouseAccessGrantsApi;
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        provideNexaHttp({
          apiBaseUrl: "https://api.example.test/api/v1",
          surface: "PLATFORM",
        }),
        provideHttpClientTesting(),
      ],
    });
    api = TestBed.inject(NexaWarehouseAccessGrantsApi);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  it("lists the server-selected page without client-supplied Tenant or Workspace scope", () => {
    let received: unknown;
    api.listWarehouses(2).subscribe((value) => (received = value));

    const request = http.expectOne(
      "https://api.example.test/api/v1/warehouses?page=2&size=100&sort=code,asc",
    );
    expect(request.request.method).toBe("GET");
    expect(request.request.params.has("tenantId")).toBe(false);
    expect(request.request.params.has("workspaceId")).toBe(false);
    request.flush({ items: [], page: 2, size: 100, total: 0 });
    expect(received).toEqual({ items: [], page: 2, size: 100, total: 0 });
  });

  it("creates a new explicit grant with only the selected membership ID", () => {
    let received: unknown;
    api
      .grantAccess("warehouse/1", "membership-1")
      .subscribe((value) => (received = value));

    const request = http.expectOne(
      "https://api.example.test/api/v1/warehouses/warehouse%2F1/access-grants",
    );
    expect(request.request.method).toBe("POST");
    expect(request.request.body).toEqual({ membershipId: "membership-1" });
    expect(request.request.headers.has("If-Match")).toBe(false);
    request.flush(grant(), {
      status: 201,
      statusText: "Created",
      headers: { ETag: '"0"' },
    });
    expect(received).toMatchObject({ body: grant() });
  });

  it("uses the prior version to reactivate a grant and revoke it", () => {
    api.grantAccess("warehouse-1", "membership-1", 4).subscribe();
    const reactivate = http.expectOne(
      "https://api.example.test/api/v1/warehouses/warehouse-1/access-grants",
    );
    expect(reactivate.request.headers.get("If-Match")).toBe('"4"');
    reactivate.flush(grant({ version: 5 }));

    api.revokeAccess("warehouse-1", "membership-1", 5).subscribe();
    const revoke = http.expectOne(
      "https://api.example.test/api/v1/warehouses/warehouse-1/access-grants/membership-1",
    );
    expect(revoke.request.method).toBe("DELETE");
    expect(revoke.request.headers.get("If-Match")).toBe('"5"');
    revoke.flush(grant({ status: "REVOKED", version: 6 }));
  });

  it("rejects invalid IDs and versions before sending a request", () => {
    expect(() => api.grantAccess("warehouse-1", " ")).toThrow();
    expect(() => api.grantAccess("warehouse-1", "membership-1", -1)).toThrow();
    expect(() =>
      api.revokeAccess("warehouse-1", "membership-1", Number.NaN),
    ).toThrow();
    http.expectNone(() => true);
  });
});

function grant(
  overrides: Partial<{
    tenantId: string;
    workspaceId: string;
    membershipId: string;
    warehouseId: string;
    status: "ACTIVE" | "REVOKED";
    version: number;
    changedByMembershipId: string;
    changedAt: string;
  }> = {},
) {
  return {
    tenantId: "tenant-1",
    workspaceId: "workspace-1",
    membershipId: "membership-1",
    warehouseId: "warehouse/1",
    status: "ACTIVE" as const,
    version: 0,
    changedByMembershipId: "owner-membership",
    changedAt: "2026-10-10T00:00:00Z",
    ...overrides,
  };
}

import { provideHttpClient } from "@angular/common/http";
import {
  HttpTestingController,
  provideHttpClientTesting,
} from "@angular/common/http/testing";
import { TestBed } from "@angular/core/testing";
import { NEXA_API_HTTP_CONFIGURATION } from "../../../http/nexa-http";
import { NexaTenantAccessGovernanceApi } from "./tenant-access-governance-api";

describe("NexaTenantAccessGovernanceApi", () => {
  let api: NexaTenantAccessGovernanceApi;
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        {
          provide: NEXA_API_HTTP_CONFIGURATION,
          useValue: {
            apiBaseUrl: "https://api.nexa.test/api/v1",
            surface: "PLATFORM",
            requestTimeoutMs: 30_000,
          },
        },
      ],
    });
    api = TestBed.inject(NexaTenantAccessGovernanceApi);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  it("lists memberships from the active server context without tenant query parameters", () => {
    api.listMemberships().subscribe();
    const request = http.expectOne("https://api.nexa.test/api/v1/workspace-memberships");
    expect(request.request.method).toBe("GET");
    expect(request.request.params.keys()).toEqual([]);
    request.flush([]);
  });

  it("creates an invitation with the required API idempotency key", () => {
    api.createInvitation(
      { email: "person@example.test", displayName: "A Person", roles: ["SALES"] },
      "invite-command-1",
    ).subscribe();
    const request = http.expectOne("https://api.nexa.test/api/v1/organization-invitations");
    expect(request.request.method).toBe("POST");
    expect(request.request.headers.get("Idempotency-Key")).toBe("invite-command-1");
    expect(request.request.urlWithParams).not.toContain("tenantId");
    expect(request.request.urlWithParams).not.toContain("workspaceId");
    request.flush({ id: "invite-1", version: 1 });
  });

  it("uses If-Match for role updates and quotes the server version", () => {
    api.updateMembershipRoles("member-1", 7, ["SALES", "LOGISTICS"]).subscribe();
    const request = http.expectOne("https://api.nexa.test/api/v1/workspace-memberships/member-1/roles");
    expect(request.request.method).toBe("PATCH");
    expect(request.request.headers.get("If-Match")).toBe('"7"');
    expect(request.request.body).toEqual({ roles: ["SALES", "LOGISTICS"] });
    request.flush({ id: "member-1", version: 8 });
  });

  it("uses the active Workspace identifier from the caller for role creation and exposes the permission catalog", () => {
    api.createRole({
      workspaceId: "workspace-1",
      code: "CUSTOM_REVIEW",
      name: "Custom review",
      description: "Review team",
      permissions: ["sales.purchase_request.read"],
    }).subscribe();
    const create = http.expectOne("https://api.nexa.test/api/v1/roles");
    expect(create.request.method).toBe("POST");
    expect(create.request.body.workspaceId).toBe("workspace-1");
    create.flush({ id: "role-1", version: 0 });

    api.listPermissionCatalog().subscribe();
    const catalog = http.expectOne("https://api.nexa.test/api/v1/permissions/catalog");
    expect(catalog.request.method).toBe("GET");
    catalog.flush([{ code: "sales.purchase_request.read", group: "SALES", legacyCodes: [] }]);
  });

  it("rejects unsafe versions, empty ids, and out-of-range invitation pages before HTTP", () => {
    expect(() => api.suspendMembership("member-1", -1)).toThrow();
    expect(() => api.getMembership(" ")).toThrow();
    expect(() => api.listInvitations(0, 101)).toThrow(RangeError);
    http.expectNone("https://api.nexa.test/api/v1/workspace-memberships/member-1/suspensions");
    http.expectNone("https://api.nexa.test/api/v1/organization-invitations");
  });
});

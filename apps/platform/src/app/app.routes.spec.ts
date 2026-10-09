import { routes } from "./app.routes";
import { PLATFORM_FULFILLMENT_ROUTES } from "./contexts/fulfillment-delivery/application/public-api";
import { PLATFORM_SALES_COMMITMENT_ROUTES } from "./contexts/sales-commitment/application/public-api";

function exportedName(value: unknown): string | undefined {
  return typeof value === "function"
    ? value.name.replace(/^_+/, "")
    : undefined;
}

import { PLATFORM_BUSINESS_DOCUMENT_ROUTES } from "./contexts/business-documents/application/public-api";

describe("Platform root route composition", () => {
  it("keeps sign-in and recovery routes public", () => {
    expect(routes.slice(0, 3).map((route) => route.path)).toEqual([
      "sign-in",
      "reset-password",
      "forgot-password",
    ]);
  });

  it("protects the shell and mounts business routes under its authenticated children", () => {
    const shellRoute = routes.find((route) => route.path === "");

    expect(exportedName(shellRoute?.component)).toBe(
      "PlatformShellSessionWrapperComponent",
    );
    expect(shellRoute?.canActivate?.map(exportedName)).toContain(
      "requirePlatformAuthentication",
    );
    expect(shellRoute?.canActivateChild?.map(exportedName)).toContain(
      "requirePlatformAuthenticationForChild",
    );

    const children = shellRoute?.children ?? [];
    expect(
      children.some(
        (route) =>
          route.path === "" &&
          exportedName(route.component) === "PlatformActiveContextComponent",
      ),
    ).toBe(true);
    expect(children.some((route) => route.path === "operations/overview")).toBe(
      true,
    );

    for (const route of PLATFORM_SALES_COMMITMENT_ROUTES) {
      expect(children).toContain(route);
    }
    for (const route of [
      ...PLATFORM_FULFILLMENT_ROUTES,
      ...PLATFORM_BUSINESS_DOCUMENT_ROUTES,
    ]) {
      expect(children).toContain(route);
    }
  });
});

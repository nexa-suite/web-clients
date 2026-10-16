import { readPortalDeliveryMapConfiguration, type PortalDeliveryMapConfiguration } from "./portal-delivery-map-configuration";
import type { PortalWindow } from "./portal-runtime-config";

describe("readPortalDeliveryMapConfiguration", () => {
  it("keeps external tile requests disabled by default", () => {
    expect(readPortalDeliveryMapConfiguration(null)).toBeNull();
    expect(readPortalDeliveryMapConfiguration({ __NEXA_PORTAL_CONFIG__: {} } as PortalWindow)).toBeNull();
  });

  it("accepts explicitly configured tiles with visible attribution", () => {
    const browserWindow = {
      __NEXA_PORTAL_CONFIG__: {
        deliveryMapTileUrlTemplate: "https://tile.openstreetmap.org/{z}/{x}/{y}.png",
        deliveryMapAttribution: "© OpenStreetMap contributors",
        deliveryMapAttributionUrl: "https://www.openstreetmap.org/copyright",
      },
    } as PortalWindow;

    expect(readPortalDeliveryMapConfiguration(browserWindow)).toEqual({
      tileUrlTemplate: "https://tile.openstreetmap.org/{z}/{x}/{y}.png",
      attribution: "© OpenStreetMap contributors",
      attributionUrl: "https://www.openstreetmap.org/copyright",
    } satisfies PortalDeliveryMapConfiguration);
  });

  it("rejects unsafe or incomplete tile configuration", () => {
    for (const tileUrlTemplate of [
      "javascript:alert(1)/{z}/{x}/{y}",
      "http://tiles.example.test/{z}/{x}/{y}.png",
      "https://tiles.example.test/{z}/{x}",
      "https://tiles.example.test/{z}/{x}/{y}.png?token=secret",
      "//tiles.example.test/{z}/{x}/{y}.png",
    ]) {
      const browserWindow = {
        __NEXA_PORTAL_CONFIG__: {
          deliveryMapTileUrlTemplate: tileUrlTemplate,
          deliveryMapAttribution: "Tile provider",
        },
      } as PortalWindow;
      expect(readPortalDeliveryMapConfiguration(browserWindow)).toBeNull();
    }
  });
});

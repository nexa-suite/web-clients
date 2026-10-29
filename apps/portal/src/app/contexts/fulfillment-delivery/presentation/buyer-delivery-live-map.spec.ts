import type { BuyerDeliveryLocationSample } from "@nexa/api";
import { buildBuyerDeliveryLiveMap } from "./buyer-delivery-live-map";

const location: BuyerDeliveryLocationSample = {
  sampleId: "00000000-0000-4000-8000-000000000002",
  latitude: -12.0464,
  longitude: -77.0428,
  accuracyMeters: 5,
  capturedAt: "2026-10-09T12:00:00Z",
  expiresAt: "2026-10-09T12:15:00Z",
};
const configuration = {
  tileUrlTemplate: "https://tiles.example.test/{z}/{x}/{y}.png",
  attribution: "Synthetic map tiles",
  attributionUrl: null,
};

describe("buildBuyerDeliveryLiveMap", () => {
  it("builds a bounded tile grid only for a current API sample and configured provider", () => {
    const map = buildBuyerDeliveryLiveMap(location, configuration, Date.parse("2026-10-09T12:01:00Z"));

    expect(map?.tiles).toHaveLength(9);
    expect(map?.tiles.every((tile) => /^https:\/\/tiles\.example\.test\/15\/\d+\/\d+\.png$/.test(tile.url))).toBe(true);
    expect(map?.markerLeftPercent).toBeGreaterThan(0);
    expect(map?.markerLeftPercent).toBeLessThan(100);
    expect(map?.markerTopPercent).toBeGreaterThan(0);
    expect(map?.markerTopPercent).toBeLessThan(100);
    expect(buildBuyerDeliveryLiveMap(location, null, Date.parse("2026-10-09T12:01:00Z"))).toBeNull();
    expect(buildBuyerDeliveryLiveMap(location, configuration, Date.parse("2026-10-09T12:16:00Z"))).toBeNull();
  });

  it("rejects invalid coordinates instead of sending them to the tile provider", () => {
    expect(buildBuyerDeliveryLiveMap({ ...location, latitude: 100 }, configuration, Date.parse("2026-10-09T12:01:00Z"))).toBeNull();
    expect(buildBuyerDeliveryLiveMap({ ...location, longitude: Number.NaN }, configuration, Date.parse("2026-10-09T12:01:00Z"))).toBeNull();
  });
});

import type { BuyerDeliveryLocationSample } from "@nexa/api";
import type { PortalDeliveryMapConfiguration } from "../../../core/portal-delivery-map-configuration";

const TILE_SIZE = 256;
const MAX_MERCATOR_LATITUDE = 85.05112878;
const EARTH_RADIUS_METERS = 6_378_137;

export interface BuyerDeliveryLiveMapTile {
  readonly key: string;
  readonly url: string;
  readonly column: number;
  readonly row: number;
}

export interface BuyerDeliveryLiveMapModel {
  readonly tiles: readonly BuyerDeliveryLiveMapTile[];
  readonly markerLeftPercent: number;
  readonly markerTopPercent: number;
  readonly accuracyDiameterPixels: number;
  readonly zoom: number;
}

export function buildBuyerDeliveryLiveMap(
  location: BuyerDeliveryLocationSample,
  configuration: PortalDeliveryMapConfiguration | null,
  nowMilliseconds = Date.now(),
  zoom = 15,
): BuyerDeliveryLiveMapModel | null {
  if (!configuration || !isCurrentLocation(location, nowMilliseconds) || !Number.isInteger(zoom) || zoom < 1 || zoom > 20) return null;

  const latitude = Math.max(-MAX_MERCATOR_LATITUDE, Math.min(MAX_MERCATOR_LATITUDE, location.latitude));
  const worldTileCount = 2 ** zoom;
  const radians = (latitude * Math.PI) / 180;
  const worldX = ((location.longitude + 180) / 360) * worldTileCount;
  const worldY = ((1 - Math.log(Math.tan(radians) + 1 / Math.cos(radians)) / Math.PI) / 2) * worldTileCount;
  const centerTileX = Math.floor(worldX);
  const centerTileY = Math.floor(worldY);
  const fractionX = worldX - centerTileX;
  const fractionY = worldY - centerTileY;
  const tiles: BuyerDeliveryLiveMapTile[] = [];

  for (let row = 0; row < 3; row += 1) {
    for (let column = 0; column < 3; column += 1) {
      const tileY = centerTileY + row - 1;
      if (tileY < 0 || tileY >= worldTileCount) continue;
      const rawTileX = centerTileX + column - 1;
      const tileX = ((rawTileX % worldTileCount) + worldTileCount) % worldTileCount;
      const url = configuration.tileUrlTemplate
        .replace("{z}", String(zoom))
        .replace("{x}", String(tileX))
        .replace("{y}", String(tileY));
      tiles.push({ key: `${zoom}/${tileX}/${tileY}`, url, column: column + 1, row: row + 1 });
    }
  }

  const metersPerPixel = (Math.cos(radians) * 2 * Math.PI * EARTH_RADIUS_METERS) / (TILE_SIZE * worldTileCount);
  const accuracyDiameterPixels = Math.max(12, Math.min(180, (location.accuracyMeters * 2) / metersPerPixel));
  return {
    tiles,
    markerLeftPercent: ((1 + fractionX) / 3) * 100,
    markerTopPercent: ((1 + fractionY) / 3) * 100,
    accuracyDiameterPixels,
    zoom,
  };
}

export function isCurrentLocation(location: BuyerDeliveryLocationSample, nowMilliseconds = Date.now()): boolean {
  return Number.isFinite(location.latitude)
    && location.latitude >= -90
    && location.latitude <= 90
    && Number.isFinite(location.longitude)
    && location.longitude >= -180
    && location.longitude <= 180
    && Number.isFinite(location.accuracyMeters)
    && location.accuracyMeters >= 0
    && Number.isFinite(Date.parse(location.capturedAt))
    && Number.isFinite(Date.parse(location.expiresAt))
    && Date.parse(location.expiresAt) > nowMilliseconds;
}

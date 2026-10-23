import "server-only";
import { env } from "./env";

/**
 * Map provider abstraction. Any XYZ raster tile service works (OpenStreetMap
 * by default; MapTiler, Mapbox raster or a self-hosted tile server via
 * MAP_TILE_URL). Respect the provider's usage policy: the public OSM tile
 * servers are fine for development and light use, not heavy production load.
 */
export type MapConfig = { tileUrl: string; attribution: string };

export function mapConfig(): MapConfig {
  return { tileUrl: env().MAP_TILE_URL, attribution: env().MAP_ATTRIBUTION };
}

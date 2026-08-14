const EARTH_RADIUS_METRES = 6_371_008.8;
const toRadians = (degrees: number) => (degrees * Math.PI) / 180;

export interface Coordinates {
  latitude: number;
  longitude: number;
}

/**
 * Great-circle distance in metres.
 *
 * Uses haversine rather than a flat-earth approximation: the error of the
 * simple version grows with latitude, and a checkpoint geofence is tens of
 * metres wide, so being wrong by a few metres decides whether a real guard is
 * locked out of their round.
 */
export const haversineMetres = (from: Coordinates, to: Coordinates): number => {
  const deltaLat = toRadians(to.latitude - from.latitude);
  const deltaLon = toRadians(to.longitude - from.longitude);
  const fromLat = toRadians(from.latitude);
  const toLat = toRadians(to.latitude);

  const a =
    Math.sin(deltaLat / 2) ** 2 +
    Math.sin(deltaLon / 2) ** 2 * Math.cos(fromLat) * Math.cos(toLat);

  return 2 * EARTH_RADIUS_METRES * Math.asin(Math.min(1, Math.sqrt(a)));
};

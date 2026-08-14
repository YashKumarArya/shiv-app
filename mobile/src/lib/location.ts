import * as Location from 'expo-location';

export interface Coordinates {
  latitude: number;
  longitude: number;
  /** Metres of horizontal uncertainty reported by the device, when known. */
  accuracy: number | null;
}

export class LocationUnavailableError extends Error {}

/**
 * One reading of where the device is, for recording a checkpoint's position and
 * for proving a guard stood at it.
 *
 * Deliberately not cached: a stale fix is exactly the failure that would let a
 * guard scan from the car park, and Expo will happily return a last-known
 * position that is minutes old and hundreds of metres away.
 */
export const getCurrentPosition = async (): Promise<Coordinates> => {
  const { granted } = await Location.requestForegroundPermissionsAsync();
  if (!granted) {
    throw new LocationUnavailableError(
      'Location permission is off. Turn it on in your device settings to continue.',
    );
  }

  const enabled = await Location.hasServicesEnabledAsync();
  if (!enabled) {
    throw new LocationUnavailableError('Turn on location (GPS) on your device, then try again.');
  }

  try {
    const position = await Location.getCurrentPositionAsync({
      accuracy: Location.Accuracy.High,
    });
    return {
      latitude: position.coords.latitude,
      longitude: position.coords.longitude,
      accuracy: position.coords.accuracy ?? null,
    };
  } catch {
    throw new LocationUnavailableError(
      'Could not get a location fix. Step outside or away from the building and try again.',
    );
  }
};

const EARTH_RADIUS_METRES = 6_371_008.8;
const toRadians = (degrees: number) => (degrees * Math.PI) / 180;

/**
 * Great-circle distance in metres. Mirrors haversineMetres on the server so a
 * scan the device accepts offline is not rejected on sync hours later, when the
 * guard has long since walked away.
 */
export const distanceMetres = (
  from: { latitude: number; longitude: number },
  to: { latitude: number; longitude: number },
) => {
  const deltaLat = toRadians(to.latitude - from.latitude);
  const deltaLon = toRadians(to.longitude - from.longitude);
  const a =
    Math.sin(deltaLat / 2) ** 2 +
    Math.sin(deltaLon / 2) ** 2 * Math.cos(toRadians(from.latitude)) * Math.cos(toRadians(to.latitude));
  return 2 * EARTH_RADIUS_METRES * Math.asin(Math.min(1, Math.sqrt(a)));
};

/** Formats a stored coordinate pair for display, tolerating API numeric strings. */
export const formatCoordinates = (
  latitude?: string | number | null,
  longitude?: string | number | null,
) =>
  latitude == null || longitude == null
    ? null
    : `${Number(latitude).toFixed(5)}, ${Number(longitude).toFixed(5)}`;

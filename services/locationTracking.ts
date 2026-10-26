import * as Location from 'expo-location';
import { getToken } from './auth';
import { getOnline } from './api';

// The OS reports a new position only after the user moves this far (meters)
const DISTANCE_INTERVAL_M = 50;
// Coordinates are sent to the server no more often than this
const MIN_SEND_INTERVAL_MS = 30 * 1000;

type Coords = { lat: number; lng: number };

let subscription: Location.LocationSubscription | null = null;
// Incremented on every stop: an in-flight start or send from an older session is discarded
let session = 0;
let lastSentAt = 0;
let pendingCoords: Coords | null = null;
let sendTimer: ReturnType<typeof setTimeout> | null = null;
let callback: ((coords: Coords) => void) | null = null;

const sendCoords = async (currentSession: number) => {
  sendTimer = null;
  const coords = pendingCoords;
  if (!coords) return;

  const token = await getToken();
  // Tracking was stopped (went offline / logged out) while waiting - do not mark the user online again
  if (!token || currentSession !== session) return;

  pendingCoords = null;
  lastSentAt = Date.now();
  const result = await getOnline({ token, is_online: 1, lat: coords.lat, lng: coords.lng });
  if (result.status !== 'success') {
    console.error('LocationTracking: Failed to send coordinates');
  }
};

const handleLocation = (location: Location.LocationObject, currentSession: number) => {
  const coords = { lat: location.coords.latitude, lng: location.coords.longitude };
  callback?.(coords);

  // Always keep the latest position: if a send is already scheduled, it will take this one
  pendingCoords = coords;
  if (sendTimer) return;

  const wait = Math.max(0, lastSentAt + MIN_SEND_INTERVAL_MS - Date.now());
  sendTimer = setTimeout(() => sendCoords(currentSession), wait);
};

/**
 * Starts sending the user's position to the server while they are online.
 * Uses the already granted foreground permission and never prompts for it.
 */
export const startLocationTracking = async () => {
  if (subscription) return;

  const currentSession = ++session;
  try {
    const { status } = await Location.getForegroundPermissionsAsync();
    if (status !== 'granted' || currentSession !== session) return;

    const newSubscription = await Location.watchPositionAsync(
      { accuracy: Location.Accuracy.Balanced, distanceInterval: DISTANCE_INTERVAL_M },
      (location) => handleLocation(location, currentSession),
    );

    // stop() was called while the subscription was being created
    if (currentSession !== session) {
      newSubscription.remove();
      return;
    }
    subscription = newSubscription;
  } catch (error) {
    console.error('LocationTracking: Error starting tracking:', error);
  }
};

export const stopLocationTracking = () => {
  session++;
  subscription?.remove();
  subscription = null;
  if (sendTimer) {
    clearTimeout(sendTimer);
    sendTimer = null;
  }
  pendingCoords = null;
};

export const setLocationCallback = (cb: ((coords: Coords) => void) | null) => {
  callback = cb;
};

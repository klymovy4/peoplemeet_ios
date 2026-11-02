import { useSyncExternalStore } from 'react';

// Whether the server is reachable, judged by the app's own requests (no extra native module):
// the app polls every 3 seconds, so a lost connection shows up quickly and so does its return.
// Two failures in a row are needed, so one dropped request doesn't flash the banner.
const FAILURES_BEFORE_OFFLINE = 2;

let consecutiveFailures = 0;
let offline = false;
const listeners = new Set<() => void>();

const setOffline = (value: boolean) => {
  if (offline === value) return;
  offline = value;
  listeners.forEach((listener) => listener());
};

/** A request got any response from the server */
export const reportNetworkSuccess = () => {
  consecutiveFailures = 0;
  setOffline(false);
};

/** A request failed without reaching the server (no internet, server unreachable) */
export const reportNetworkFailure = () => {
  consecutiveFailures += 1;
  if (consecutiveFailures >= FAILURES_BEFORE_OFFLINE) setOffline(true);
};

export const isOffline = () => offline;

const subscribe = (listener: () => void) => {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
};

/** React hook: true while the server can't be reached */
export const useIsOffline = () => useSyncExternalStore(subscribe, isOffline, isOffline);

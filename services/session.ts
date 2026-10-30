import { router } from 'expo-router';
import Toast from 'react-native-toast-message';
import { setUnauthorizedHandler } from './api';
import { removeToken } from './auth';
import { stopLocationTracking } from './locationTracking';
import { stopMessagesInterval } from './messagesInterval';
import { disableUsersOnlinePolling } from './usersOnlineInterval';

// Several polling requests can fail at once - log out only once per burst
const LOGOUT_DEBOUNCE_MS = 3000;
let lastLogoutAt = 0;

const endSession = async (reason: 'expired' | 'banned') => {
  const now = Date.now();
  if (now - lastLogoutAt < LOGOUT_DEBOUNCE_MS) return;
  lastLogoutAt = now;

  disableUsersOnlinePolling();
  stopMessagesInterval();
  stopLocationTracking();
  await removeToken();

  Toast.show(
    reason === 'banned'
      ? { type: 'error', text1: 'Account blocked', text2: 'Your account has been blocked for violating the rules' }
      : { type: 'info', text1: 'Session expired', text2: 'Please log in again' },
  );
  router.replace('/');
};

/** Called once on app start: logs the user out on 401 (expired token) or 403 "banned" */
export const registerSessionHandler = () => {
  setUnauthorizedHandler((reason) => {
    endSession(reason);
  });
};

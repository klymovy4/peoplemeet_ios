import { router } from 'expo-router';
import { Alert, Linking } from 'react-native';
import Toast from 'react-native-toast-message';
import { setUnauthorizedHandler } from './api';
import { removeToken } from './auth';
import { stopLocationTracking } from './locationTracking';
import { stopMessagesInterval } from './messagesInterval';
import { disableUsersOnlinePolling } from './usersOnlineInterval';

// Where banned users can appeal
export const SUPPORT_EMAIL = 'klymovy4roman@gmail.com';

/** Explains the ban and offers to appeal by email (used after logout and on the login screen) */
export const showBannedAlert = () => {
  Alert.alert(
    'Account blocked',
    `Your account has been blocked for violating the community rules. If you think this is a mistake, write to ${SUPPORT_EMAIL}.`,
    [
      { text: 'OK', style: 'cancel' },
      {
        text: 'Contact support',
        onPress: () => {
          const subject = encodeURIComponent('PeopleMeet: account blocked');
          Linking.openURL(`mailto:${SUPPORT_EMAIL}?subject=${subject}`).catch(() => {});
        },
      },
    ],
  );
};

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

  router.replace('/');
  if (reason === 'banned') {
    showBannedAlert();
  } else {
    Toast.show({ type: 'info', text1: 'Session expired', text2: 'Please log in again' });
  }
};

/** Called once on app start: logs the user out on 401 (expired token) or 403 "banned" */
export const registerSessionHandler = () => {
  setUnauthorizedHandler((reason) => {
    endSession(reason);
  });
};

import { getToken } from './auth';
import { getUsersOnline } from './api';

let intervalId: number | null = null;
let callback: ((users: any) => void) | null = null;

export const enableUsersOnlinePolling = () => {
  // If the interval is already running, do not start it again
  if (intervalId !== null) {
    console.log('🟢 UsersOnlinePolling: Already enabled');
    return;
  }

  console.log('🟢 UsersOnlinePolling: Enabling polling');

  // Make the first request right away
  const fetchUsers = async () => {
    try {
      const token = await getToken();
      if (!token) {
        console.log('🔴 UsersOnlinePolling: No token, stopping polling');
        disableUsersOnlinePolling();
        return;
      }

      const users = await getUsersOnline(token);
      
      // Call the callback if it is set
      if (callback) {
        callback(users);
      }
    } catch (error) {
      console.error('❌ UsersOnlinePolling: Error fetching users:', error);
    }
  };

  // Make the first request
  fetchUsers();

  // Set the interval to 3 seconds
  intervalId = setInterval(fetchUsers, 3000);
};

export const disableUsersOnlinePolling = () => {
  if (intervalId !== null) {
    console.log('UsersOnlinePolling: Disabling polling');
    clearInterval(intervalId);
    intervalId = null;
  }
};

export const setUsersOnlineCallback = (cb: ((users: any) => void) | null) => {
  callback = cb;
  console.log('📞 UsersOnlinePolling: Callback', cb ? '✅ set' : '❌ cleared');
};


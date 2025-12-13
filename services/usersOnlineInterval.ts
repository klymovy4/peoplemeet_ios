import { getToken } from './auth';
import { getUsersOnline } from './api';

let intervalId: number | null = null;
let callback: ((users: any) => void) | null = null;

export const enableUsersOnlinePolling = () => {
  // Если интервал уже запущен, не запускаем повторно
  if (intervalId !== null) {
    console.log('🟢 UsersOnlinePolling: Already enabled');
    return;
  }

  console.log('🟢 UsersOnlinePolling: Enabling polling');

  // Выполняем первый запрос сразу
  const fetchUsers = async () => {
    try {
      const token = await getToken();
      if (!token) {
        console.log('🔴 UsersOnlinePolling: No token, stopping polling');
        disableUsersOnlinePolling();
        return;
      }

      const users = await getUsersOnline(token);
      
      // Вызываем callback если он установлен
      if (callback) {
        callback(users);
      }
    } catch (error) {
      console.error('❌ UsersOnlinePolling: Error fetching users:', error);
    }
  };

  // Выполняем первый запрос
  fetchUsers();

  // Устанавливаем интервал на 3 секунды
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


import { getToken } from './auth';
import { getMessages } from './api';

let intervalId: number | null = null;
let callback: ((messagesData: any) => void) | null = null;

export const startMessagesInterval = () => {
  // Если интервал уже запущен, не запускаем повторно
  if (intervalId !== null) {
    console.log('MessagesInterval: Already started');
    return;
  }

  console.log('MessagesInterval: Starting polling');

  // Выполняем первый запрос сразу
  const fetchMessages = async () => {
    try {
      const token = await getToken();
      if (!token) {
        console.log('MessagesInterval: No token, stopping polling');
        stopMessagesInterval();
        return;
      }

      const result = await getMessages(token);
      
      // Вызываем callback если он установлен
      if (callback) {
        if (result.status === 'success') {
          callback(result.data);
        } else {
          callback(null);
        }
      }
    } catch (error) {
      console.error('MessagesInterval: Error fetching messages:', error);
      if (callback) {
        callback(null);
      }
    }
  };

  // Выполняем первый запрос
  fetchMessages();

  // Устанавливаем интервал на 3 секунды
  intervalId = setInterval(fetchMessages, 3000);
};

export const stopMessagesInterval = () => {
  if (intervalId !== null) {
    console.log('MessagesInterval: Stopping polling');
    clearInterval(intervalId);
    intervalId = null;
  }
};

export const setMessagesCallback = (cb: ((messagesData: any) => void) | null) => {
  callback = cb;
  console.log('MessagesInterval: Callback', cb ? 'set' : 'cleared');
};


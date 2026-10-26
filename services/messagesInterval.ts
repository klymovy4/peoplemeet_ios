import { getToken } from './auth';
import { getMessages } from './api';

let intervalId: number | null = null;
let callback: ((messagesData: any) => void) | null = null;

export const startMessagesInterval = () => {
  // If the interval is already running, do not start it again
  if (intervalId !== null) {
    console.log('MessagesInterval: Already started');
    return;
  }

  console.log('MessagesInterval: Starting polling');

  // Make the first request right away
  const fetchMessages = async () => {
    try {
      const token = await getToken();
      if (!token) {
        console.log('MessagesInterval: No token, stopping polling');
        stopMessagesInterval();
        return;
      }

      const result = await getMessages(token);
      
      // Call the callback if it is set
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

  // Make the first request
  fetchMessages();

  // Set the interval to 3 seconds
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


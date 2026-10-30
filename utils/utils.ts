// Helper functions for the map

/**
 * Returns the user's image URL
 */
export const getImageUrl = (imageName: string | null | undefined): string | null => {
  if (!imageName) return null;
  if (imageName.startsWith('http://') || imageName.startsWith('https://')) {
    return imageName;
  }
  return `https://peoplemeet.com.ua/uploads/${imageName}`;
};

/**
 * Safely converts a coordinate to a number
 */
export const parseCoordinate = (coord: string | number | null | undefined): number | null => {
  if (coord === null || coord === undefined) return null;
  if (typeof coord === 'number') return coord;
  const parsed = parseFloat(String(coord));
  return isNaN(parsed) ? null : parsed;
};

/**
 * Generates a unique marker color for a user based on their data
 */
export const getUserMarkerColor = (user: any): string => {
  // Collect data for generating the color
  const name = user?.name || '';
  const age = user?.age || 0;
  const sex = user?.sex || '';
  
  // Build a string from all the data
  const dataString = `${name}-${age}-${sex}`;
  
  // Simple hash function to turn the string into a number
  let hash = 0;
  for (let i = 0; i < dataString.length; i++) {
    const char = dataString.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash; // Convert to 32bit integer
  }
  
  // Use the hash to generate RGB components
  // Use different ranges for brighter, more saturated colors
  const r = Math.abs(hash) % 156 + 100; // 100-255 (bright reds)
  const g = Math.abs(hash * 7) % 156 + 100; // 100-255 (bright greens)
  const b = Math.abs(hash * 13) % 156 + 100; // 100-255 (bright blues)
  
  // Return the color in hex format
  return `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`;
};

/**
 * Calculates the distance between two points on the map
 */
export const calculateDistance = (lat1: number, lon1: number, lat2: number, lon2: number): string => {
  const EARTH_RADIUS = 6378137; // Radius of the Earth in meters

  const latitude1 = (lat1 * Math.PI) / 180;
  const latitude2 = (lat2 * Math.PI) / 180;
  const deltaLatitude = ((lat2 - lat1) * Math.PI) / 180;
  const deltaLongitude = ((lon2 - lon1) * Math.PI) / 180;

  const a =
      Math.sin(deltaLatitude / 2) ** 2 +
      Math.cos(latitude1) *
      Math.cos(latitude2) *
      Math.sin(deltaLongitude / 2) ** 2;

  const angularDistance = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  const d = EARTH_RADIUS * angularDistance;

  return d > 1000 ? `${(d / 1000).toFixed(1)} km` : `${Math.round(d)} m`;
};

/**
 * Formats created_at time as HH:mm
 */
export const formatMessageTime = (createdAt: string | null | undefined): string => {
  if (!createdAt) return '';
  
  try {
    // Parse the time string (format "2025-12-10 20:03:11")
    // If the string has no time zone info,
    // treat it as UTC and convert to local time
    let date: Date;
    
    // Check whether there is time zone info
    if (createdAt.includes('T') || createdAt.includes('Z') || createdAt.includes('+') || createdAt.includes('-', 10)) {
      // Time zone info is already present
      date = new Date(createdAt);
    } else {
      // No time zone info: assume UTC and append 'Z'
      date = new Date(createdAt.replace(' ', 'T') + 'Z');
    }
    
    // Use the device's local time
    const hours = date.getHours();
    const minutes = date.getMinutes();
    
    // 24-hour format (device local time)
    const hoursStr = hours.toString().padStart(2, '0');
    const minutesStr = minutes.toString().padStart(2, '0');
    
    return `${hoursStr}:${minutesStr}`;
  } catch (error) {
    return '';
  }
};

// Text emoticons that are turned into emoji in chat messages
const EMOTICONS: Record<string, string> = {
  ':)': '🙂', ':-)': '🙂',
  ':(': '🙁', ':-(': '🙁',
  ';)': '😉', ';-)': '😉',
  ":'(": '😢',
  ':*': '😘', ':-*': '😘',
  ':|': '😐',
  '<3': '❤️',
  ':D': '😃', ':-D': '😃',
  'xD': '😆', 'XD': '😆',
  ':P': '😛', ':p': '😛', ':-P': '😛', ':-p': '😛',
  ':O': '😮', ':o': '😮', ':-O': '😮', ':-o': '😮',
};

const escapeRegExp = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const buildEmoticonRegExp = (emoticons: string[], lookahead: string) =>
  new RegExp(`(^|\\s)(${emoticons.map(escapeRegExp).join('|')})(?=${lookahead})`, 'g');

const emoticonKeys = Object.keys(EMOTICONS);
// Ending in a letter (":D", ":P", "xD"), the emoticon may still be the start of a word,
// so while typing it is replaced only once a space follows it
const endsWithLetter = (emoticon: string) => /[a-z]$/i.test(emoticon);
const SAFE_EMOTICONS_RE = buildEmoticonRegExp(emoticonKeys.filter((e) => !endsWithLetter(e)), '\\s|$');
const LETTER_EMOTICONS_RE = buildEmoticonRegExp(emoticonKeys.filter(endsWithLetter), '\\s');
const ALL_EMOTICONS_RE = buildEmoticonRegExp(emoticonKeys, '\\s|$');

/**
 * Replaces standalone text emoticons (":)", "<3", ":D"...) with emoji.
 * `final` is used when the message is sent: emoticons at the very end are replaced too.
 */
export const replaceEmoticons = (text: string, final = false): string => {
  const toEmoji = (_: string, prefix: string, emoticon: string) => prefix + EMOTICONS[emoticon];
  if (final) return text.replace(ALL_EMOTICONS_RE, toEmoji);
  return text.replace(SAFE_EMOTICONS_RE, toEmoji).replace(LETTER_EMOTICONS_RE, toEmoji);
};

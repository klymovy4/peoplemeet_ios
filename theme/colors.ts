// App palette "Italia": matches the logo (green and red pins on mint).
// Change the colors here to restyle the chat; other screens still use their own colors.
export const palette = {
  green: '#2F8F52', // a bit darker than the logo green, so white text on it stays readable
  greenLight: '#3FA563',
  red: '#E5545E',
  mint: '#E9F6EC',
  mintBorder: '#CFE5D6',
  white: '#FFFFFF',
  ink: '#1F2D24',
  inkSoft: '#6B7D72',
  yellow: '#FFE58F',
};

export const chatColors = {
  background: palette.mint,
  border: palette.mintBorder,
  // Your messages
  sent: palette.green,
  sentText: palette.white,
  sentMeta: 'rgba(255, 255, 255, 0.8)',
  readTick: palette.yellow,
  // Messages from the other person
  received: palette.white,
  receivedText: palette.ink,
  receivedMeta: palette.inkSoft,
  // Send button, reply accents, "online"
  accent: palette.green,
  online: palette.green,
  offline: palette.red,
  danger: palette.red,
  quoteSentBackground: 'rgba(255, 255, 255, 0.2)',
  quoteReceivedBackground: 'rgba(47, 143, 82, 0.10)',
};

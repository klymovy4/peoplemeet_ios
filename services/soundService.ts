import type { AudioPlayer } from 'expo-audio';

// One player for the "new message" sound, created once and reused afterwards
let player: AudioPlayer | null = null;
let audioUnavailable = false;

const getPlayer = (): AudioPlayer | null => {
  if (player || audioUnavailable) return player;
  try {
    // Loaded lazily: if the installed build has no native audio module (e.g. not rebuilt yet),
    // only the sound is missing instead of the screens that import this file failing to load
    const { createAudioPlayer } = require('expo-audio') as typeof import('expo-audio');
    player = createAudioPlayer(require('../assets/message2.mp3'));
    player.volume = 1.0;
  } catch (error) {
    audioUnavailable = true;
    console.warn('🔇 Message sound unavailable (rebuild the app to include expo-audio):', error);
  }
  return player;
};

/** Loads the sound file in advance, so the first new message isn't silent while it loads */
export const preloadMessageSound = () => {
  getPlayer();
};

export const playMessageSound = () => {
  const current = getPlayer();
  if (!current) return;
  try {
    // Restart from the beginning if the previous sound is still playing
    current.seekTo(0);
    current.play();
  } catch (error) {
    console.error('🔇 Error playing message sound:', error);
  }
};

import type { AudioPlayer } from 'expo-audio';

// One player for the "new message" sound, created on first use and reused afterwards
let player: AudioPlayer | null = null;
let audioUnavailable = false;

export const playMessageSound = () => {
  if (audioUnavailable) return;
  try {
    if (!player) {
      // Loaded lazily: if the installed build has no native audio module (e.g. not rebuilt yet),
      // only the sound is missing instead of the screens that import this file failing to load
      const { createAudioPlayer } = require('expo-audio') as typeof import('expo-audio');
      player = createAudioPlayer(require('../assets/message2.mp3'));
      player.volume = 1.0;
    }
    // Restart from the beginning if the previous sound is still playing
    player.seekTo(0);
    player.play();
  } catch (error) {
    audioUnavailable = true;
    console.error('🔇 Message sound unavailable:', error);
  }
};

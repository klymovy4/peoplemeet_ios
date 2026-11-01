import { AudioPlayer, createAudioPlayer } from 'expo-audio';

// One player for the "new message" sound, created on first use and reused afterwards
let player: AudioPlayer | null = null;

export const playMessageSound = () => {
  try {
    if (!player) {
      player = createAudioPlayer(require('../assets/message2.mp3'));
      player.volume = 1.0;
    }
    // Restart from the beginning if the previous sound is still playing
    player.seekTo(0);
    player.play();
  } catch (error) {
    console.error('🔇 Error playing message sound:', error);
  }
};

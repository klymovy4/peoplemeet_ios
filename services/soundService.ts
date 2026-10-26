import { Audio } from 'expo-av';

let soundObject: Audio.Sound | null = null;

export const playMessageSound = async () => {
  try {
    // Stop the previous sound if it is playing
    if (soundObject) {
      await soundObject.unloadAsync();
      soundObject = null;
    }

    // Use the file path in assets
    const soundUri = require('../assets/message2.mp3');

    // Create a new sound object
    const { sound } = await Audio.Sound.createAsync(
      soundUri,
      { shouldPlay: true, volume: 1.0 }
    );

    soundObject = sound;

    // Unload the sound after playback finishes
    sound.setOnPlaybackStatusUpdate((status) => {
      if (status.isLoaded && status.didJustFinish) {
        sound.unloadAsync();
        soundObject = null;
      }
    });
  } catch (error) {
    console.error('🔇 Error playing message sound:', error);
  }
};

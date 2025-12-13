import { Audio } from 'expo-av';

let soundObject: Audio.Sound | null = null;

export const playMessageSound = async () => {
  try {
    // Останавливаем предыдущий звук, если он играет
    if (soundObject) {
      await soundObject.unloadAsync();
      soundObject = null;
    }

    // Используем путь к файлу в assets
    const soundUri = require('../assets/message2.mp3');

    // Создаем новый звуковой объект
    const { sound } = await Audio.Sound.createAsync(
      soundUri,
      { shouldPlay: true, volume: 1.0 }
    );

    soundObject = sound;

    // Очищаем звук после завершения воспроизведения
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

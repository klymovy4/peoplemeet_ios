import { getToken, removeToken, saveUserData } from '@/services/auth';
import { getSelf, uploadAvatar, editProfile } from '@/services/api';
import { Image } from 'expo-image';
import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View, TextInput, Platform } from 'react-native';
import Toast from 'react-native-toast-message';
import * as ImagePicker from 'expo-image-picker';
import * as ImageManipulator from 'expo-image-manipulator';
import ImageCropModal from '@/components/ImageCropModal';
// @ts-ignore - Picker может не иметь типов
import { Picker } from '@react-native-picker/picker';

export default function ProfileScreen() {
  const [userData, setUserData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [cropMode, setCropMode] = useState(false);
  const [selectedImageUri, setSelectedImageUri] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);
  
  // Состояния для редактируемых полей
  const [name, setName] = useState('');
  const [age, setAge] = useState('');
  const [sex, setSex] = useState('');
  const [description, setDescription] = useState('');
  const [thoughts, setThoughts] = useState('');

  useEffect(() => {
    checkAuth();
  }, []);

  const checkAuth = async () => {
    const token = await getToken();
    if (!token) {
      Toast.show({
        type: 'error',
        text1: 'Ошибка',
        text2: 'Требуется авторизация',
      });
      router.replace('/');
      return;
    }

    // Запрашиваем данные с сервера
    const result = await getSelf(token);
    
    if (result.status === 'success') {
      const userData = result.data;
      setUserData(userData);
      // Инициализируем поля редактирования
      setName(userData.name || '');
      setAge(userData.age?.toString() || '');
      setSex(userData.sex || '');
      setDescription(userData.description || '');
      setThoughts(userData.thoughts || '');
      // Сохраняем данные для кэша
      await saveUserData(userData);
    } else {
      Toast.show({
        type: 'error',
        text1: 'Ошибка',
        text2: result.data?.message || 'Не удалось загрузить данные профиля',
      });
    }

    setLoading(false);
  };

  const handleLogout = async () => {
    await removeToken();
    Toast.show({
      type: 'success',
      text1: 'Выход выполнен',
      text2: 'Вы успешно вышли из системы',
    });
    router.replace('/');
  };

  const openFileDialog = async () => {
    try {
      // Запрашиваем разрешение на доступ к медиатеке
      const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (status !== 'granted') {
        Toast.show({
          type: 'error',
          text1: 'Ошибка',
          text2: 'Необходимо разрешение на доступ к фотографиям',
        });
        return;
      }

      // Открываем выбор фото
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsEditing: false,
        quality: 1,
      });

      if (!result.canceled && result.assets[0]) {
        setSelectedImageUri(result.assets[0].uri);
        setCropMode(true);
      }
    } catch (error) {
      console.error('Error picking image:', error);
      Toast.show({
        type: 'error',
        text1: 'Ошибка',
        text2: 'Не удалось выбрать фото',
      });
    }
  };

  const onSave = async (cropData: { x: number; y: number; width: number; height: number; imageWidth: number; imageHeight: number }) => {
    if (!selectedImageUri) return;

    try {
      setUploading(true);

      // Создаем квадратный кроп (используем минимальный размер для квадрата)
      const size = Math.min(cropData.width, cropData.height);
      
      const croppedImage = await ImageManipulator.manipulateAsync(
        selectedImageUri,
        [
          {
            crop: {
              originX: Math.round(cropData.x),
              originY: Math.round(cropData.y),
              width: Math.round(size),
              height: Math.round(size),
            },
          },
          {
            resize: {
              width: 800,
              height: 800,
            },
          },
        ],
        {
          compress: 0.8,
          format: ImageManipulator.SaveFormat.JPEG,
        }
      );

      // Загружаем фото
      const token = await getToken();
      if (!token) {
        Toast.show({
          type: 'error',
          text1: 'Ошибка',
          text2: 'Требуется авторизация',
        });
        return;
      }

      const file = {
        uri: croppedImage.uri,
        type: 'image/jpeg',
        name: 'avatar.jpg',
      };

      const response = await uploadAvatar(file, token);

      if (response.status === 'success') {
        Toast.show({
          type: 'success',
          text1: 'Успешно',
          text2: response?.data?.message || 'Фото загружено',
        });

        // Обновляем данные пользователя
        const selfResult = await getSelf(token);
        if (selfResult.status === 'success') {
          setUserData(selfResult.data);
          await saveUserData(selfResult.data);
        }
      } else {
        Toast.show({
          type: 'error',
          text1: 'Ошибка',
          text2: response?.data?.message || 'Не удалось загрузить фото',
        });
      }

      setCropMode(false);
      setSelectedImageUri(null);
    } catch (error) {
      console.error('Error saving image:', error);
      Toast.show({
        type: 'error',
        text1: 'Ошибка',
        text2: 'Не удалось обработать фото',
      });
    } finally {
      setUploading(false);
    }
  };

  const onDiscard = () => {
    setCropMode(false);
    setSelectedImageUri(null);
  };

  const handleSaveDetails = async () => {
    // Валидация возраста
    const ageNum = parseInt(age, 10);
    if (age && (isNaN(ageNum) || ageNum < 18 || ageNum > 90)) {
      Toast.show({
        type: 'error',
        text1: 'Ошибка',
        text2: 'Возраст должен быть от 18 до 90 лет',
      });
      return;
    }

    try {
      setSaving(true);
      const token = await getToken();
      if (!token) {
        Toast.show({
          type: 'error',
          text1: 'Ошибка',
          text2: 'Требуется авторизация',
        });
        return;
      }

      const data = {
        name: name,
        age: age ? parseInt(age, 10) : null,
        sex: sex || null,
        description: description || null,
        thoughts: thoughts || null,
        email: userData?.email || '',
        token: token,
      };

      const response = await editProfile(data);

      if (response.status === 'success') {
        Toast.show({
          type: 'success',
          text1: 'Успешно',
          text2: response?.data?.message || 'Профиль обновлен',
        });

        // Обновляем данные пользователя
        const selfResult = await getSelf(token);
        if (selfResult.status === 'success') {
          setUserData(selfResult.data);
          await saveUserData(selfResult.data);
        }
      } else {
        Toast.show({
          type: 'error',
          text1: 'Ошибка',
          text2: response?.data?.message || 'Не удалось обновить профиль',
        });
      }
    } catch (error) {
      console.error('Error saving profile:', error);
      Toast.show({
        type: 'error',
        text1: 'Ошибка',
        text2: 'Не удалось сохранить изменения',
      });
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" />
      </View>
    );
  }

  const getImageUrl = (imageName: string | null | undefined) => {
    if (!imageName) return null;
    // Если изображение уже содержит полный URL, вернем его
    if (imageName.startsWith('http://') || imageName.startsWith('https://')) {
      return imageName;
    }
    // Формируем URL для изображения
    return `https://peoplemeet.com.ua/uploads/${imageName}`;
  };

  const formatDate = (dateString: string | null | undefined) => {
    if (!dateString) return 'Не указано';
    try {
      const date = new Date(dateString);
      return date.toLocaleString('ru-RU');
    } catch {
      return dateString;
    }
  };

  const formatOnlineStatus = (isOnline: number | null | undefined) => {
    if (isOnline === 1) return 'Онлайн';
    return 'Офлайн';
  };

  const formatSex = (sex: string | null | undefined) => {
    if (!sex) return 'Не указано';
    return sex === 'male' ? 'Мужской' : sex === 'female' ? 'Женский' : sex;
  };

  return (
    <View style={styles.container}>
      <ScrollView contentContainerStyle={styles.scrollContent}>
        <Text style={styles.title}>People Meet</Text>

        <View style={styles.card}>
          <Text style={styles.header}>Профиль</Text>

          {userData && (
              <View style={styles.userInfo}>
                {/* Фото профиля */}
                <View style={styles.imageContainer}>
                  {userData.image ? (
                      <Image
                          source={{uri: getImageUrl(userData.image) || ''}}
                          style={styles.profileImage}
                          contentFit="cover"
                          placeholderContentFit="cover"
                          onError={() => console.log('Error loading image:', userData.image)}
                      />
                  ) : (
                      <View style={styles.placeholderImage}>
                        <Text style={styles.placeholderText}>Нет фото</Text>
                      </View>
                  )}
                  
                  {/* Кнопка Upload Photo */}
                  <Pressable
                    style={[styles.uploadButton, uploading && styles.uploadButtonDisabled]}
                    onPress={cropMode ? undefined : openFileDialog}
                    disabled={uploading || cropMode}
                  >
                    {uploading ? (
                      <ActivityIndicator size="small" color="#fff" />
                    ) : (
                      <Text style={styles.uploadButtonText}>
                        {cropMode ? 'Обработка...' : 'Upload Photo'}
                      </Text>
                    )}
                  </Pressable>
                </View>

                {/* Основная информация */}
                <View style={styles.infoRow}>
                  <Text style={styles.infoLabel}>Имя:</Text>
                  <TextInput
                    style={styles.input}
                    value={name}
                    onChangeText={setName}
                    placeholder="Введите имя"
                    placeholderTextColor="#999"
                  />
                </View>

                <View style={styles.infoRow}>
                  <Text style={styles.infoLabel}>Email:</Text>
                  <Text style={styles.infoValue}>{userData.email || 'Не указано'}</Text>
                </View>

                <View style={styles.infoRow}>
                  <Text style={styles.infoLabel}>Возраст (18-90):</Text>
                  <TextInput
                    style={styles.input}
                    value={age}
                    onChangeText={(text) => {
                      // Разрешаем только цифры
                      const numericValue = text.replace(/[^0-9]/g, '');
                      setAge(numericValue);
                    }}
                    placeholder="Введите возраст"
                    placeholderTextColor="#999"
                    keyboardType="numeric"
                    maxLength={2}
                  />
                </View>

                <View style={styles.infoRow}>
                  <Text style={styles.infoLabel}>Пол:</Text>
                  <View style={styles.pickerContainer}>
                    <Picker
                      selectedValue={sex}
                      onValueChange={(itemValue: string) => setSex(itemValue)}
                      style={styles.picker}
                    >
                      <Picker.Item label="Выберите пол" value="" />
                      <Picker.Item label="Мужской" value="male" />
                      <Picker.Item label="Женский" value="female" />
                    </Picker>
                  </View>
                </View>

                {/* Описание */}
                <View style={styles.infoRow}>
                  <Text style={styles.infoLabel}>Описание:</Text>
                  <TextInput
                    style={[styles.input, styles.textArea]}
                    value={description}
                    onChangeText={setDescription}
                    placeholder="Введите описание"
                    placeholderTextColor="#999"
                    multiline
                    numberOfLines={4}
                    textAlignVertical="top"
                  />
                </View>

                {/* Мысли */}
                <View style={styles.infoRow}>
                  <Text style={styles.infoLabel}>Мысли:</Text>
                  <TextInput
                    style={[styles.input, styles.textArea]}
                    value={thoughts}
                    onChangeText={setThoughts}
                    placeholder="Введите мысли"
                    placeholderTextColor="#999"
                    multiline
                    numberOfLines={4}
                    textAlignVertical="top"
                  />
                </View>

                {/* Статус онлайн */}
                <View style={styles.infoRow}>
                  <Text style={styles.infoLabel}>Статус:</Text>
                  <Text style={styles.infoValue}>{formatOnlineStatus(userData.is_online)}</Text>
                </View>

                {/* Последний раз онлайн */}
                <View style={styles.infoRow}>
                  <Text style={styles.infoLabel}>Последний раз онлайн:</Text>
                  <Text style={styles.infoValue}>{formatDate(userData.last_time_online)}</Text>
                </View>

                {/* Координаты (показываем только если оба значения есть) */}
                {userData.lat !== null && userData.lat !== undefined &&
                    userData.lng !== null && userData.lng !== undefined && (
                        <View style={styles.infoRow}>
                          <Text style={styles.infoLabel}>Координаты:</Text>
                          <Text style={styles.infoValue}>{userData.lat}, {userData.lng}</Text>
                        </View>
                    )}

                {/* ID */}
                {userData.id !== null && userData.id !== undefined && (
                    <View style={styles.infoRow}>
                      <Text style={styles.infoLabel}>ID:</Text>
                      <Text style={styles.infoValue}>{userData.id}</Text>
                    </View>
                )}
              </View>
          )}

          <Pressable 
            style={[styles.saveButton, saving && styles.saveButtonDisabled]} 
            onPress={handleSaveDetails}
            disabled={saving}
          >
            {saving ? (
              <ActivityIndicator size="small" color="#fff" />
            ) : (
              <Text style={styles.saveButtonText}>Save Details</Text>
            )}
          </Pressable>

          <Pressable style={styles.logoutButton} onPress={handleLogout}>
            <Text style={styles.logoutButtonText}>Logout</Text>
          </Pressable>
        </View>
      </ScrollView>

      {/* Модальное окно для кропа */}
      {selectedImageUri && (
        <ImageCropModal
          visible={cropMode}
          imageUri={selectedImageUri}
          onSave={onSave}
          onDiscard={onDiscard}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f5f5f5',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  scrollContent: {
    flexGrow: 1,
    alignItems: 'center',
    padding: 20,
    paddingTop: 40,
  },
  title: {
    marginBottom: 20,
    fontSize: 24,
    fontWeight: 'bold',
    color: '#333',
  },
  card: {
    width: '100%',
    maxWidth: 500,
    padding: 20,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#e0e0e0',
    backgroundColor: '#fff',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  header: {
    textAlign: 'center',
    marginBottom: 16,
    fontSize: 22,
    fontWeight: '600',
    color: '#333',
  },
  userInfo: {
    // marginBottom: 16,
    // backgroundColor: 'yellow',

  },
  imageContainer: {
    alignItems: 'center',
    marginBottom: 16,

  },
  uploadButton: {
    marginTop: 16,
    paddingVertical: 12,
    paddingHorizontal: 24,
    borderRadius: 8,
    backgroundColor: '#4ECDC4',
    minWidth: 150,
    alignItems: 'center',
    justifyContent: 'center',
  },
  uploadButtonDisabled: {
    opacity: 0.6,

  },
  uploadButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  profileImage: {
    width: 220,
    height: 220,
    borderRadius: 60,
    borderWidth: 3,
    borderColor: '#4ECDC4',
    backgroundColor: '#f0f0f0',
  },
  placeholderImage: {
    width: 120,
    height: 120,
    borderRadius: 60,
    borderWidth: 3,
    borderColor: '#4ECDC4',
    backgroundColor: '#e0e0e0',
    justifyContent: 'center',
    alignItems: 'center',
  },
  placeholderText: {
    color: '#999',
    fontSize: 14,
  },
  infoRow: {
    marginBottom: 16,
    paddingBottom: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0',
  },
  infoLabel: {
    fontWeight: '600',
    marginBottom: 4,
    fontSize: 14,
    color: '#666',
    textTransform: 'uppercase',
  },
  infoValue: {
    fontSize: 16,
    color: '#333',
    lineHeight: 22,
  },
  input: {
    fontSize: 16,
    color: '#333',
    borderWidth: 1,
    borderColor: '#e0e0e0',
    borderRadius: 8,
    padding: 12,
    backgroundColor: '#f9f9f9',
    marginTop: 4,
  },
  textArea: {
    minHeight: 100,
    maxHeight: 150,
  },
  pickerContainer: {
    borderWidth: 1,
    borderColor: '#e0e0e0',
    borderRadius: 8,
    backgroundColor: '#f9f9f9',
    marginTop: 4,
    overflow: 'hidden',
  },
  picker: {
    height: Platform.OS === 'ios' ? 150 : 50,
    width: '100%',
  },
  saveButton: {
    borderRadius: 8,
    alignItems: 'center',
    padding: 15,
    backgroundColor: '#4ECDC4',
    marginTop: 20,
    minHeight: 50,
    justifyContent: 'center',
  },
  saveButtonDisabled: {
    opacity: 0.6,
  },
  saveButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  logoutButton: {
    borderRadius: 8,
    alignItems: 'center',
    padding: 15,
    backgroundColor: '#ff4444',
    marginTop: 10,
  },
  logoutButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
});


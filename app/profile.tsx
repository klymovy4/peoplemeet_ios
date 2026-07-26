import { getToken, removeToken, saveUserData } from '@/services/auth';
import { getSelf, uploadAvatar, editProfile, getOnline, readMessages, sendMessage } from '@/services/api';
import { enableUsersOnlinePolling, disableUsersOnlinePolling, setUsersOnlineCallback } from '@/services/usersOnlineInterval';
import { startMessagesInterval, stopMessagesInterval, setMessagesCallback } from '@/services/messagesInterval';
import { playMessageSound } from '@/services/soundService';
import { Image } from 'expo-image';
import { router } from 'expo-router';
import { formatMessageTime, getImageUrl } from '@/app/utils/utils';
import { useEffect, useState, useRef } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View, TextInput, Platform, Switch } from 'react-native';
import { useSharedValue, withSpring } from 'react-native-reanimated';
import Toast from 'react-native-toast-message';
import * as ImagePicker from 'expo-image-picker';
import * as ImageManipulator from 'expo-image-manipulator';
import * as Location from 'expo-location';
import ImageCropModal from '@/components/ImageCropModal';
import MessagesModal from '@/components/MessagesModal';
// @ts-ignore - Picker может не иметь типов
import { Picker } from '@react-native-picker/picker';

export default function ProfileScreen() {
  const [userData, setUserData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [cropMode, setCropMode] = useState(false);
  const [selectedImageUri, setSelectedImageUri] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [isOnline, setIsOnline] = useState(false);
  const [togglingOnline, setTogglingOnline] = useState(false);
  
  // Состояния для редактируемых полей
  const [name, setName] = useState('');
  const [age, setAge] = useState('');
  const [sex, setSex] = useState('');
  const [description, setDescription] = useState('');
  const [thoughts, setThoughts] = useState('');
  const [messagesVisible, setMessagesVisible] = useState(false);
  const [onlineUsers, setOnlineUsers] = useState<any[]>([]);
  const [unreadMessagesCount, setUnreadMessagesCount] = useState(0);
  const [messagesUsers, setMessagesUsers] = useState<any>({});
  const [messagesData, setMessagesData] = useState<any>({});
  const [selectedChatUser, setSelectedChatUser] = useState<any | null>(null);
  const [messageText, setMessageText] = useState('');
  const [sendingMessage, setSendingMessage] = useState(false);
  const [showUserInfo, setShowUserInfo] = useState(false);
  const slideAnim = useSharedValue(1); // Начальное значение 1 = плашка скрыта внизу
  const scrollViewRef = useRef<ScrollView | null>(null);
  const lastMessageCountRef = useRef<number>(0); // Храним количество сообщений для проверки новых
  const previousUnreadCountRef = useRef<number>(0); // Храним предыдущее количество непрочитанных сообщений
  const userIdRef = useRef<number | null>(null);
  


  useEffect(() => {
    checkAuth();
  }, []);

  useEffect(() => {
    // Обновляем ref при изменении userData
    if (userData?.id) {
      userIdRef.current = userData.id;
    }
  }, [userData?.id]);

  useEffect(() => {
    // Устанавливаем callback для получения онлайн пользователей
    setUsersOnlineCallback((users) => {
      const currentUserId = userIdRef.current;
      
      if (!users) {
        setOnlineUsers([]);
        return;
      }
      
      let usersArray: any[] = [];
      
      // Обрабатываем разные форматы ответа
      if (Array.isArray(users)) {
        usersArray = users;
      } else if (users.users && Array.isArray(users.users)) {
        usersArray = users.users;
      } else if (users.data && Array.isArray(users.data)) {
        usersArray = users.data;
      }
      
      // Фильтруем текущего пользователя из списка
      const filteredUsers = usersArray.filter((user: any) => {
        const userId = user.id || user.user_id;
        return userId !== currentUserId;
      });
      
      setOnlineUsers(filteredUsers);
    });

    // Очищаем callback при размонтировании
    return () => {
      setUsersOnlineCallback(null);
    };
  }, []);

  useEffect(() => {
    // Устанавливаем callback для получения сообщений
    setMessagesCallback((messagesData) => {
      console.log('ProfileScreen: Received messages data:', messagesData);
      
      if (!messagesData) {
        setUnreadMessagesCount(0);
        setMessagesUsers({});
        setMessagesData({});
        return;
      }
      
      // Подсчитываем количество пользователей с непрочитанными сообщениями
      const messages = messagesData.messages || {};
      let usersWithUnreadCount = 0;
      
      Object.keys(messages).forEach((userId) => {
        const userMessages = messages[userId] || [];
        const userIdNum = parseInt(userId, 10);
        
        // Проверяем, есть ли хотя бы одно входящее непрочитанное сообщение (sender_id === userId и is_read: 0)
        const hasUnread = Array.isArray(userMessages) && userMessages.some((message) => {
          return message && 
                 message.sender_id === userIdNum && 
                 message.is_read === 0;
        });
        
        if (hasUnread) {
          usersWithUnreadCount++;
        }
      });
      
      // Воспроизводим звук, если появились новые непрочитанные сообщения
      const previousUnreadCount = previousUnreadCountRef.current;
      if (usersWithUnreadCount > previousUnreadCount && !messagesVisible) {
        // Воспроизводим звук только если появились новые непрочитанные сообщения и чат не открыт
        playMessageSound();
      }
      
      previousUnreadCountRef.current = usersWithUnreadCount;
      setUnreadMessagesCount(usersWithUnreadCount);
      
      // Сохраняем данные о пользователях и сообщениях
      const users = messagesData.users || {};
      setMessagesUsers(users);
      setMessagesData(messagesData);
      
      // Если чат открыт с пользователем И модальное окно видимо, проверяем есть ли новые непрочитанные сообщения
      if (selectedChatUser && selectedChatUser.id && messagesVisible) {
        const messages = messagesData.messages || {};
        // Находим userId по ключу в messagesUsers
        const userId = Object.keys(users).find(id => {
          const user = users[id];
          return user?.id === selectedChatUser.id || id === String(selectedChatUser.id);
        }) || String(selectedChatUser.id);
        
        const userMessages = messages[userId] || [];
        const userIdNum = typeof userId === 'string' ? parseInt(userId, 10) : parseInt(String(userId), 10);
        
        // Проверяем, есть ли входящие непрочитанные сообщения от этого пользователя (sender_id === userId и is_read: 0)
        const hasUnread = Array.isArray(userMessages) && userMessages.some((message) => {
          return message && 
                 message.sender_id === userIdNum && 
                 message.is_read === 0;
        });
        
        // Если есть непрочитанные сообщения, отправляем запрос о прочтении
        if (hasUnread) {
          (async () => {
            try {
              const token = await getToken();
              if (token && selectedChatUser.id) {
                const result = await readMessages(token, selectedChatUser.id);
                if (result.status === 'success') {
                  console.log('Auto-marked messages as read for user:', selectedChatUser.id);
                }
              }
            } catch (error) {
              console.error('Error auto-marking messages as read:', error);
            }
          })();
        }
        
        // Проверяем, появились ли новые сообщения (больше чем было раньше)
        const currentMessageCount = Array.isArray(userMessages) ? userMessages.length : 0;
        const previousMessageCount = lastMessageCountRef.current;
        
        // Автоскролл вниз только если появились новые сообщения
        if (currentMessageCount > previousMessageCount) {
          setTimeout(() => {
            scrollViewRef.current?.scrollToEnd({ animated: true });
          }, 100);
        }
        
        // Обновляем счетчик сообщений
        lastMessageCountRef.current = currentMessageCount;
      }
    });

    // Очищаем callback при размонтировании
    return () => {
      setMessagesCallback(null);
    };
  }, [selectedChatUser, messagesVisible]);

  const checkAuth = async () => {
    const token = await getToken();
    if (!token) {
      Toast.show({
        type: 'error',
        text1: 'Error',
        text2: 'Authentication required',
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
      const onlineStatus = userData.is_online === 1;
      setIsOnline(onlineStatus);
      if (onlineStatus) {
        enableUsersOnlinePolling();
      } else {
        disableUsersOnlinePolling();
      }
      // Сохраняем данные для кэша
      await saveUserData(userData);
      
      // Запускаем интервал получения сообщений (всегда, если пользователь залогинен)
      startMessagesInterval();
      
    } else {
      Toast.show({
        type: 'error',
        text1: 'Error',
        text2: result.data?.message || 'Failed to load profile data',
      });
    }

    setLoading(false);
  };

  const handleLogout = async () => {
    try {
      // Гарантированно выключаем запросы пользователей
      disableUsersOnlinePolling();
      // Останавливаем интервал получения сообщений
      stopMessagesInterval();

      // Если пользователь онлайн, сначала отправляем запрос о переходе в оффлайн
      if (isOnline) {
        const token = await getToken();
        if (token) {
          const data = {
            token: token,
            is_online: 0,
            lat: null,
            lng: null,
          };

          try {
            await getOnline(data);
          } catch (error) {
            console.error('Error setting offline status on logout:', error);
            // Продолжаем выход даже если не удалось отправить статус оффлайн
          }
        }
      }

      // Теперь выполняем выход
      await removeToken();
      Toast.show({
        type: 'success',
        text1: 'Logged out',
        text2: 'You have been logged out',
      });
      router.replace('/');
    } catch (error) {
      console.error('Error during logout:', error);
      // В любом случае выполняем выход
      await removeToken();
      router.replace('/');
    }
  };

  const openFileDialog = async () => {
    try {
      // Запрашиваем разрешение на доступ к медиатеке
      const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (status !== 'granted') {
        Toast.show({
          type: 'error',
          text1: 'Error',
          text2: 'Photo library permission is required',
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
        text1: 'Error',
        text2: 'Failed to select photo',
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
          text1: 'Error',
          text2: 'Authentication required',
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
          text1: 'Success',
          text2: response?.data?.message || 'Photo uploaded',
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
          text1: 'Error',
          text2: response?.data?.message || 'Failed to upload photo',
        });
      }

      setCropMode(false);
      setSelectedImageUri(null);
    } catch (error) {
      console.error('Error saving image:', error);
      Toast.show({
        type: 'error',
        text1: 'Error',
        text2: 'Failed to process photo',
      });
    } finally {
      setUploading(false);
    }
  };

  const onDiscard = () => {
    setCropMode(false);
    setSelectedImageUri(null);
  };


  const toggleOnlineHandler = async () => {
    if (togglingOnline) return;

    try {
      setTogglingOnline(true);
      const token = await getToken();
      if (!token) {
        Toast.show({
          type: 'error',
          text1: 'Error',
          text2: 'Authentication required',
        });
        return;
      }

      if (isOnline) {
        // Переключаемся на оффлайн
        const data = {
          token: token,
          is_online: 0,
          lat: null,
          lng: null,
        };

        const response = await getOnline(data);
        if (response.status === 'success') {
          setIsOnline(false);
          disableUsersOnlinePolling(); // Останавливаем запросы онлайн-пользователей
          Toast.show({
            type: 'info',
            text1: 'Offline',
            text2: 'You are now offline',
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
            text1: 'Error',
            text2: response?.data?.message || 'Failed to go offline',
          });
        }
      } else {
        // Проверяем наличие всех обязательных данных перед переходом в онлайн
        if (!userData?.image) {
          Toast.show({
            type: 'error',
            text1: 'Error',
            text2: 'A profile photo is required',
          });
          return;
        }

        if (!name || name.trim().length === 0) {
          Toast.show({
            type: 'error',
            text1: 'Error',
            text2: 'Name is required',
          });
          return;
        }

        if (!age || age.trim().length === 0) {
          Toast.show({
            type: 'error',
            text1: 'Error',
            text2: 'Age is required',
          });
          return;
        }

        const ageNum = parseInt(age, 10);
        if (isNaN(ageNum) || ageNum < 18 || ageNum > 90) {
          Toast.show({
            type: 'error',
            text1: 'Error',
            text2: 'Age must be between 18 and 90',
          });
          return;
        }

        if (!sex || sex.trim().length === 0) {
          Toast.show({
            type: 'error',
            text1: 'Error',
            text2: 'Please select your gender',
          });
          return;
        }

        if (!thoughts || thoughts.trim().length === 0) {
          Toast.show({
            type: 'error',
            text1: 'Error',
            text2: 'Please share your thoughts',
          });
          return;
        }

        // Переключаемся на онлайн - запрашиваем геолокацию
        const { status } = await Location.requestForegroundPermissionsAsync();
        if (status !== 'granted') {
          Toast.show({
            type: 'error',
            text1: 'Error',
            text2: 'Location permission is required',
          });
          return;
        }

        const location = await Location.getCurrentPositionAsync({});
        const latitude = location.coords.latitude;
        const longitude = location.coords.longitude;

        const data = {
          token: token,
          is_online: 1,
          lat: latitude,
          lng: longitude,
        };

        const response = await getOnline(data);
        if (response.status === 'success') {
          setIsOnline(true);
          enableUsersOnlinePolling(); // Возобновляем запросы онлайн-пользователей
          Toast.show({
            type: 'success',
            text1: 'Online',
            text2: 'You are now online',
          });

          // Обновляем данные пользователя
          const selfResult = await getSelf(token);
          if (selfResult.status === 'success') {
            setUserData(selfResult.data);
            await saveUserData(selfResult.data);
          }

          // Переходим на страницу карты (интервал будет запущен там)
          router.replace('/map');
        } else {
          Toast.show({
            type: 'error',
            text1: 'Error',
            text2: response?.data?.message || 'Failed to go online',
          });
        }
      }
    } catch (error) {
      console.error('Error toggling online status:', error);
      Toast.show({
        type: 'error',
        text1: 'Error',
        text2: 'Failed to change status',
      });
    } finally {
      setTogglingOnline(false);
    }
  };

  // Функция для проверки валидности формы
  const isFormValid = () => {
    // Проверка имени
    if (!name || name.trim().length === 0) {
      return false;
    }

    // Проверка возраста
    if (!age || age.trim().length === 0) {
      return false;
    }
    const ageNum = parseInt(age, 10);
    if (isNaN(ageNum) || ageNum < 18 || ageNum > 90) {
      return false;
    }

    // Проверка пола
    if (!sex || sex.trim().length === 0) {
      return false;
    }

    // Проверка описания - минимум 10 символов
    if (!description || description.trim().length < 10) {
      return false;
    }

    return true;
  };

  const handleSaveDetails = async () => {
    // Валидация имени - обязательно
    if (!name || name.trim().length === 0) {
      Toast.show({
        type: 'error',
        text1: 'Error',
        text2: 'Name is required',
      });
      return;
    }

    // Валидация возраста - обязательно, от 18 до 90
    if (!age || age.trim().length === 0) {
      Toast.show({
        type: 'error',
        text1: 'Error',
        text2: 'Age is required',
      });
      return;
    }

    const ageNum = parseInt(age, 10);
    if (isNaN(ageNum) || ageNum < 18 || ageNum > 90) {
      Toast.show({
        type: 'error',
        text1: 'Error',
        text2: 'Age must be between 18 and 90',
      });
      return;
    }

    // Валидация пола - обязательно
    if (!sex || sex.trim().length === 0) {
      Toast.show({
        type: 'error',
        text1: 'Error',
        text2: 'Please select your gender',
      });
      return;
    }

    // Валидация описания - обязательно, минимум 10 символов
    if (!description || description.trim().length === 0) {
      Toast.show({
        type: 'error',
        text1: 'Error',
        text2: 'Description is required',
      });
      return;
    }

    if (description.trim().length < 10) {
      Toast.show({
        type: 'error',
        text1: 'Error',
        text2: 'Description must be at least 10 characters',
      });
      return;
    }

    try {
      setSaving(true);
      const token = await getToken();
      if (!token) {
        Toast.show({
          type: 'error',
          text1: 'Error',
          text2: 'Authentication required',
        });
        return;
      }

      const data = {
        name: name.trim(),
        age: parseInt(age, 10),
        sex: sex,
        description: description.trim(),
        thoughts: thoughts ? thoughts.trim() : '',
        email: userData?.email || '',
        token: token,
      };

      const response = await editProfile(data);

      if (response.status === 'success') {
        Toast.show({
          type: 'success',
          text1: 'Success',
          text2: response?.data?.message || 'Profile updated',
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
          text1: 'Error',
          text2: response?.data?.message || 'Failed to update profile',
        });
      }
    } catch (error) {
      console.error('Error saving profile:', error);
      Toast.show({
        type: 'error',
        text1: 'Error',
        text2: 'Failed to save changes',
      });
    } finally {
      setSaving(false);
    }
  };

  // Функция для подсчета непрочитанных сообщений от конкретного пользователя
  const getUnreadCountForUser = (userId: string | number): number => {
    const messages = messagesData.messages || {};
    const userMessages = messages[userId] || [];
    const userIdNum = typeof userId === 'string' ? parseInt(userId, 10) : userId;
    
    // Подсчитываем только входящие непрочитанные сообщения (sender_id === userId и is_read === 0)
    if (!Array.isArray(userMessages)) {
      return 0;
    }
    
    return userMessages.filter((message) => {
      return message && 
             message.sender_id === userIdNum && 
             message.is_read === 0;
    }).length;
  };

  // Функция для получения сообщений от конкретного пользователя
  const getMessagesForUser = (userId: string | number): any[] => {
    const messages = messagesData.messages || {};
    const userMessages = messages[userId] || [];
    
    // Если это массив, сортируем по created_at
    if (!Array.isArray(userMessages)) {
      return [];
    }
    
    return [...userMessages].sort((a, b) => {
      const dateA = a.created_at ? new Date(a.created_at).getTime() : 0;
      const dateB = b.created_at ? new Date(b.created_at).getTime() : 0;
      return dateA - dateB;
    });
  };

  // Функция для отправки сообщения
  const handleSendMessage = async () => {
    if (!messageText.trim() || !selectedChatUser || sendingMessage) {
      return;
    }

    try {
      setSendingMessage(true);
      const token = await getToken();
      if (!token || !selectedChatUser.id) {
        return;
      }

      const result = await sendMessage(token, selectedChatUser.id, messageText.trim());
      if (result.status === 'success') {
        setMessageText('');
        // Прокручиваем вниз после отправки
        setTimeout(() => {
          scrollViewRef.current?.scrollToEnd({ animated: true });
        }, 100);
      }
    } catch (error) {
      console.error('Error sending message:', error);
    } finally {
      setSendingMessage(false);
    }
  };


  // Функция для возврата к списку пользователей
  const handleBackToUsers = () => {
    setSelectedChatUser(null);
    // Сбрасываем счетчик сообщений при возврате к списку
    lastMessageCountRef.current = 0;
  };

  // Функция для показа пользователя на карте (переход на страницу карты)
  const handleShowOnMap = (userId: number) => {
    router.push({
      pathname: '/map',
      params: { focusUserId: String(userId) }
    });
  };

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {/* Header с иконками карты, заголовка и сообщений */}
      <View style={styles.header}>
        <Pressable
          style={styles.mapIconButton}
          onPress={() => {
            if (isOnline) {
              router.replace('/map');
            } else {
              Toast.show({
                type: 'info',
                text1: 'Info',
                text2: 'You must be online to view the map',
              });
            }
          }}
        >
          <View style={[styles.mapIcon, styles.mapIconPlaceholder]}>
            <Text style={styles.mapIconText}>🗺️</Text>
          </View>
        </Pressable>
        
        <Text style={styles.headerTitle}>People Meet</Text>
        
        <Pressable
          style={styles.messageButton}
          onPress={() => {
            setMessagesVisible(true);
            // Устанавливаем значение в 0, чтобы плашка появилась (translateY = 0)
            slideAnim.value = withSpring(0);
          }}
        >
          <View style={[styles.messageIcon, styles.messageIconPlaceholder]}>
            <Text style={styles.messageIconText}>✉️</Text>
            {unreadMessagesCount > 0 && (
              <View style={styles.messageBadge}>
                <Text style={styles.messageBadgeText}>
                  {unreadMessagesCount > 99 ? '99+' : unreadMessagesCount}
                </Text>
              </View>
            )}
          </View>
        </Pressable>
      </View>
      
      <ScrollView contentContainerStyle={styles.scrollContent}>
        {/*<Text style={styles.title}>People Meet</Text>*/}

        <View style={styles.card}>
          <Text style={styles.cardHeader}>Профиль</Text>

          {userData && (
              <View style={styles.userInfo}>
                {/* Фото профиля */}
                <View style={styles.imageContainer}>
                  {userData.image ? (
                      <Image
                          source={{uri: getImageUrl(userData.image) || ''}}
                          style={[styles.profileImage, { borderColor: isOnline ? '#4ECDC4' : '#FF6B6B' }]}
                          contentFit="cover"
                          placeholderContentFit="cover"
                          onError={() => console.log('Error loading image:', userData.image)}
                      />
                  ) : (
                      <View style={[styles.placeholderImage, { borderColor: isOnline ? '#4ECDC4' : '#FF6B6B' }]}>
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
                {/* Статус онлайн */}
                <View style={styles.infoRow}>
                  <Text style={styles.infoLabel}>Статус:</Text>
                  <View style={styles.switchContainer}>
                    <Text style={styles.switchLabel}>
                      {isOnline ? 'Online' : 'Offline'}
                    </Text>
                    <Switch
                        value={isOnline}
                        onValueChange={toggleOnlineHandler}
                        disabled={togglingOnline}
                        trackColor={{ false: '#e0e0e0', true: '#4ECDC4' }}
                        thumbColor={isOnline ? '#fff' : '#f4f3f4'}
                    />
                    {togglingOnline && (
                        <ActivityIndicator size="small" style={styles.switchLoader} />
                    )}
                  </View>
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

                {/*<View style={styles.infoRow}>*/}
                {/*  <Text style={styles.infoLabel}>Email:</Text>*/}
                {/*  <Text style={styles.infoValue}>{userData.email || 'Не указано'}</Text>*/}
                {/*</View>*/}

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
                    placeholder="Введите описание (минимум 10 символов)"
                    placeholderTextColor="#999"
                    multiline
                    numberOfLines={4}
                    textAlignVertical="top"
                  />
                  {description && description.trim().length > 0 && description.trim().length < 10 && (
                    <Text style={styles.errorText}>
                      Описание должно содержать минимум 10 символов ({description.trim().length}/10)
                    </Text>
                  )}
                </View>

                {/* Мысли */}
                <View style={styles.infoRow}>
                  <Text style={styles.infoLabel}>Мысли:</Text>
                  <TextInput
                    style={[styles.input, styles.textArea]}
                    value={thoughts}
                    onChangeText={(text) => {
                      // Ограничиваем до 21 символов
                      if (text.length <= 21) {
                        setThoughts(text);
                      } else {
                        setThoughts(text.substring(0, 21));
                      }
                    }}
                    placeholder="Введите мысли (максимум 38 символов)"
                    placeholderTextColor="#999"
                    multiline
                    numberOfLines={4}
                    textAlignVertical="top"
                    maxLength={21}
                  />
                  {thoughts !== null && thoughts !== undefined && (
                    <Text style={[
                      styles.charCountText,
                      thoughts.length >= 21 && styles.charCountTextWarning
                    ]}>
                      {thoughts.length}/21 символов
                    </Text>
                  )}
                </View>
              </View>
          )}

          <Pressable
            style={[
              styles.saveButton, 
              (saving || !isFormValid()) && styles.saveButtonDisabled
            ]} 
            onPress={handleSaveDetails}
            disabled={saving || !isFormValid()}
          >
            {saving ? (
              <ActivityIndicator size="small" color="#fff" />
            ) : (
              <Text style={styles.saveButtonText}>Save Details</Text>
            )}
          </Pressable>

          {/*/!* Кнопка для перехода на карту, если онлайн *!/*/}
          {/*{isOnline && (*/}
          {/*  <Pressable */}
          {/*    style={styles.mapButton} */}
          {/*    onPress={() => router.replace('/map')}*/}
          {/*  >*/}
          {/*    <Text style={styles.mapButtonText}>Go to M22ap</Text>*/}
          {/*  </Pressable>*/}
          {/*)}*/}

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

      {/* Плашка сообщений снизу */}
      <MessagesModal
        visible={messagesVisible}
        slideAnim={slideAnim}
        messagesUsers={messagesUsers}
        messagesData={messagesData}
        selectedChatUser={selectedChatUser}
        showUserInfo={showUserInfo}
        messageText={messageText}
        sendingMessage={sendingMessage}
        userData={userData}
        scrollViewRef={scrollViewRef}
        lastMessageCountRef={lastMessageCountRef}
        onClose={() => {
          setSelectedChatUser(null);
          setMessagesVisible(false);
        }}
        onBackToUsers={handleBackToUsers}
        onSetShowUserInfo={setShowUserInfo}
        onSetSelectedChatUser={setSelectedChatUser}
        onSetMessageText={setMessageText}
        onSendMessage={handleSendMessage}
        onShowOnMap={handleShowOnMap}
        getImageUrl={getImageUrl}
        getUnreadCountForUser={getUnreadCountForUser}
        getMessagesForUser={getMessagesForUser}
        formatMessageTime={formatMessageTime}
        title="Сообщения"
        getToken={getToken}
        readMessages={readMessages}
        setMessagesData={setMessagesData}
        setUnreadMessagesCount={setUnreadMessagesCount}
        onlineUsers={onlineUsers}
      />
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
    padding: 16,
  },
  header: {
    paddingTop: 50,
    paddingHorizontal: 20,
    paddingBottom: 10,
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#e0e0e0',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  headerSpacer: {
    flex: 1,
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#333',
    flex: 1,
    textAlign: 'center',
  },
  mapIconButton: {
    width: 50,
    height: 50,
  },
  mapIcon: {
    width: 50,
    height: 50,
    borderRadius: 25,
    borderWidth: 2,
    borderColor: '#4ECDC4',
    backgroundColor: '#f0f0f0',
  },
  mapIconPlaceholder: {
    backgroundColor: '#e0e0e0',
    justifyContent: 'center',
    alignItems: 'center',
  },
  mapIconText: {
    fontSize: 24,
  },
  messageButton: {
    width: 50,
    height: 50,
  },
  messageIcon: {
    width: 50,
    height: 50,
    borderRadius: 25,
    borderWidth: 2,
    borderColor: '#4ECDC4',
    backgroundColor: '#f0f0f0',
    position: 'relative',
  },
  messageIconPlaceholder: {
    backgroundColor: '#e0e0e0',
    justifyContent: 'center',
    alignItems: 'center',
  },
  messageIconText: {
    fontSize: 24,
  },
  messageBadge: {
    position: 'absolute',
    top: -2,
    right: -2,
    minWidth: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: '#FF6B6B',
    borderWidth: 2,
    borderColor: '#fff',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 4,
  },
  messageBadgeText: {
    color: '#fff',
    fontSize: 11,
    fontWeight: 'bold',
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
    padding: 16,
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
  cardHeader: {
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
    borderRadius: 20,
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
  mapButton: {
    borderRadius: 8,
    alignItems: 'center',
    padding: 15,
    backgroundColor: '#4ECDC4',
    marginTop: 10,
    minHeight: 50,
    justifyContent: 'center',
  },
  mapButtonText: {
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
  switchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 4,
  },
  switchLabel: {
    fontSize: 16,
    color: '#333',
    marginRight: 12,
    minWidth: 70,
  },
  switchLoader: {
    marginLeft: 8,
  },
  errorText: {
    color: '#ff4444',
    fontSize: 12,
    marginTop: 4,
  },
  charCountText: {
    color: '#666',
    fontSize: 12,
    marginTop: 4,
    textAlign: 'right',
  },
  charCountTextWarning: {
    color: '#ff8800',
    fontWeight: '600',
  },
  messagesBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'flex-end',
  },
  messagesSheet: {
    backgroundColor: '#fff',
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    maxHeight: '90%',
    minHeight: 600,
    width: '100%',
  },
  messagesSheetInner: {
    flex: 1,
    flexDirection: 'column',
    minHeight: 0,
  },
  messagesHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 16,
    minHeight: 60,
    height: 60,
    borderBottomWidth: 1,
    borderBottomColor: '#e0e0e0',
  },
  messagesBackButton: {
    marginRight: 12,
  },
  messagesBackButtonText: {
    fontSize: 24,
    color: '#333',
    fontWeight: 'bold',
  },
  messagesHeaderAvatarContainer: {
    marginRight: 12,
  },
  messagesHeaderAvatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    borderWidth: 2,
    backgroundColor: '#f0f0f0',
  },
  messagesHeaderAvatarPlaceholder: {
    backgroundColor: '#e0e0e0',
    justifyContent: 'center',
    alignItems: 'center',
  },
  messagesHeaderAvatarInner: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: '#ccc',
  },
  messagesTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#333',
    flex: 1,
  },
  messagesCloseButton: {
    fontSize: 24,
    color: '#666',
    fontWeight: 'bold',

  },
  chatContainer: {
    flex: 1,
    flexDirection: 'column',
    minHeight: 0,

  },
  messagesUsersContainer: {
    flex: 1,
    minHeight: 0,
  },
  messagesContent: {
    flex: 1,
    minHeight: 0,
  },
  messagesUsersContentContainer: {
    paddingVertical: 8,
  },
  messagesContentContainer: {
    padding: 8,
    paddingBottom: 16,
  },
  messagesEmptyText: {
    textAlign: 'center',
    color: '#999',
    fontSize: 16,
    marginTop: 50,
  },
  messageUserItem: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0',
  },
  messageUserAvatarContainer: {
    marginRight: 12,
    position: 'relative',
  },
  messageUserAvatar: {
    width: 50,
    height: 50,
    borderRadius: 25,
    borderWidth: 2,
    backgroundColor: '#f0f0f0',
  },
  messageUserBadge: {
    position: 'absolute',
    top: -2,
    right: -2,
    minWidth: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 2,
    borderColor: '#fff',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 4,
  },
  messageUserBadgeText: {
    color: '#fff',
    fontSize: 11,
    fontWeight: 'bold',
  },
  messageUserAvatarPlaceholder: {
    backgroundColor: '#e0e0e0',
    justifyContent: 'center',
    alignItems: 'center',
  },
  messageUserAvatarInner: {
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: '#ccc',
  },
  messageUserName: {
    fontSize: 16,
    fontWeight: '600',
    color: '#333',
  },
  chatMessage: {
    marginBottom: 12,
    maxWidth: '80%',
  },
  chatMessageSent: {
    alignSelf: 'flex-end',
    backgroundColor: '#4ECDC4',
    borderRadius: 16,
    borderTopRightRadius: 4,
    padding: 12,
  },
  chatMessageReceived: {
    alignSelf: 'flex-start',
    backgroundColor: '#e0e0e0',
    borderRadius: 16,
    borderTopLeftRadius: 4,
    padding: 12,
  },
  chatMessageText: {
    fontSize: 16,
    lineHeight: 20,
  },
  chatMessageTextSent: {
    color: '#fff',
  },
  chatMessageTextReceived: {
    color: '#333',
  },
  chatMessageTime: {
    fontSize: 11,
    marginTop: 4,
    opacity: 0.7,
  },
  chatMessageTimeSent: {
    color: '#fff',
    textAlign: 'right',
  },
  chatMessageTimeReceived: {
    color: '#666',
    textAlign: 'left',
  },
  chatInputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    borderTopWidth: 1,
    borderTopColor: '#e0e0e0',
    backgroundColor: '#fff',
  },
  chatInput: {
    flex: 1,
    borderWidth: 1,
    borderColor: '#e0e0e0',
    borderRadius: 20,
    paddingHorizontal: 16,
    paddingVertical: 10,
    fontSize: 16,
    maxHeight: 100,
    marginRight: 8,
  },
  chatSendButton: {
    backgroundColor: '#4ECDC4',
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 20,
    minWidth: 80,
    alignItems: 'center',
    justifyContent: 'center',
  },
  chatSendButtonDisabled: {
    opacity: 0.5,
  },
  chatSendButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  userInfoContainer: {
    flex: 1,
    minHeight: 0,
  },
  userInfoContent: {
    padding: 16,
  },
  userInfoImageContainer: {
    alignItems: 'center',
    marginBottom: 24,
  },
  userInfoImage: {
    width: 200,
    height: 200,
    borderRadius: 100,
    borderWidth: 3,
    backgroundColor: '#f0f0f0',
  },
  userInfoImagePlaceholder: {
    backgroundColor: '#e0e0e0',
    justifyContent: 'center',
    alignItems: 'center',
  },
  userInfoImageInner: {
    width: 120,
    height: 120,
    borderRadius: 60,
    backgroundColor: '#ccc',
  },
  userInfoDetails: {
    width: '100%',
  },
  userInfoName: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#333',
    marginBottom: 20,
    textAlign: 'center',
  },
  userInfoRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0',
  },
  userInfoLabel: {
    fontSize: 16,
    fontWeight: '600',
    color: '#666',
    textTransform: 'uppercase',
  },
  userInfoValue: {
    fontSize: 16,
    color: '#333',
  },
  userInfoDescriptionContainer: {
    paddingTop: 20,
  },
  userInfoDescriptionLabel: {
    fontSize: 16,
    fontWeight: '600',
    color: '#666',
    marginBottom: 8,
    textTransform: 'uppercase',
  },
  userInfoDescription: {
    fontSize: 16,
    color: '#333',
    lineHeight: 24,
  },
  userInfoThoughtsContainer: {
    paddingTop: 20,
  },
  userInfoThoughts: {
    fontSize: 16,
    color: '#666',
    fontStyle: 'italic',
    lineHeight: 24,
  },
  userInfoShowOnMapButton: {
    backgroundColor: '#4ECDC4',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 8,
  },
  userInfoShowOnMapButtonText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
  },
});
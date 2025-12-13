import { getToken } from '@/services/auth';
import { getSelf, readMessages, sendMessage } from '@/services/api';
import { enableUsersOnlinePolling, disableUsersOnlinePolling, setUsersOnlineCallback } from '@/services/usersOnlineInterval';
import { startMessagesInterval, setMessagesCallback } from '@/services/messagesInterval';
import { playMessageSound } from '@/services/soundService';
import { Image } from 'expo-image';
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useState, useRef } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, View, Text, Modal, TouchableWithoutFeedback, ScrollView, TextInput, Alert } from 'react-native';
import Toast from 'react-native-toast-message';
import Animated, { useSharedValue, useAnimatedStyle, withTiming, withSpring } from 'react-native-reanimated';
import { Marker, PROVIDER_DEFAULT, MapView as RNMapView } from 'react-native-maps';
import MapView from 'react-native-map-clustering';
import MessagesModal from '@/components/MessagesModal';

export default function MapScreen() {
  const [userData, setUserData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [messagesVisible, setMessagesVisible] = useState(false);
  const [onlineUsers, setOnlineUsers] = useState<any[]>([]);
  const [selectedUser, setSelectedUser] = useState<any | null>(null);
  const [unreadMessagesCount, setUnreadMessagesCount] = useState(0);
  const [messagesUsers, setMessagesUsers] = useState<any>({});
  const [messagesData, setMessagesData] = useState<any>({});
  const [selectedChatUser, setSelectedChatUser] = useState<any | null>(null);
  const [messageText, setMessageText] = useState('');
  const [sendingMessage, setSendingMessage] = useState(false);
  const [showUserInfo, setShowUserInfo] = useState(false);
  const slideAnim = useSharedValue(1); // Начальное значение 1 = плашка скрыта внизу
  const avatarAnim = useSharedValue({ x: 0, y: 0, scale: 1 });
  const userIdRef = useRef<number | null>(null);
  const scrollViewRef = useRef<ScrollView | null>(null);
  const lastMessageCountRef = useRef<number>(0); // Храним количество сообщений для проверки новых
  const previousUnreadCountRef = useRef<number>(0); // Храним предыдущее количество непрочитанных сообщений
  const previousMessagesRef = useRef<any>({}); // Храним предыдущие сообщения для определения новых
  const mapViewRef = useRef<MapView>(null);
  const params = useLocalSearchParams();

  useEffect(() => {
    checkAuth();

    // Очищаем при размонтировании - останавливаем интервал если пользователь уходит со страницы
    return () => {
      console.log('MapScreen: Component unmounting, disabling polling');
      disableUsersOnlinePolling();
      setUsersOnlineCallback(null);
    };
  }, []);

  useEffect(() => {
    // Обновляем ref при изменении userData
    if (userData?.id) {
      userIdRef.current = userData.id;
    }
  }, [userData?.id]);

  useEffect(() => {
    // Устанавливаем callback для получения онлайн пользователей
    // Используем функциональное обновление состояния для гарантии актуальности
    setUsersOnlineCallback((users) => {
      const currentUserId = userIdRef.current;
      console.log('MapScreen: Received online users data:', users);
      console.log('MapScreen: Current user ID:', currentUserId);
      
      if (!users) {
        console.log('MapScreen: No users data, clearing list');
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
      
      // console.log('MapScreen: Filtered online users:', filteredUsers.length);
      // console.log('MapScreen: Users data:', filteredUsers.map(u => ({ id: u.id || u.user_id, name: u.name, lat: u.lat, lng: u.lng })));

      // Всегда обновляем состояние, даже если количество не изменилось
      // Это гарантирует актуальность координат и других данных
      setOnlineUsers(filteredUsers);
    });

    // Очищаем callback при размонтировании (дублирующий cleanup уже есть в первом useEffect)
    return () => {
      setUsersOnlineCallback(null);
    };
  }, []);

  // Обработка параметра focusUserId для фокуса на маркер пользователя
  useEffect(() => {
    const focusUserId = params.focusUserId;
    if (focusUserId && onlineUsers.length > 0 && mapViewRef.current) {
      const userId = typeof focusUserId === 'string' ? parseInt(focusUserId, 10) : focusUserId;
      const user = onlineUsers.find((u: any) => (u.id || u.user_id) === userId);
      
      if (user) {
        const userLat = parseCoordinate(user.lat);
        const userLng = parseCoordinate(user.lng);
        
        if (userLat !== null && userLng !== null) {
          // Наводим карту на маркер пользователя
          setTimeout(() => {
            mapViewRef.current?.animateToRegion({
              latitude: userLat,
              longitude: userLng,
              latitudeDelta: 0.005,
              longitudeDelta: 0.005,
            }, 1000);
          }, 500);
        }
      }
    }
  }, [params.focusUserId, onlineUsers]);

  useEffect(() => {
    // Устанавливаем callback для получения сообщений
    setMessagesCallback((messagesData) => {
      console.log('MapScreen: Received messages data:', messagesData);
      
      if (!messagesData) {
        setUnreadMessagesCount(0);
        setMessagesUsers({});
        setMessagesData({});
        return;
      }
      
      // Подсчитываем количество пользователей с непрочитанными сообщениями
      const messages = messagesData.messages || {};
      const previousMessages = previousMessagesRef.current || {};
      let usersWithUnreadCount = 0;
      let shouldPlaySound = false;
      
      Object.keys(messages).forEach((userId) => {
        const userMessages = messages[userId] || [];
        const userIdNum = parseInt(userId, 10);
        const previousUserMessages = previousMessages[userId] || [];
        
        // Проверяем, есть ли хотя бы одно входящее непрочитанное сообщение (sender_id === userId и is_read: 0)
        const hasUnread = Array.isArray(userMessages) && userMessages.some((message) => {
          return message && 
                 message.sender_id === userIdNum && 
                 message.is_read === 0;
        });
        
        if (hasUnread) {
          usersWithUnreadCount++;
        }
        
        // Проверяем, есть ли новые непрочитанные сообщения от этого пользователя
        if (Array.isArray(userMessages) && Array.isArray(previousUserMessages)) {
          // Находим новые непрочитанные сообщения (is_read: 0 и sender_id === userIdNum)
          const newUnreadMessages = userMessages.filter((message) => {
            if (!message || message.sender_id !== userIdNum || message.is_read !== 0) {
              return false;
            }
            
            // Проверяем, что это сообщение не было в предыдущих сообщениях
            const messageExists = previousUserMessages.some((prevMessage) => {
              return prevMessage && prevMessage.id === message.id;
            });
            
            return !messageExists;
          });
          
          // Если есть новые непрочитанные сообщения и диалог с этим пользователем не открыт
          if (newUnreadMessages.length > 0) {
            const isDialogOpen = messagesVisible && selectedChatUser && 
              (selectedChatUser.id === userIdNum || String(selectedChatUser.id) === userId);
            
            if (!isDialogOpen) {
              shouldPlaySound = true;
            }
          }
        }
      });
      
      // Воспроизводим звук, если есть новые непрочитанные сообщения и диалог не открыт
      if (shouldPlaySound) {
        playMessageSound();
      }
      
      // Сохраняем текущие сообщения для следующей проверки
      previousMessagesRef.current = messages;
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
      router.replace('/');
      return;
    }

    // Запрашиваем данные с сервера
    const result = await getSelf(token);

    if (result.status === 'success') {
      setUserData(result.data);

      // Запускаем интервал получения сообщений (всегда, если пользователь залогинен)
      startMessagesInterval();

      // Если пользователь не онлайн, перенаправляем на профиль и выключаем запросы
      if (result.data.is_online !== 1) {
        console.log('MapScreen: User is offline, disabling polling and redirecting to profile');
        disableUsersOnlinePolling();
        router.replace('/profile');
        return;
      }

      // Если пользователь онлайн, запускаем запросы пользователей
      const onlineStatus = result.data.is_online === 1;
      if (onlineStatus) {
        console.log('MapScreen: User is online, enabling polling');
        enableUsersOnlinePolling();
        // Первый запрос будет сделан автоматически в startInterval, если callback установлен
      } else {
        console.log('MapScreen: User is offline, disabling polling');
        disableUsersOnlinePolling();
      }
    } else {
      // Если не удалось получить данные, перенаправляем на профиль
      router.replace('/profile');
      return;
    }

    setLoading(false);
  };


  const getImageUrl = (imageName: string | null | undefined) => {
    if (!imageName) return null;
    if (imageName.startsWith('http://') || imageName.startsWith('https://')) {
      return imageName;
    }
    return `https://peoplemeet.com.ua/uploads/${imageName}`;
  };

  // Безопасное преобразование координат в число
  const parseCoordinate = (coord: string | number | null | undefined): number | null => {
    if (coord === null || coord === undefined) return null;
    if (typeof coord === 'number') return coord;
    const parsed = parseFloat(String(coord));
    return isNaN(parsed) ? null : parsed;
  };

  const userLat = parseCoordinate(userData?.lat);
  const userLng = parseCoordinate(userData?.lng);

  // Функция для генерации уникального цвета на основе имени, возраста и пола пользователя
  const getUserMarkerColor = (user: any): string => {
    // Собираем данные для генерации цвета
    const name = user?.name || '';
    const age = user?.age || 0;
    const sex = user?.sex || '';
    
    // Создаем строку из всех данных
    const dataString = `${name}-${age}-${sex}`;
    
    // Простая hash-функция для преобразования строки в число
    let hash = 0;
    for (let i = 0; i < dataString.length; i++) {
      const char = dataString.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // Convert to 32bit integer
    }
    
    // Используем hash для генерации RGB компонентов
    // Используем разные диапазоны для более ярких и насыщенных цветов
    const r = Math.abs(hash) % 156 + 100; // 100-255 (яркие красные)
    const g = Math.abs(hash * 7) % 156 + 100; // 100-255 (яркие зеленые)
    const b = Math.abs(hash * 13) % 156 + 100; // 100-255 (яркие синие)
    
    // Возвращаем цвет в формате hex
    return `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`;
  };

  // Вычисляем расстояние до пользователя
  const calculateDistance = (lat1: number, lon1: number, lat2: number, lon2: number): string => {
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

  const handleMarkerPress = (user: any) => {
    setSelectedUser(user);
  };

  // Функция для рендеринга кластера
  const renderCluster = (cluster: any) => {
    const { id, geometry, properties } = cluster;
    const { cluster_id, point_count } = properties;
    
    return (
      <Marker
        key={`cluster-${cluster_id}`}
        coordinate={{
          latitude: geometry.coordinates[1],
          longitude: geometry.coordinates[0],
        }}
        onPress={() => {
          // При нажатии на кластер приближаемся максимально, чтобы увидеть отдельные маркеры
          // Используем очень маленькие delta для максимального приближения
          const region = {
            latitude: geometry.coordinates[1],
            longitude: geometry.coordinates[0],
            latitudeDelta: 0.0002, // Максимальное приближение
            longitudeDelta: 0.0002, // Максимальное приближение
          };
          
          // Сначала быстро приближаемся
          mapViewRef.current?.animateToRegion(region, 400);
          
          // Затем еще больше приближаемся для гарантированного раскрытия кластера
          setTimeout(() => {
            const tighterRegion = {
              latitude: geometry.coordinates[1],
              longitude: geometry.coordinates[0],
              latitudeDelta: 0.0001,
              longitudeDelta: 0.0001,
            };
            mapViewRef.current?.animateToRegion(tighterRegion, 400);
          }, 500);
        }}
      >
        <View style={styles.clusterContainer}>
          <View style={styles.clusterMarker}>
            <Text style={styles.clusterText}>{point_count}</Text>
          </View>
        </View>
      </Marker>
    );
  };

  const handleCloseUserCard = () => {
    setSelectedUser(null);
  };

  // Обновляем selectedUser актуальными данными из onlineUsers и messagesUsers при их изменении
  useEffect(() => {
    if (selectedUser) {
      const userId = selectedUser.id || selectedUser.user_id;
      if (userId) {
        // Сначала ищем пользователя в onlineUsers (они содержат актуальные данные)
        const onlineUser = onlineUsers.find((u: any) => {
          const uId = u.id || u.user_id;
          return uId === userId || String(uId) === String(userId);
        });
        
        // Затем ищем в messagesUsers для дополнения данными
        const userIdKey = Object.keys(messagesUsers).find(id => {
          const msgUser = messagesUsers[id];
          return msgUser && (msgUser.id === userId || String(msgUser.id) === String(userId) || id === String(userId));
        });
        
        let updatedUser = { ...selectedUser };
        let hasChanges = false;
        
        // Если пользователь найден в onlineUsers, обновляем данными оттуда
        if (onlineUser) {
          // Проверяем изменения в важных полях
          const fieldsToCheck = ['image', 'name', 'age', 'sex', 'description', 'thoughts', 'is_online', 'lat', 'lng'];
          for (const field of fieldsToCheck) {
            if (onlineUser[field] !== selectedUser[field]) {
              hasChanges = true;
              break;
            }
          }
          
          if (hasChanges) {
            updatedUser = {
              ...updatedUser,
              ...onlineUser, // Обновляем данными из onlineUsers
              id: userId, // Сохраняем id
            };
          }
        }
        
        // Если пользователь найден в messagesUsers, дополняем/перезаписываем данными
        if (userIdKey && messagesUsers[userIdKey]) {
          const msgUser = messagesUsers[userIdKey];
          const fieldsToCheck = ['image', 'name', 'age', 'sex', 'description', 'thoughts', 'is_online'];
          for (const field of fieldsToCheck) {
            if (msgUser[field] !== updatedUser[field]) {
              hasChanges = true;
              break;
            }
          }
          
          if (hasChanges) {
            updatedUser = {
              ...updatedUser,
              ...msgUser, // Дополняем данными из messagesUsers
              lat: updatedUser.lat || selectedUser.lat, // Сохраняем координаты
              lng: updatedUser.lng || selectedUser.lng,
              id: userId, // Сохраняем id
            };
          }
        }
        
        if (hasChanges) {
          setSelectedUser(updatedUser);
        }
      }
    }
  }, [onlineUsers, messagesUsers]);

  // Функция для форматирования времени из created_at
  const formatMessageTime = (createdAt: string | null | undefined): string => {
    if (!createdAt) return '';
    
    try {
      // Парсим строку времени (формат "2025-12-10 20:03:11")
      // Если строка не содержит информации о часовом поясе, 
      // интерпретируем её как UTC и конвертируем в локальное время
      let date: Date;
      
      // Проверяем, есть ли информация о часовом поясе
      if (createdAt.includes('T') || createdAt.includes('Z') || createdAt.includes('+') || createdAt.includes('-', 10)) {
        // Уже есть информация о часовом поясе
        date = new Date(createdAt);
      } else {
        // Нет информации о часовом поясе, предполагаем UTC и добавляем 'Z'
        date = new Date(createdAt.replace(' ', 'T') + 'Z');
      }
      
      // Используем локальное время устройства
      const hours = date.getHours();
      const minutes = date.getMinutes();
      
      // Формат 24 часа (локальное время устройства)
      const hoursStr = hours.toString().padStart(2, '0');
      const minutesStr = minutes.toString().padStart(2, '0');
      
      return `${hoursStr}:${minutesStr}`;
    } catch (error) {
      return '';
    }
  };

  const handleWrite = () => {
    if (!selectedUser?.id) return;
    
    // Ищем пользователя в messagesUsers по id (может быть разный формат ключа)
    const userId = Object.keys(messagesUsers).find(id => {
      const user = messagesUsers[id];
      return user && (user.id === selectedUser.id || 
                      String(user.id) === String(selectedUser.id) || 
                      id === String(selectedUser.id));
    });
    
    let chatUser;
    
    if (userId && messagesUsers[userId]) {
      // Если пользователь найден в messagesUsers, используем его данные (актуальные из get_messages)
      // Но дополняем координатами из selectedUser если они есть
      chatUser = {
        ...messagesUsers[userId],
        lat: selectedUser.lat,
        lng: selectedUser.lng,
      };
    } else {
      // Если пользователя нет в messagesUsers, используем все данные из selectedUser
      // selectedUser содержит актуальные данные из onlineUsers (age, description, name, sex, thoughts и т.д.)
      chatUser = { ...selectedUser };
    }
    
    // Устанавливаем пользователя для диалога
    setSelectedChatUser(chatUser);
    setShowUserInfo(false); // Сбрасываем показ информации при открытии нового чата
    
    // Сбрасываем счетчик сообщений при открытии нового чата
    lastMessageCountRef.current = 0;
    
    // Закрываем карточку пользователя
    handleCloseUserCard();
    
    // Открываем модальное окно сообщений
    setMessagesVisible(true);
    slideAnim.value = withSpring(0);
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

  // Функция для открытия чата с пользователем

  // Функция для возврата к списку пользователей
  const handleBackToUsers = () => {
    setSelectedChatUser(null);
    // Сбрасываем счетчик сообщений при возврате к списку
    lastMessageCountRef.current = 0;
  };

  // Функция для показа пользователя на карте
  const handleShowOnMap = (userId: number) => {
    const user = onlineUsers.find((u: any) => (u.id || u.user_id) === userId);
    
    if (user && mapViewRef.current) {
      const userLat = parseCoordinate(user.lat);
      const userLng = parseCoordinate(user.lng);
      
      if (userLat !== null && userLng !== null) {
        mapViewRef.current.animateToRegion({
          latitude: userLat,
          longitude: userLng,
          latitudeDelta: 0.005,
          longitudeDelta: 0.005,
        }, 1000);
      }
    }
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
        {/* Header с иконками профиля, заголовка и сообщений */}
        <View style={styles.header}>
          <Pressable
              style={styles.profileButton}
              onPress={() => router.replace('/profile')}
          >
            {userData?.image ? (
                <Image
                    source={{ uri: getImageUrl(userData.image) || '' }}
                    style={styles.profileIcon}
                    contentFit="cover"
                />
            ) : (
                <View style={[styles.profileIcon, styles.profileIconPlaceholder]}>
                  <View style={styles.profileIconInner} />
                </View>
            )}
          </Pressable>

          <Text style={styles.headerTitle}>People Meet Map</Text>

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

        {/* Контент страницы - карта */}
        <View style={styles.content}>
          {userLat !== null && userLng !== null ? (
              <MapView
                  ref={mapViewRef}
                  provider={PROVIDER_DEFAULT}
                  style={styles.map}
                  initialRegion={{
                    latitude: userLat,
                    longitude: userLng,
                    latitudeDelta: 0.01,
                    longitudeDelta: 0.01,
                  }}
                  showsUserLocation={false}
                  showsMyLocationButton={false}
                  radius={20}
                  extent={512}
                  minZoom={10}
                  maxZoom={20}
                  minPoints={2}
                  edgePadding={{ top: 50, left: 50, bottom: 50, right: 50 }}
                  renderCluster={renderCluster}
                  clusterColor="#4ECDC4"
                  clusterTextColor="#fff"
                  clusterFontFamily="System"
              >
                <Marker
                    coordinate={{
                      latitude: userLat,
                      longitude: userLng,
                    }}
                    onPress={() => handleMarkerPress(userData)}
                    tracksViewChanges={false}
                >
                  <View style={styles.markerContainer}>
                    {userData?.image ? (
                        <Image
                            source={{ uri: getImageUrl(userData.image) || '' }}
                            style={styles.markerAvatar}
                            contentFit="cover"
                        />
                    ) : (
                        <View style={[styles.markerAvatar, styles.markerAvatarPlaceholder]}>
                          <View style={styles.markerAvatarInner} />
                        </View>
                    )}
                    {userData?.thoughts && (
                      <Text style={styles.markerThoughts} numberOfLines={2}>
                        {userData.thoughts}
                      </Text>
                    )}
                  </View>
                </Marker>

                {/* Маркеры других онлайн пользователей */}
                {onlineUsers.map((user: any) => {
                  const userLat = parseCoordinate(user.lat);
                  const userLng = parseCoordinate(user.lng);
                  const userId = user.id || user.user_id || `user-${user.lat}-${user.lng}`;
                  
                  if (userLat === null || userLng === null) {
                    return null;
                  }
                  
                  // Объединяем данные из onlineUsers с актуальными данными из messagesUsers
                  // onlineUsers уже содержит все актуальные данные (age, description, name, sex, thoughts и т.д.)
                  // messagesUsers может содержать более свежие данные, если была переписка
                  const actualUser = (() => {
                    // Сначала используем данные из onlineUsers как основу (они уже актуальные)
                    let mergedUser = { ...user };
                    
                    // Ищем пользователя в messagesUsers по id для дополнения данными
                    const userIdKey = Object.keys(messagesUsers).find(id => {
                      const msgUser = messagesUsers[id];
                      return msgUser && (msgUser.id === userId || String(msgUser.id) === String(userId) || id === String(userId));
                    });
                    
                    if (userIdKey && messagesUsers[userIdKey]) {
                      // Объединяем: данные из messagesUsers имеют приоритет для полей, которые могут обновиться
                      // но сохраняем координаты из onlineUsers (они обновляются каждые 3 секунды)
                      mergedUser = {
                        ...mergedUser, // Все данные из onlineUsers (age, description, name, sex, thoughts и т.д.)
                        ...messagesUsers[userIdKey], // Дополняем/перезаписываем данными из messagesUsers если они есть
                        lat: user.lat, // Сохраняем координаты из onlineUsers
                        lng: user.lng,
                        id: user.id || user.user_id || messagesUsers[userIdKey].id, // Сохраняем id
                      };
                    }
                    
                    return mergedUser;
                  })();
                  
                  // Генерируем уникальный цвет для маркера на основе данных пользователя
                  const markerColor = getUserMarkerColor(actualUser);
                  
                  return (
                      <Marker
                          key={userId}
                          identifier={String(userId)}
                          coordinate={{
                            latitude: userLat,
                            longitude: userLng,
                          }}
                          onPress={() => handleMarkerPress(actualUser)}
                          tracksViewChanges={false}
                      >
                          <View style={styles.markerContainer}>
                              {actualUser.image ? (
                                  <Image
                                      source={{ uri: getImageUrl(actualUser.image) || '' }}
                                      style={[styles.otherUserMarkerAvatar, { borderColor: markerColor }]}
                                      contentFit="cover"
                                  />
                              ) : (
                                  <View style={[styles.otherUserMarkerAvatar, styles.markerAvatarPlaceholder, { borderColor: markerColor }]}>
                                      <View style={styles.markerAvatarInner} />
                                  </View>
                              )}
                              {actualUser?.thoughts && (
                                <Text style={styles.markerThoughts} numberOfLines={2}>
                                  {actualUser.thoughts}
                                </Text>
                              )}
                          </View>
                      </Marker>
                  );
                })}
              </MapView>
          ) : (
              <View style={styles.emptyContent}>
                <Text style={styles.emptyText}>Координаты не доступны</Text>
              </View>
          )}
        </View>

        {/* Карточка пользователя при нажатии на маркер */}
        <Modal
          visible={selectedUser !== null}
          transparent={true}
          animationType="fade"
          onRequestClose={handleCloseUserCard}
        >
          <TouchableWithoutFeedback onPress={handleCloseUserCard}>
            <View style={styles.userCardBackdrop}>
              <TouchableWithoutFeedback onPress={(e) => e.stopPropagation()}>
                <View style={styles.userCard}>
                  {/* Кнопка закрытия */}
                  <Pressable
                    style={styles.userCardCloseButton}
                    onPress={handleCloseUserCard}
                  >
                    <Text style={styles.userCardCloseText}>✕</Text>
                  </Pressable>

                  {/* Фото пользователя */}
                  <View style={styles.userCardImageContainer}>
                    {selectedUser?.image ? (
                      <Image
                        source={{ uri: getImageUrl(selectedUser.image) || '' }}
                        style={styles.userCardImage}
                        contentFit="cover"
                      />
                    ) : (
                      <View style={[styles.userCardImage, styles.userCardImagePlaceholder]}>
                        <View style={styles.userCardImageInner} />
                      </View>
                    )}
                  </View>

                  {/* Информация о пользователе */}
                  <ScrollView style={styles.userCardContent} showsVerticalScrollIndicator={false}>
                    <Text style={styles.userCardName}>
                      {selectedUser?.name || 'Имя не указано'}
                    </Text>
                    
                    <Text style={styles.userCardInfo}>
                      Age - {selectedUser?.age || 'не указан'}
                    </Text>
                    
                    <Text style={styles.userCardInfo}>
                      Sex - {selectedUser?.sex || 'не указан'}
                    </Text>
                    
                    {userLat !== null && userLng !== null && selectedUser?.lat && selectedUser?.lng && 
                     selectedUser?.id !== userData?.id && (
                      <Text style={styles.userCardInfo}>
                        Distance: {calculateDistance(
                          userLat,
                          userLng,
                          parseCoordinate(selectedUser.lat) || 0,
                          parseCoordinate(selectedUser.lng) || 0
                      )}
                      </Text>
                    )}
                    
                    {selectedUser?.description && (
                      <View style={styles.userCardDescriptionContainer}>
                        <Text style={styles.userCardDescriptionLabel}>Description:</Text>
                        <Text style={styles.userCardDescription}>
                          {selectedUser.description}
                        </Text>
                      </View>
                    )}
                  </ScrollView>

                  {/* Кнопка Write или текст "It's you" */}
                  {selectedUser?.id === userData?.id ? (
                    <View style={styles.userCardItsYouContainer}>
                      <Text style={styles.userCardItsYouText}>It&apos;s you</Text>
                    </View>
                  ) : (
                    <Pressable
                      style={styles.userCardWriteButton}
                      onPress={handleWrite}
                    >
                      <Text style={styles.userCardWriteButtonText}>WRITE</Text>
                    </Pressable>
                  )}
                </View>
              </TouchableWithoutFeedback>
            </View>
          </TouchableWithoutFeedback>
        </Modal>

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
  headerTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#333',
    flex: 1,
    textAlign: 'center',
  },
  profileButton: {
    width: 50,
    height: 50,
  },
  profileIcon: {
    width: 50,
    height: 50,
    borderRadius: 25,
    borderWidth: 2,
    borderColor: '#4ECDC4',
    backgroundColor: '#f0f0f0',
  },
  profileIconPlaceholder: {
    backgroundColor: '#e0e0e0',
    justifyContent: 'center',
    alignItems: 'center',
  },
  profileIconInner: {
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: '#ccc',
  },
  content: {
    flex: 1,
  },
  map: {
    flex: 1,
    width: '100%',
  },
  emptyContent: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  emptyText: {
    fontSize: 16,
    color: '#999',
  },
  markerContainer: {
    position: 'relative',
    alignItems: 'center',
    justifyContent: 'center',
  },
  markerAvatar: {
    width: 50,
    height: 50,
    borderRadius: 25,
    borderWidth: 3,
    borderColor: '#4ECDC4',
    backgroundColor: '#fff',
  },
  markerAvatarPlaceholder: {
    backgroundColor: '#e0e0e0',
    justifyContent: 'center',
    alignItems: 'center',
  },
  markerAvatarInner: {
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: '#ccc',
  },
  otherUserMarkerAvatar: {
    width: 45,
    height: 45,
    borderRadius: 22.5,
    borderWidth: 3, // Увеличено для лучшей видимости уникального цвета
    borderColor: '#FF6B6B', // Дефолтный цвет, будет перезаписан динамически
    backgroundColor: '#fff',
  },
  markerThoughts: {
    position: 'absolute',
    top: -40,
    right: -135,
    fontSize: 12,
    color: '#333',
    maxWidth: 150,
    width: 'fit-content',
    minWidth: 150,
    height: 'auto',
    textAlign: 'left',
    fontStyle: 'italic',
    backgroundColor: 'rgba(255, 255, 255, 0.98)',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
    overflow: 'hidden',
    zIndex: 10,
    shadowColor: '#000',
    // shadowOffset: {
    //   width: 0,
      // height: 2,
    // },
    // shadowOpacity: 0.25,
    shadowRadius: 3.84,
    elevation: 5,
    borderWidth: 1,
    borderColor: 'rgba(0, 0, 0, 0.1)',
  },
  clusterContainer: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  clusterMarker: {
    width: 50,
    height: 50,
    borderRadius: 25,
    backgroundColor: '#4ECDC4',
    borderWidth: 3,
    borderColor: '#fff',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 2,
    },
    shadowOpacity: 0.25,
    shadowRadius: 3.84,
    elevation: 5,
  },
  clusterText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: 'bold',
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
    marginRight: 8,
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
  },
  messageUserItem: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0'
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
  userCardBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  userCard: {
    width: '90%',
    maxWidth: 400,
    maxHeight: '85%',
    backgroundColor: '#fff',
    borderRadius: 20,
    overflow: 'hidden',
    position: 'relative',
  },
  userCardCloseButton: {
    position: 'absolute',
    top: 15,
    right: 15,
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: 'rgba(0, 0, 0, 0.1)',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 10,
  },
  userCardCloseText: {
    fontSize: 18,
    color: '#666',
    fontWeight: 'bold',
  },
  userCardImageContainer: {
    width: '100%',
    height: 300,
    backgroundColor: '#f0f0f0',
  },
  userCardImage: {
    width: '100%',
    height: '100%',
  },
  userCardImagePlaceholder: {
    backgroundColor: '#e0e0e0',
    justifyContent: 'center',
    alignItems: 'center',
  },
  userCardImageInner: {
    width: 100,
    height: 100,
    borderRadius: 50,
    backgroundColor: '#ccc',
  },
  userCardContent: {
    padding: 20,
    maxHeight: 300,
  },
  userCardName: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#333',
    marginBottom: 10,
  },
  userCardInfo: {
    fontSize: 16,
    color: '#666',
    marginBottom: 8,
  },
  userCardDescriptionContainer: {
    marginTop: 15,
  },
  userCardDescriptionLabel: {
    fontSize: 16,
    fontWeight: '600',
    color: '#333',
    marginBottom: 8,
  },
  userCardDescription: {
    fontSize: 14,
    color: '#666',
    lineHeight: 20,
  },
  userCardThoughtsContainer: {
    marginTop: 10,
    marginBottom: 10,
  },
  userCardThoughts: {
    fontSize: 14,
    color: '#666',
    fontStyle: 'italic',
  },
  userCardWriteButton: {
    backgroundColor: '#4ECDC4',
    paddingVertical: 15,
    paddingHorizontal: 30,
    alignItems: 'center',
    justifyContent: 'center',
    borderTopWidth: 1,
    borderTopColor: '#e0e0e0',
  },
  userCardWriteButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: 'bold',
    letterSpacing: 1,
  },
  userCardItsYouContainer: {
    paddingVertical: 15,
    paddingHorizontal: 30,
    alignItems: 'center',
    justifyContent: 'center',
    borderTopWidth: 1,
    borderTopColor: '#e0e0e0',
  },
  userCardItsYouText: {
    color: '#666',
    fontSize: 16,
    fontWeight: '600',
    fontStyle: 'italic',
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
    marginTop: 20,
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
  userInfoDeleteContainer: {
    marginTop: 30,
    paddingTop: 20,
    borderTopWidth: 1,
    borderTopColor: '#f0f0f0',
    alignItems: 'center',
  },
  userInfoDeleteButton: {
    backgroundColor: '#FF6B6B',
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 8,
    minWidth: 200,
    alignItems: 'center',
    justifyContent: 'center',
  },
  userInfoDeleteButtonDisabled: {
    opacity: 0.6,
  },
  userInfoDeleteButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
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


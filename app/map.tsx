import { getToken } from '@/services/auth';
import { getSelf, readMessages, sendMessage, getUsersOnline } from '@/services/api';
import { enableUsersOnlinePolling, disableUsersOnlinePolling, setUsersOnlineCallback } from '@/services/usersOnlineInterval';
import { startMessagesInterval, setMessagesCallback } from '@/services/messagesInterval';
import { playMessageSound } from '@/services/soundService';
import { Image } from 'expo-image';
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useState, useRef } from 'react';
import { ActivityIndicator, Pressable, View, Text, Modal, TouchableWithoutFeedback, ScrollView } from 'react-native';
import { useSharedValue, withSpring } from 'react-native-reanimated';
import { Marker, PROVIDER_DEFAULT } from 'react-native-maps';
import MapView from 'react-native-map-clustering';
import MessagesModal from '@/components/MessagesModal';
import { getImageUrl, parseCoordinate, getUserMarkerColor, calculateDistance, formatMessageTime } from '@/app/utils/utils';
import { mapStyles } from '@/app/styles/mapStyles';

export default function MapScreen() {
  const [userData, setUserData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [messagesVisible, setMessagesVisible] = useState(false);
  const [onlineUsers, setOnlineUsers] = useState<any[]>([]);
  const [currentUserFromOnline, setCurrentUserFromOnline] = useState<any | null>(null); // Актуальные данные текущего пользователя из online_users
  const [selectedUser, setSelectedUser] = useState<any | null>(null);
  const [unreadMessagesCount, setUnreadMessagesCount] = useState(0);
  const [messagesUsers, setMessagesUsers] = useState<any>({});
  const [messagesData, setMessagesData] = useState<any>({});
  const [selectedChatUser, setSelectedChatUser] = useState<any | null>(null);
  const [messageText, setMessageText] = useState('');
  const [sendingMessage, setSendingMessage] = useState(false);
  const [showUserInfo, setShowUserInfo] = useState(false);
  const [fixedRegion, setFixedRegion] = useState<any>(null); // Фиксированная позиция камеры после раскрытия кластера
  const slideAnim = useSharedValue(1); // Начальное значение 1 = плашка скрыта внизу
  const userIdRef = useRef<number | null>(null);
  const scrollViewRef = useRef<ScrollView | null>(null);
  const lastMessageCountRef = useRef<number>(0); // Храним количество сообщений для проверки новых
  const previousUnreadCountRef = useRef<number>(0); // Храним предыдущее количество непрочитанных сообщений
  const previousMessagesRef = useRef<any>({}); // Храним предыдущие сообщения для определения новых
  const mapViewRef = useRef<any>(null);
  const currentRegionRef = useRef<any>(null); // Сохраняем текущую позицию камеры
  const isUserInteractingRef = useRef<boolean>(false); // Флаг, что пользователь управляет камерой
  const isUpdatingDataRef = useRef<boolean>(false); // Флаг, что происходит обновление данных
  const isClusterExpandingRef = useRef<boolean>(false); // Флаг, что происходит раскрытие кластера
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
      
      // Находим данные текущего пользователя в ответе и сохраняем отдельно
      // Это гарантирует использование актуальных данных из последнего запроса
      const currentUserData = usersArray.find((user: any) => {
        const userId = user.id || user.user_id;
        return userId === currentUserId;
      });
      
      // Сохраняем актуальные данные текущего пользователя из online_users
      if (currentUserData) {
        const parsedCurrentUser = {
          ...currentUserData,
          id: currentUserData.id || currentUserData.user_id,
          lat: parseCoordinate(currentUserData.lat),
          lng: parseCoordinate(currentUserData.lng),
        };
        setCurrentUserFromOnline(parsedCurrentUser);
      }
      
      // Фильтруем текущего пользователя из списка других пользователей и проверяем валидность данных
      const filteredUsers = usersArray
        .filter((user: any) => {
          const userId = user.id || user.user_id;
          // Проверяем, что пользователь не текущий и данные валидны
          if (userId === currentUserId) return false;
          // Проверяем наличие координат
          const lat = parseCoordinate(user.lat);
          const lng = parseCoordinate(user.lng);
          return lat !== null && lng !== null;
        })
        .map((user: any) => ({
          ...user,
          id: user.id || user.user_id,
          // Убеждаемся, что координаты валидны
          lat: parseCoordinate(user.lat),
          lng: parseCoordinate(user.lng),
        }));

      // Всегда обновляем состояние новыми данными из online_users
      // Это гарантирует, что маркеры используют актуальные данные (thoughts, image и т.д.)
      // Используем небольшую задержку для предотвращения крашей при быстрых обновлениях
      isUpdatingDataRef.current = true;
      setTimeout(() => {
        setOnlineUsers(filteredUsers);
        setTimeout(() => {
          isUpdatingDataRef.current = false;
        }, 200);
      }, 50);
    });

    // Очищаем callback при размонтировании (дублирующий cleanup уже есть в первом useEffect)
    return () => {
      setUsersOnlineCallback(null);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
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


  // Используем актуальные данные текущего пользователя из online_users, если они есть
  // Иначе используем данные из userData (при первой загрузке)
  const currentUserData = currentUserFromOnline || userData;
  const userLat = parseCoordinate(currentUserData?.lat);
  const userLng = parseCoordinate(currentUserData?.lng);

  const handleMarkerPress = async (user: any) => {
    const userId = user.id;
    
    // Сразу ищем актуальные данные пользователя в onlineUsers
    // onlineUsers обновляются каждые 3 секунды и содержат свежую информацию
    const actualUser = onlineUsers.find((u: any) => {
      const uId = u.id || u.user_id;
      return uId === userId || String(uId) === String(userId);
    });
    
    // Если нашли актуальные данные в onlineUsers, используем их
    if (actualUser) {
      // Объединяем данные: приоритет у актуальных данных из onlineUsers
      const updatedUser = {
        ...user, // Базовые данные из маркера
        ...actualUser, // Актуальные данные из onlineUsers (перезаписывают старые)
        id: userId, // Сохраняем id
        lat: actualUser.lat || user.lat, // Сохраняем координаты
        lng: actualUser.lng || user.lng,
      };
      setSelectedUser(updatedUser);
    } else {
      // Если пользователя нет в onlineUsers, проверяем messagesUsers
      const userIdKey = Object.keys(messagesUsers).find(id => {
        const msgUser = messagesUsers[id];
        return msgUser && (msgUser.id === userId || String(msgUser.id) === String(userId) || id === String(userId));
      });
      
      if (userIdKey && messagesUsers[userIdKey]) {
        // Объединяем данные из messagesUsers
        const updatedUser = {
          ...user,
          ...messagesUsers[userIdKey],
          id: userId,
          lat: user.lat, // Сохраняем координаты из маркера
          lng: user.lng,
        };
        setSelectedUser(updatedUser);
      } else {
        // Используем данные из маркера как есть
        setSelectedUser(user);
      }
    }
    
    // Дополнительно: запрашиваем свежие данные через API для гарантии актуальности
    // Это полезно если пользователь только что изменил данные
    try {
      const token = await getToken();
      if (token && userId) {
        // Запрашиваем актуальный список пользователей
        const freshUsers = await getUsersOnline(token);
        if (freshUsers) {
          let usersArray: any[] = [];
          
          // Обрабатываем разные форматы ответа
          if (Array.isArray(freshUsers)) {
            usersArray = freshUsers;
          } else if (freshUsers.users && Array.isArray(freshUsers.users)) {
            usersArray = freshUsers.users;
          } else if (freshUsers.data && Array.isArray(freshUsers.data)) {
            usersArray = freshUsers.data;
          }
          
          // Ищем пользователя в свежих данных
          const freshUser = usersArray.find((u: any) => {
            const uId = u.id || u.user_id;
            return uId === userId || String(uId) === String(userId);
          });
          
          // Если нашли свежие данные, обновляем selectedUser
          if (freshUser) {
            setSelectedUser((prevUser: any) => {
              if (!prevUser || (prevUser.id || prevUser.user_id) !== userId) {
                return prevUser; // Если selectedUser изменился, не обновляем
              }
              
              return {
                ...prevUser,
                ...freshUser,
                id: userId,
                lat: freshUser.lat || prevUser.lat,
                lng: freshUser.lng || prevUser.lng,
              };
            });
          }
        }
      }
    } catch (error) {
      console.error('Error fetching fresh user data:', error);
      // Игнорируем ошибку, используем данные которые уже есть
    }
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
        onPress={async () => {
          // Приближаем камеру к точке кластера
          const clusterLat = geometry.coordinates[1];
          const clusterLng = geometry.coordinates[0];
          
          try {
            if (mapViewRef.current?.getCamera) {
              const camera = await mapViewRef.current.getCamera();
              const currentZoom = camera?.zoom || 10;
              
              // Увеличиваем zoom на несколько уровней для раскрытия кластера
              const newZoom = Math.min(currentZoom + 5, 22);
              
              // Вычисляем новый delta на основе zoom
              const baseDelta = 0.01;
              const zoomFactor = Math.pow(2, currentZoom - newZoom);
              const newDelta = baseDelta * zoomFactor;
              
              // Устанавливаем флаг, что происходит раскрытие кластера
              isClusterExpandingRef.current = true;
              
              if (mapViewRef.current?.animateToCamera) {
                mapViewRef.current.animateToCamera({
                  center: {
                    latitude: clusterLat,
                    longitude: clusterLng,
                  },
                  zoom: newZoom,
                }, 500);
                
                // Сохраняем zoom и фиксируем позицию после анимации
                setTimeout(() => {
                  isClusterExpandingRef.current = false;
                  setFixedRegion({
                    latitude: clusterLat,
                    longitude: clusterLng,
                    latitudeDelta: newDelta,
                    longitudeDelta: newDelta,
                  });
                }, 550);
              } else {
                // Fallback: используем очень маленький delta с координатами кластера
                const delta = point_count <= 3 ? 0.000003 : 0.000005;
                mapViewRef.current?.animateToRegion(
                    {
                      latitude: clusterLat,
                      longitude: clusterLng,
                      latitudeDelta: delta,
                      longitudeDelta: delta,
                    },
                    500
                );
                
                // Сохраняем zoom и фиксируем позицию после анимации
                setTimeout(() => {
                  isClusterExpandingRef.current = false;
                  setFixedRegion({
                    latitude: clusterLat,
                    longitude: clusterLng,
                    latitudeDelta: delta,
                    longitudeDelta: delta,
                  });
                }, 550);
              }
            } else {
              // Если getCamera не доступен, используем очень маленький delta
              const delta = point_count <= 3 ? 0.000003 : 0.000005;
              
              isClusterExpandingRef.current = true;
              mapViewRef.current?.animateToRegion(
                  {
                    latitude: clusterLat,
                    longitude: clusterLng,
                    latitudeDelta: delta,
                    longitudeDelta: delta,
                  },
                  500
              );
              
              // Сохраняем zoom и фиксируем позицию после анимации
              setTimeout(() => {
                isClusterExpandingRef.current = false;
                setFixedRegion({
                  latitude: clusterLat,
                  longitude: clusterLng,
                  latitudeDelta: delta,
                  longitudeDelta: delta,
                });
              }, 550);
            }
          } catch (error) {
            // Если произошла ошибка, используем очень маленький delta
            const delta = point_count <= 3 ? 0.000003 : 0.000005;
            
            isClusterExpandingRef.current = true;
            mapViewRef.current?.animateToRegion(
                {
                  latitude: clusterLat,
                  longitude: clusterLng,
                  latitudeDelta: delta,
                  longitudeDelta: delta,
                },
                500
            );
            
            // Сохраняем zoom и фиксируем позицию после анимации
            setTimeout(() => {
              isClusterExpandingRef.current = false;
              setFixedRegion({
                latitude: clusterLat,
                longitude: clusterLng,
                latitudeDelta: delta,
                longitudeDelta: delta,
              });
            }, 550);
          }
        }}
      >
        <View style={mapStyles.clusterContainer}>
          <View style={mapStyles.clusterMarker}>
            <Text style={mapStyles.clusterText}>{point_count}</Text>
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
        // Ищем пользователя в onlineUsers (они содержат самые актуальные данные, обновляются каждые 3 секунды)
        const onlineUser = onlineUsers.find((u: any) => {
          const uId = u.id || u.user_id;
          return uId === userId || String(uId) === String(userId);
        });
        
        // Если пользователь найден в onlineUsers, всегда обновляем данными оттуда (они самые актуальные)
        if (onlineUser) {
          // Создаем объект с актуальными данными
          const updatedUser = {
            ...selectedUser,
            ...onlineUser, // Актуальные данные из onlineUsers имеют приоритет
            id: userId, // Сохраняем id
            lat: onlineUser.lat || selectedUser.lat, // Сохраняем координаты
            lng: onlineUser.lng || selectedUser.lng,
          };
          
          // Проверяем, действительно ли данные изменились
          const fieldsToCheck = ['image', 'name', 'age', 'sex', 'description', 'thoughts', 'is_online'];
          const hasChanges = fieldsToCheck.some(field => {
            const oldValue = selectedUser[field];
            const newValue = onlineUser[field];
            return oldValue !== newValue;
          });
          
          // Обновляем только если данные действительно изменились
          if (hasChanges) {
            setSelectedUser(updatedUser);
          }
        } else {
          // Если пользователя нет в onlineUsers, проверяем messagesUsers
          const userIdKey = Object.keys(messagesUsers).find(id => {
            const msgUser = messagesUsers[id];
            return msgUser && (msgUser.id === userId || String(msgUser.id) === String(userId) || id === String(userId));
          });
          
          if (userIdKey && messagesUsers[userIdKey]) {
            const msgUser = messagesUsers[userIdKey];
            const fieldsToCheck = ['image', 'name', 'age', 'sex', 'description', 'thoughts', 'is_online'];
            const hasChanges = fieldsToCheck.some(field => {
              return msgUser[field] !== selectedUser[field];
            });
            
            if (hasChanges) {
              const updatedUser = {
                ...selectedUser,
                ...msgUser, // Дополняем данными из messagesUsers
                lat: selectedUser.lat, // Сохраняем координаты
                lng: selectedUser.lng,
                id: userId, // Сохраняем id
              };
              setSelectedUser(updatedUser);
            }
          }
        }
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [onlineUsers, messagesUsers]);

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
        <View style={mapStyles.loadingContainer}>
          <ActivityIndicator size="large" />
        </View>
    );
  }

  return (
      <View style={mapStyles.container}>
        {/* Header с иконками профиля, заголовка и сообщений */}
        <View style={mapStyles.header}>
          <Pressable
              style={mapStyles.profileButton}
              onPress={() => router.replace('/profile')}
          >
            {userData?.image ? (
                <Image
                    source={{ uri: getImageUrl(userData.image) || '' }}
                    style={mapStyles.profileIcon}
                    contentFit="cover"
                />
            ) : (
                <View style={[mapStyles.profileIcon, mapStyles.profileIconPlaceholder]}>
                  <View style={mapStyles.profileIconInner} />
                </View>
            )}
          </Pressable>

          <Text style={mapStyles.headerTitle}>People Meet Map</Text>

          <Pressable
              style={mapStyles.messageButton}
              onPress={() => {
                setMessagesVisible(true);
                // Устанавливаем значение в 0, чтобы плашка появилась (translateY = 0)
                slideAnim.value = withSpring(0);
              }}
          >
            <View style={[mapStyles.messageIcon, mapStyles.messageIconPlaceholder]}>
              <Text style={mapStyles.messageIconText}>✉️</Text>
              {unreadMessagesCount > 0 && (
                <View style={mapStyles.messageBadge}>
                  <Text style={mapStyles.messageBadgeText}>
                    {unreadMessagesCount > 99 ? '99+' : unreadMessagesCount}
                  </Text>
                </View>
              )}
            </View>
          </Pressable>
        </View>

        {/* Контент страницы - карта */}
        <View style={mapStyles.content}>
          {userLat !== null && userLng !== null ? (
              <MapView
                  key="main-map" // Стабильный key предотвращает полный перерендер при обновлении данных
                  ref={mapViewRef}
                  provider={PROVIDER_DEFAULT}
                  style={mapStyles.map}
                  initialRegion={{
                    latitude: userLat || 0,
                    longitude: userLng || 0,
                    latitudeDelta: 0.01,
                    longitudeDelta: 0.01,
                  }}
                  // region={fixedRegion || undefined}
                  onRegionChangeComplete={(region) => {
                    // Сохраняем позицию камеры только если это не автоматическое изменение при обновлении данных
                    if (!isUpdatingDataRef.current && !isClusterExpandingRef.current) {
                      currentRegionRef.current = region;
                      isUserInteractingRef.current = true;
                    }
                  }}
                  onPanDrag={() => {
                    // Пользователь перетаскивает карту - снимаем фиксацию позиции
                    setFixedRegion(null);

                  }}
                  onPress={() => {
                    // Пользователь нажал на карту - снимаем фиксацию позиции
                    setFixedRegion(null);

                  }}
                  onMarkerPress={() => {
                    // Пользователь нажал на маркер - снимаем фиксацию позиции
                    setFixedRegion(null);
                  }}
                  showsUserLocation={false}
                  showsMyLocationButton={false}
                  radius={10}
                  extent={512}
                  minZoom={5}
                  maxZoom={22}
                  minPoints={3}
                  edgePadding={{ top: 50, left: 50, bottom: 50, right: 50 }}
                  renderCluster={renderCluster}
                  preserveClusterPressBehavior={true}
                  clusterColor="#4ECDC4"
                  clusterTextColor="#fff"
                  clusterFontFamily="System"
                  onMapReady={() => {
                    // При готовности карты сохраняем начальную позицию
                    if (mapViewRef.current?.getCamera) {
                      mapViewRef.current.getCamera().then((camera: any) => {
                        if (camera?.center) {
                          currentRegionRef.current = {
                            latitude: camera.center.latitude,
                            longitude: camera.center.longitude,
                            latitudeDelta: 0.01,
                            longitudeDelta: 0.01,
                          };
                        }
                      }).catch(() => {});
                    }
                  }}
              >
                {/* Маркер текущего пользователя - используем актуальные данные из online_users */}
                {currentUserData && userLat !== null && userLng !== null && (
                  <Marker
                      key={`self-${currentUserData?.thoughts || ''}-${currentUserData?.image || ''}-${currentUserData?.id || ''}`}
                      coordinate={{
                        latitude: userLat,
                        longitude: userLng,
                      }}
                      onPress={() => handleMarkerPress(currentUserData)}
                      tracksViewChanges={true} // TODO 1
                  >
                    <View style={mapStyles.markerContainer}>
                      {currentUserData?.image ? (
                          <Image
                              source={{ uri: getImageUrl(currentUserData.image) || '' }}
                              style={mapStyles.markerAvatar}
                              contentFit="cover"
                          />
                      ) : (
                          <View style={[mapStyles.markerAvatar, mapStyles.markerAvatarPlaceholder]}>
                            <View style={mapStyles.markerAvatarInner} />
                          </View>
                      )}
                      {currentUserData?.thoughts && (
                        <Text style={mapStyles.markerThoughts} numberOfLines={2}>
                          {currentUserData.thoughts}
                        </Text>
                      )}
                    </View>
                  </Marker>
                )}

                {/* Маркеры других онлайн пользователей */}
                {onlineUsers
                  .filter((user: any) => {
                    // Фильтруем только пользователей с валидными координатами
                    const lat = parseCoordinate(user.lat);
                    const lng = parseCoordinate(user.lng);
                    return lat !== null && lng !== null && user.id !== undefined;
                  })
                  .map((user: any) => {
                  const userLat = parseCoordinate(user.lat);
                  const userLng = parseCoordinate(user.lng);
                  const userId = String(user.id || user.user_id || `user-${user.lat}-${user.lng}`);
                  
                  // Дополнительная проверка на валидность координат
                  if (userLat === null || userLng === null || !userId) {
                    return null;
                  }
                  
                  // Используем актуальные данные из onlineUsers (они обновляются каждые 3 секунды)
                  // onlineUsers содержит самые свежие данные (thoughts, image, name, age и т.д.)
                  const actualUser = user; // onlineUsers уже содержит актуальные данные
                  
                  // Генерируем уникальный цвет для маркера на основе данных пользователя
                  const markerColor = getUserMarkerColor(actualUser);
                  
                  // Создаем ключ, который включает изменяемые поля для перерисовки маркера при изменении
                  const markerKey = `${userId}-${actualUser.thoughts || ''}-${actualUser.image || ''}-${actualUser.name || ''}`;
                  
                  return (
                      <Marker
                          key={markerKey}
                          identifier={String(userId)}
                          coordinate={{
                            latitude: userLat,
                            longitude: userLng,
                          }}
                          onPress={() => handleMarkerPress(actualUser)}
                          tracksViewChanges={true}
                      >
                          <View style={mapStyles.markerContainer}>
                              {actualUser.image ? (
                                  <Image
                                      source={{ uri: getImageUrl(actualUser.image) || '' }}
                                      style={[mapStyles.otherUserMarkerAvatar, { borderColor: markerColor }]}
                                      contentFit="cover"
                                  />
                              ) : (
                                  <View style={[mapStyles.otherUserMarkerAvatar, mapStyles.markerAvatarPlaceholder, { borderColor: markerColor }]}>
                                      <View style={mapStyles.markerAvatarInner} />
                                  </View>
                              )}
                              {actualUser?.thoughts && (
                                <Text style={mapStyles.markerThoughts} numberOfLines={2}>
                                  {actualUser.thoughts}
                                </Text>
                              )}
                          </View>
                      </Marker>
                  );
                })}
              </MapView>
          ) : (
              <View style={mapStyles.emptyContent}>
                <Text style={mapStyles.emptyText}>Координаты не доступны</Text>
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
            <View style={mapStyles.userCardBackdrop}>
              <TouchableWithoutFeedback onPress={(e) => e.stopPropagation()}>
                <View style={mapStyles.userCard}>
                  {/* Кнопка закрытия */}
                  <Pressable
                    style={mapStyles.userCardCloseButton}
                    onPress={handleCloseUserCard}
                  >
                    <Text style={mapStyles.userCardCloseText}>✕</Text>
                  </Pressable>

                  {/* Фото пользователя */}
                  <View style={mapStyles.userCardImageContainer}>
                    {selectedUser?.image ? (
                      <Image
                        source={{ uri: getImageUrl(selectedUser.image) || '' }}
                        style={mapStyles.userCardImage}
                        contentFit="cover"
                      />
                    ) : (
                      <View style={[mapStyles.userCardImage, mapStyles.userCardImagePlaceholder]}>
                        <View style={mapStyles.userCardImageInner} />
                      </View>
                    )}
                  </View>

                  {/* Информация о пользователе */}
                  <ScrollView style={mapStyles.userCardContent} showsVerticalScrollIndicator={false}>
                    <Text style={mapStyles.userCardName}>
                      {selectedUser?.name || 'Имя не указано'}
                    </Text>
                    
                    <Text style={mapStyles.userCardInfo}>
                      Age - {selectedUser?.age || 'не указан'}
                    </Text>
                    
                    <Text style={mapStyles.userCardInfo}>
                      Sex - {selectedUser?.sex || 'не указан'}
                    </Text>
                    
                    {userLat !== null && userLng !== null && selectedUser?.lat && selectedUser?.lng && 
                     selectedUser?.id !== userData?.id && (
                      <Text style={mapStyles.userCardInfo}>
                        Distance: {calculateDistance(
                          userLat,
                          userLng,
                          parseCoordinate(selectedUser.lat) || 0,
                          parseCoordinate(selectedUser.lng) || 0
                      )}
                      </Text>
                    )}
                    
                    {selectedUser?.description && (
                      <View style={mapStyles.userCardDescriptionContainer}>
                        <Text style={mapStyles.userCardDescriptionLabel}>Description:</Text>
                        <Text style={mapStyles.userCardDescription}>
                          {selectedUser.description}
                        </Text>
                      </View>
                    )}
                  </ScrollView>

                  {/* Кнопка Write или текст "It's you" */}
                  {selectedUser?.id === userData?.id ? (
                    <View style={mapStyles.userCardItsYouContainer}>
                      <Text style={mapStyles.userCardItsYouText}>It&apos;s you</Text>
                    </View>
                  ) : (
                    <Pressable
                      style={mapStyles.userCardWriteButton}
                      onPress={handleWrite}
                    >
                      <Text style={mapStyles.userCardWriteButtonText}>WRITE</Text>
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


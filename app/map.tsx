import { getToken } from '@/services/auth';
import { getSelf, readMessages, sendMessage } from '@/services/api';
import { enableUsersOnlinePolling, disableUsersOnlinePolling, setUsersOnlineCallback } from '@/services/usersOnlineInterval';
import { startMessagesInterval, setMessagesCallback } from '@/services/messagesInterval';
import { Image } from 'expo-image';
import { router } from 'expo-router';
import { useEffect, useState, useRef } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, View, Text, Modal, TouchableWithoutFeedback, ScrollView, TextInput } from 'react-native';
import Animated, { useSharedValue, useAnimatedStyle, withTiming, withSpring } from 'react-native-reanimated';
import MapView, { Marker, PROVIDER_DEFAULT } from 'react-native-maps';

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
  const slideAnim = useSharedValue(1); // Начальное значение 1 = плашка скрыта внизу
  const avatarAnim = useSharedValue({ x: 0, y: 0, scale: 1 });
  const userIdRef = useRef<number | null>(null);
  const scrollViewRef = useRef<ScrollView>(null);

  // Анимированный стиль для плашки сообщений (должен быть на верхнем уровне)
  const messagesSheetStyle = useAnimatedStyle(() => {
    return {
      transform: [{ translateY: slideAnim.value * 600 }], // Увеличено с 400 до 500 для более высокого открытия
    };
  });

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
      
      console.log('MapScreen: Filtered online users:', filteredUsers.length);
      console.log('MapScreen: Users data:', filteredUsers.map(u => ({ id: u.id || u.user_id, name: u.name, lat: u.lat, lng: u.lng })));
      
      // Всегда обновляем состояние, даже если количество не изменилось
      // Это гарантирует актуальность координат и других данных
      setOnlineUsers(filteredUsers);
    });

    // Очищаем callback при размонтировании (дублирующий cleanup уже есть в первом useEffect)
    return () => {
      setUsersOnlineCallback(null);
    };
  }, []);

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
      let usersWithUnreadCount = 0;
      
      Object.keys(messages).forEach((userId) => {
        const userMessages = messages[userId] || [];
        // Проверяем, есть ли хотя бы одно непрочитанное сообщение (is_read: 0)
        const hasUnread = Array.isArray(userMessages) && userMessages.some((message) => {
          return message && message.is_read === 0;
        });
        
        if (hasUnread) {
          usersWithUnreadCount++;
        }
      });
      
      setUnreadMessagesCount(usersWithUnreadCount);
      
      // Сохраняем данные о пользователях и сообщениях
      const users = messagesData.users || {};
      setMessagesUsers(users);
      setMessagesData(messagesData);
      
      // Если чат открыт с пользователем, проверяем есть ли новые непрочитанные сообщения
      if (selectedChatUser && selectedChatUser.id) {
        const messages = messagesData.messages || {};
        // Находим userId по ключу в messagesUsers
        const userId = Object.keys(users).find(id => {
          const user = users[id];
          return user?.id === selectedChatUser.id || id === String(selectedChatUser.id);
        }) || String(selectedChatUser.id);
        
        const userMessages = messages[userId] || [];
        // Проверяем, есть ли непрочитанные сообщения от этого пользователя
        const hasUnread = Array.isArray(userMessages) && userMessages.some((message) => {
          return message && message.is_read === 0;
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
        
        // Автоскролл вниз при новых сообщениях
        setTimeout(() => {
          scrollViewRef.current?.scrollToEnd({ animated: true });
        }, 100);
      }
    });

    // Очищаем callback при размонтировании
    return () => {
      setMessagesCallback(null);
    };
  }, [selectedChatUser]);

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

  const handleCloseUserCard = () => {
    setSelectedUser(null);
  };

  const handleWrite = () => {
    // TODO: Реализовать отправку сообщения
    console.log('Write to user:', selectedUser?.id);
    // Закрываем карточку после нажатия
    handleCloseUserCard();
  };

  // Функция для подсчета непрочитанных сообщений от конкретного пользователя
  const getUnreadCountForUser = (userId: string | number): number => {
    const messages = messagesData.messages || {};
    const userMessages = messages[userId] || [];
    
    // Подсчитываем сообщения с is_read: 0
    if (!Array.isArray(userMessages)) {
      return 0;
    }
    
    return userMessages.filter((message) => message && message.is_read === 0).length;
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
  const handleOpenChat = async (userId: string | number) => {
    const user = messagesUsers[userId];
    if (user) {
      setSelectedChatUser(user);
      
      // Отправляем запрос о прочтении сообщений
      try {
        const token = await getToken();
        if (token && user.id) {
          const result = await readMessages(token, user.id);
          if (result.status === 'success') {
            console.log('Messages marked as read for user:', user.id);
            
            // Обновляем локальное состояние сообщений, помечая их как прочитанные
            setMessagesData((prevData: any) => {
              const updatedData = { ...prevData };
              const messages = updatedData.messages || {};
              const userMessages = messages[userId] || [];
              
              // Помечаем все сообщения от этого пользователя как прочитанные
              if (Array.isArray(userMessages)) {
                userMessages.forEach((message) => {
                  if (message) {
                    message.is_read = 1;
                  }
                });
              }
              
              return updatedData;
            });
            
            // Пересчитываем количество непрочитанных сообщений
            const messages = messagesData.messages || {};
            const usersCount = Object.keys(messages).filter((uid) => {
              const userMsgs = messages[uid] || [];
              if (!Array.isArray(userMsgs)) {
                return false;
              }
              return userMsgs.some((message) => message && message.is_read === 0);
            }).length;
            setUnreadMessagesCount(usersCount);
          }
        }
      } catch (error) {
        console.error('Error marking messages as read:', error);
      }
    }
  };

  // Функция для возврата к списку пользователей
  const handleBackToUsers = () => {
    setSelectedChatUser(null);
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
              >
                <Marker
                    coordinate={{
                      latitude: userLat,
                      longitude: userLng,
                    }}
                    onPress={() => handleMarkerPress(userData)}
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
                  
                  return (
                      <Marker
                          key={userId}
                          identifier={String(userId)}
                          coordinate={{
                            latitude: userLat,
                            longitude: userLng,
                          }}
                          onPress={() => handleMarkerPress(user)}
                      >
                          <View style={styles.markerContainer}>
                              {user.image ? (
                                  <Image
                                      source={{ uri: getImageUrl(user.image) || '' }}
                                      style={styles.otherUserMarkerAvatar}
                                      contentFit="cover"
                                  />
                              ) : (
                                  <View style={[styles.otherUserMarkerAvatar, styles.markerAvatarPlaceholder]}>
                                      <View style={styles.markerAvatarInner} />
                                  </View>
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
                    
                    {selectedUser?.thoughts && (
                      <View style={styles.userCardThoughtsContainer}>
                        <Text style={styles.userCardThoughts}>
                          {selectedUser.thoughts}
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
        <Modal
            visible={messagesVisible}
            transparent={true}
            animationType="none"
            onRequestClose={() => {
              slideAnim.value = withTiming(1, { duration: 300 });
              setTimeout(() => setMessagesVisible(false), 300);
            }}
        >
          <TouchableWithoutFeedback
              onPress={() => {
                slideAnim.value = withTiming(1, { duration: 300 });
                setTimeout(() => setMessagesVisible(false), 300);
              }}
          >
            <View style={styles.messagesBackdrop}>
              <TouchableWithoutFeedback onPress={(e) => e.stopPropagation()}>
                <Animated.View style={[styles.messagesSheet, messagesSheetStyle]}>
                  <View style={styles.messagesHeader}>
                    {selectedChatUser ? (
                      <>
                        <Pressable
                          style={styles.messagesBackButton}
                          onPress={handleBackToUsers}
                        >
                          <Text style={styles.messagesBackButtonText}>←</Text>
                        </Pressable>
                        <View style={styles.messagesHeaderAvatarContainer}>
                          {(() => {
                            // Находим актуального пользователя из messagesUsers для получения актуального is_online
                            const userId = Object.keys(messagesUsers).find(id => {
                              const user = messagesUsers[id];
                              return user?.id === selectedChatUser?.id || id === String(selectedChatUser?.id);
                            });
                            const actualUser = userId ? messagesUsers[userId] : selectedChatUser;
                            const isOnline = actualUser?.is_online === 1;
                            
                            return selectedChatUser?.image ? (
                              <Image
                                source={{ uri: getImageUrl(selectedChatUser.image) || '' }}
                                style={[
                                  styles.messagesHeaderAvatar,
                                  { borderColor: isOnline ? '#4ECDC4' : '#FF6B6B' }
                                ]}
                                contentFit="cover"
                              />
                            ) : (
                              <View style={[
                                styles.messagesHeaderAvatar,
                                styles.messagesHeaderAvatarPlaceholder,
                                { borderColor: isOnline ? '#4ECDC4' : '#FF6B6B' }
                              ]}>
                                <View style={styles.messagesHeaderAvatarInner} />
                              </View>
                            );
                          })()}
                        </View>
                        <Text style={styles.messagesTitle}>
                          {selectedChatUser?.name || 'Пользователь'}
                        </Text>
                      </>
                    ) : (
                      <Text style={styles.messagesTitle}>Сообщения1</Text>
                    )}
                    <Pressable
                        onPress={() => {
                          setSelectedChatUser(null);
                          slideAnim.value = withTiming(1, { duration: 300 });
                          setTimeout(() => setMessagesVisible(false), 300);
                        }}
                    >
                      <Text style={styles.messagesCloseButton}>✕</Text>
                    </Pressable>
                  </View>
                  {selectedChatUser ? (
                    <>
                      <ScrollView 
                        ref={scrollViewRef}
                        style={styles.messagesContent}
                        onContentSizeChange={() => {
                          scrollViewRef.current?.scrollToEnd({ animated: true });
                        }}
                      >
                        {(() => {
                          // Находим userId по ключу в messagesUsers
                          const userId = Object.keys(messagesUsers).find(id => {
                            const user = messagesUsers[id];
                            return user?.id === selectedChatUser.id || id === String(selectedChatUser.id);
                          }) || selectedChatUser.id;
                          const chatMessages = userId ? getMessagesForUser(userId) : [];
                          
                          return chatMessages.length === 0 ? (
                            <Text style={styles.messagesEmptyText}>Нет сообщений</Text>
                          ) : (
                            chatMessages.map((message: any, index: number) => {
                              const isFromCurrentUser = message.sender_id === userData?.id;
                              return (
                                <View
                                  key={message.id || index}
                                  style={[
                                    styles.chatMessage,
                                    isFromCurrentUser ? styles.chatMessageSent : styles.chatMessageReceived
                                  ]}
                                >
                                  <Text style={[
                                    styles.chatMessageText,
                                    isFromCurrentUser ? styles.chatMessageTextSent : styles.chatMessageTextReceived
                                  ]}>
                                    {message.message_text || ''}
                                  </Text>
                                </View>
                              );
                            })
                          );
                        })()}
                      </ScrollView>
                      <View style={styles.chatInputContainer}>
                        <TextInput
                          style={styles.chatInput}
                          value={messageText}
                          onChangeText={setMessageText}
                          placeholder="Введите сообщение..."
                          placeholderTextColor="#999"
                          multiline
                          onSubmitEditing={handleSendMessage}
                        />
                        <Pressable
                          style={[styles.chatSendButton, (!messageText.trim() || sendingMessage) && styles.chatSendButtonDisabled]}
                          onPress={handleSendMessage}
                          disabled={!messageText.trim() || sendingMessage}
                        >
                          {sendingMessage ? (
                            <ActivityIndicator size="small" color="#fff" />
                          ) : (
                            <Text style={styles.chatSendButtonText}>Отправить</Text>
                          )}
                        </Pressable>
                      </View>
                    </>
                  ) : (
                    <ScrollView style={styles.messagesContent}>
                      {Object.keys(messagesUsers).length === 0 ? (
                        <Text style={styles.messagesEmptyText}>Здесь будут ваши сообщения</Text>
                      ) : (
                        Object.keys(messagesUsers).map((userId) => {
                          const user = messagesUsers[userId];
                          return (
                            <Pressable
                              key={userId}
                              style={styles.messageUserItem}
                              onPress={() => handleOpenChat(userId)}
                            >
                              <View style={styles.messageUserAvatarContainer}>
                                {user?.image ? (
                                  <Image
                                    source={{ uri: getImageUrl(user.image) || '' }}
                                    style={[
                                      styles.messageUserAvatar,
                                      { borderColor: user?.is_online === 1 ? '#4ECDC4' : '#FF6B6B' }
                                    ]}
                                    contentFit="cover"
                                  />
                                ) : (
                                  <View style={[
                                    styles.messageUserAvatar,
                                    styles.messageUserAvatarPlaceholder,
                                    { borderColor: user?.is_online === 1 ? '#4ECDC4' : '#FF6B6B' }
                                  ]}>
                                    <View style={styles.messageUserAvatarInner} />
                                  </View>
                                )}
                                {getUnreadCountForUser(userId) > 0 && (
                                  <View style={[
                                    styles.messageUserBadge,
                                    { backgroundColor: user?.is_online === 1 ? '#4ECDC4' : '#FF6B6B' }
                                  ]}>
                                    <Text style={styles.messageUserBadgeText}>
                                      {getUnreadCountForUser(userId) > 99 ? '99+' : getUnreadCountForUser(userId)}
                                    </Text>
                                  </View>
                                )}
                              </View>
                              <Text style={styles.messageUserName}>
                                {user?.name || 'Пользователь'}
                              </Text>
                            </Pressable>
                          );
                        })
                      )}
                    </ScrollView>
                  )}
                </Animated.View>
              </TouchableWithoutFeedback>
            </View>
          </TouchableWithoutFeedback>
        </Modal>
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
    borderWidth: 2,
    borderColor: '#FF6B6B',
    backgroundColor: '#fff',
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
  messagesContent: {
    flex: 1,
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
    borderBottomColor: '#f0f0f0',
    borderColor: 'red',
    borderWidth: 1,
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
    marginBottom: 10,
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
});


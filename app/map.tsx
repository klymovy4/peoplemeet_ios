import { getToken } from '@/services/auth';
import { getSelf } from '@/services/api';
import { enableUsersOnlinePolling, disableUsersOnlinePolling, setUsersOnlineCallback } from '@/services/usersOnlineInterval';
import { startMessagesInterval } from '@/services/messagesInterval';
import { Image } from 'expo-image';
import { router } from 'expo-router';
import { useEffect, useState, useRef } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, View, Text, Modal, TouchableWithoutFeedback, ScrollView } from 'react-native';
import Animated, { useSharedValue, useAnimatedStyle, withTiming, withSpring } from 'react-native-reanimated';
import MapView, { Marker, PROVIDER_DEFAULT } from 'react-native-maps';

export default function MapScreen() {
  const [userData, setUserData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [messagesVisible, setMessagesVisible] = useState(false);
  const [onlineUsers, setOnlineUsers] = useState<any[]>([]);
  const [selectedUser, setSelectedUser] = useState<any | null>(null);
  const slideAnim = useSharedValue(1); // Начальное значение 1 = плашка скрыта внизу
  const userIdRef = useRef<number | null>(null);

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
                    title="Вы здесь"
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
                          title={user.name || 'Пользователь'}
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
                    
                    {userLat !== null && userLng !== null && selectedUser?.lat && selectedUser?.lng && (
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

                  {/* Кнопка Write */}
                  <Pressable
                    style={styles.userCardWriteButton}
                    onPress={handleWrite}
                  >
                    <Text style={styles.userCardWriteButtonText}>WRITE</Text>
                  </Pressable>
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
                    <Text style={styles.messagesTitle}>Сообщения1</Text>
                    <Pressable
                        onPress={() => {
                          slideAnim.value = withTiming(1, { duration: 300 });
                          setTimeout(() => setMessagesVisible(false), 300);
                        }}
                    >
                      <Text style={styles.messagesCloseButton}>✕</Text>
                    </Pressable>
                  </View>
                  <ScrollView style={styles.messagesContent}>
                    <Text style={styles.messagesEmptyText}>Здесь будут ваши сообщения</Text>
                  </ScrollView>
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
  },
  messageIconPlaceholder: {
    backgroundColor: '#e0e0e0',
    justifyContent: 'center',
    alignItems: 'center',
  },
  messageIconText: {
    fontSize: 24,
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
    borderBottomWidth: 1,
    borderBottomColor: '#e0e0e0',
  },
  messagesTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#333',
  },
  messagesCloseButton: {
    fontSize: 24,
    color: '#666',
    fontWeight: 'bold',
  },
  messagesContent: {
    flex: 1,
    padding: 16,
  },
  messagesEmptyText: {
    textAlign: 'center',
    color: '#999',
    fontSize: 16,
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
});


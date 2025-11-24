import { getToken } from '@/services/auth';
import { getSelf } from '@/services/api';
import { enableUsersOnlinePolling, disableUsersOnlinePolling } from '@/services/usersOnlineInterval';
import { startMessagesInterval } from '@/services/messagesInterval';
import { Image } from 'expo-image';
import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, View, Text, Modal, TouchableWithoutFeedback, ScrollView } from 'react-native';
import Animated, { useSharedValue, useAnimatedStyle, withTiming, withSpring } from 'react-native-reanimated';

export default function MapScreen() {
  const [userData, setUserData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [messagesVisible, setMessagesVisible] = useState(false);
  const slideAnim = useSharedValue(1); // Начальное значение 1 = плашка скрыта внизу
  
  // Анимированный стиль для плашки сообщений (должен быть на верхнем уровне)
  const messagesSheetStyle = useAnimatedStyle(() => {
    return {
      transform: [{ translateY: slideAnim.value * 600 }], // Увеличено с 400 до 500 для более высокого открытия
    };
  });

  useEffect(() => {
    checkAuth();
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
        disableUsersOnlinePolling();
        router.replace('/profile');
        return;
      }
      
      // Если пользователь онлайн, запускаем запросы пользователей
      const onlineStatus = result.data.is_online === 1;
      if (onlineStatus) {
        enableUsersOnlinePolling();
      } else {
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

      {/* Контент страницы - пока пустой */}
      <View style={styles.content}>
        <View style={styles.emptyContent}>
          {/* Здесь будет контент карты/пользователей */}
        </View>
      </View>

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
  emptyContent: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
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
});


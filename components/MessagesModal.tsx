import React, { useRef, useState } from 'react';
import { View, StyleSheet, Modal, Pressable, Text, ScrollView, TextInput, ActivityIndicator, TouchableWithoutFeedback, Alert } from 'react-native';
import Animated, { useSharedValue, useAnimatedStyle, withTiming } from 'react-native-reanimated';
import { Image } from 'expo-image';
import Toast from 'react-native-toast-message';
import { removeConversation } from '@/services/api';

interface MessagesModalProps {
  visible: boolean;
  slideAnim: ReturnType<typeof useSharedValue<number>>;
  messagesUsers: any;
  messagesData: any;
  selectedChatUser: any | null;
  showUserInfo: boolean;
  messageText: string;
  sendingMessage: boolean;
  removingConversation?: boolean;
  userData: any;
  scrollViewRef: React.RefObject<ScrollView | null>;
  lastMessageCountRef: React.MutableRefObject<number>;
  onClose: () => void;
  onBackToUsers: () => void;
  onSetShowUserInfo: (show: boolean) => void;
  onSetSelectedChatUser: (user: any | null) => void;
  onSetMessageText: (text: string) => void;
  onSendMessage: () => void;
  onRemoveConversation?: () => void;
  onShowOnMap?: (userId: number) => void;
  getImageUrl: (imageName: string | null | undefined) => string | null;
  getUnreadCountForUser: (userId: string | number) => number;
  getMessagesForUser: (userId: string | number) => any[];
  formatMessageTime: (createdAt: string | null | undefined) => string;
  title?: string;
  // Функции для работы с сообщениями
  getToken: () => Promise<string | null>;
  readMessages: (token: string, userId: number) => Promise<any>;
  setMessagesData: React.Dispatch<React.SetStateAction<any>>;
  setUnreadMessagesCount: React.Dispatch<React.SetStateAction<number>>;
  onlineUsers?: any[]; // Массив онлайн пользователей из get_users/online_users
}

export default function MessagesModal({
  visible,
  slideAnim,
  messagesUsers,
  messagesData,
  selectedChatUser,
  showUserInfo,
  messageText,
  sendingMessage,
  removingConversation = false,
  userData,
  scrollViewRef,
  lastMessageCountRef,
  onClose,
  onBackToUsers,
  onSetShowUserInfo,
  onSetSelectedChatUser,
  onSetMessageText,
  onSendMessage,
  onRemoveConversation,
  onShowOnMap,
  getImageUrl,
  getUnreadCountForUser,
  getMessagesForUser,
  formatMessageTime,
  title = 'Сообщения  ',
  getToken,
  readMessages,
  setMessagesData,
  setUnreadMessagesCount,
  onlineUsers = [],
}: MessagesModalProps) {
  // Внутреннее состояние для удаления переписки (если не передано извне)
  const [internalRemovingConversation, setInternalRemovingConversation] = useState(false);
  const isRemovingConversation = removingConversation !== undefined ? removingConversation : internalRemovingConversation;

  const messagesSheetStyle = useAnimatedStyle(() => {
    return {
      transform: [{ translateY: slideAnim.value * 600 }],
    };
  });

  const handleClose = () => {
    slideAnim.value = withTiming(1, { duration: 300 });
    setTimeout(() => {
      onClose();
    }, 300);
  };

  const handleBack = () => {
    if (showUserInfo) {
      onSetShowUserInfo(false);
    } else {
      onBackToUsers();
    }
  };

  // Функция для получения актуального пользователя из messagesUsers или onlineUsers
  // messagesUsers содержит данные из get_messages.users[id] - это актуальная информация о пользователе
  // onlineUsers содержит данные из get_users/online_users - пользователи которые онлайн
  const getActualUser = () => {
    if (!selectedChatUser) return null;
    
    const userId = Object.keys(messagesUsers).find(id => {
      const user = messagesUsers[id];
      return user && (user.id === selectedChatUser.id || 
                      String(user.id) === String(selectedChatUser.id) || 
                      id === String(selectedChatUser.id));
    });
    
    // Если пользователь найден в messagesUsers, используем его данные (актуальные из get_messages)
    if (userId && messagesUsers[userId]) {
      return messagesUsers[userId];
    }
    
    // Если пользователя нет в messagesUsers, проверяем onlineUsers
    // Если пользователь есть в onlineUsers, значит он онлайн
    const onlineUser = onlineUsers.find((u: any) => {
      const uId = u.id || u.user_id;
      return uId === selectedChatUser.id || String(uId) === String(selectedChatUser.id);
    });
    
    if (onlineUser) {
      // Пользователь онлайн, используем данные из onlineUsers и помечаем как онлайн
      return {
        ...selectedChatUser,
        ...onlineUser,
        is_online: 1, // Помечаем как онлайн, так как он есть в onlineUsers
      };
    }
    
    // Иначе используем selectedChatUser как fallback
    return selectedChatUser;
  };

  // Универсальная функция удаления переписки
  const handleRemoveConversation = async () => {
    if (isRemovingConversation) {
      return;
    }

    const actualUser = getActualUser();
    const targetUserId = actualUser?.id || selectedChatUser?.id;

    if (!targetUserId) {
      Toast.show({
        type: 'error',
        text1: 'Ошибка',
        text2: 'Пользователь не выбран',
      });
      return;
    }

    // Показываем подтверждение перед удалением
    Alert.alert(
      'Удалить переписку',
      'Вы уверены, что хотите удалить переписку с этим пользователем? Это действие нельзя отменить.',
      [
        {
          text: 'Отмена',
          style: 'cancel',
        },
        {
          text: 'Удалить',
          style: 'destructive',
          onPress: async () => {
            try {
              if (removingConversation === undefined) {
                setInternalRemovingConversation(true);
              }
              
              const token = await getToken();
              if (!token || !targetUserId) {
                if (removingConversation === undefined) {
                  setInternalRemovingConversation(false);
                }
                return;
              }

              const result = await removeConversation(token, targetUserId);
              
              if (result.status === 'success') {
                Toast.show({
                  type: 'success',
                  text1: 'Успешно',
                  text2: 'Переписка удалена',
                });
                
                // Закрываем модальное окно сообщений
                slideAnim.value = withTiming(1, { duration: 300 });
                setTimeout(() => {
                  onClose();
                  onSetSelectedChatUser(null);
                  onSetShowUserInfo(false);
                }, 300);
                
                // Обновляем данные сообщений
                setMessagesData({});
                setUnreadMessagesCount(0);
              } else {
                Toast.show({
                  type: 'error',
                  text1: 'Ошибка',
                  text2: result?.data?.message || 'Не удалось удалить переписку',
                });
              }
            } catch (error) {
              console.error('Error removing conversation:', error);
              Toast.show({
                type: 'error',
                text1: 'Ошибка',
                text2: 'Не удалось удалить переписку',
              });
            } finally {
              if (removingConversation === undefined) {
                setInternalRemovingConversation(false);
              }
            }
          },
        },
      ]
    );
  };

  // Функция для открытия чата с пользователем и пометки сообщений как прочитанных
  const handleOpenChat = async (userId: string | number) => {
    const user = messagesUsers[userId];
    if (user) {
      onSetSelectedChatUser(user);
      onSetShowUserInfo(false); // Сбрасываем показ информации при открытии нового чата
      
      // Сбрасываем счетчик сообщений при открытии нового чата
      lastMessageCountRef.current = 0;
      
      // Прокручиваем вниз при открытии чата
      setTimeout(() => {
        scrollViewRef.current?.scrollToEnd({ animated: true });
      }, 300);
      
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
              
              // Помечаем все входящие сообщения от этого пользователя как прочитанные
              if (Array.isArray(userMessages)) {
                const userIdNum = typeof userId === 'string' ? parseInt(userId, 10) : userId;
                userMessages.forEach((message) => {
                  if (message && message.sender_id === userIdNum) {
                    message.is_read = 1;
                  }
                });
              }
              
              // Пересчитываем количество непрочитанных пользователей сразу
              let usersWithUnreadCount = 0;
              Object.keys(messages).forEach((uid) => {
                const userMsgs = messages[uid] || [];
                const uidNum = parseInt(uid, 10);
                
                if (Array.isArray(userMsgs)) {
                  const hasUnread = userMsgs.some((message) => {
                    return message && 
                           message.sender_id === uidNum && 
                           message.is_read === 0;
                  });
                  
                  if (hasUnread) {
                    usersWithUnreadCount++;
                  }
                }
              });
              
              // Обновляем счетчик непрочитанных сразу
              setUnreadMessagesCount(usersWithUnreadCount);
              
              return updatedData;
            });
          }
        }
      } catch (error) {
        console.error('Error marking messages as read:', error);
      }
    }
  };

  return (
    <Modal
      visible={visible}
      transparent={true}
      animationType="none"
      onRequestClose={handleClose}
    >
      <View style={styles.messagesBackdrop} pointerEvents="box-none">
        <TouchableWithoutFeedback onPress={handleClose}>
          <View style={StyleSheet.absoluteFill} />
        </TouchableWithoutFeedback>
        <View pointerEvents="box-none" style={{ flex: 1, justifyContent: 'flex-end' }}>
          <Animated.View style={[styles.messagesSheet, messagesSheetStyle]} pointerEvents="auto">
            <View style={styles.messagesSheetInner}>
              <View style={styles.messagesHeader}>
                {selectedChatUser ? (
                  <>
                    <Pressable style={styles.messagesBackButton} onPress={handleBack}>
                      <Text style={styles.messagesBackButtonText}>←</Text>
                    </Pressable>
                    <Pressable
                      style={styles.messagesHeaderAvatarContainer}
                      onPress={() => onSetShowUserInfo(true)}
                    >
                      {(() => {
                        // Используем актуальные данные из messagesUsers или onlineUsers
                        const actualUser = getActualUser();
                        // Если is_online === 1 или пользователь найден в onlineUsers, значит онлайн
                        const isOnline = actualUser?.is_online === 1 || 
                          (onlineUsers.some((u: any) => {
                            const uId = u.id || u.user_id;
                            return uId === actualUser?.id || String(uId) === String(actualUser?.id);
                          }));
                        
                        return actualUser?.image ? (
                          <Image
                            source={{ uri: getImageUrl(actualUser.image) || '' }}
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
                    </Pressable>
                    <Text style={styles.messagesTitle}>
                      {(() => {
                        const actualUser = getActualUser();
                        return actualUser?.name || 'Пользователь';
                      })()}
                    </Text>
                  </>
                ) : (
                  <Text style={styles.messagesTitle}>{title}</Text>
                )}
                <Pressable onPress={handleClose}>
                  <Text style={styles.messagesCloseButton}>✕</Text>
                </Pressable>
              </View>
              
              {selectedChatUser ? (
                showUserInfo ? (
                  <ScrollView style={styles.userInfoContainer} contentContainerStyle={styles.userInfoContent}>
                    {(() => {
                      // Используем актуальные данные из messagesUsers или onlineUsers
                      const actualUser = getActualUser();
                      // Если is_online === 1 или пользователь найден в onlineUsers, значит онлайн
                      const isOnline = actualUser?.is_online === 1 || 
                        (onlineUsers.some((u: any) => {
                          const uId = u.id || u.user_id;
                          return uId === actualUser?.id || String(uId) === String(actualUser?.id);
                        }));
                      
                      return (
                        <>
                          <View style={styles.userInfoImageContainer}>
                            {actualUser?.image ? (
                              <Image
                                source={{ uri: getImageUrl(actualUser.image) || '' }}
                                style={[
                                  styles.userInfoImage,
                                  { borderColor: isOnline ? '#4ECDC4' : '#FF6B6B' }
                                ]}
                                contentFit="cover"
                              />
                            ) : (
                              <View style={[
                                styles.userInfoImage,
                                styles.userInfoImagePlaceholder,
                                { borderColor: isOnline ? '#4ECDC4' : '#FF6B6B' }
                              ]}>
                                <View style={styles.userInfoImageInner} />
                              </View>
                            )}
                          </View>
                          
                          <View style={styles.userInfoDetails}>
                            <Text style={styles.userInfoName}>
                              {actualUser?.name || 'Имя не указано'}
                            </Text>
                            
                            <View style={styles.userInfoRow}>
                              <Text style={styles.userInfoLabel}>Возраст:</Text>
                              <Text style={styles.userInfoValue}>{actualUser?.age || 'не указан'}</Text>
                            </View>
                            
                            <View style={styles.userInfoRow}>
                              <Text style={styles.userInfoLabel}>Пол:</Text>
                              <Text style={styles.userInfoValue}>
                                {actualUser?.sex === 'male' ? 'Мужской' : actualUser?.sex === 'female' ? 'Женский' : actualUser?.sex || 'не указан'}
                              </Text>
                            </View>
                            
                            <View style={styles.userInfoRow}>
                              <Text style={styles.userInfoLabel}>Статус:</Text>
                              {isOnline ? (
                                onShowOnMap ? (
                                  <Pressable
                                    style={styles.userInfoShowOnMapButton}
                                    onPress={() => {
                                      const userId = actualUser?.id || selectedChatUser?.id;
                                      if (userId) {
                                        handleClose();
                                        setTimeout(() => {
                                          onShowOnMap(userId);
                                        }, 300);
                                      }
                                    }}
                                  >
                                    <Text style={styles.userInfoShowOnMapButtonText}>Show on map</Text>
                                  </Pressable>
                                ) : (
                                  <Text style={styles.userInfoValue}>Онлайн</Text>
                                )
                              ) : (
                                <Text style={styles.userInfoValue}>Оффлайн</Text>
                              )}
                            </View>
                            
                            {actualUser?.description && (
                              <View style={styles.userInfoDescriptionContainer}>
                                <Text style={styles.userInfoDescriptionLabel}>Описание:</Text>
                                <Text style={styles.userInfoDescription}>
                                  {actualUser.description}
                                </Text>
                              </View>
                            )}
                            
                            {(() => {
                              // Проверяем, есть ли сообщения у этого пользователя
                              const targetUserId = actualUser?.id || selectedChatUser?.id;
                              const userId = Object.keys(messagesUsers).find(id => {
                                const user = messagesUsers[id];
                                return user && (user.id === targetUserId || 
                                                String(user.id) === String(targetUserId) || 
                                                id === String(targetUserId));
                              });
                              const chatMessages = userId ? getMessagesForUser(userId) : [];
                              const hasMessages = chatMessages.length > 0;
                              
                              // Показываем кнопку только если есть сообщения
                              if (!hasMessages) {
                                return null;
                              }
                              
                              return (
                                <View style={styles.userInfoDeleteContainer}>
                                  <Pressable
                                    style={[styles.userInfoDeleteButton, isRemovingConversation && styles.userInfoDeleteButtonDisabled]}
                                    onPress={() => {
                                      // Используем переданную функцию или внутреннюю
                                      if (onRemoveConversation) {
                                        onRemoveConversation();
                                      } else {
                                        handleRemoveConversation();
                                      }
                                    }}
                                    disabled={isRemovingConversation}
                                  >
                                    {isRemovingConversation ? (
                                      <ActivityIndicator size="small" color="#fff" />
                                    ) : (
                                      <Text style={styles.userInfoDeleteButtonText}>Удалить переписку</Text>
                                    )}
                                  </Pressable>
                                </View>
                              );
                            })()}
                          </View>
                        </>
                      );
                    })()}
                  </ScrollView>
                ) : (
                  <View style={styles.chatContainer}>
                    <ScrollView 
                      ref={scrollViewRef}
                      style={styles.messagesContent}
                      contentContainerStyle={styles.messagesContentContainer}
                      onContentSizeChange={() => {
                        scrollViewRef.current?.scrollToEnd({ animated: true });
                      }}
                      nestedScrollEnabled={true}
                      showsVerticalScrollIndicator={true}
                      scrollEnabled={true}
                      bounces={true}
                      alwaysBounceVertical={false}
                      keyboardShouldPersistTaps="handled"
                    >
                      {(() => {
                        const userId = Object.keys(messagesUsers).find(id => {
                          const user = messagesUsers[id];
                          return user?.id === selectedChatUser.id || id === String(selectedChatUser.id);
                        }) || selectedChatUser.id;
                        const chatMessages = userId ? getMessagesForUser(userId) : [];
                        
                        return chatMessages.length === 0 ? (
                          <Text style={styles.messagesEmptyText}>Нет сообщений msg</Text>
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
                                <Text style={[
                                  styles.chatMessageTime,
                                  isFromCurrentUser ? styles.chatMessageTimeSent : styles.chatMessageTimeReceived
                                ]}>
                                  {formatMessageTime(message.created_at)}
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
                        onChangeText={onSetMessageText}
                        placeholder="Введите сообщение..."
                        placeholderTextColor="#999"
                        multiline
                        onSubmitEditing={onSendMessage}
                      />
                      <Pressable
                        style={[styles.chatSendButton, (!messageText.trim() || sendingMessage) && styles.chatSendButtonDisabled]}
                        onPress={onSendMessage}
                        disabled={!messageText.trim() || sendingMessage}
                      >
                        {sendingMessage ? (
                          <ActivityIndicator size="small" color="#fff" />
                        ) : (
                          <Text style={styles.chatSendButtonText}>Отправить</Text>
                        )}
                      </Pressable>
                    </View>
                  </View>
                )
              ) : (
                <View style={styles.messagesUsersContainer}>
                  <ScrollView 
                    style={styles.messagesContent}
                    contentContainerStyle={styles.messagesUsersContentContainer}
                    nestedScrollEnabled={true}
                    showsVerticalScrollIndicator={true}
                    scrollEnabled={true}
                    bounces={true}
                    keyboardShouldPersistTaps="handled"
                  >
                    {Object.keys(messagesUsers).length === 0 ? (
                      <Text style={styles.messagesEmptyText}>Здесь будут ваши сообщения</Text>
                    ) : (
                      Object.keys(messagesUsers).map((userId) => {
                        const user = messagesUsers[userId];
                        // Проверяем онлайн статус: либо is_online === 1, либо пользователь есть в onlineUsers
                        const isOnline = user?.is_online === 1 || 
                          (onlineUsers.some((u: any) => {
                            const uId = u.id || u.user_id;
                            return uId === user?.id || String(uId) === String(user?.id) || String(uId) === String(userId);
                          }));
                        
                        // Ищем пользователя в onlineUsers для получения thoughts
                        const onlineUser = onlineUsers.find((u: any) => {
                          const uId = u.id || u.user_id;
                          return uId === user?.id || String(uId) === String(user?.id) || String(uId) === String(userId);
                        });
                        
                        // Используем thoughts из onlineUsers, если пользователь онлайн и поле есть
                        const thoughts = (isOnline && onlineUser?.thoughts) ? onlineUser.thoughts : null;
                        
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
                                    { borderColor: isOnline ? '#4ECDC4' : '#FF6B6B' }
                                  ]}
                                  contentFit="cover"
                                />
                              ) : (
                                <View style={[
                                  styles.messageUserAvatar,
                                  styles.messageUserAvatarPlaceholder,
                                  { borderColor: isOnline ? '#4ECDC4' : '#FF6B6B' }
                                ]}>
                                  <View style={styles.messageUserAvatarInner} />
                                </View>
                              )}
                              {getUnreadCountForUser(userId) > 0 && (
                                <View style={[
                                  styles.messageUserBadge,
                                  { backgroundColor: isOnline ? '#4ECDC4' : '#FF6B6B' }
                                ]}>
                                  <Text style={styles.messageUserBadgeText}>
                                    {getUnreadCountForUser(userId) > 99 ? '99+' : getUnreadCountForUser(userId)}
                                  </Text>
                                </View>
                              )}
                            </View>
                            <View style={styles.messageUserInfoContainer}>
                              <Text style={styles.messageUserName}>
                                {user?.name || `user ${user?.id}`}
                              </Text>
                              {thoughts && (
                                <Text style={styles.messageUserThoughts} numberOfLines={1}>
                                  {thoughts}
                                </Text>
                              )}
                            </View>
                          </Pressable>
                        );
                      })
                    )}
                  </ScrollView>
                </View>
              )}
            </View>
          </Animated.View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
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
  messageUserInfoContainer: {
    flex: 1,
    justifyContent: 'center',
  },
  messageUserThoughts: {
    fontSize: 14,
    color: '#666',
    marginTop: 4,
    fontStyle: 'italic',
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

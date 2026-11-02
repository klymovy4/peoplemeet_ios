import React, { useEffect, useRef, useState } from 'react';
import { View, StyleSheet, Modal, Pressable, Text, ScrollView, TextInput, ActivityIndicator, TouchableWithoutFeedback, Alert, Keyboard, KeyboardAvoidingView, Platform } from 'react-native';
import Animated, { useSharedValue, useAnimatedStyle, withTiming } from 'react-native-reanimated';
import { Image } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import Toast from 'react-native-toast-message';
import { deleteMessage, likeMessage, removeConversation } from '@/services/api';
import * as Haptics from 'expo-haptics';
import { formatLastSeen, replaceEmoticons } from '@/utils/utils';
import { useUserModeration } from '@/hooks/use-user-moderation';
import SwipeToReply from '@/components/SwipeToReply';
import { chatColors } from '@/theme/colors';

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
  // Gets the id of the message being replied to; resolves to true when the message was sent
  onSendMessage: (replyToId?: number) => Promise<boolean> | void;
  onRemoveConversation?: () => void;
  // Called after the user is blocked or reported, so the screen can hide them right away
  onUserBlocked?: (userId: number) => void;
  onShowOnMap?: (userId: number) => void;
  getImageUrl: (imageName: string | null | undefined) => string | null;
  getUnreadCountForUser: (userId: string | number) => number;
  getMessagesForUser: (userId: string | number) => any[];
  formatMessageTime: (createdAt: string | null | undefined) => string;
  title?: string;
  // Functions for working with messages
  getToken: () => Promise<string | null>;
  readMessages: (token: string, userId: number) => Promise<any>;
  setMessagesData: React.Dispatch<React.SetStateAction<any>>;
  setUnreadMessagesCount: React.Dispatch<React.SetStateAction<number>>;
  onlineUsers?: any[]; // Online users array from get_users/online_users
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
  onUserBlocked,
  onShowOnMap,
  getImageUrl,
  getUnreadCountForUser,
  getMessagesForUser,
  formatMessageTime,
  title = 'Messages',
  getToken,
  readMessages,
  setMessagesData,
  setUnreadMessagesCount,
  onlineUsers = [],
}: MessagesModalProps) {
  // Internal state for deleting a conversation (if not passed from outside)
  const [internalRemovingConversation, setInternalRemovingConversation] = useState(false);
  const isRemovingConversation = removingConversation !== undefined ? removingConversation : internalRemovingConversation;

  // While the keyboard is open the sheet's fixed minHeight would push the header
  // off-screen, so it is replaced with a height relative to the space above the keyboard
  const [keyboardVisible, setKeyboardVisible] = useState(false);

  useEffect(() => {
    const showEvent = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
    const hideEvent = Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide';
    const showSub = Keyboard.addListener(showEvent, () => setKeyboardVisible(true));
    const hideSub = Keyboard.addListener(hideEvent, () => setKeyboardVisible(false));
    return () => {
      showSub.remove();
      hideSub.remove();
    };
  }, []);

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

  // Returns the up-to-date user from messagesUsers or onlineUsers
  // messagesUsers holds data from get_messages.users[id] - the up-to-date user info
  // onlineUsers holds data from get_users/online_users - users who are online
  const getActualUser = () => {
    if (!selectedChatUser) return null;
    
    const userId = Object.keys(messagesUsers).find(id => {
      const user = messagesUsers[id];
      return user && (user.id === selectedChatUser.id || 
                      String(user.id) === String(selectedChatUser.id) || 
                      id === String(selectedChatUser.id));
    });
    
    // If the user is found in messagesUsers, use that data (up to date from get_messages)
    if (userId && messagesUsers[userId]) {
      return messagesUsers[userId];
    }
    
    // If the user is not in messagesUsers, check onlineUsers
    // If the user is in onlineUsers, they are online
    const onlineUser = onlineUsers.find((u: any) => {
      const uId = u.id || u.user_id;
      return uId === selectedChatUser.id || String(uId) === String(selectedChatUser.id);
    });
    
    if (onlineUser) {
      // The user is online: use data from onlineUsers and mark as online
      return {
        ...selectedChatUser,
        ...onlineUser,
        is_online: 1, // Mark as online since they are in onlineUsers
      };
    }
    
    // Otherwise fall back to selectedChatUser
    return selectedChatUser;
  };

  const { openReport, confirmBlock, reportMessage, reportModal } = useUserModeration((userId) => {
    // Back to the conversations list: this chat is hidden now
    onSetShowUserInfo(false);
    onSetSelectedChatUser(null);
    onUserBlocked?.(userId);
  });

  // Updates one message in the local data right away (the next poll confirms it)
  const patchMessage = (messageId: number, patch: Record<string, unknown>) => {
    setMessagesData((data: any) => {
      const messages = { ...(data?.messages || {}) };
      for (const partnerId of Object.keys(messages)) {
        messages[partnerId] = messages[partnerId].map((m: any) => (m.id === messageId ? { ...m, ...patch } : m));
      }
      return { ...data, messages };
    });
  };

  // Double tap on a received message toggles ❤️
  const DOUBLE_TAP_MS = 300;
  const lastTapRef = useRef<{ id: number; time: number } | null>(null);

  const toggleLike = async (message: any) => {
    const liked = !message.is_liked;
    patchMessage(message.id, { is_liked: liked ? 1 : 0 });
    if (liked) Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});

    const token = await getToken();
    const result = token ? await likeMessage(token, message.id, liked) : null;
    if (result?.status !== 'success') {
      patchMessage(message.id, { is_liked: liked ? 0 : 1 });
    }
  };

  const handleMessagePress = (message: any, isFromCurrentUser: boolean) => {
    if (isFromCurrentUser || message.is_deleted || !message.id) return;
    const now = Date.now();
    const last = lastTapRef.current;
    if (last && last.id === message.id && now - last.time < DOUBLE_TAP_MS) {
      lastTapRef.current = null;
      toggleLike(message);
    } else {
      lastTapRef.current = { id: message.id, time: now };
    }
  };

  const deleteForEveryone = async (message: any) => {
    const token = await getToken();
    if (!token) return;
    const result = await deleteMessage(token, message.id);
    if (result.status !== 'success') {
      Toast.show({ type: 'error', text1: 'Error', text2: result.data?.message || 'Failed to delete the message' });
      return;
    }
    // Show the placeholder right away instead of waiting for the next poll
    patchMessage(message.id, { message_text: '', is_deleted: 1, is_liked: 0 });
  };

  // --- Replies: swipe a message right (or "Reply" in the long-press menu) ---
  const [replyTo, setReplyTo] = useState<any | null>(null);
  const chatInputRef = useRef<TextInput>(null);
  // Vertical position of every message in the chat, to scroll to a quoted message
  const messagePositionsRef = useRef<Record<number, number>>({});
  const [highlightedMessageId, setHighlightedMessageId] = useState<number | null>(null);

  // A reply belongs to one conversation: drop it when the chat changes
  useEffect(() => {
    setReplyTo(null);
    messagePositionsRef.current = {};
  }, [selectedChatUser?.id]);

  const startReply = (message: any) => {
    if (!message?.id || message.is_deleted) return;
    setReplyTo(message);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    chatInputRef.current?.focus();
  };

  const handleSend = async () => {
    const sent = await onSendMessage(replyTo?.id);
    if (sent) setReplyTo(null);
  };

  // Name shown above a quote
  const quoteAuthor = (senderId: number) =>
    senderId === userData?.id ? 'You' : (getActualUser() || selectedChatUser)?.name || 'User';

  const replyPreviewText = (text: string) => (text.length > 80 ? `${text.slice(0, 80)}…` : text);

  // Tap on a quote: scroll to the original message and highlight it for a moment
  const goToQuotedMessage = (messageId: number) => {
    const y = messagePositionsRef.current[messageId];
    if (y === undefined) return;
    scrollViewRef.current?.scrollTo({ y: Math.max(0, y - 40), animated: true });
    setHighlightedMessageId(messageId);
    setTimeout(() => setHighlightedMessageId((id) => (id === messageId ? null : id)), 1200);
  };

  // Long press: Reply, plus Delete for everyone (own message) or Report (received message)
  const handleMessageLongPress = (message: any, isFromCurrentUser: boolean) => {
    if (!message?.id) return;
    const replyAction = message.is_deleted ? [] : [{ text: 'Reply', onPress: () => startReply(message) }];

    if (isFromCurrentUser) {
      if (message.is_deleted) return;
      Alert.alert('Message', undefined, [
        ...replyAction,
        {
          text: 'Delete for everyone',
          style: 'destructive',
          onPress: () =>
            Alert.alert('Delete for everyone?', 'The message will be replaced with "Message deleted" for both of you.', [
              { text: 'Cancel', style: 'cancel' },
              { text: 'Delete', style: 'destructive', onPress: () => deleteForEveryone(message) },
            ]),
        },
        { text: 'Cancel', style: 'cancel' },
      ]);
      return;
    }

    // Deleted messages can still be reported: moderators see the original text
    const user = getActualUser() || selectedChatUser;
    if (!user?.id) return;
    Alert.alert('Message', message.is_deleted ? 'Deleted message' : undefined, [
      ...replyAction,
      { text: 'Report', style: 'destructive', onPress: () => reportMessage({ id: user.id, name: user.name }, message.id) },
      { text: 'Cancel', style: 'cancel' },
    ]);
  };

  // Generic conversation delete function
  const handleRemoveConversation = async () => {
    if (isRemovingConversation) {
      return;
    }

    const actualUser = getActualUser();
    const targetUserId = actualUser?.id || selectedChatUser?.id;

    if (!targetUserId) {
      Toast.show({
        type: 'error',
        text1: 'Error',
        text2: 'No user selected',
      });
      return;
    }

    // Show a confirmation before deleting
    Alert.alert(
      'Delete conversation',
      'The conversation will be deleted for you only. The other person will still see it.',
      [
        {
          text: 'Cancel',
          style: 'cancel',
        },
        {
          text: 'Delete',
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
                  text1: 'Success',
                  text2: 'Conversation deleted for you',
                });
                
                // Close the messages modal
                slideAnim.value = withTiming(1, { duration: 300 });
                setTimeout(() => {
                  onClose();
                  onSetSelectedChatUser(null);
                  onSetShowUserInfo(false);
                }, 300);
                
                // Update messages data
                setMessagesData({});
                setUnreadMessagesCount(0);
              } else {
                Toast.show({
                  type: 'error',
                  text1: 'Error',
                  text2: result?.data?.message || 'Failed to delete conversation',
                });
              }
            } catch (error) {
              console.error('Error removing conversation:', error);
              Toast.show({
                type: 'error',
                text1: 'Error',
                text2: 'Failed to delete conversation',
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

  // Opens a chat with a user and marks messages as read
  const handleOpenChat = async (userId: string | number) => {
    const user = messagesUsers[userId];
    if (user) {
      onSetSelectedChatUser(user);
      onSetShowUserInfo(false); // Reset the user info view when opening a new chat
      
      // Reset the message counter when opening a new chat
      lastMessageCountRef.current = 0;
      
      // Scroll down when opening the chat
      setTimeout(() => {
        scrollViewRef.current?.scrollToEnd({ animated: true });
      }, 300);
      
      // Send a read receipt request
      try {
        const token = await getToken();
        if (token && user.id) {
          const result = await readMessages(token, user.id);
          if (result.status === 'success') {
            console.log('Messages marked as read for user:', user.id);
            
            // Update local messages state, marking them as read
            setMessagesData((prevData: any) => {
              const updatedData = { ...prevData };
              const messages = updatedData.messages || {};
              const userMessages = messages[userId] || [];
              
              // Mark all incoming messages from this user as read
              if (Array.isArray(userMessages)) {
                const userIdNum = typeof userId === 'string' ? parseInt(userId, 10) : userId;
                userMessages.forEach((message) => {
                  if (message && message.sender_id === userIdNum) {
                    message.is_read = 1;
                  }
                });
              }
              
              // Recalculate the number of users with unread messages right away
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
              
              // Update the unread counter right away
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
        <KeyboardAvoidingView
          pointerEvents="box-none"
          style={{ flex: 1, justifyContent: 'flex-end' }}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        >
          <Animated.View
            style={[styles.messagesSheet, keyboardVisible && styles.messagesSheetKeyboard, messagesSheetStyle]}
            pointerEvents="auto"
          >
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
                        // Use up-to-date data from messagesUsers or onlineUsers
                        const actualUser = getActualUser();
                        // If is_online === 1 or the user is found in onlineUsers, they are online
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
                              { borderColor: isOnline ? chatColors.online : chatColors.offline }
                            ]}
                            contentFit="cover"
                          />
                        ) : (
                          <View style={[
                            styles.messagesHeaderAvatar,
                            styles.messagesHeaderAvatarPlaceholder,
                            { borderColor: isOnline ? chatColors.online : chatColors.offline }
                          ]}>
                            <View style={styles.messagesHeaderAvatarInner} />
                          </View>
                        );
                      })()}
                    </Pressable>
                    {(() => {
                      const actualUser = getActualUser();
                      const isOnline = actualUser?.is_online === 1 ||
                        onlineUsers.some((u: any) => String(u.id || u.user_id) === String(actualUser?.id));
                      const lastSeen = isOnline ? null : formatLastSeen(actualUser?.last_time_online);
                      return (
                        <View style={styles.messagesTitleContainer}>
                          <Text style={styles.messagesTitleName} numberOfLines={1}>
                            {actualUser?.name || 'User'}
                          </Text>
                          {/* Online, or when the person was last active */}
                          {isOnline ? (
                            <Text style={[styles.messagesStatus, styles.messagesStatusOnline]}>online</Text>
                          ) : lastSeen ? (
                            <Text style={styles.messagesStatus}>{lastSeen}</Text>
                          ) : null}
                        </View>
                      );
                    })()}
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
                      // Use up-to-date data from messagesUsers or onlineUsers
                      const actualUser = getActualUser();
                      // If is_online === 1 or the user is found in onlineUsers, they are online
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
                                  { borderColor: isOnline ? chatColors.online : chatColors.offline }
                                ]}
                                contentFit="cover"
                              />
                            ) : (
                              <View style={[
                                styles.userInfoImage,
                                styles.userInfoImagePlaceholder,
                                { borderColor: isOnline ? chatColors.online : chatColors.offline }
                              ]}>
                                <View style={styles.userInfoImageInner} />
                              </View>
                            )}
                          </View>
                          
                          <View style={styles.userInfoDetails}>
                            <Text style={styles.userInfoName}>
                              {actualUser?.name || 'No name'}
                            </Text>
                            
                            <View style={styles.userInfoRow}>
                              <Text style={styles.userInfoLabel}>Age:</Text>
                              <Text style={styles.userInfoValue}>{actualUser?.age || 'not specified'}</Text>
                            </View>
                            
                            <View style={styles.userInfoRow}>
                              <Text style={styles.userInfoLabel}>Gender:</Text>
                              <Text style={styles.userInfoValue}>
                                {actualUser?.sex === 'male' ? 'Male' : actualUser?.sex === 'female' ? 'Female' : actualUser?.sex || 'not specified'}
                              </Text>
                            </View>
                            
                            <View style={styles.userInfoRow}>
                              <Text style={styles.userInfoLabel}>Status:</Text>
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
                                  <Text style={styles.userInfoValue}>Online</Text>
                                )
                              ) : (
                                <Text style={styles.userInfoValue}>Offline</Text>
                              )}
                            </View>
                            
                            {actualUser?.description && (
                              <View style={styles.userInfoDescriptionContainer}>
                                <Text style={styles.userInfoDescriptionLabel}>Description:</Text>
                                <Text style={styles.userInfoDescription}>
                                  {actualUser.description}
                                </Text>
                              </View>
                            )}
                            
                            {(() => {
                              // Check whether this user has messages
                              const targetUserId = actualUser?.id || selectedChatUser?.id;
                              const userId = Object.keys(messagesUsers).find(id => {
                                const user = messagesUsers[id];
                                return user && (user.id === targetUserId || 
                                                String(user.id) === String(targetUserId) || 
                                                id === String(targetUserId));
                              });
                              const chatMessages = userId ? getMessagesForUser(userId) : [];
                              const hasMessages = chatMessages.length > 0;
                              
                              // Show the button only if there are messages
                              if (!hasMessages) {
                                return null;
                              }
                              
                              return (
                                <View style={styles.userInfoDeleteContainer}>
                                  <Pressable
                                    style={[styles.userInfoDeleteButton, isRemovingConversation && styles.userInfoDeleteButtonDisabled]}
                                    onPress={() => {
                                      // Use the passed function or the internal one
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
                                      <Text style={styles.userInfoDeleteButtonText}>Delete conversation</Text>
                                    )}
                                  </Pressable>
                                </View>
                              );
                            })()}

                            {/* Report / block - always available, even without messages */}
                            {actualUser?.id ? (
                              <View style={styles.userInfoModerationContainer}>
                                <Pressable
                                  style={[styles.userInfoModerationButton, styles.userInfoReportButton]}
                                  onPress={() => openReport({ id: actualUser.id, name: actualUser.name })}
                                >
                                  <Ionicons name="flag-outline" size={18} color={chatColors.danger} />
                                  <Text style={styles.userInfoReportButtonText}>Report</Text>
                                </Pressable>
                                <Pressable
                                  style={[styles.userInfoModerationButton, styles.userInfoBlockButton]}
                                  onPress={() => confirmBlock({ id: actualUser.id, name: actualUser.name })}
                                >
                                  <Ionicons name="ban-outline" size={18} color="#666" />
                                  <Text style={styles.userInfoBlockButtonText}>Block</Text>
                                </Pressable>
                              </View>
                            ) : null}
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
                      // Swipe down on the messages to hide the keyboard
                      keyboardDismissMode={Platform.OS === 'ios' ? 'interactive' : 'on-drag'}
                      // The list shrinks when the keyboard opens - keep the latest message visible
                      onLayout={() => scrollViewRef.current?.scrollToEnd({ animated: false })}
                    >
                      {(() => {
                        const userId = Object.keys(messagesUsers).find(id => {
                          const user = messagesUsers[id];
                          return user?.id === selectedChatUser.id || id === String(selectedChatUser.id);
                        }) || selectedChatUser.id;
                        const chatMessages = userId ? getMessagesForUser(userId) : [];
                        
                        return chatMessages.length === 0 ? (
                          <Text style={styles.messagesEmptyText}>No messages yet</Text>
                        ) : (
                          chatMessages.map((message: any, index: number) => {
                            const isFromCurrentUser = message.sender_id === userData?.id;
                            const quote = message.reply_to;
                            return (
                              <View
                                key={message.id || index}
                                onLayout={(e) => {
                                  if (message.id) messagePositionsRef.current[message.id] = e.nativeEvent.layout.y;
                                }}
                              >
                              <SwipeToReply enabled={!message.is_deleted} onReply={() => startReply(message)}>
                              <Pressable
                                style={[
                                  styles.chatMessage,
                                  isFromCurrentUser ? styles.chatMessageSent : styles.chatMessageReceived,
                                  highlightedMessageId === message.id ? styles.chatMessageHighlighted : null,
                                ]}
                                onPress={() => handleMessagePress(message, isFromCurrentUser)}
                                onLongPress={() => handleMessageLongPress(message, isFromCurrentUser)}
                              >
                                {quote ? (
                                  <Pressable
                                    style={[styles.chatQuote, isFromCurrentUser ? styles.chatQuoteSent : styles.chatQuoteReceived]}
                                    onPress={() => goToQuotedMessage(quote.id)}
                                    disabled={!!quote.unavailable}
                                  >
                                    {!quote.unavailable ? (
                                      <Text style={[styles.chatQuoteAuthor, isFromCurrentUser && styles.chatQuoteTextSent]}>
                                        {quoteAuthor(quote.sender_id)}
                                      </Text>
                                    ) : null}
                                    <Text
                                      style={[styles.chatQuoteText, isFromCurrentUser && styles.chatQuoteTextSent]}
                                      numberOfLines={2}
                                    >
                                      {quote.unavailable
                                        ? 'Message no longer available'
                                        : quote.is_deleted
                                          ? '🚫 Message deleted'
                                          : quote.text}
                                    </Text>
                                  </Pressable>
                                ) : null}
                                <Text style={[
                                  styles.chatMessageText,
                                  isFromCurrentUser ? styles.chatMessageTextSent : styles.chatMessageTextReceived,
                                  message.is_deleted ? styles.chatMessageTextDeleted : null,
                                ]}>
                                  {message.is_deleted ? '🚫 Message deleted' : message.message_text || ''}
                                </Text>
                                <View style={[styles.chatMessageMeta, isFromCurrentUser && styles.chatMessageMetaSent]}>
                                  <Text style={[
                                    styles.chatMessageTime,
                                    isFromCurrentUser ? styles.chatMessageTimeSent : styles.chatMessageTimeReceived
                                  ]}>
                                    {formatMessageTime(message.created_at)}
                                  </Text>
                                  {/* Your messages: ✓ sent, ✓✓ delivered, ✓✓ (dark) read */}
                                  {isFromCurrentUser && !message.is_deleted ? (
                                    <Ionicons
                                      name={message.is_read || message.is_delivered ? 'checkmark-done' : 'checkmark'}
                                      size={15}
                                      color={message.is_read ? chatColors.readTick : chatColors.sentMeta}
                                      accessibilityLabel={message.is_read ? 'Read' : message.is_delivered ? 'Delivered' : 'Sent'}
                                    />
                                  ) : null}
                                </View>
                                {message.is_liked ? (
                                  <View
                                    style={[
                                      styles.chatMessageLike,
                                      isFromCurrentUser ? styles.chatMessageLikeSent : styles.chatMessageLikeReceived,
                                    ]}
                                  >
                                    <Text style={styles.chatMessageLikeText}>❤️</Text>
                                  </View>
                                ) : null}
                              </Pressable>
                              </SwipeToReply>
                              </View>
                            );
                          })
                        );
                      })()}
                    </ScrollView>
                    {replyTo ? (
                      <View style={styles.replyBar}>
                        <View style={styles.replyBarAccent} />
                        <View style={styles.replyBarContent}>
                          <Text style={styles.replyBarTitle}>Replying to {quoteAuthor(replyTo.sender_id)}</Text>
                          <Text style={styles.replyBarText} numberOfLines={1}>
                            {replyPreviewText(replyTo.message_text || '')}
                          </Text>
                        </View>
                        <Pressable onPress={() => setReplyTo(null)} hitSlop={10} accessibilityLabel="Cancel reply">
                          <Ionicons name="close" size={20} color="#999" />
                        </Pressable>
                      </View>
                    ) : null}
                    <View style={styles.chatInputContainer}>
                      <TextInput
                        ref={chatInputRef}
                        style={styles.chatInput}
                        value={messageText}
                        maxLength={1000}
                        // Typed emoticons like :) turn into emoji right away
                        onChangeText={(text) => onSetMessageText(replaceEmoticons(text))}
                        placeholder="Type a message..."
                        placeholderTextColor="#999"
                        // Return inserts a new line; messages are sent with the button
                        multiline
                      />
                      <Pressable
                        style={({ pressed }) => [
                          styles.chatSendButton,
                          !messageText.trim() && styles.chatSendButtonDisabled,
                          (pressed || sendingMessage) && styles.chatSendButtonPressed,
                        ]}
                        onPress={handleSend}
                        // Always visible, but inactive until some text is typed
                        disabled={!messageText.trim() || sendingMessage}
                        hitSlop={8}
                        accessibilityLabel="Send message"
                      >
                        {sendingMessage ? (
                          <ActivityIndicator size="small" color="#fff" />
                        ) : (
                          <Ionicons name="send" size={18} color="#fff" style={styles.chatSendIcon} />
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
                      <Text style={styles.messagesEmptyText}>Your messages will appear here</Text>
                    ) : (
                      Object.keys(messagesUsers).map((userId) => {
                        const user = messagesUsers[userId];
                        // Check online status: either is_online === 1 or the user is in onlineUsers
                        const isOnline = user?.is_online === 1 || 
                          (onlineUsers.some((u: any) => {
                            const uId = u.id || u.user_id;
                            return uId === user?.id || String(uId) === String(user?.id) || String(uId) === String(userId);
                          }));
                        
                        // Look up the user in onlineUsers to get thoughts
                        const onlineUser = onlineUsers.find((u: any) => {
                          const uId = u.id || u.user_id;
                          return uId === user?.id || String(uId) === String(user?.id) || String(uId) === String(userId);
                        });
                        
                        // Use thoughts from onlineUsers if the user is online and the field exists
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
                                    { borderColor: isOnline ? chatColors.online : chatColors.offline }
                                  ]}
                                  contentFit="cover"
                                />
                              ) : (
                                <View style={[
                                  styles.messageUserAvatar,
                                  styles.messageUserAvatarPlaceholder,
                                  { borderColor: isOnline ? chatColors.online : chatColors.offline }
                                ]}>
                                  <View style={styles.messageUserAvatarInner} />
                                </View>
                              )}
                              {getUnreadCountForUser(userId) > 0 && (
                                <View style={[
                                  styles.messageUserBadge,
                                  { backgroundColor: isOnline ? chatColors.online : chatColors.offline }
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
        </KeyboardAvoidingView>
      </View>
      {/* Rendered inside this modal so it can be presented on top of it */}
      {reportModal}
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
  messagesSheetKeyboard: {
    minHeight: 0,
    height: '90%',
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
  // Chat header: name with "online" / "last seen …" under it
  messagesTitleContainer: {
    flex: 1,
    justifyContent: 'center',
  },
  messagesTitleName: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#333',
  },
  messagesStatus: {
    fontSize: 12,
    color: '#999',
    marginTop: 1,
  },
  messagesStatusOnline: {
    color: chatColors.online,
    fontWeight: '600',
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
    backgroundColor: chatColors.background,
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
    // Soft shadow so bubbles stand out from the mint background
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.12,
    shadowRadius: 2.5,
    elevation: 2,
  },
  chatMessageSent: {
    alignSelf: 'flex-end',
    backgroundColor: chatColors.sent,
    borderRadius: 16,
    borderTopRightRadius: 4,
    padding: 12,
  },
  chatMessageReceived: {
    alignSelf: 'flex-start',
    backgroundColor: chatColors.received,
    borderRadius: 16,
    borderTopLeftRadius: 4,
    padding: 12,
  },
  chatMessageText: {
    fontSize: 16,
    lineHeight: 20,
  },
  chatMessageTextSent: {
    color: chatColors.sentText,
  },
  chatMessageTextReceived: {
    color: chatColors.receivedText,
  },
  // ❤️ badge on the bottom corner of a liked message
  chatMessageLike: {
    position: 'absolute',
    bottom: -10,
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: '#fff',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.2,
    shadowRadius: 2,
    elevation: 2,
  },
  chatMessageLikeSent: {
    left: -8,
  },
  chatMessageLikeReceived: {
    right: -8,
  },
  chatMessageLikeText: {
    fontSize: 12,
  },
  chatMessageTextDeleted: {
    fontStyle: 'italic',
    opacity: 0.75,
  },
  // Time and delivery ticks under the message text
  chatMessageMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    marginTop: 4,
  },
  chatMessageMetaSent: {
    justifyContent: 'flex-end',
  },
  chatMessageTime: {
    fontSize: 11,
    opacity: 0.7,
  },
  chatMessageTimeSent: {
    color: chatColors.sentText,
    textAlign: 'right',
  },
  chatMessageTimeReceived: {
    color: chatColors.receivedMeta,
    textAlign: 'left',
  },
  chatMessageHighlighted: {
    opacity: 0.6,
  },
  // Quote of the replied message, inside the bubble
  chatQuote: {
    borderLeftWidth: 3,
    borderRadius: 6,
    paddingVertical: 4,
    paddingHorizontal: 8,
    marginBottom: 6,
  },
  chatQuoteSent: {
    borderLeftColor: '#fff',
    backgroundColor: chatColors.quoteSentBackground,
  },
  chatQuoteReceived: {
    borderLeftColor: chatColors.accent,
    backgroundColor: chatColors.quoteReceivedBackground,
  },
  chatQuoteAuthor: {
    fontSize: 12,
    fontWeight: '600',
    color: chatColors.accent,
  },
  chatQuoteText: {
    fontSize: 13,
    color: '#555',
  },
  chatQuoteTextSent: {
    color: '#fff',
  },
  // "Replying to …" bar above the input
  replyBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderTopWidth: 1,
    borderTopColor: chatColors.border,
    backgroundColor: '#fff',
  },
  replyBarAccent: {
    width: 3,
    alignSelf: 'stretch',
    borderRadius: 2,
    backgroundColor: chatColors.accent,
  },
  replyBarContent: {
    flex: 1,
  },
  replyBarTitle: {
    fontSize: 13,
    fontWeight: '600',
    color: chatColors.accent,
  },
  replyBarText: {
    fontSize: 13,
    color: '#666',
  },
  chatInputContainer: {
    flexDirection: 'row',
    // The send button stays at the bottom while the input grows to several lines
    alignItems: 'flex-end',
    padding: 12,
    borderTopWidth: 1,
    borderTopColor: chatColors.border,
    backgroundColor: '#fff',
  },
  chatInput: {
    flex: 1,
    borderWidth: 1,
    borderColor: chatColors.border,
    borderRadius: 20,
    paddingHorizontal: 16,
    paddingVertical: 10,
    fontSize: 16,
    maxHeight: 120,
  },
  chatSendButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    marginLeft: 8,
    backgroundColor: chatColors.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  chatSendButtonDisabled: {
    backgroundColor: '#c8c8c8',
  },
  chatSendButtonPressed: {
    opacity: 0.6,
  },
  chatSendIcon: {
    // The paper-plane glyph looks off-center without a small nudge to the right
    marginLeft: 2,
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
    backgroundColor: chatColors.danger,
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
  userInfoModerationContainer: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 20,
  },
  userInfoModerationButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 12,
    borderRadius: 8,
    borderWidth: 1,
  },
  userInfoReportButton: {
    borderColor: chatColors.danger,
  },
  userInfoReportButtonText: {
    color: chatColors.danger,
    fontSize: 16,
    fontWeight: '600',
  },
  userInfoBlockButton: {
    borderColor: '#ccc',
  },
  userInfoBlockButtonText: {
    color: '#666',
    fontSize: 16,
    fontWeight: '600',
  },
  userInfoShowOnMapButton: {
    backgroundColor: chatColors.accent,
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

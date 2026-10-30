import { getToken, removeToken, saveUserData } from '@/services/auth';
import { getSelf, uploadAvatar, editProfile, getOnline, readMessages, sendMessage, deleteAccount } from '@/services/api';
import { enableUsersOnlinePolling, disableUsersOnlinePolling, setUsersOnlineCallback } from '@/services/usersOnlineInterval';
import { startMessagesInterval, stopMessagesInterval, setMessagesCallback } from '@/services/messagesInterval';
import { startLocationTracking, stopLocationTracking } from '@/services/locationTracking';
import { playMessageSound } from '@/services/soundService';
import { Image } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { formatMessageTime, getImageUrl, replaceEmoticons } from '@/utils/utils';
import { useEffect, useState, useRef } from 'react';
import { ActivityIndicator, AppState, KeyboardAvoidingView, Pressable, ScrollView, StyleSheet, Text, View, TextInput, Platform, Switch } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useSharedValue, withSpring } from 'react-native-reanimated';
import Toast from 'react-native-toast-message';
import * as ImagePicker from 'expo-image-picker';
import * as ImageManipulator from 'expo-image-manipulator';
import * as Location from 'expo-location';
import ImageCropModal from '@/components/ImageCropModal';
import MessagesModal from '@/components/MessagesModal';
import DeleteAccountModal from '@/components/DeleteAccountModal';
import { openLegalPage } from '@/services/legal';

// Picked photos are scaled down to this long side before cropping (the avatar is 800x800)
const MAX_PICKED_IMAGE_SIDE = 1600;

const GENDER_OPTIONS = [
  { value: 'male', label: 'Male', icon: 'male' },
  { value: 'female', label: 'Female', icon: 'female' },
] as const;

export default function ProfileScreen() {
  const insets = useSafeAreaInsets();
  const [userData, setUserData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [cropMode, setCropMode] = useState(false);
  const [selectedImageUri, setSelectedImageUri] = useState<string | null>(null);
  // Pixel size of the picked photo, the same image ImageManipulator crops
  const [selectedImageSize, setSelectedImageSize] = useState<{ width: number; height: number } | null>(null);
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [isOnline, setIsOnline] = useState(false);
  const [togglingOnline, setTogglingOnline] = useState(false);
  
  // State for editable fields
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
  const [deleteAccountVisible, setDeleteAccountVisible] = useState(false);
  const [messageText, setMessageText] = useState('');
  const [sendingMessage, setSendingMessage] = useState(false);
  const [showUserInfo, setShowUserInfo] = useState(false);
  const slideAnim = useSharedValue(1); // Initial value 1 = panel hidden at the bottom
  const scrollViewRef = useRef<ScrollView | null>(null);
  const lastMessageCountRef = useRef<number>(0); // Message count, used to detect new messages
  // Previous unread count; null means no poll has happened yet
  const previousUnreadCountRef = useRef<number | null>(null);
  const userIdRef = useRef<number | null>(null);
  


  useEffect(() => {
    checkAuth();
  }, []);

  // Keep a ref in sync so the AppState listener (registered once) sees the current status
  const isOnlineRef = useRef(false);
  useEffect(() => {
    isOnlineRef.current = isOnline;
  }, [isOnline]);

  useEffect(() => {
    // Location is not tracked in the background; on return the server may have already
    // set the user offline (no requests for 5 minutes), so re-check the status
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') {
        refreshOnlineStatus();
      } else if (state === 'background') {
        // Stop telling the server "I'm here": after 3 minutes in the background the server sets
        // the user offline (iOS freezes the app anyway, Android can keep it running)
        stopLocationTracking();
        disableUsersOnlinePolling();
      }
    });
    return () => subscription.remove();
  }, []);

  useEffect(() => {
    // Update the ref when userData changes
    if (userData?.id) {
      userIdRef.current = userData.id;
    }
  }, [userData?.id]);

  useEffect(() => {
    // Set the callback for receiving online users
    setUsersOnlineCallback((users) => {
      const currentUserId = userIdRef.current;
      
      if (!users) {
        setOnlineUsers([]);
        return;
      }
      
      let usersArray: any[] = [];
      
      // Handle different response formats
      if (Array.isArray(users)) {
        usersArray = users;
      } else if (users.users && Array.isArray(users.users)) {
        usersArray = users.users;
      } else if (users.data && Array.isArray(users.data)) {
        usersArray = users.data;
      }
      
      // Filter the current user out of the list
      const filteredUsers = usersArray.filter((user: any) => {
        const userId = user.id || user.user_id;
        return userId !== currentUserId;
      });
      
      setOnlineUsers(filteredUsers);
    });

    // Clear the callback on unmount
    return () => {
      setUsersOnlineCallback(null);
    };
  }, []);

  useEffect(() => {
    // Set the callback for receiving messages
    setMessagesCallback((messagesData) => {
      console.log('ProfileScreen: Received messages data:', messagesData);
      
      if (!messagesData) {
        setUnreadMessagesCount(0);
        setMessagesUsers({});
        setMessagesData({});
        return;
      }
      
      // Count users with unread messages
      const messages = messagesData.messages || {};
      let usersWithUnreadCount = 0;
      
      Object.keys(messages).forEach((userId) => {
        const userMessages = messages[userId] || [];
        const userIdNum = parseInt(userId, 10);
        
        // Check whether there is at least one incoming unread message (sender_id === userId and is_read: 0)
        const hasUnread = Array.isArray(userMessages) && userMessages.some((message) => {
          return message && 
                 message.sender_id === userIdNum && 
                 message.is_read === 0;
        });
        
        if (hasUnread) {
          usersWithUnreadCount++;
        }
      });
      
      // Play a sound if new unread messages arrived
      const previousUnreadCount = previousUnreadCountRef.current;
      if (previousUnreadCount !== null && usersWithUnreadCount > previousUnreadCount && !messagesVisible) {
        // Play the sound only if new unread messages arrived and the chat is not open
        playMessageSound();
      }
      
      previousUnreadCountRef.current = usersWithUnreadCount;
      setUnreadMessagesCount(usersWithUnreadCount);
      
      // Store users and messages data
      const users = messagesData.users || {};
      setMessagesUsers(users);
      setMessagesData(messagesData);
      
      // If a chat with a user is open AND the modal is visible, check for new unread messages
      if (selectedChatUser && selectedChatUser.id && messagesVisible) {
        const messages = messagesData.messages || {};
        // Find userId by key in messagesUsers
        const userId = Object.keys(users).find(id => {
          const user = users[id];
          return user?.id === selectedChatUser.id || id === String(selectedChatUser.id);
        }) || String(selectedChatUser.id);
        
        const userMessages = messages[userId] || [];
        const userIdNum = typeof userId === 'string' ? parseInt(userId, 10) : parseInt(String(userId), 10);
        
        // Check for incoming unread messages from this user (sender_id === userId and is_read: 0)
        const hasUnread = Array.isArray(userMessages) && userMessages.some((message) => {
          return message && 
                 message.sender_id === userIdNum && 
                 message.is_read === 0;
        });
        
        // If there are unread messages, send a read receipt request
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
        
        // Check whether new messages arrived (more than before)
        const currentMessageCount = Array.isArray(userMessages) ? userMessages.length : 0;
        const previousMessageCount = lastMessageCountRef.current;
        
        // Auto-scroll down only if new messages arrived
        if (currentMessageCount > previousMessageCount) {
          setTimeout(() => {
            scrollViewRef.current?.scrollToEnd({ animated: true });
          }, 100);
        }
        
        // Update the message counter
        lastMessageCountRef.current = currentMessageCount;
      }
    });

    // Clear the callback on unmount
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

    setLoading(true);

    // Fetch data from the server
    const result = await getSelf(token);
    
    if (result.status === 'success') {
      const userData = result.data;
      setUserData(userData);
      // Initialize the editable fields
      setName(userData.name || '');
      setAge(userData.age?.toString() || '');
      setSex(userData.sex || '');
      setDescription(userData.description || '');
      setThoughts(userData.thoughts || '');
      const onlineStatus = userData.is_online === 1;
      setIsOnline(onlineStatus);
      if (onlineStatus) {
        enableUsersOnlinePolling();
        startLocationTracking();
      } else {
        disableUsersOnlinePolling();
        stopLocationTracking();
      }
      // Save data to the cache
      await saveUserData(userData);
      
      // Start the messages polling interval (always, if the user is logged in)
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

  // Syncs the online status with the server without touching the editable fields
  const refreshOnlineStatus = async () => {
    const token = await getToken();
    if (!token) return;

    const result = await getSelf(token);
    if (result.status !== 'success') return;

    const onlineStatus = result.data.is_online === 1;
    setUserData(result.data);

    if (onlineStatus) {
      enableUsersOnlinePolling();
      startLocationTracking();
    } else {
      disableUsersOnlinePolling();
      stopLocationTracking();
      if (isOnlineRef.current) {
        Toast.show({
          type: 'info',
          text1: 'Offline',
          text2: 'You were set offline due to inactivity',
        });
      }
    }
    setIsOnline(onlineStatus);
  };

  // Hide a blocked/reported user right away instead of waiting for the next poll
  const removeUserLocally = (removedId: number) => {
    const isRemoved = (user: any) => String(user?.id ?? user?.user_id) === String(removedId);
    setOnlineUsers((users) => users.filter((user) => !isRemoved(user)));
    setMessagesUsers((users: any) => {
      const { [removedId]: _removed, ...rest } = users || {};
      return rest;
    });
    setMessagesData((data: any) => {
      const messages = { ...(data?.messages || {}) };
      delete messages[removedId];
      return { ...data, messages };
    });
  };

  const handleLogout = async () => {
    try {
      // Make sure online users polling and location tracking are turned off
      disableUsersOnlinePolling();
      stopLocationTracking();
      // Stop the messages polling interval
      stopMessagesInterval();

      // If the user is online, first send a request to go offline
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
            // Continue logging out even if the offline status could not be sent
          }
        }
      }

      // Now log out
      await removeToken();
      Toast.show({
        type: 'success',
        text1: 'Logged out',
        text2: 'You have been logged out',
      });
      router.replace('/');
    } catch (error) {
      console.error('Error during logout:', error);
      // Log out in any case
      await removeToken();
      router.replace('/');
    }
  };

  // Returns an error message for the modal, or null when the account is gone
  const handleDeleteAccount = async (password: string): Promise<string | null> => {
    const token = await getToken();
    if (!token) return 'Not logged in';

    const result = await deleteAccount(token, password);
    if (result.status !== 'success') {
      return result.data?.message || 'Failed to delete the account';
    }

    disableUsersOnlinePolling();
    stopLocationTracking();
    stopMessagesInterval();
    await removeToken();
    setDeleteAccountVisible(false);
    Toast.show({ type: 'success', text1: 'Account deleted', text2: 'Your account and data have been deleted' });
    router.replace('/');
    return null;
  };

  const openFileDialog = async () => {
    try {
      // Request media library permission
      const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (status !== 'granted') {
        Toast.show({
          type: 'error',
          text1: 'Error',
          text2: 'Photo library permission is required',
        });
        return;
      }

      // Open the photo picker
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        allowsEditing: false,
        quality: 1,
      });

      if (!result.canceled && result.assets[0]) {
        const asset = result.assets[0];
        // Re-save the photo once with its EXIF rotation applied (and scaled down). The crop
        // screen and the crop itself then work on the very same pixels, so a rotated iPhone
        // photo can't be cropped in a different place than the frame shows
        const longSide = Math.max(asset.width || 0, asset.height || 0);
        const normalized = await ImageManipulator.manipulateAsync(
          asset.uri,
          longSide > MAX_PICKED_IMAGE_SIDE
            ? [{ resize: asset.width >= asset.height ? { width: MAX_PICKED_IMAGE_SIDE } : { height: MAX_PICKED_IMAGE_SIDE } }]
            : [],
          { compress: 1, format: ImageManipulator.SaveFormat.JPEG }
        );
        console.log('Avatar: picked', asset.width, 'x', asset.height, '-> normalized', normalized.width, 'x', normalized.height);
        setSelectedImageUri(normalized.uri);
        setSelectedImageSize({ width: normalized.width, height: normalized.height });
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

      // Create a square crop (use the smaller side for the square)
      const size = Math.min(cropData.width, cropData.height);
      
      console.log('Avatar: crop', JSON.stringify(cropData));
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

      // Upload the photo
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

        // Refresh user data
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
        // Switch to offline. Stop tracking first so a pending send cannot mark the user online again
        stopLocationTracking();
        const data = {
          token: token,
          is_online: 0,
          lat: null,
          lng: null,
        };

        const response = await getOnline(data);
        if (response.status === 'success') {
          setIsOnline(false);
          disableUsersOnlinePolling(); // Stop online users polling
          Toast.show({
            type: 'info',
            text1: 'Offline',
            text2: 'You are now offline',
          });

          // Refresh user data
          const selfResult = await getSelf(token);
          if (selfResult.status === 'success') {
            setUserData(selfResult.data);
            await saveUserData(selfResult.data);
          }
        } else {
          startLocationTracking();
          Toast.show({
            type: 'error',
            text1: 'Error',
            text2: response?.data?.message || 'Failed to go offline',
          });
        }
      } else {
        // Check that all required data is present before going online:
        // the same rules as for saving, plus a photo (thoughts are optional)
        const validationError = !userData?.image ? 'A profile photo is required' : getProfileError();

        if (validationError) {
          Toast.show({
            type: 'error',
            text1: 'Error',
            text2: validationError,
          });
          return;
        }

        // Send unsaved changes to the server first,
        // otherwise other users will see the old profile
        if (hasUnsavedChanges()) {
          const saved = await saveProfile(token);
          if (!saved) {
            return;
          }
        }

        // Switch to online - request location
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
          enableUsersOnlinePolling(); // Resume online users polling
          startLocationTracking();
          Toast.show({
            type: 'success',
            text1: 'Online',
            text2: 'You are now online',
          });

          // Refresh user data
          const selfResult = await getSelf(token);
          if (selfResult.status === 'success') {
            setUserData(selfResult.data);
            await saveUserData(selfResult.data);
          }

          // Go to the map screen (the interval is started there)
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

  // Validate profile fields. Returns an error message, or null if everything is fine
  const getProfileError = (): string | null => {
    if (!name || name.trim().length === 0) {
      return 'Name is required';
    }

    if (!age || age.trim().length === 0) {
      return 'Age is required';
    }
    const ageNum = parseInt(age, 10);
    if (isNaN(ageNum) || ageNum < 18 || ageNum > 90) {
      return 'Age must be between 18 and 90';
    }

    if (!sex || sex.trim().length === 0) {
      return 'Please select your gender';
    }

    if (!description || description.trim().length === 0) {
      return 'Description is required';
    }
    if (description.trim().length < 10) {
      return 'Description must be at least 10 characters';
    }

    return null;
  };

  // Checks whether the form is valid
  const isFormValid = () => getProfileError() === null;

  // Whether the form fields differ from the profile saved on the server
  const hasUnsavedChanges = () =>
    name.trim() !== (userData?.name || '') ||
    age !== (userData?.age?.toString() || '') ||
    sex !== (userData?.sex || '') ||
    description.trim() !== (userData?.description || '') ||
    thoughts.trim() !== (userData?.thoughts || '');

  // Sends profile fields to the server and refreshes userData. Returns whether it succeeded
  const saveProfile = async (token: string): Promise<boolean> => {
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

    if (response.status !== 'success') {
      Toast.show({
        type: 'error',
        text1: 'Error',
        text2: response?.data?.message || 'Failed to update profile',
      });
      return false;
    }

    // Refresh user data
    const selfResult = await getSelf(token);
    if (selfResult.status === 'success') {
      setUserData(selfResult.data);
      await saveUserData(selfResult.data);
    }

    return true;
  };

  const handleSaveDetails = async () => {
    const validationError = getProfileError();
    if (validationError) {
      Toast.show({
        type: 'error',
        text1: 'Error',
        text2: validationError,
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

      if (await saveProfile(token)) {
        Toast.show({
          type: 'success',
          text1: 'Success',
          text2: 'Profile updated',
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

  // Counts unread messages from a specific user
  const getUnreadCountForUser = (userId: string | number): number => {
    const messages = messagesData.messages || {};
    const userMessages = messages[userId] || [];
    const userIdNum = typeof userId === 'string' ? parseInt(userId, 10) : userId;
    
    // Count only incoming unread messages (sender_id === userId and is_read === 0)
    if (!Array.isArray(userMessages)) {
      return 0;
    }
    
    return userMessages.filter((message) => {
      return message && 
             message.sender_id === userIdNum && 
             message.is_read === 0;
    }).length;
  };

  // Returns messages with a specific user
  const getMessagesForUser = (userId: string | number): any[] => {
    const messages = messagesData.messages || {};
    const userMessages = messages[userId] || [];
    
    // If it is an array, sort by created_at
    if (!Array.isArray(userMessages)) {
      return [];
    }
    
    return [...userMessages].sort((a, b) => {
      const dateA = a.created_at ? new Date(a.created_at).getTime() : 0;
      const dateB = b.created_at ? new Date(b.created_at).getTime() : 0;
      return dateA - dateB;
    });
  };

  // Sends a message
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

      const result = await sendMessage(token, selectedChatUser.id, replaceEmoticons(messageText, true).trim());
      if (result.status === 'success') {
        setMessageText('');
        // Scroll down after sending
        setTimeout(() => {
          scrollViewRef.current?.scrollToEnd({ animated: true });
        }, 100);
      } else if (result.data?.error === 'blocked') {
        Toast.show({ type: 'error', text1: "Can't send", text2: "You can't message this user" });
      }
    } catch (error) {
      console.error('Error sending message:', error);
    } finally {
      setSendingMessage(false);
    }
  };


  // Returns to the users list
  const handleBackToUsers = () => {
    setSelectedChatUser(null);
    // Reset the message counter when returning to the list
    lastMessageCountRef.current = 0;
  };

  // Shows the user on the map (navigates to the map screen)
  const handleShowOnMap = (userId: number) => {
    // replace, not push: the profile must not stay mounted under the map, since the polling
    // services keep a single callback and the map clears it when it closes
    router.replace({
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

  // Profile failed to load (no network, server error) - let the user retry or log out
  if (!userData) {
    return (
      <View style={styles.loadingContainer}>
        <Text style={styles.loadErrorText}>Failed to load profile</Text>
        <Pressable style={styles.saveButton} onPress={checkAuth}>
          <Text style={styles.saveButtonText}>Retry</Text>
        </Pressable>
        <Pressable style={styles.logoutButton} onPress={handleLogout}>
          <Text style={styles.logoutButtonText}>Logout</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      {/* Header with map icon, title and messages icon */}
      <View style={[styles.header, { paddingTop: insets.top + 6 }]}>
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
            // Set the value to 0 so the panel appears (translateY = 0)
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
      
      <ScrollView contentContainerStyle={styles.scrollContent} keyboardShouldPersistTaps="handled">
        {/*<Text style={styles.title}>People Meet</Text>*/}

        <View style={styles.card}>
          <Text style={styles.cardHeader}>Profile</Text>

          {userData && (
              <View style={styles.userInfo}>
                {/* Profile photo */}
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
                        <Text style={styles.placeholderText}>No photo</Text>
                      </View>
                  )}
                  
                  {/* Upload Photo button */}
                  <Pressable
                    style={[styles.uploadButton, uploading && styles.uploadButtonDisabled]}
                    onPress={cropMode ? undefined : openFileDialog}
                    disabled={uploading || cropMode}
                  >
                    {uploading ? (
                      <ActivityIndicator size="small" color="#fff" />
                    ) : (
                      <Text style={styles.uploadButtonText}>
                        {cropMode ? 'Processing...' : 'Upload Photo'}
                      </Text>
                    )}
                  </Pressable>
                </View>
                {/* Online status */}
                <View style={styles.infoRow}>
                  <Text style={styles.infoLabel}>Status:</Text>
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


                {/* Main info */}
                <View style={styles.infoRow}>
                  <Text style={styles.infoLabel}>Name:</Text>
                  <TextInput
                    style={styles.input}
                    value={name}
                    onChangeText={setName}
                    placeholder="Enter your name"
                    placeholderTextColor="#999"
                  />
                </View>

                {/*<View style={styles.infoRow}>*/}
                {/*  <Text style={styles.infoLabel}>Email:</Text>*/}
                {/*  <Text style={styles.infoValue}>{userData.email || 'Not specified'}</Text>*/}
                {/*</View>*/}

                <View style={styles.infoRow}>
                  <Text style={styles.infoLabel}>Age (18-90):</Text>
                  <TextInput
                    style={styles.input}
                    value={age}
                    onChangeText={(text) => {
                      // Allow digits only
                      const numericValue = text.replace(/[^0-9]/g, '');
                      setAge(numericValue);
                    }}
                    placeholder="Enter your age"
                    placeholderTextColor="#999"
                    keyboardType="numeric"
                    maxLength={2}
                  />
                </View>

                <View style={styles.infoRow}>
                  <Text style={styles.infoLabel}>Gender:</Text>
                  <View style={styles.genderOptions}>
                    {GENDER_OPTIONS.map((option) => {
                      const selected = sex === option.value;
                      return (
                        <Pressable
                          key={option.value}
                          style={[styles.genderOption, selected && styles.genderOptionSelected]}
                          onPress={() => setSex(option.value)}
                          accessibilityRole="radio"
                          accessibilityState={{ selected }}
                        >
                          <Ionicons name={option.icon} size={18} color={selected ? '#fff' : '#666'} />
                          <Text style={[styles.genderOptionText, selected && styles.genderOptionTextSelected]}>
                            {option.label}
                          </Text>
                        </Pressable>
                      );
                    })}
                  </View>
                </View>

                {/* Description */}
                <View style={styles.infoRow}>
                  <Text style={styles.infoLabel}>Description:</Text>
                  <TextInput
                    style={[styles.input, styles.textArea]}
                    value={description}
                    onChangeText={setDescription}
                    placeholder="Enter a description (at least 10 characters)"
                    placeholderTextColor="#999"
                    multiline
                    numberOfLines={4}
                    textAlignVertical="top"
                  />
                  {description && description.trim().length > 0 && description.trim().length < 10 && (
                    <Text style={styles.errorText}>
                      Description must be at least 10 characters ({description.trim().length}/10)
                    </Text>
                  )}
                </View>

                {/* Thoughts */}
                <View style={styles.infoRow}>
                  <Text style={styles.infoLabel}>Thoughts:</Text>
                  <TextInput
                    style={[styles.input, styles.textArea]}
                    value={thoughts}
                    onChangeText={(text) => {
                      // Limit to 21 characters
                      if (text.length <= 21) {
                        setThoughts(text);
                      } else {
                        setThoughts(text.substring(0, 21));
                      }
                    }}
                    placeholder="Share your thoughts (up to 21 characters)"
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
                      {thoughts.length}/21 characters
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

          {/*/!* Button to go to the map when online *!/*/}
          {/*{isOnline && (*/}
          {/*  <Pressable */}
          {/*    style={styles.mapButton} */}
          {/*    onPress={() => router.replace('/map')}*/}
          {/*  >*/}
          {/*    <Text style={styles.mapButtonText}>Go to M22ap</Text>*/}
          {/*  </Pressable>*/}
          {/*)}*/}

          <Pressable style={styles.blockedUsersButton} onPress={() => router.push('/blocked-users')}>
            <Text style={styles.blockedUsersButtonText}>Blocked users</Text>
          </Pressable>

          <Pressable style={styles.logoutButton} onPress={handleLogout}>
            <Text style={styles.logoutButtonText}>Logout</Text>
          </Pressable>

          <Pressable style={styles.deleteAccountButton} onPress={() => setDeleteAccountVisible(true)}>
            <Text style={styles.deleteAccountButtonText}>Delete account</Text>
          </Pressable>

          <View style={styles.legalLinks}>
            <Text style={styles.legalLink} onPress={() => openLegalPage('privacy')}>Privacy Policy</Text>
            <Text style={styles.legalSeparator}>·</Text>
            <Text style={styles.legalLink} onPress={() => openLegalPage('terms')}>Terms of Use</Text>
          </View>
        </View>
      </ScrollView>

      <DeleteAccountModal
        visible={deleteAccountVisible}
        onClose={() => setDeleteAccountVisible(false)}
        onConfirm={handleDeleteAccount}
      />

      {/* Crop modal */}
      {selectedImageUri && (
        <ImageCropModal
          visible={cropMode}
          imageUri={selectedImageUri}
          imageWidth={selectedImageSize?.width}
          imageHeight={selectedImageSize?.height}
          onSave={onSave}
          onDiscard={onDiscard}
        />
      )}

      {/* Messages panel at the bottom */}
      <MessagesModal
        visible={messagesVisible}
        onUserBlocked={removeUserLocally}
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
        title="Messages"
        getToken={getToken}
        readMessages={readMessages}
        setMessagesData={setMessagesData}
        setUnreadMessagesCount={setUnreadMessagesCount}
        onlineUsers={onlineUsers}
      />
    </KeyboardAvoidingView>
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
  loadErrorText: {
    fontSize: 16,
    color: '#333',
    marginBottom: 10,
  },
  scrollContent: {
    flexGrow: 1,
    alignItems: 'center',
    padding: 16,
  },
  header: {
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
  genderOptions: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 4,
  },
  genderOption: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    padding: 12,
    borderWidth: 1,
    borderColor: '#e0e0e0',
    borderRadius: 8,
    backgroundColor: '#f9f9f9',
  },
  genderOptionSelected: {
    borderColor: '#4ECDC4',
    backgroundColor: '#4ECDC4',
  },
  genderOptionText: {
    fontSize: 16,
    color: '#333',
  },
  genderOptionTextSelected: {
    color: '#fff',
    fontWeight: '600',
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
  blockedUsersButton: {
    borderRadius: 8,
    alignItems: 'center',
    padding: 15,
    borderWidth: 1,
    borderColor: '#e0e0e0',
    marginTop: 10,
  },
  blockedUsersButtonText: {
    color: '#666',
    fontSize: 16,
    fontWeight: '600',
  },
  legalLinks: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 8,
    marginTop: 4,
  },
  legalLink: {
    color: '#999',
    fontSize: 13,
    textDecorationLine: 'underline',
  },
  legalSeparator: {
    color: '#999',
    fontSize: 13,
  },
  deleteAccountButton: {
    alignItems: 'center',
    padding: 15,
    marginTop: 10,
  },
  deleteAccountButtonText: {
    color: '#ff4444',
    fontSize: 15,
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
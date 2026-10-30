import { getToken } from '@/services/auth';
import { getSelf, readMessages, sendMessage, getUsersOnline } from '@/services/api';
import { enableUsersOnlinePolling, disableUsersOnlinePolling, setUsersOnlineCallback } from '@/services/usersOnlineInterval';
import { startMessagesInterval, setMessagesCallback } from '@/services/messagesInterval';
import { startLocationTracking, stopLocationTracking, setLocationCallback } from '@/services/locationTracking';
import { playMessageSound } from '@/services/soundService';
import { Image } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useMemo, useState, useRef } from 'react';
import { ActivityIndicator, AppState, Pressable, View, Text, Modal, TouchableWithoutFeedback, ScrollView, Platform, StyleProp, ImageStyle } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useSharedValue, withSpring } from 'react-native-reanimated';
import MapView, { Marker, PROVIDER_DEFAULT } from 'react-native-maps';
import MessagesModal from '@/components/MessagesModal';
import { useUserModeration } from '@/hooks/use-user-moderation';
import { useMapClusters, MapPoint } from '@/hooks/use-map-clusters';
import Toast from 'react-native-toast-message';
import { getImageUrl, parseCoordinate, getUserMarkerColor, calculateDistance, formatMessageTime, replaceEmoticons } from '@/utils/utils';
import { mapStyles } from '@/styles/mapStyles';

type AvatarMarkerProps = {
  coordinate: { latitude: number; longitude: number };
  identifier?: string;
  onPress: () => void;
  imageUri: string | null;
  avatarStyle: StyleProp<ImageStyle>;
  avatarSize: number;
  thoughts?: string;
};

// Avatar sizes - must match mapStyles.markerAvatar / otherUserMarkerAvatar
const SELF_AVATAR_SIZE = 50;
const OTHER_AVATAR_SIZE = 45;

// Thoughts bubble geometry relative to the avatar: the bubble starts THOUGHTS_TOP above
// the avatar and THOUGHTS_OVERLAP to the left of its right edge
const THOUGHTS_TOP = 40;
const THOUGHTS_WIDTH = 150;
const THOUGHTS_OVERLAP = 15;

// On Android a custom marker is rendered into a bitmap the size of its root View, so the
// bubble would be clipped if it overflowed: with thoughts the root View is expanded to fit it.
// The View is made symmetric around the avatar (transparent space on the other sides), so its
// center IS the avatar center and the marker needs no centerOffset/anchor tweaks: those are
// handled differently by react-native-maps versions and made the marker drift when zooming
const getThoughtsLayout = (avatarSize: number) => {
  const halfAvatar = avatarSize / 2;
  // From the avatar center to the bubble's right edge and to its top
  const toRight = avatarSize - THOUGHTS_OVERLAP + THOUGHTS_WIDTH - halfAvatar;
  const toTop = THOUGHTS_TOP + halfAvatar;
  const width = toRight * 2;
  const height = toTop * 2;
  return {
    width,
    height,
    avatarLeft: width / 2 - halfAvatar,
    avatarTop: height / 2 - halfAvatar,
    bubbleLeft: width / 2 - halfAvatar + avatarSize - THOUGHTS_OVERLAP,
  };
};

// Google Maps anchors custom markers by the bottom center by default; the center keeps the
// avatar on the coordinate (Apple Maps already centers custom views)
const MARKER_ANCHOR = Platform.OS === 'android' ? { anchor: { x: 0.5, y: 0.5 } } : {};

// Marker with a custom avatar view. tracksViewChanges stays on only until the avatar
// is displayed: when it is always on, iOS keeps redrawing every marker and the map lags
function AvatarMarker({ coordinate, identifier, onPress, imageUri, avatarStyle, avatarSize, thoughts }: AvatarMarkerProps) {
  const [tracksViewChanges, setTracksViewChanges] = useState(true);

  // Without a photo there is nothing to wait for: stop tracking after the first render
  // Markers keep a stable key, so a new photo or thoughts update the existing marker instead of
  // re-creating it: redraw for a moment, then stop. With a photo, onDisplay usually stops it
  // earlier; the timeout covers cached photos and thoughts-only changes
  useEffect(() => {
    setTracksViewChanges(true);
    const timer = setTimeout(() => setTracksViewChanges(false), imageUri ? 1500 : 300);
    return () => clearTimeout(timer);
  }, [imageUri, thoughts]);

  const avatar = imageUri ? (
    <Image
      source={{ uri: imageUri }}
      style={avatarStyle}
      contentFit="cover"
      onDisplay={() => setTracksViewChanges(false)}
      onError={() => setTracksViewChanges(false)}
    />
  ) : (
    <View style={[avatarStyle, mapStyles.markerAvatarPlaceholder]}>
      <View style={mapStyles.markerAvatarInner} />
    </View>
  );

  const thoughtsLayout = thoughts ? getThoughtsLayout(avatarSize) : null;

  return (
    <Marker
      identifier={identifier}
      coordinate={coordinate}
      onPress={onPress}
      tracksViewChanges={tracksViewChanges}
      {...MARKER_ANCHOR}
    >
      {thoughtsLayout ? (
        <View style={{ width: thoughtsLayout.width, height: thoughtsLayout.height }}>
          <View style={{ position: 'absolute', left: thoughtsLayout.avatarLeft, top: thoughtsLayout.avatarTop }}>{avatar}</View>
          <View style={[mapStyles.markerThoughtsContainer, { left: thoughtsLayout.bubbleLeft }]}>
            <Text style={mapStyles.markerThoughts} numberOfLines={2}>
              {thoughts}
            </Text>
          </View>
        </View>
      ) : (
        <View style={mapStyles.markerContainer}>{avatar}</View>
      )}
    </Marker>
  );
}

export default function MapScreen() {
  const insets = useSafeAreaInsets();
  const [userData, setUserData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [messagesVisible, setMessagesVisible] = useState(false);
  const [onlineUsers, setOnlineUsers] = useState<any[]>([]);
  const [currentUserFromOnline, setCurrentUserFromOnline] = useState<any | null>(null); // Up-to-date data of the current user from online_users
  const [selectedUser, setSelectedUser] = useState<any | null>(null);
  // The phone's own position from location tracking; /online_users never includes the current user,
  // so without it the own marker would stay where it was when the map opened
  const [liveCoords, setLiveCoords] = useState<{ lat: number; lng: number } | null>(null);
  const [unreadMessagesCount, setUnreadMessagesCount] = useState(0);
  const [messagesUsers, setMessagesUsers] = useState<any>({});
  const [messagesData, setMessagesData] = useState<any>({});
  const [selectedChatUser, setSelectedChatUser] = useState<any | null>(null);
  const [messageText, setMessageText] = useState('');
  const [sendingMessage, setSendingMessage] = useState(false);
  const [showUserInfo, setShowUserInfo] = useState(false);
  const slideAnim = useSharedValue(1); // Initial value 1 = panel hidden at the bottom
  const userIdRef = useRef<number | null>(null);
  const scrollViewRef = useRef<ScrollView | null>(null);
  const lastMessageCountRef = useRef<number>(0); // Message count, used to detect new messages
  const previousUnreadCountRef = useRef<number>(0); // Previous unread messages count
  // Previous messages, used to detect new ones; null means no poll has happened yet
  const previousMessagesRef = useRef<any>(null);
  const mapViewRef = useRef<any>(null);
  const focusedUserIdRef = useRef<string | null>(null); // focusUserId the map has already been pointed at
  const openChatAfterCardCloseRef = useRef(false); // Open the messages panel once the user card modal is dismissed
  const params = useLocalSearchParams();

  useEffect(() => {
    checkAuth();

    // Clean up on unmount - stop the interval when the user leaves the screen
    setLocationCallback(setLiveCoords);

    // Location is not tracked in the background; on return the server may have already
    // set the user offline (no requests for 3 minutes), so re-check the status
    const appStateSubscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') {
        refreshOnlineStatus();
      } else if (state === 'background') {
        // Stop telling the server "I'm here": after 3 minutes in the background the server sets
        // the user offline (iOS freezes the app anyway, Android can keep it running)
        stopLocationTracking();
        disableUsersOnlinePolling();
      }
    });

    return () => {
      console.log('MapScreen: Component unmounting, disabling polling');
      appStateSubscription.remove();
      disableUsersOnlinePolling();
      stopLocationTracking();
      setUsersOnlineCallback(null);
      setLocationCallback(null);
    };
  }, []);

  useEffect(() => {
    // Update the ref when userData changes
    if (userData?.id) {
      userIdRef.current = userData.id;
    }
  }, [userData?.id]);

  useEffect(() => {
    // Set the callback for receiving online users
    // Use a functional state update to make sure the state is current
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
      
      // Handle different response formats
      if (Array.isArray(users)) {
        usersArray = users;
      } else if (users.users && Array.isArray(users.users)) {
        usersArray = users.users;
      } else if (users.data && Array.isArray(users.data)) {
        usersArray = users.data;
      }
      
      // Find the current user's data in the response and store it separately
      // This guarantees the data from the latest request is used
      const currentUserData = usersArray.find((user: any) => {
        const userId = user.id || user.user_id;
        return userId === currentUserId;
      });
      
      // Store the current user's up-to-date data from online_users
      if (currentUserData) {
        const parsedCurrentUser = {
          ...currentUserData,
          id: currentUserData.id || currentUserData.user_id,
          lat: parseCoordinate(currentUserData.lat),
          lng: parseCoordinate(currentUserData.lng),
        };
        setCurrentUserFromOnline(parsedCurrentUser);
      }
      
      // Filter the current user out of the list of other users and validate the data
      const filteredUsers = usersArray
        .filter((user: any) => {
          const userId = user.id || user.user_id;
          // Check that the user is not the current one and the data is valid
          if (userId === currentUserId) return false;
          // Check that coordinates are present
          const lat = parseCoordinate(user.lat);
          const lng = parseCoordinate(user.lng);
          return lat !== null && lng !== null;
        })
        .map((user: any) => ({
          ...user,
          id: user.id || user.user_id,
          // Make sure the coordinates are valid
          lat: parseCoordinate(user.lat),
          lng: parseCoordinate(user.lng),
        }));

      // Always update state with fresh data from online_users
      // This ensures markers use up-to-date data (thoughts, image, etc.)
      setOnlineUsers(filteredUsers);
    });

    // Clear the callback on unmount (a duplicate cleanup already exists in the first useEffect)
    return () => {
      setUsersOnlineCallback(null);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Handle the focusUserId param to focus on a user's marker
  useEffect(() => {
    const focusUserId = params.focusUserId;
    // onlineUsers refresh every 3 seconds: point the map at the user only once,
    // otherwise the camera keeps jumping back and the map cannot be moved
    if (typeof focusUserId === 'string' && focusUserId === focusedUserIdRef.current) {
      return;
    }
    if (focusUserId && onlineUsers.length > 0 && mapViewRef.current) {
      const userId = typeof focusUserId === 'string' ? parseInt(focusUserId, 10) : focusUserId;
      const user = onlineUsers.find((u: any) => (u.id || u.user_id) === userId);
      
      if (user) {
        const userLat = parseCoordinate(user.lat);
        const userLng = parseCoordinate(user.lng);
        
        if (userLat !== null && userLng !== null) {
          focusedUserIdRef.current = String(focusUserId);
          // Point the map at the user's marker
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
    // Set the callback for receiving messages
    setMessagesCallback((messagesData) => {
      console.log('MapScreen: Received messages data:', messagesData);
      
      if (!messagesData) {
        setUnreadMessagesCount(0);
        setMessagesUsers({});
        setMessagesData({});
        return;
      }
      
      // Count users with unread messages
      const messages = messagesData.messages || {};
      // On the first poll every existing unread message would look new - do not play a sound for them
      const isFirstPoll = previousMessagesRef.current === null;
      const previousMessages = previousMessagesRef.current || {};
      let usersWithUnreadCount = 0;
      let shouldPlaySound = false;
      
      Object.keys(messages).forEach((userId) => {
        const userMessages = messages[userId] || [];
        const userIdNum = parseInt(userId, 10);
        const previousUserMessages = previousMessages[userId] || [];
        
        // Check whether there is at least one incoming unread message (sender_id === userId and is_read: 0)
        const hasUnread = Array.isArray(userMessages) && userMessages.some((message) => {
          return message && 
                 message.sender_id === userIdNum && 
                 message.is_read === 0;
        });
        
        if (hasUnread) {
          usersWithUnreadCount++;
        }
        
        // Check for new unread messages from this user
        if (Array.isArray(userMessages) && Array.isArray(previousUserMessages)) {
          // Find new unread messages (is_read: 0 and sender_id === userIdNum)
          const newUnreadMessages = userMessages.filter((message) => {
            if (!message || message.sender_id !== userIdNum || message.is_read !== 0) {
              return false;
            }
            
            // Check that this message was not among the previous messages
            const messageExists = previousUserMessages.some((prevMessage) => {
              return prevMessage && prevMessage.id === message.id;
            });
            
            return !messageExists;
          });
          
          // If there are new unread messages and the chat with this user is not open
          if (newUnreadMessages.length > 0) {
            const isDialogOpen = messagesVisible && selectedChatUser && 
              (selectedChatUser.id === userIdNum || String(selectedChatUser.id) === userId);
            
            if (!isDialogOpen) {
              shouldPlaySound = true;
            }
          }
        }
      });
      
      // Play a sound if there are new unread messages and the chat is not open
      if (shouldPlaySound && !isFirstPoll) {
        playMessageSound();
      }
      
      // Store current messages for the next check
      previousMessagesRef.current = messages;
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
      router.replace('/');
      return;
    }

    // Fetch data from the server
    const result = await getSelf(token);

    if (result.status === 'success') {
      setUserData(result.data);

      // Start the messages polling interval (always, if the user is logged in)
      startMessagesInterval();

      // If the user is not online, redirect to the profile and stop polling
      if (result.data.is_online !== 1) {
        console.log('MapScreen: User is offline, disabling polling and redirecting to profile');
        disableUsersOnlinePolling();
        stopLocationTracking();
        router.replace('/profile');
        return;
      }

      // If the user is online, start users polling
      const onlineStatus = result.data.is_online === 1;
      if (onlineStatus) {
        console.log('MapScreen: User is online, enabling polling');
        enableUsersOnlinePolling();
        startLocationTracking();
        // The first request is made automatically in startInterval if the callback is set
      } else {
        console.log('MapScreen: User is offline, disabling polling');
        disableUsersOnlinePolling();
        stopLocationTracking();
      }
    } else {
      // If the data could not be fetched, redirect to the profile
      router.replace('/profile');
      return;
    }

    setLoading(false);
  };

  // Called when the app returns to the foreground
  const refreshOnlineStatus = async () => {
    const token = await getToken();
    if (!token) return;

    const result = await getSelf(token);
    // A network error on resume is not a reason to leave the map: keep going as before
    if (result.status === 'success' && result.data.is_online !== 1) {
      disableUsersOnlinePolling();
      stopLocationTracking();
      Toast.show({
        type: 'info',
        text1: 'Offline',
        text2: 'You were set offline due to inactivity',
      });
      router.replace('/profile');
      return;
    }

    if (result.status === 'success') {
      setUserData(result.data);
    }
    enableUsersOnlinePolling();
    startLocationTracking();
  };


  // Use the current user's up-to-date data from online_users, if available
  // Otherwise use data from userData (on first load)
  const currentUserData = currentUserFromOnline || userData;
  // The live position from the phone takes priority over the one stored on the server
  const userLat = liveCoords?.lat ?? parseCoordinate(currentUserData?.lat);
  const userLng = liveCoords?.lng ?? parseCoordinate(currentUserData?.lng);

  const handleMarkerPress = async (user: any) => {
    const userId = user.id;
    
    // Look up the user's up-to-date data in onlineUsers right away
    // onlineUsers refresh every 3 seconds and hold fresh info
    const actualUser = onlineUsers.find((u: any) => {
      const uId = u.id || u.user_id;
      return uId === userId || String(uId) === String(userId);
    });
    
    // If up-to-date data was found in onlineUsers, use it
    if (actualUser) {
      // Merge data: up-to-date data from onlineUsers takes priority
      const updatedUser = {
        ...user, // Base data from the marker
        ...actualUser, // Up-to-date data from onlineUsers (overrides old data)
        id: userId, // Keep the id
        lat: actualUser.lat || user.lat, // Keep coordinates
        lng: actualUser.lng || user.lng,
      };
      setSelectedUser(updatedUser);
    } else {
      // If the user is not in onlineUsers, check messagesUsers
      const userIdKey = Object.keys(messagesUsers).find(id => {
        const msgUser = messagesUsers[id];
        return msgUser && (msgUser.id === userId || String(msgUser.id) === String(userId) || id === String(userId));
      });
      
      if (userIdKey && messagesUsers[userIdKey]) {
        // Merge data from messagesUsers
        const updatedUser = {
          ...user,
          ...messagesUsers[userIdKey],
          id: userId,
          lat: user.lat, // Keep coordinates from the marker
          lng: user.lng,
        };
        setSelectedUser(updatedUser);
      } else {
        // Use the marker data as is
        setSelectedUser(user);
      }
    }
    
    // Additionally: fetch fresh data via the API to make sure it is current
    // Useful if the user has just changed their data
    try {
      const token = await getToken();
      if (token && userId) {
        // Fetch the current users list
        const freshUsers = await getUsersOnline(token);
        if (freshUsers) {
          let usersArray: any[] = [];
          
          // Handle different response formats
          if (Array.isArray(freshUsers)) {
            usersArray = freshUsers;
          } else if (freshUsers.users && Array.isArray(freshUsers.users)) {
            usersArray = freshUsers.users;
          } else if (freshUsers.data && Array.isArray(freshUsers.data)) {
            usersArray = freshUsers.data;
          }
          
          // Find the user in the fresh data
          const freshUser = usersArray.find((u: any) => {
            const uId = u.id || u.user_id;
            return uId === userId || String(uId) === String(userId);
          });
          
          // If fresh data was found, update selectedUser
          if (freshUser) {
            setSelectedUser((prevUser: any) => {
              if (!prevUser || (prevUser.id || prevUser.user_id) !== userId) {
                return prevUser; // If selectedUser has changed, do not update
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
      // Ignore the error, use the data we already have
    }
  };

  // Renders a cluster
  // Other online users as map points (your own marker is never clustered)
  const otherUserPoints: MapPoint<any>[] = useMemo(
    () =>
      onlineUsers
        .map((user: any) => ({
          user,
          userId: user.id ?? user.user_id,
          latitude: parseCoordinate(user.lat),
          longitude: parseCoordinate(user.lng),
        }))
        .filter(({ userId, latitude, longitude }) => userId !== undefined && latitude !== null && longitude !== null)
        .map(({ user, userId, latitude, longitude }) => ({
          key: `user-${userId}`,
          latitude: latitude as number,
          longitude: longitude as number,
          data: user,
        })),
    [onlineUsers],
  );

  const { items: mapItems, onRegionChangeComplete, getClusterCoordinates } = useMapClusters(otherUserPoints);

  const renderCluster = (clusterId: number, pointCount: number, latitude: number, longitude: number) => {
    return (
      <Marker
        key={`cluster-${clusterId}`}
        coordinate={{ latitude, longitude }}
        // Zoom to fit all the cluster's markers: fitToCoordinates works on Apple Maps too,
        // unlike animateToCamera({ zoom }), which is Google Maps only
        onPress={() =>
          mapViewRef.current?.fitToCoordinates(getClusterCoordinates(clusterId), {
            edgePadding: { top: 50, left: 50, bottom: 50, right: 50 },
            animated: true,
          })
        }
      >
        <View style={mapStyles.clusterContainer}>
          <View style={mapStyles.clusterMarker}>
            <Text style={mapStyles.clusterText}>{pointCount}</Text>
          </View>
        </View>
      </Marker>
    );
  };

  const handleCloseUserCard = () => {
    setSelectedUser(null);
  };

  // Hide a blocked/reported user right away instead of waiting for the next poll
  const removeUserLocally = (removedId: number) => {
    const isRemoved = (user: any) => String(user?.id ?? user?.user_id) === String(removedId);
    setSelectedUser((current: any) => (isRemoved(current) ? null : current));
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
    if (selectedChatUser && isRemoved(selectedChatUser)) {
      setSelectedChatUser(null);
    }
  };

  const { openMenu: openUserMenu, reportModal } = useUserModeration(removeUserLocally);

  // Update selectedUser with up-to-date data from onlineUsers and messagesUsers when they change
  useEffect(() => {
    if (selectedUser) {
      const userId = selectedUser.id || selectedUser.user_id;
      if (userId) {
        // Look up the user in onlineUsers (they hold the most up-to-date data, refreshed every 3 seconds)
        const onlineUser = onlineUsers.find((u: any) => {
          const uId = u.id || u.user_id;
          return uId === userId || String(uId) === String(userId);
        });
        
        // If the user is found in onlineUsers, always update from there (that data is the most current)
        if (onlineUser) {
          // Build an object with up-to-date data
          const updatedUser = {
            ...selectedUser,
            ...onlineUser, // Up-to-date data from onlineUsers takes priority
            id: userId, // Keep the id
            lat: onlineUser.lat || selectedUser.lat, // Keep coordinates
            lng: onlineUser.lng || selectedUser.lng,
          };
          
          // Check whether the data actually changed
          const fieldsToCheck = ['image', 'name', 'age', 'sex', 'description', 'thoughts', 'is_online'];
          const hasChanges = fieldsToCheck.some(field => {
            const oldValue = selectedUser[field];
            const newValue = onlineUser[field];
            return oldValue !== newValue;
          });
          
          // Update only if the data actually changed
          if (hasChanges) {
            setSelectedUser(updatedUser);
          }
        } else {
          // If the user is not in onlineUsers, check messagesUsers
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
                ...msgUser, // Fill in with data from messagesUsers
                lat: selectedUser.lat, // Keep coordinates
                lng: selectedUser.lng,
                id: userId, // Keep the id
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
    
    // Look up the user in messagesUsers by id (key format may differ)
    const userId = Object.keys(messagesUsers).find(id => {
      const user = messagesUsers[id];
      return user && (user.id === selectedUser.id || 
                      String(user.id) === String(selectedUser.id) || 
                      id === String(selectedUser.id));
    });
    
    let chatUser;
    
    if (userId && messagesUsers[userId]) {
      // If the user is found in messagesUsers, use that data (up to date from get_messages)
      // But fill in coordinates from selectedUser if available
      chatUser = {
        ...messagesUsers[userId],
        lat: selectedUser.lat,
        lng: selectedUser.lng,
      };
    } else {
      // If the user is not in messagesUsers, use all data from selectedUser
      // selectedUser holds up-to-date data from onlineUsers (age, description, name, sex, thoughts, etc.)
      chatUser = { ...selectedUser };
    }
    
    // Set the user for the chat
    setSelectedChatUser(chatUser);
    setShowUserInfo(false); // Reset the user info view when opening a new chat
    
    // Reset the message counter when opening a new chat
    lastMessageCountRef.current = 0;
    
    // Close the user card
    handleCloseUserCard();
    
    // On iOS a Modal cannot be presented while another one is being dismissed,
    // so the messages panel is opened from the card's onDismiss
    if (Platform.OS === 'ios') {
      openChatAfterCardCloseRef.current = true;
    } else {
      openMessagesPanel();
    }
  };

  // Open the messages modal
  const openMessagesPanel = () => {
    setMessagesVisible(true);
    // Set the value to 0 so the panel appears (translateY = 0)
    slideAnim.value = withSpring(0);
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

  // Opens a chat with a user

  // Returns to the users list
  const handleBackToUsers = () => {
    setSelectedChatUser(null);
    // Reset the message counter when returning to the list
    lastMessageCountRef.current = 0;
  };

  // Shows a user on the map
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

  // Moves the map back to the current user's position
  const handleCenterOnMe = () => {
    if (userLat === null || userLng === null) return;
    mapViewRef.current?.animateToRegion({
      latitude: userLat,
      longitude: userLng,
      latitudeDelta: 0.01,
      longitudeDelta: 0.01,
    }, 500);
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
        {/* Header with profile icon, title and messages icon */}
        <View style={[mapStyles.header, { paddingTop: insets.top + 6 }]}>
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
              onPress={openMessagesPanel}
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

        {/* Screen content - the map */}
        <View style={mapStyles.content}>
          {userLat !== null && userLng !== null ? (
              <MapView
                  key="main-map" // A stable key prevents a full re-render on data updates
                  ref={mapViewRef}
                  provider={PROVIDER_DEFAULT}
                  style={mapStyles.map}
                  initialRegion={{
                    latitude: userLat || 0,
                    longitude: userLng || 0,
                    latitudeDelta: 0.01,
                    longitudeDelta: 0.01,
                  }}
                  showsUserLocation={false}
                  showsMyLocationButton={false}
                  // Clusters are recomputed for the region the user settled on
                  onRegionChangeComplete={onRegionChangeComplete}
              >
                {/* Current user's marker - uses up-to-date data from online_users */}
                {currentUserData && userLat !== null && userLng !== null && (
                  <AvatarMarker
                      // Stable key: re-creating map markers crashes react-native-maps on the new architecture
                      key="self"
                      coordinate={{
                        latitude: userLat,
                        longitude: userLng,
                      }}
                      onPress={() => handleMarkerPress(currentUserData)}
                      imageUri={getImageUrl(currentUserData?.image)}
                      avatarStyle={mapStyles.markerAvatar}
                      avatarSize={SELF_AVATAR_SIZE}
                      thoughts={currentUserData?.thoughts}
                  />
                )}

                {/* Markers of other online users and clusters: one flat list with stable keys */}
                {mapItems.map((item) => {
                  const [longitude, latitude] = item.geometry.coordinates;
                  if ('cluster' in item.properties && item.properties.cluster) {
                    return renderCluster(item.properties.cluster_id, item.properties.point_count, latitude, longitude);
                  }

                  // onlineUsers holds the freshest data (thoughts, image, name, age, etc.), refreshed every 3 seconds
                  const actualUser = item.properties.data;
                  const userId = actualUser.id ?? actualUser.user_id;
                  // Generate a unique marker color based on user data
                  const markerColor = getUserMarkerColor(actualUser);

                  return (
                      <AvatarMarker
                          // Stable key: changed thoughts/photo update the marker instead of re-creating it
                          key={item.properties.key}
                          identifier={String(userId)}
                          coordinate={{ latitude, longitude }}
                          onPress={() => handleMarkerPress(actualUser)}
                          imageUri={getImageUrl(actualUser.image)}
                          avatarStyle={[mapStyles.otherUserMarkerAvatar, { borderColor: markerColor }]}
                          avatarSize={OTHER_AVATAR_SIZE}
                          thoughts={actualUser.thoughts}
                      />
                  );
                })}
              </MapView>
          ) : null}

          {/* Button that moves the map back to the current user */}
          {userLat !== null && userLng !== null ? (
              <Pressable
                  style={({ pressed }) => [
                    mapStyles.centerOnMeButton,
                    { bottom: insets.bottom + 24 },
                    pressed && mapStyles.centerOnMeButtonPressed,
                  ]}
                  onPress={handleCenterOnMe}
                  hitSlop={8}
                  accessibilityLabel="Show my location"
              >
                <Ionicons name="locate" size={24} color="#4ECDC4" />
              </Pressable>
          ) : (
              <View style={mapStyles.emptyContent}>
                <Text style={mapStyles.emptyText}>Location unavailable</Text>
              </View>
          )}
        </View>

        {/* User card shown when a marker is tapped */}
        <Modal
          visible={selectedUser !== null}
          transparent={true}
          animationType="fade"
          onRequestClose={handleCloseUserCard}
          onDismiss={() => {
            if (openChatAfterCardCloseRef.current) {
              openChatAfterCardCloseRef.current = false;
              openMessagesPanel();
            }
          }}
        >
          <TouchableWithoutFeedback onPress={handleCloseUserCard}>
            <View style={mapStyles.userCardBackdrop}>
              <TouchableWithoutFeedback onPress={(e) => e.stopPropagation()}>
                <View style={mapStyles.userCard}>
                  {/* Close button */}
                  <Pressable
                    style={mapStyles.userCardCloseButton}
                    onPress={handleCloseUserCard}
                  >
                    <Text style={mapStyles.userCardCloseText}>✕</Text>
                  </Pressable>

                  {/* Report / block menu - not for your own card */}
                  {selectedUser && selectedUser.id !== userData?.id ? (
                    <Pressable
                      style={mapStyles.userCardMenuButton}
                      onPress={() => openUserMenu({ id: selectedUser.id || selectedUser.user_id, name: selectedUser.name })}
                      hitSlop={8}
                      accessibilityLabel="Report or block"
                    >
                      <Ionicons name="ellipsis-horizontal" size={18} color="#666" />
                    </Pressable>
                  ) : null}

                  {/* User photo */}
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

                  {/* User info */}
                  <ScrollView style={mapStyles.userCardContent} showsVerticalScrollIndicator={false}>
                    <Text style={mapStyles.userCardName}>
                      {selectedUser?.name || 'No name'}
                    </Text>
                    
                    <Text style={mapStyles.userCardInfo}>
                      Age - {selectedUser?.age || 'not specified'}
                    </Text>
                    
                    <Text style={mapStyles.userCardInfo}>
                      Gender - {selectedUser?.sex === 'male' ? 'Male' : selectedUser?.sex === 'female' ? 'Female' : selectedUser?.sex || 'not specified'}
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

                  {/* Write button or "It's you" text */}
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
          {/* Rendered inside the card modal so it can be presented on top of it */}
          {reportModal}
        </Modal>

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
      </View>
  );
}


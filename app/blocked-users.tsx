import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Alert, FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import { Image } from 'expo-image';
import Toast from 'react-native-toast-message';
import { getBlockedUsers, unblockUser } from '@/services/api';
import { getToken } from '@/services/auth';
import { getImageUrl } from '@/utils/utils';

type BlockedUser = { id: number; name?: string | null; image?: string | null; blocked_at?: string };

export default function BlockedUsersScreen() {
  const [users, setUsers] = useState<BlockedUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [unblockingId, setUnblockingId] = useState<number | null>(null);

  const loadUsers = useCallback(async () => {
    const token = await getToken();
    if (!token) return;
    const result = await getBlockedUsers(token);
    if (result.status === 'success') {
      setUsers(result.data?.users || []);
    } else {
      Toast.show({ type: 'error', text1: 'Error', text2: 'Failed to load blocked users' });
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    loadUsers();
  }, [loadUsers]);

  const unblock = async (user: BlockedUser) => {
    const token = await getToken();
    if (!token) return;
    setUnblockingId(user.id);
    const result = await unblockUser(token, user.id);
    setUnblockingId(null);
    if (result.status === 'success') {
      setUsers((current) => current.filter((u) => u.id !== user.id));
      Toast.show({ type: 'success', text1: 'Unblocked', text2: `${user.name || 'User'} can see you again` });
    } else {
      Toast.show({ type: 'error', text1: 'Error', text2: result.data?.message || 'Failed to unblock' });
    }
  };

  const confirmUnblock = (user: BlockedUser) => {
    Alert.alert(`Unblock ${user.name || 'this user'}?`, 'You will see each other on the map and can message each other again.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Unblock', onPress: () => unblock(user) },
    ]);
  };

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" />
      </View>
    );
  }

  return (
    <FlatList
      style={styles.list}
      contentContainerStyle={users.length === 0 ? styles.center : styles.listContent}
      data={users}
      keyExtractor={(user) => String(user.id)}
      ListEmptyComponent={<Text style={styles.emptyText}>{"You haven't blocked anyone"}</Text>}
      renderItem={({ item }) => (
        <View style={styles.row}>
          {item.image ? (
            <Image source={{ uri: getImageUrl(item.image) || '' }} style={styles.avatar} contentFit="cover" />
          ) : (
            <View style={[styles.avatar, styles.avatarPlaceholder]} />
          )}
          <Text style={styles.name} numberOfLines={1}>
            {item.name || `User ${item.id}`}
          </Text>
          <Pressable
            style={[styles.unblockButton, unblockingId === item.id && styles.unblockButtonDisabled]}
            onPress={() => confirmUnblock(item)}
            disabled={unblockingId === item.id}
          >
            {unblockingId === item.id ? (
              <ActivityIndicator size="small" color="#4ECDC4" />
            ) : (
              <Text style={styles.unblockText}>Unblock</Text>
            )}
          </Pressable>
        </View>
      )}
    />
  );
}

const styles = StyleSheet.create({
  list: {
    flex: 1,
    backgroundColor: '#fff',
  },
  listContent: {
    padding: 16,
  },
  center: {
    flexGrow: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#fff',
  },
  emptyText: {
    fontSize: 16,
    color: '#999',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0',
  },
  avatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    marginRight: 12,
  },
  avatarPlaceholder: {
    backgroundColor: '#e0e0e0',
  },
  name: {
    flex: 1,
    fontSize: 16,
    color: '#333',
  },
  unblockButton: {
    minWidth: 90,
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#4ECDC4',
    alignItems: 'center',
  },
  unblockButtonDisabled: {
    opacity: 0.6,
  },
  unblockText: {
    color: '#4ECDC4',
    fontSize: 15,
    fontWeight: '600',
  },
});

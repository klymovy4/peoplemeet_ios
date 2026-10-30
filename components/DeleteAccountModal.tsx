import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

type Props = {
  visible: boolean;
  onClose: () => void;
  // Resolves to an error message, or null when the account was deleted
  onConfirm: (password: string) => Promise<string | null>;
};

export default function DeleteAccountModal({ visible, onClose, onConfirm }: Props) {
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    if (visible) {
      setPassword('');
      setError(null);
      setDeleting(false);
    }
  }, [visible]);

  const handleDelete = async () => {
    if (!password || deleting) return;
    setDeleting(true);
    setError(null);
    const errorMessage = await onConfirm(password);
    setDeleting(false);
    if (errorMessage) setError(errorMessage);
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <KeyboardAvoidingView
        style={styles.backdrop}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <View style={styles.sheet}>
          <Text style={styles.title}>Delete account?</Text>
          <Text style={styles.text}>
            Your profile, photo and all your conversations will be deleted permanently. This cannot be undone.
          </Text>
          <Text style={styles.text}>You can register again with the same email later.</Text>

          <Text style={styles.label}>Enter your password to confirm</Text>
          <TextInput
            style={styles.input}
            value={password}
            onChangeText={setPassword}
            secureTextEntry
            textContentType="password"
            autoComplete="current-password"
            autoFocus
            returnKeyType="done"
            onSubmitEditing={handleDelete}
          />
          {error ? <Text style={styles.error}>{error}</Text> : null}

          <View style={styles.buttons}>
            <Pressable style={[styles.button, styles.cancelButton]} onPress={onClose} disabled={deleting}>
              <Text style={styles.cancelText}>Cancel</Text>
            </Pressable>
            <Pressable
              style={[styles.button, styles.deleteButton, (!password || deleting) && styles.deleteDisabled]}
              onPress={handleDelete}
              disabled={!password || deleting}
            >
              {deleting ? <ActivityIndicator color="#fff" /> : <Text style={styles.deleteText}>Delete</Text>}
            </Pressable>
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  sheet: {
    width: '90%',
    maxWidth: 400,
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 20,
  },
  title: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#333',
    marginBottom: 10,
  },
  text: {
    fontSize: 15,
    color: '#555',
    marginBottom: 8,
  },
  label: {
    fontSize: 14,
    color: '#666',
    marginTop: 8,
    marginBottom: 6,
  },
  input: {
    borderWidth: 1,
    borderColor: '#e0e0e0',
    borderRadius: 8,
    padding: 12,
    fontSize: 16,
    color: '#333',
  },
  error: {
    color: '#ff4444',
    fontSize: 14,
    marginTop: 8,
  },
  buttons: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 20,
  },
  button: {
    flex: 1,
    padding: 14,
    borderRadius: 8,
    alignItems: 'center',
  },
  cancelButton: {
    backgroundColor: '#f0f0f0',
  },
  cancelText: {
    fontSize: 16,
    color: '#333',
    fontWeight: '600',
  },
  deleteButton: {
    backgroundColor: '#ff4444',
  },
  deleteDisabled: {
    opacity: 0.5,
  },
  deleteText: {
    fontSize: 16,
    color: '#fff',
    fontWeight: '600',
  },
});

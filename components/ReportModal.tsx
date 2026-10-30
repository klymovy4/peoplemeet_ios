import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { REPORT_REASONS, ReportReason } from '@/services/api';

const MAX_COMMENT_LENGTH = 500;

type Props = {
  visible: boolean;
  userName: string;
  // Reporting a specific chat message rather than the whole profile
  isMessage?: boolean;
  onClose: () => void;
  onSubmit: (reason: ReportReason, comment: string) => Promise<void>;
};

export default function ReportModal({ visible, userName, isMessage, onClose, onSubmit }: Props) {
  const [reason, setReason] = useState<ReportReason | null>(null);
  const [comment, setComment] = useState('');
  const [sending, setSending] = useState(false);

  // Start clean every time the modal opens
  useEffect(() => {
    if (visible) {
      setReason(null);
      setComment('');
      setSending(false);
    }
  }, [visible]);

  const handleSubmit = async () => {
    if (!reason || sending) return;
    setSending(true);
    try {
      await onSubmit(reason, comment.trim());
    } finally {
      setSending(false);
    }
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <KeyboardAvoidingView
        style={styles.backdrop}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <View style={styles.sheet}>
          <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={styles.content}>
            <Text style={styles.title}>{isMessage ? 'Report message' : `Report ${userName}`}</Text>
            <Text style={styles.subtitle}>
              {`${userName} will be blocked and our team will review the report. They won't know who reported them.`}
            </Text>

            {REPORT_REASONS.map((option) => {
              const selected = reason === option.value;
              return (
                <Pressable
                  key={option.value}
                  style={[styles.reason, selected && styles.reasonSelected]}
                  onPress={() => setReason(option.value)}
                  accessibilityRole="radio"
                  accessibilityState={{ selected }}
                >
                  <Text style={[styles.reasonText, selected && styles.reasonTextSelected]}>{option.label}</Text>
                  {selected ? <Ionicons name="checkmark" size={20} color="#4ECDC4" /> : null}
                </Pressable>
              );
            })}

            <TextInput
              style={styles.comment}
              value={comment}
              onChangeText={setComment}
              placeholder="Add details (optional)"
              placeholderTextColor="#999"
              multiline
              maxLength={MAX_COMMENT_LENGTH}
            />

            <View style={styles.buttons}>
              <Pressable style={[styles.button, styles.cancelButton]} onPress={onClose} disabled={sending}>
                <Text style={styles.cancelText}>Cancel</Text>
              </Pressable>
              <Pressable
                style={[styles.button, styles.submitButton, (!reason || sending) && styles.submitDisabled]}
                onPress={handleSubmit}
                disabled={!reason || sending}
              >
                {sending ? <ActivityIndicator color="#fff" /> : <Text style={styles.submitText}>Report</Text>}
              </Pressable>
            </View>
          </ScrollView>
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
    maxHeight: '85%',
    backgroundColor: '#fff',
    borderRadius: 16,
  },
  content: {
    padding: 20,
  },
  title: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#333',
    marginBottom: 6,
  },
  subtitle: {
    fontSize: 14,
    color: '#666',
    marginBottom: 16,
  },
  reason: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderWidth: 1,
    borderColor: '#e0e0e0',
    borderRadius: 8,
    marginBottom: 8,
  },
  reasonSelected: {
    borderColor: '#4ECDC4',
    backgroundColor: 'rgba(78, 205, 196, 0.08)',
  },
  reasonText: {
    fontSize: 16,
    color: '#333',
  },
  reasonTextSelected: {
    fontWeight: '600',
  },
  comment: {
    minHeight: 70,
    maxHeight: 120,
    borderWidth: 1,
    borderColor: '#e0e0e0',
    borderRadius: 8,
    padding: 12,
    fontSize: 15,
    color: '#333',
    textAlignVertical: 'top',
    marginTop: 4,
  },
  buttons: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 16,
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
  submitButton: {
    backgroundColor: '#FF6B6B',
  },
  submitDisabled: {
    opacity: 0.5,
  },
  submitText: {
    fontSize: 16,
    color: '#fff',
    fontWeight: '600',
  },
});

import { useState } from 'react';
import { Alert } from 'react-native';
import Toast from 'react-native-toast-message';
import ReportModal from '@/components/ReportModal';
import { blockUser, reportUser, ReportReason } from '@/services/api';
import { getToken } from '@/services/auth';

type ModeratedUser = { id: number; name?: string | null };

type ReportTarget = { userId: number; name: string; messageId?: number };

const displayName = (user: ModeratedUser) => user.name || 'this user';

/**
 * "Report" / "Block" actions for another user. `onUserRemoved` is called after a block or
 * a report (reporting blocks too), so the screen can hide the user right away instead of
 * waiting for the next poll. Render `reportModal` inside the screen's (or modal's) tree.
 */
export function useUserModeration(onUserRemoved?: (userId: number) => void) {
  const [reportTarget, setReportTarget] = useState<ReportTarget | null>(null);

  const block = async (user: ModeratedUser) => {
    const token = await getToken();
    if (!token) return;

    const result = await blockUser(token, user.id);
    if (result.status === 'success') {
      Toast.show({ type: 'success', text1: 'Blocked', text2: `You won't see ${displayName(user)} anymore` });
      onUserRemoved?.(user.id);
    } else {
      Toast.show({ type: 'error', text1: 'Error', text2: result.data?.message || 'Failed to block the user' });
    }
  };

  const confirmBlock = (user: ModeratedUser) => {
    Alert.alert(
      `Block ${displayName(user)}?`,
      "You won't see each other on the map and won't be able to message each other. You can unblock them in your profile.",
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Block', style: 'destructive', onPress: () => block(user) },
      ],
    );
  };

  /** Action menu for the "⋯" button */
  const openMenu = (user: ModeratedUser) => {
    Alert.alert(user.name || 'User', undefined, [
      { text: 'Report', onPress: () => openReport(user) },
      { text: 'Block', style: 'destructive', onPress: () => confirmBlock(user) },
      { text: 'Cancel', style: 'cancel' },
    ]);
  };

  const openReport = (user: ModeratedUser) => {
    setReportTarget({ userId: user.id, name: displayName(user) });
  };

  const reportMessage = (user: ModeratedUser, messageId: number) => {
    setReportTarget({ userId: user.id, name: displayName(user), messageId });
  };

  const submitReport = async (reason: ReportReason, comment: string) => {
    if (!reportTarget) return;
    const token = await getToken();
    if (!token) return;

    const result = await reportUser(token, reportTarget.userId, reason, {
      message_id: reportTarget.messageId,
      comment: comment || undefined,
    });
    if (result.status === 'success') {
      Toast.show({ type: 'success', text1: 'Report sent', text2: 'Thank you. The user has been blocked' });
      const { userId } = reportTarget;
      setReportTarget(null);
      onUserRemoved?.(userId);
    } else {
      Toast.show({ type: 'error', text1: 'Error', text2: result.data?.message || 'Failed to send the report' });
    }
  };

  const reportModal = (
    <ReportModal
      visible={reportTarget !== null}
      userName={reportTarget?.name || ''}
      isMessage={reportTarget?.messageId !== undefined}
      onClose={() => setReportTarget(null)}
      onSubmit={submitReport}
    />
  );

  return { openMenu, openReport, confirmBlock, reportMessage, reportModal };
}

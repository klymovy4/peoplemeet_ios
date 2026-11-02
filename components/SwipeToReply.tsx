import { ReactNode } from 'react';
import { StyleSheet } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  Extrapolation,
  interpolate,
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
} from 'react-native-reanimated';
import { Ionicons } from '@expo/vector-icons';
import { chatColors } from '@/theme/colors';

// How far the message follows the finger, and from where releasing it starts a reply
const MAX_DRAG = 80;
const REPLY_THRESHOLD = 55;

type Props = {
  enabled: boolean;
  onReply: () => void;
  children: ReactNode;
};

/**
 * Swipe a message to the right to reply (as in WhatsApp/Telegram). The pan only starts after a
 * clear horizontal move to the right and gives up on vertical moves, so scrolling the chat,
 * double tap (like) and long press (menu) keep working.
 */
export default function SwipeToReply({ enabled, onReply, children }: Props) {
  const translateX = useSharedValue(0);

  const pan = Gesture.Pan()
    .enabled(enabled)
    .activeOffsetX(15)
    .failOffsetX(-10)
    .failOffsetY([-12, 12])
    .onUpdate((e) => {
      translateX.value = Math.max(0, Math.min(MAX_DRAG, e.translationX));
    })
    .onEnd(() => {
      if (translateX.value >= REPLY_THRESHOLD) {
        runOnJS(onReply)();
      }
      translateX.value = withSpring(0, { damping: 20, stiffness: 250 });
    });

  const rowStyle = useAnimatedStyle(() => ({ transform: [{ translateX: translateX.value }] }));
  // The reply arrow fades in behind the message as it is dragged
  const iconStyle = useAnimatedStyle(() => ({
    opacity: interpolate(translateX.value, [10, REPLY_THRESHOLD], [0, 1], Extrapolation.CLAMP),
    transform: [{ scale: interpolate(translateX.value, [10, REPLY_THRESHOLD], [0.6, 1], Extrapolation.CLAMP) }],
  }));

  return (
    <GestureDetector gesture={pan}>
      <Animated.View>
        <Animated.View style={[styles.icon, iconStyle]} pointerEvents="none">
          <Ionicons name="arrow-undo" size={20} color={chatColors.accent} />
        </Animated.View>
        <Animated.View style={rowStyle}>{children}</Animated.View>
      </Animated.View>
    </GestureDetector>
  );
}

const styles = StyleSheet.create({
  icon: {
    position: 'absolute',
    left: 4,
    top: 0,
    bottom: 0,
    justifyContent: 'center',
  },
});

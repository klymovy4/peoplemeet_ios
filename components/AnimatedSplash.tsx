import { useEffect } from 'react';
import { StyleSheet } from 'react-native';
import * as SplashScreen from 'expo-splash-screen';
import Animated, {
  Easing,
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withSequence,
  withTiming,
} from 'react-native-reanimated';

// Must match the native splash in app.json (expo-splash-screen: backgroundColor, imageWidth),
// so the switch from the native splash to this view is invisible
const SPLASH_BACKGROUND = '#E9F6EC';
const LOGO_SIZE = 200;

// One heartbeat: a quick double pulse
const beat = () =>
  withSequence(
    withTiming(1.12, { duration: 140, easing: Easing.out(Easing.quad) }),
    withTiming(1, { duration: 140, easing: Easing.in(Easing.quad) }),
    withTiming(1.08, { duration: 120, easing: Easing.out(Easing.quad) }),
    withTiming(1, { duration: 200, easing: Easing.in(Easing.quad) }),
  );

type Props = {
  onFinish: () => void;
};

/**
 * Continues the static native splash with an animation: the logo "beats" like a heart
 * twice, then the splash fades out and slightly zooms into the app.
 */
export default function AnimatedSplash({ onFinish }: Props) {
  const scale = useSharedValue(1);
  const opacity = useSharedValue(1);

  useEffect(() => {
    // The view below is identical to the native splash, so hiding it now is seamless
    SplashScreen.hideAsync().catch(() => {});

    scale.value = withSequence(withDelay(150, beat()), withDelay(120, beat()), withTiming(1.6, { duration: 350 }));
    opacity.value = withDelay(
      1450,
      withTiming(0, { duration: 350 }, (finished) => {
        if (finished) runOnJS(onFinish)();
      }),
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const containerStyle = useAnimatedStyle(() => ({ opacity: opacity.value }));
  const logoStyle = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));

  return (
    <Animated.View style={[styles.container, containerStyle]} pointerEvents="none">
      <Animated.Image
        source={require('@/assets/images/splash-icon.png')}
        style={[styles.logo, logoStyle]}
        resizeMode="contain"
      />
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: SPLASH_BACKGROUND,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 1000,
  },
  logo: {
    width: LOGO_SIZE,
    height: LOGO_SIZE,
  },
});

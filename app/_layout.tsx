import { DefaultTheme, ThemeProvider } from '@react-navigation/native';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import * as SplashScreen from 'expo-splash-screen';
import { useState } from 'react';
import 'react-native-reanimated';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import Toast from 'react-native-toast-message';
import { registerSessionHandler } from '@/services/session';
import AnimatedSplash from '@/components/AnimatedSplash';

// Keep the native splash until AnimatedSplash takes over from it
SplashScreen.preventAutoHideAsync().catch(() => {});

// Log out on an expired token or a banned account, from any screen
registerSessionHandler();

export default function RootLayout() {
  const [splashVisible, setSplashVisible] = useState(true);

  // The screens are styled for a light background only, so the app always uses the light
  // theme (also forced natively via userInterfaceStyle: "light" in app.json)
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <ThemeProvider value={DefaultTheme}>
        <Stack>
          <Stack.Screen name="index" options={{ headerShown: false }} />
          <Stack.Screen name="signup" options={{ headerShown: false }} />
          <Stack.Screen name="recover-password" options={{ headerShown: false }} />
          <Stack.Screen name="profile" options={{ headerShown: false }} />
          <Stack.Screen name="map" options={{ headerShown: false }} />
          <Stack.Screen name="blocked-users" options={{ title: 'Blocked users', headerBackTitle: 'Profile' }} />
        </Stack>
        {/* Light status bar icons on the navy splash, dark ones on the app's white screens */}
        <StatusBar style={splashVisible ? 'light' : 'dark'} />
        <Toast />
        {splashVisible && <AnimatedSplash onFinish={() => setSplashVisible(false)} />}
      </ThemeProvider>
    </GestureHandlerRootView>
  );
}

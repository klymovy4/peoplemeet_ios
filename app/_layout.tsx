import { DefaultTheme, ThemeProvider } from '@react-navigation/native';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import 'react-native-reanimated';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import Toast from 'react-native-toast-message';
import { registerSessionHandler } from '@/services/session';

// Log out on an expired token or a banned account, from any screen
registerSessionHandler();

export default function RootLayout() {
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
        <StatusBar style="dark" />
        <Toast />
      </ThemeProvider>
    </GestureHandlerRootView>
  );
}

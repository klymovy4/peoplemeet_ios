import { signUpUser } from '@/services/api';
import { saveToken } from '@/services/auth';
import { startMessagesInterval } from '@/services/messagesInterval';
import { useTheme } from '@react-navigation/native';
import { router } from 'expo-router';
import { useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import Toast from 'react-native-toast-message';
import { Ionicons } from '@expo/vector-icons';
import { openLegalPage } from '@/services/legal';

export default function SignUpScreen() {
  const { colors } = useTheme();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [passwordConfirmation, setPasswordConfirmation] = useState('');
  const [loading, setLoading] = useState(false);
  const [acceptedTerms, setAcceptedTerms] = useState(false);

  const handleEmailChange = (text: string) => {
    setEmail(text);
  };

  const handlePasswordChange = (text: string) => {
    setPassword(text);
  };

  const handlePasswordConfirmationChange = (text: string) => {
    setPasswordConfirmation(text);
  };

  const handleSignUp = async () => {
    // Field validation
    if (!email || !password || !passwordConfirmation) {
      Toast.show({
        type: 'error',
        text1: 'Error',
        text2: 'Please fill in all fields',
      });
      return;
    }

    // Accepting the rules is required (App Store / Google Play rule for user-generated content)
    if (!acceptedTerms) {
      Toast.show({
        type: 'error',
        text1: 'Error',
        text2: 'Please confirm you are 18+ and accept the Terms of Use',
      });
      return;
    }

    // Check that passwords match
    if (password !== passwordConfirmation) {
      Toast.show({
        type: 'error',
        text1: 'Error',
        text2: 'Passwords do not match',
      });
      return;
    }

    setLoading(true);
    const response = await signUpUser({ email, password });

    // Without a token the profile will not open anyway, so this is a registration error too
    const token = response.status === 'success' ? response.data?.token : null;

    if (!token) {
      Toast.show({
        type: 'error',
        text1: 'Registration failed',
        // On a successful response without a token the server message may sound like success - do not show it
        text2:
          response.status === 'success'
            ? 'No session token received'
            : response.data?.message || 'Could not register',
      });
      setLoading(false);
      return;
    }

    await saveToken(token);

    Toast.show({
      type: 'success',
      text1: 'Success',
      text2: response.data?.message || 'Registration successful',
    });

    // Start the messages polling interval
    startMessagesInterval();

    // Go to the profile screen (the profile loads user data itself via /self)
    router.replace('/profile');
  };

  const handleSignIn = () => {
    // replace, not push: otherwise switching login <-> signup grows the stack endlessly
    router.replace('/');
  };

  return (
    <KeyboardAvoidingView
      style={[styles.container, { backgroundColor: colors.background }]}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        {/* Title placeholder */}
        <Text style={[styles.title, { color: colors.text }]}>People Meet</Text>

        <View style={[styles.card, { borderColor: colors.border, backgroundColor: colors.card }]}>
          <Text style={[styles.header, { color: colors.text }]}>Signup</Text>

          {/* Email field */}
          <View style={styles.inputContainer}>
            <Text style={[styles.label, { color: colors.text }]}>Email</Text>
            <TextInput
              style={[styles.input, { color: colors.text, borderColor: colors.border }]}
              value={email}
              onChangeText={handleEmailChange}
              placeholder=""
              autoCapitalize="none"
              autoCorrect={false}
              keyboardType="email-address"
              textContentType="emailAddress"
              autoComplete="email"
            />
          </View>

          {/* Password field */}
          <View style={styles.inputContainer}>
            <Text style={[styles.label, { color: colors.text }]}>Password</Text>
            <TextInput
              style={[styles.input, { color: colors.text, borderColor: colors.border }]}
              value={password}
              maxLength={64}
              onChangeText={handlePasswordChange}
              placeholder=""
              secureTextEntry
              textContentType="newPassword"
              autoComplete="new-password"
            />
          </View>

          {/* Password Confirmation field */}
          <View style={styles.inputContainer}>
            <Text style={[styles.label, { color: colors.text }]}>Password Confirmation</Text>
            <TextInput
              style={[styles.input, { color: colors.text, borderColor: colors.border }]}
              value={passwordConfirmation}
              maxLength={64}
              onChangeText={handlePasswordConfirmationChange}
              placeholder=""
              secureTextEntry
              textContentType="newPassword"
              autoComplete="new-password"
            />
          </View>

          {/* Terms acceptance */}
          <Pressable
            style={styles.termsRow}
            onPress={() => setAcceptedTerms((value) => !value)}
            accessibilityRole="checkbox"
            accessibilityState={{ checked: acceptedTerms }}
          >
            <Ionicons
              name={acceptedTerms ? 'checkbox' : 'square-outline'}
              size={22}
              color={acceptedTerms ? '#4ECDC4' : '#999'}
            />
            <Text style={[styles.termsText, { color: colors.text }]}>
              I am 18+ and agree to the{' '}
              <Text style={styles.termsLink} onPress={() => openLegalPage('terms')}>Terms of Use</Text>
              {' '}and{' '}
              <Text style={styles.termsLink} onPress={() => openLegalPage('privacy')}>Privacy Policy</Text>
            </Text>
          </Pressable>

          {/* Sign up button */}
          <Pressable 
            style={[styles.signUpButton, loading && styles.signUpButtonDisabled]} 
            onPress={handleSignUp}
            disabled={loading}
          >
            {loading ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={styles.signUpButtonText}>Sign up</Text>
            )}
          </Pressable>


        </View>
        {/* Sign in option */}
        <View style={styles.signInContainer}>
          <Text style={[styles.signInText, { color: colors.text }]}>Or </Text>
          <Pressable onPress={handleSignIn}>
            <Text style={[styles.signInLink, { color: colors.primary }]}>Sign In</Text>
          </Pressable>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    // TODO: Add background styling
  },
  content: {
    flexGrow: 1,
    justifyContent: 'center',
    alignItems: 'center',

    width: '100%',
    // TODO: Add padding/margin styling
  },
  title: {
    // TODO: Add title styling
    marginBottom: 16,
    fontSize: 21,
  },
  card: {
    // TODO: Add card styling (background, shadow, padding, etc.)
    width: '90%',
    padding: 16,
    borderWidth: 1,
    boxShadow: 'rgba(17, 12, 46, 0.15) 0px 48px 100px 0px',
    borderRadius: 8,
  },
  header: {
    // TODO: Add header styling
    textAlign: 'center',
    marginBottom: 16,
  },
  inputContainer: {
    // TODO: Add input container styling
    marginBottom: 16,
  },
  label: {
    // TODO: Add label styling
    marginBottom: 5,
  },
  input: {
    // TODO: Add input styling (border, padding, etc.)
    borderWidth: 1,
    padding: 8,
    borderRadius: 4,
  },
  termsRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
    marginTop: 8,
  },
  termsText: {
    flex: 1,
    fontSize: 14,
    lineHeight: 20,
  },
  termsLink: {
    color: '#2aa79d',
    textDecorationLine: 'underline',
  },
  signUpButton: {
    // TODO: Add sign up button styling (background color, padding, etc.)
    borderRadius: 4,
    alignItems: 'center',
    padding: 15,
    backgroundColor: '#4ECDC4',
    marginTop: 10,
  },
  signUpButtonDisabled: {
    opacity: 0.6,
  },
  signUpButtonText: {
    // TODO: Add sign up button text styling
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  signInContainer: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    // borderWidth: 1,
    marginTop: 16,
  },
  signInText: {
    // TODO: Add sign in text styling
  },
  signInLink: {
    // TODO: Add sign in link styling
  },
});
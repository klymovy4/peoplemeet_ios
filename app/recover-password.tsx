import { changePassword, checkRecoveryCode, getRecoverCode } from '@/services/api';
import { router } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import Toast from 'react-native-toast-message';

export default function RecoverPasswordScreen() {
  const [email, setEmail] = useState('');
  const [formCode, setFormCode] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [newConfirmPassword, setNewConfirmPassword] = useState('');
  const [recoveryCode, setRecoveryCode] = useState('');
  const [isRestoreCode, setIsRestoreCode] = useState(false);
  const [isStartChangePassword, setIsStartChangePassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const confirmPasswordRef = useRef<TextInput>(null);

  const handleEmailChange = (text: string) => {
    setEmail(text);
  };

  const handleCodeChange = (text: string) => {
    // Allow digits only, up to 6 characters
    const numericText = text.replace(/[^0-9]/g, '').slice(0, 6);
    setFormCode(numericText);
  };

  const handleNewPasswordChange = (text: string) => {
    setNewPassword(text);
  };

  const handleNewConfirmPasswordChange = (text: string) => {
    setNewConfirmPassword(text);
  };

  // Automatically check the code once 6 digits are entered
  useEffect(() => {
    if (formCode.length !== 6) return;

    const sendCode = async () => {
      const response = await checkRecoveryCode(email, formCode);
      
      if (response.status === 'success') {
        setRecoveryCode(formCode);
        setIsStartChangePassword(true);
        Toast.show({
          type: 'success',
          text1: 'Success',
          text2: 'Code confirmed',
        });
      } else {
        Toast.show({
          type: 'error',
          text1: 'Error',
          text2: response.data?.message || 'Invalid code',
        });
        setFormCode('');
        setIsStartChangePassword(false);
      }
    };

    sendCode();
  }, [formCode, email]);

  const handleSendCode = async () => {
    // The Return key can trigger this while a request is already in flight
    if (loading) return;

    if (!email) {
      Toast.show({
        type: 'error',
        text1: 'Error',
        text2: 'Enter your email',
      });
      return;
    }

    setLoading(true);
    const response = await getRecoverCode(email);

    if (response.status === 'success') {
      setIsRestoreCode(true);
      Toast.show({
        type: 'info',
        text1: 'Code sent',
        text2: 'Check your email, including the spam folder. This may take a few minutes',
      });
    } else {
      Toast.show({
        type: 'error',
        text1: 'Error',
        text2: response.data?.message || 'Failed to send code',
      });
    }

    setLoading(false);
  };

  const handleResetPassword = async () => {
    if (loading) return;

    if (newPassword !== newConfirmPassword) {
      Toast.show({
        type: 'error',
        text1: 'Error',
        text2: 'Passwords do not match',
      });
      return;
    }

    if (!newPassword || !newConfirmPassword) {
      Toast.show({
        type: 'error',
        text1: 'Error',
        text2: 'Please fill in all fields',
      });
      return;
    }

    setLoading(true);
    const response = await changePassword(email, recoveryCode, newPassword);

    if (response.status === 'success') {
      Toast.show({
        type: 'success',
        text1: 'Success',
        text2: 'Password changed successfully',
      });
      
      // Go to the login screen with the email prefilled
      router.replace({
        pathname: '/',
        params: { email },
      });
    } else {
      Toast.show({
        type: 'error',
        text1: 'Error',
        text2: response.data?.message || 'Failed to change password',
      });
    }

    setLoading(false);
  };

  const handleLogIn = () => {
    router.push('/');
  };

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        {/* Title placeholder */}
        <Text style={styles.title}>People Meet</Text>

        <View style={styles.card}>
          <Text style={styles.header}>Recover password</Text>

          {/* Email field */}
          <View style={styles.inputContainer}>
            <Text style={styles.label}>Email</Text>
            <TextInput
              style={[styles.input, isStartChangePassword && styles.inputDisabled]}
              value={email}
              onChangeText={handleEmailChange}
              placeholder=""
              autoCapitalize="none"
              keyboardType="email-address"
              textContentType="emailAddress"
              autoComplete="email"
              editable={!isStartChangePassword}
              // Return sends the code
              returnKeyType="send"
              onSubmitEditing={() => {
                if (!isRestoreCode) handleSendCode();
              }}
            />
          </View>

          {/* Code field - shown after the code is sent */}
          {isRestoreCode && !isStartChangePassword && (
            <View style={styles.inputContainer}>
              <Text style={styles.label}>Code</Text>
              <TextInput
                style={styles.input}
                value={formCode}
                onChangeText={handleCodeChange}
                placeholder=""
                keyboardType="number-pad"
                maxLength={6}
                // iOS offers the code from the email above the keyboard
                textContentType="oneTimeCode"
                autoComplete="one-time-code"
                autoFocus
              />
            </View>
          )}

          {/* New password fields - shown after the code is confirmed */}
          {isStartChangePassword && (
            <>
              <View style={styles.inputContainer}>
                <Text style={styles.label}>New password</Text>
                <TextInput
                  style={styles.input}
                  value={newPassword}
                  onChangeText={handleNewPasswordChange}
                  placeholder=""
                  secureTextEntry
                  textContentType="newPassword"
                  autoComplete="new-password"
                  autoFocus
                  // Return moves to the confirmation field
                  returnKeyType="next"
                  submitBehavior="submit"
                  onSubmitEditing={() => confirmPasswordRef.current?.focus()}
                />
              </View>

              <View style={styles.inputContainer}>
                <Text style={styles.label}>New password confirmation</Text>
                <TextInput
                  ref={confirmPasswordRef}
                  style={styles.input}
                  value={newConfirmPassword}
                  onChangeText={handleNewConfirmPasswordChange}
                  placeholder=""
                  secureTextEntry
                  textContentType="newPassword"
                  autoComplete="new-password"
                  // Return resets the password
                  returnKeyType="done"
                  onSubmitEditing={handleResetPassword}
                />
              </View>
            </>
          )}

          {/* Send code button - shown before the code is sent */}
          {!isStartChangePassword && !isRestoreCode && (
            <Pressable 
              style={[styles.sendCodeButton, loading && styles.buttonDisabled]} 
              onPress={handleSendCode}
              disabled={loading}
            >
              {loading ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Text style={styles.sendCodeButtonText}>Send code</Text>
              )}
            </Pressable>
          )}

          {/* Reset password button - shown after the code is confirmed */}
          {isStartChangePassword && (
            <Pressable 
              style={[styles.sendCodeButton, loading && styles.buttonDisabled]} 
              onPress={handleResetPassword}
              disabled={loading}
            >
              {loading ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Text style={styles.sendCodeButtonText}>Reset password</Text>
              )}
            </Pressable>
          )}
        </View>

        {/* Log in option */}
        <View style={styles.logInContainer}>
          <Text style={styles.logInText}>Or </Text>
          <Pressable onPress={handleLogIn}>
            <Text style={styles.logInLink}>Log in</Text>
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
    borderRadius: 8,
    borderWidth: 1,
    borderStyle: 'solid',
    borderColor: '#0000002d',
    boxShadow: 'rgba(17, 12, 46, 0.15) 0px 48px 100px 0px',

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
    marginBottom: 8,
  },
  input: {
    // TODO: Add input styling (border, padding, etc.)
    borderWidth: 1,
    padding: 8,
    borderRadius: 4,
  },
  inputDisabled: {
    backgroundColor: '#f0f0f0',
    opacity: 0.6,
  },
  sendCodeButton: {
    // TODO: Add send code button styling (background color, padding, etc.)
    borderRadius: 4,
    alignItems: 'center',
    padding: 15,
    backgroundColor: '#4ECDC4',
    marginTop: 10,
  },
  buttonDisabled: {
    opacity: 0.6,
  },
  sendCodeButtonText: {
    // TODO: Add send code button text styling
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  logInContainer: {
    marginTop: 16,
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
  },
  logInText: {
    // TODO: Add log in text styling
  },
  logInLink: {
    // TODO: Add log in link styling
  },
});

import { useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

export default function LoginScreen() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');

  const handleEmailChange = (text: string) => {
    setEmail(text);
  };

  const handlePasswordChange = (text: string) => {
    setPassword(text);
  };

  const handleLogin = () => {
    // TODO: Implement login logic
  };

  const handleForgotPassword = () => {
    // TODO: Implement forgot password logic
  };

  const handleSignUp = () => {
    // TODO: Implement sign up navigation
  };

  return (
    <View style={styles.container}>
      <View style={styles.content}>
        {/* Title placeholder */}
        <Text style={styles.title}>People Meet</Text>

        <View style={styles.card}>
          <Text style={styles.header}>Log In</Text>

          {/* Email field */}
          <View style={styles.inputContainer}>
            <Text style={styles.label}>Email</Text>
            <TextInput
              style={styles.input}
              value={'email'}
              onChangeText={handleEmailChange}
              placeholder=""
              autoCapitalize="none"
              keyboardType="email-address"
            />
          </View>

          {/* Password field */}
          <View style={styles.inputContainer}>
            <Text style={styles.label}>Password</Text>
            <TextInput
              style={styles.input}
              value={password}
              onChangeText={handlePasswordChange}
              placeholder=""
              secureTextEntry
            />
          </View>

          {/* Login button */}
          <Pressable style={styles.loginButton} onPress={handleLogin}>
            <Text style={styles.loginButtonText}>Log in111</Text>
          </Pressable>

          {/* Forgot password link */}
          <Pressable onPress={handleForgotPassword}>
            <Text style={styles.forgotPassword}>Forgot Pas2sword</Text>
          </Pressable>

          {/* Sign up option */}
          <View style={styles.signUpContainer}>
            <Text style={styles.signUpText}>Or </Text>
            <Pressable onPress={handleSignUp}>
              <Text style={styles.signUpLink}>Sign 2Up</Text>
            </Pressable>
          </View>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    // TODO: Add background styling
  },
  content: {
    flex: 1,
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
  loginButton: {
    // TODO: Add login button styling (background color, padding, etc.)
    padding: 15,
    borderRadius: 4,
    alignItems: 'center',
    marginTop: 10,
    marginBottom: 16,
  },
  loginButtonText: {
    // TODO: Add login button text styling
    color: '#fff',
  },
  forgotPassword: {
    // TODO: Add forgot password styling
    textAlign: 'center',
    marginBottom: 15,
  },
  signUpContainer: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
  },
  signUpText: {
    // TODO: Add sign up text styling
  },
  signUpLink: {
    // TODO: Add sign up link styling
  },
});



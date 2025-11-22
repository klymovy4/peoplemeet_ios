import { getSelf, signUpUser } from '@/services/api';
import { saveToken, saveUserData } from '@/services/auth';
import { router } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import Toast from 'react-native-toast-message';

export default function SignUpScreen() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [passwordConfirmation, setPasswordConfirmation] = useState('');
  const [loading, setLoading] = useState(false);

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
    // Валидация полей
    if (!email || !password || !passwordConfirmation) {
      Toast.show({
        type: 'error',
        text1: 'Ошибка',
        text2: 'Заполните все поля',
      });
      return;
    }

    // Проверка совпадения паролей
    if (password !== passwordConfirmation) {
      Toast.show({
        type: 'error',
        text1: 'Ошибка',
        text2: 'Пароли не совпадают',
      });
      return;
    }

    setLoading(true);
    const response = await signUpUser({ email, password });

    if (response.status === 'success') {
      // Сохраняем токен
      const token = response.data.token;
      if (token) {
        await saveToken(token);
      }

      // Показываем сообщение об успехе
      Toast.show({
        type: 'success',
        text1: 'Успешно',
        text2: response.data?.message || 'Регистрация выполнена',
      });

      // Запрашиваем данные пользователя через /self
      if (token) {
        const selfResult = await getSelf(token);
        if (selfResult.status === 'success') {
          await saveUserData(selfResult.data);
        }
      }

      // Переход на страницу профиля
      router.replace('/profile');
    } else {
      Toast.show({
        type: 'error',
        text1: 'Ошибка регистрации',
        text2: response.data?.message || 'Не удалось зарегистрироваться',
      });
    }

    setLoading(false);
  };

  const handleSignIn = () => {
    router.push('/');
  };

  return (
    <View style={styles.container}>
      <View style={styles.content}>
        {/* Title placeholder */}
        <Text style={styles.title}>People Meet</Text>

        <View style={styles.card}>
          <Text style={styles.header}>Signup</Text>

          {/* Email field */}
          <View style={styles.inputContainer}>
            <Text style={styles.label}>Email</Text>
            <TextInput
              style={styles.input}
              value={email}
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

          {/* Password Confirmation field */}
          <View style={styles.inputContainer}>
            <Text style={styles.label}>Password Confirmation</Text>
            <TextInput
              style={styles.input}
              value={passwordConfirmation}
              onChangeText={handlePasswordConfirmationChange}
              placeholder=""
              secureTextEntry
            />
          </View>

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
          <Text style={styles.signInText}>Or </Text>
          <Pressable onPress={handleSignIn}>
            <Text style={styles.signInLink}>Sign In</Text>
          </Pressable>
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
    borderColor: 'green',
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
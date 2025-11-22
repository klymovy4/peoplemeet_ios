import { changePassword, checkRecoveryCode, getRecoverCode } from '@/services/api';
import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
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

  const handleEmailChange = (text: string) => {
    setEmail(text);
  };

  const handleCodeChange = (text: string) => {
    // Разрешаем только цифры и максимум 4 символа
    const numericText = text.replace(/[^0-9]/g, '').slice(0, 4);
    setFormCode(numericText);
  };

  const handleNewPasswordChange = (text: string) => {
    setNewPassword(text);
  };

  const handleNewConfirmPasswordChange = (text: string) => {
    setNewConfirmPassword(text);
  };

  // Автоматическая проверка кода при вводе 4 цифр
  useEffect(() => {
    if (formCode.length !== 4) return;

    const sendCode = async () => {
      const response = await checkRecoveryCode(email, formCode);
      
      if (response.status === 'success') {
        setRecoveryCode(formCode);
        setIsStartChangePassword(true);
        Toast.show({
          type: 'success',
          text1: 'Успешно',
          text2: 'Код подтвержден',
        });
      } else {
        Toast.show({
          type: 'error',
          text1: 'Ошибка',
          text2: response.data?.message || 'Неверный код',
        });
        setFormCode('');
        setIsStartChangePassword(false);
      }
    };

    sendCode();
  }, [formCode, email]);

  const handleSendCode = async () => {
    if (!email) {
      Toast.show({
        type: 'error',
        text1: 'Ошибка',
        text2: 'Введите email',
      });
      return;
    }

    setLoading(true);
    const response = await getRecoverCode(email);

    if (response.status === 'success') {
      setIsRestoreCode(true);
      Toast.show({
        type: 'info',
        text1: 'Код отправлен',
        text2: 'Проверьте email. Также проверьте папку спам. Это может занять несколько минут',
      });
    } else {
      Toast.show({
        type: 'error',
        text1: 'Ошибка',
        text2: response.data?.message || 'Не удалось отправить код',
      });
    }

    setLoading(false);
  };

  const handleResetPassword = async () => {
    if (newPassword !== newConfirmPassword) {
      Toast.show({
        type: 'error',
        text1: 'Ошибка',
        text2: 'Пароли не совпадают',
      });
      return;
    }

    if (!newPassword || !newConfirmPassword) {
      Toast.show({
        type: 'error',
        text1: 'Ошибка',
        text2: 'Заполните все поля',
      });
      return;
    }

    setLoading(true);
    const response = await changePassword(email, recoveryCode, newPassword);

    if (response.status === 'success') {
      Toast.show({
        type: 'success',
        text1: 'Успешно',
        text2: 'Пароль успешно изменен',
      });
      
      // Переход на страницу логина с заполненным email
      router.replace({
        pathname: '/',
        params: { email },
      });
    } else {
      Toast.show({
        type: 'error',
        text1: 'Ошибка',
        text2: response.data?.message || 'Не удалось изменить пароль',
      });
    }

    setLoading(false);
  };

  const handleLogIn = () => {
    router.push('/');
  };

  return (
    <View style={styles.container}>
      <View style={styles.content}>
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
              editable={!isStartChangePassword}
            />
          </View>

          {/* Code field - показывается после отправки кода */}
          {isRestoreCode && !isStartChangePassword && (
            <View style={styles.inputContainer}>
              <Text style={styles.label}>Code</Text>
              <TextInput
                style={styles.input}
                value={formCode}
                onChangeText={handleCodeChange}
                placeholder=""
                keyboardType="number-pad"
                maxLength={4}
              />
            </View>
          )}

          {/* New password fields - показываются после подтверждения кода */}
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
                />
              </View>

              <View style={styles.inputContainer}>
                <Text style={styles.label}>New password confirmation</Text>
                <TextInput
                  style={styles.input}
                  value={newConfirmPassword}
                  onChangeText={handleNewConfirmPasswordChange}
                  placeholder=""
                  secureTextEntry
                />
              </View>
            </>
          )}

          {/* Send code button - показывается до отправки кода */}
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

          {/* Reset password button - показывается после подтверждения кода */}
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
    borderRadius: 8,
    borderColor: 'green',
    borderWidth: 1,
    borderStyle: 'solid',
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

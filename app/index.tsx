import { loginUser } from '@/services/api';
import { saveToken, saveUserData } from '@/services/auth';
import { startMessagesInterval } from '@/services/messagesInterval';
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import Toast from 'react-native-toast-message';

export default function LoginScreen() {
   const params = useLocalSearchParams();
   const [email, setEmail] = useState('');
   const [password, setPassword] = useState('');
   const [loading, setLoading] = useState(false);

   // Заполняем email из параметров роутера
   useEffect(() => {
      if (params.email && typeof params.email === 'string') {
         setEmail(params.email);
      }
   }, [params.email]);

   const handleEmailChange = (text: string) => {
      setEmail(text);
   };

   const handlePasswordChange = (text: string) => {
      setPassword(text);
   };

   const handleLogin = async () => {
      if (!email || !password) {
         Toast.show({
            type: 'error',
            text1: 'Ошибка',
            text2: 'Заполните все поля',
         });
         return;
      }

      setLoading(true);
      const result = await loginUser({email, password});

      if (result.status === 'success') {
         // Сохраняем токен (может быть в разных форматах)
         const token = result.data.token;
         if (token) {
            await saveToken(token);
         }

         // Сохраняем данные пользователя (могут быть в разных местах)
         const userData = result.data.user || result.data.data || result.data;
         if (userData && typeof userData === 'object') {
            await saveUserData(userData);
         }

         Toast.show({
            type: 'success',
            text1: 'Успешно',
            text2: 'Вход выполнен',
         });

         // Запускаем интервал получения сообщений
         startMessagesInterval();

         // Переход на защищенную страницу
         router.replace('/profile');
      } else {
         Toast.show({
            type: 'error',
            text1: 'Ошибка входа',
            text2: result.data?.message || 'Неверный email или пароль',
         });
      }

      setLoading(false);
   };

   const handleForgotPassword = () => {
      router.push('/recover-password');
   };

   const handleSignUp = () => {
      router.push('/signup');
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

                {/* Login button */}
                <Pressable 
                   style={[styles.loginButton, loading && styles.loginButtonDisabled]} 
                   onPress={handleLogin}
                   disabled={loading}
                >
                   {loading ? (
                      <ActivityIndicator color="#fff" />
                   ) : (
                      <Text style={styles.loginButtonText}>Log in</Text>
                   )}
                </Pressable>

                {/* Forgot password link */}
                <Pressable onPress={handleForgotPassword}>
                   <Text style={styles.forgotPassword}>Forgot Password</Text>
                </Pressable>


             </View>
             {/* Sign up option */}
             <View style={styles.signUpContainer}>
                <Text style={styles.signUpText}>Or </Text>
                <Pressable onPress={handleSignUp}>
                   <Text style={styles.signUpLink}>Sign Up</Text>
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
      borderWidth: 1,
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
   loginButton: {
      // TODO: Add login button styling (background color, padding, etc.)
      borderRadius: 4,
      alignItems: 'center',
      marginTop: 16,
      marginBottom: 16,
      padding: 15,
      backgroundColor: '#4ECDC4',
   },
   loginButtonDisabled: {
      opacity: 0.6,
   },
   loginButtonText: {
      // TODO: Add login button text styling
      color: '#fff',
      fontSize: 16,
      fontWeight: '600',
   },
   forgotPassword: {
      // TODO: Add forgot password styling
      textAlign: 'center',
   },
   signUpContainer: {
      flexDirection: 'row',
      justifyContent: 'center',
      alignItems: 'center',
      marginTop: 16,

   },
   signUpText: {
      // TODO: Add sign up text styling
   },
   signUpLink: {
      // TODO: Add sign up link styling
   },
});


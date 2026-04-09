import { createNativeStackNavigator } from '@react-navigation/native-stack';
import type { AuthStackParamList } from './types';
import Login from '../screens/logins/Login';
import Signup from '../screens/logins/Signup';
import ForgotPassword from '../screens/logins/ForgotPassword';
import ResetPassword from '../screens/logins/ResetPassword';

const Stack = createNativeStackNavigator<AuthStackParamList>();

export default function AuthStack() {
  return (
    <Stack.Navigator screenOptions={{ headerShown: false }} initialRouteName="Login">
      <Stack.Screen name="Login" component={Login} />
      <Stack.Screen name="Signup" component={Signup} />
      <Stack.Screen name="ForgotPassword" component={ForgotPassword} />
      <Stack.Screen name="ResetPassword" component={ResetPassword} />
    </Stack.Navigator>
  );
}

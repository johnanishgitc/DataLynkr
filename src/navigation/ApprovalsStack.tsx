import { createNativeStackNavigator } from '@react-navigation/native-stack';
import type { ApprovalsStackParamList } from './types';
import ApprovalsScreen from '../screens/ApprovalsScreen';

const Stack = createNativeStackNavigator<ApprovalsStackParamList>();

export default function ApprovalsStack() {
  return (
    <Stack.Navigator screenOptions={{ headerShown: false }} initialRouteName="ApprovalsScreen">
      <Stack.Screen
        name="ApprovalsScreen"
        component={ApprovalsScreen}
      />
    </Stack.Navigator>
  );
}

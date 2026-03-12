import { createNativeStackNavigator } from '@react-navigation/native-stack';
import type { ApprovalsStackParamList } from './types';
import ApprovalsScreen from '../screens/ApprovalsScreen';
import VoucherDetailView from '../screens/VoucherDetailView';

const Stack = createNativeStackNavigator<ApprovalsStackParamList>();

export default function ApprovalsStack() {
  return (
    <Stack.Navigator screenOptions={{ headerShown: false }} initialRouteName="ApprovalsScreen">
      <Stack.Screen
        name="ApprovalsScreen"
        component={ApprovalsScreen}
      />
      <Stack.Screen
        name="VoucherDetailView"
        component={VoucherDetailView}
        options={{ headerShown: false }}
      />
    </Stack.Navigator>
  );
}

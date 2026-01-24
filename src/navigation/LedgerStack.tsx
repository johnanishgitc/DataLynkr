import { createNativeStackNavigator } from '@react-navigation/native-stack';
import type { LedgerStackParamList } from './types';
import LedgerMain from '../screens/LedgerMain';
import LedgerEntries from '../screens/LedgerEntries';
import VoucherDetails from '../screens/VoucherDetails';

const Stack = createNativeStackNavigator<LedgerStackParamList>();

export default function LedgerStack() {
  return (
    <Stack.Navigator screenOptions={{ headerShown: true }} initialRouteName="LedgerEntries">
      <Stack.Screen name="LedgerMain" component={LedgerMain} options={{ headerShown: false }} />
      <Stack.Screen name="LedgerEntries" component={LedgerEntries} options={{ headerShown: false }} />
      <Stack.Screen name="VoucherDetails" component={VoucherDetails} options={{ headerShown: false }} />
    </Stack.Navigator>
  );
}

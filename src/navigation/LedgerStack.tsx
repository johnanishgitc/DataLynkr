import { createNativeStackNavigator } from '@react-navigation/native-stack';
import type { LedgerStackParamList } from './types';
import LedgerMain from '../screens/LedgerMain';
import LedgerEntries from '../screens/LedgerEntries';
import VoucherDetailView from '../screens/VoucherDetailView';
import VoucherDetails from '../screens/VoucherDetails';
import BillAllocations from '../screens/BillAllocations';
import MoreDetails from '../screens/MoreDetails';

const Stack = createNativeStackNavigator<LedgerStackParamList>();

export default function LedgerStack() {
  return (
    <Stack.Navigator screenOptions={{ headerShown: true }} initialRouteName="LedgerEntries">
      <Stack.Screen name="LedgerMain" component={LedgerMain} options={{ headerShown: false }} />
      <Stack.Screen name="LedgerEntries" component={LedgerEntries} options={{ headerShown: false }} />
      <Stack.Screen name="VoucherDetailView" component={VoucherDetailView} options={{ headerShown: false }} />
      <Stack.Screen name="VoucherDetails" component={VoucherDetails} options={{ headerShown: false }} />
      <Stack.Screen name="BillAllocations" component={BillAllocations} options={{ headerShown: false }} />
      <Stack.Screen name="MoreDetails" component={MoreDetails} options={{ headerShown: false }} />
    </Stack.Navigator>
  );
}

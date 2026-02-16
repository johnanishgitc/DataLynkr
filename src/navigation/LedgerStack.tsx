import { createNativeStackNavigator } from '@react-navigation/native-stack';
import type { LedgerStackParamList } from './types';
import LedgerMain from '../screens/LedgerMain';
import LedgerEntries from '../screens/LedgerEntries';
import VoucherDetails from '../screens/VoucherDetails';
import VoucherDetailView from '../screens/VoucherDetailView';
import BillAllocations from '../screens/BillAllocations';
import MoreDetails from '../screens/MoreDetails';
import SalesOrderVoucherDetails from '../screens/SalesOrderVoucherDetails';
import SalesOrderLineDetail from '../screens/SalesOrderLineDetail';
import SalesOrderOrderDetails from '../screens/SalesOrderOrderDetails';
import ClearedOrderDetails from '../screens/ClearedOrderDetails';

const Stack = createNativeStackNavigator<LedgerStackParamList>();

export default function LedgerStack() {
  return (
    <Stack.Navigator screenOptions={{ headerShown: true }} initialRouteName="LedgerEntries">
      <Stack.Screen name="LedgerMain" component={LedgerMain} options={{ headerShown: false }} />
      <Stack.Screen name="LedgerEntries" component={LedgerEntries} options={{ headerShown: false }} />
      <Stack.Screen name="VoucherDetails" component={VoucherDetails} options={{ headerShown: false }} />
      <Stack.Screen name="VoucherDetailView" component={VoucherDetailView} options={{ headerShown: false }} />
      <Stack.Screen name="BillAllocations" component={BillAllocations} options={{ headerShown: false }} />
      <Stack.Screen name="MoreDetails" component={MoreDetails} options={{ headerShown: false }} />
      <Stack.Screen name="SalesOrderVoucherDetails" component={SalesOrderVoucherDetails} options={{ headerShown: false }} />
      <Stack.Screen name="SalesOrderLineDetail" component={SalesOrderLineDetail} options={{ headerShown: false }} />
      <Stack.Screen name="SalesOrderOrderDetails" component={SalesOrderOrderDetails} options={{ headerShown: false }} />
      <Stack.Screen name="ClearedOrderDetails" component={ClearedOrderDetails} options={{ headerShown: false }} />
    </Stack.Navigator>
  );
}

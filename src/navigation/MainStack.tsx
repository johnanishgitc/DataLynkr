import { createNativeStackNavigator } from '@react-navigation/native-stack';
import type { MainStackParamList } from './types';
import AdminDashboard from '../screens/AdminDashboard';
import MainTabs from './MainTabs';
import SalesOrderVoucherDetails from '../screens/SalesOrderVoucherDetails';
import SalesOrderLineDetail from '../screens/SalesOrderLineDetail';
import SalesOrderOrderDetails from '../screens/SalesOrderOrderDetails';
import ClearedOrderDetails from '../screens/ClearedOrderDetails';

const Stack = createNativeStackNavigator<MainStackParamList>();

export default function MainStack() {
  return (
    <Stack.Navigator screenOptions={{ headerShown: false }} initialRouteName="AdminDashboard">
      <Stack.Screen name="AdminDashboard" component={AdminDashboard} />
      <Stack.Screen name="MainTabs" component={MainTabs} />
      <Stack.Screen name="SalesOrderVoucherDetails" component={SalesOrderVoucherDetails} />
      <Stack.Screen name="SalesOrderLineDetail" component={SalesOrderLineDetail} />
      <Stack.Screen name="SalesOrderOrderDetails" component={SalesOrderOrderDetails} />
      <Stack.Screen name="ClearedOrderDetails" component={ClearedOrderDetails} />
    </Stack.Navigator>
  );
}

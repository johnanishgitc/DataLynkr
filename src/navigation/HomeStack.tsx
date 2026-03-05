import { createNativeStackNavigator } from '@react-navigation/native-stack';
import type { HomeStackParamList } from './types';
import DataManagement from '../screens/CacheManagement2';
import SalesDashboard from '../screens/SalesDashboard';
import ComingSoon from '../screens/ComingSoon';

const Stack = createNativeStackNavigator<HomeStackParamList>();

export default function HomeStack() {
  return (
    <Stack.Navigator screenOptions={{ headerShown: false }} initialRouteName="SalesDashboard">
      <Stack.Screen name="SalesDashboard" component={SalesDashboard} options={{ title: 'Sales Dashboard', headerShown: false }} />
      <Stack.Screen name="DataManagement" component={DataManagement} options={{ title: 'Data Management', headerShown: false }} />
      <Stack.Screen name="ComingSoon" component={ComingSoon} options={{ headerShown: false }} />
    </Stack.Navigator>
  );
}

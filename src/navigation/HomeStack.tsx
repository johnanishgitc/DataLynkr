import { createNativeStackNavigator } from '@react-navigation/native-stack';
import type { HomeStackParamList } from './types';
import Home from '../screens/Home';
import CacheManagement from '../screens/CacheManagement';
import SalesDashboard from '../screens/SalesDashboard';
import ComingSoon from '../screens/ComingSoon';

const Stack = createNativeStackNavigator<HomeStackParamList>();

export default function HomeStack() {
  return (
    <Stack.Navigator screenOptions={{ headerShown: false }} initialRouteName="Home">
      <Stack.Screen name="Home" component={Home} options={{ title: 'Home' }} />
      <Stack.Screen name="CacheManagement" component={CacheManagement} options={{ title: 'Cache Management', headerShown: true }} />
      <Stack.Screen name="SalesDashboard" component={SalesDashboard} options={{ title: 'Sales Dashboard', headerShown: false }} />
      <Stack.Screen name="ComingSoon" component={ComingSoon} options={{ title: 'Coming Soon', headerShown: true }} />
    </Stack.Navigator>
  );
}

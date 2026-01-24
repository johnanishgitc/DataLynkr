import { createNativeStackNavigator } from '@react-navigation/native-stack';
import type { OrdersStackParamList } from './types';
import ComingSoon from '../screens/ComingSoon';
import { strings } from '../constants/strings';

const Stack = createNativeStackNavigator<OrdersStackParamList>();

export default function OrdersStack() {
  return (
    <Stack.Navigator screenOptions={{ headerShown: true }} initialRouteName="ComingSoon">
      <Stack.Screen
        name="ComingSoon"
        component={ComingSoon}
        initialParams={{ tab_name: strings.orders }}
        options={{ title: strings.orders }}
      />
    </Stack.Navigator>
  );
}

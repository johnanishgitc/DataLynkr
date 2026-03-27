import { createNativeStackNavigator } from '@react-navigation/native-stack';
import type { OrdersStackParamList } from './types';
import OrderEntry from '../screens/OrderEntry';
import OrderEntryItemDetail from '../screens/OrderEntryItemDetail';
import OrderSuccess from '../screens/OrderSuccess';
import { MasterCreationScreen } from '../screens/MasterCreation';
import ComingSoon from '../screens/ComingSoon';
import { strings } from '../constants/strings';

const Stack = createNativeStackNavigator<OrdersStackParamList>();

export default function OrdersStack() {
  return (
    <Stack.Navigator screenOptions={{ headerShown: false }} initialRouteName="OrderEntry">
      <Stack.Screen name="OrderEntry" component={OrderEntry} />
      <Stack.Screen name="OrderEntryItemDetail" component={OrderEntryItemDetail} />
      <Stack.Screen name="OrderSuccess" component={OrderSuccess} />
      <Stack.Screen name="AddCustomer" component={MasterCreationScreen} />
      <Stack.Screen
        name="ComingSoon"
        component={ComingSoon}
        initialParams={{ tab_name: strings.orders }}
        options={{ title: strings.orders }}
      />
    </Stack.Navigator>
  );
}

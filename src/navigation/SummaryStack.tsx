import { createNativeStackNavigator } from '@react-navigation/native-stack';
import type { SummaryStackParamList } from './types';
import StockSummary from '../screens/StockSummary';
import StockItemMonthly from '../screens/StockItemMonthly';
import StockItemVouchers from '../screens/StockItemVouchers';

const Stack = createNativeStackNavigator<SummaryStackParamList>();

export default function SummaryStack() {
  return (
    <Stack.Navigator screenOptions={{ headerShown: false }} initialRouteName="StockSummary">
      <Stack.Screen name="StockSummary" component={StockSummary} />
      <Stack.Screen name="StockGroupSummary" component={StockSummary} />
      <Stack.Screen name="StockItemMonthly" component={StockItemMonthly} />
      <Stack.Screen name="StockItemVouchers" component={StockItemVouchers} />
    </Stack.Navigator>
  );
}

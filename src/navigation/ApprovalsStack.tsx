import { createNativeStackNavigator } from '@react-navigation/native-stack';
import type { ApprovalsStackParamList } from './types';
import ComingSoon from '../screens/ComingSoon';
import { strings } from '../constants/strings';

const Stack = createNativeStackNavigator<ApprovalsStackParamList>();

export default function ApprovalsStack() {
  return (
    <Stack.Navigator screenOptions={{ headerShown: true }} initialRouteName="ComingSoon">
      <Stack.Screen
        name="ComingSoon"
        component={ComingSoon}
        initialParams={{ tab_name: strings.approvals }}
        options={{ title: strings.approvals }}
      />
    </Stack.Navigator>
  );
}

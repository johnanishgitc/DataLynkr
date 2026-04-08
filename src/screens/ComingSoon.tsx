import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { strings } from '../constants/strings';
import { colors } from '../constants/colors';
import Logo from '../components/Logo';
import { StatusBarTopBar } from '../components/StatusBarTopBar';
import { useGlobalSidebar } from '../store/GlobalSidebarContext';
import type { HomeStackParamList } from '../navigation/types';

type P = { tab_name?: string };

export default function ComingSoon({ route }: { route: { params?: P } }) {
  const name = route.params?.tab_name ?? 'Feature';
  const { openSidebar } = useGlobalSidebar();

  return (
    <View style={styles.c}>
      <StatusBarTopBar
        title={name}
        leftIcon="menu"
        rightIcons="none"
        onMenuPress={openSidebar}
      />
      <View style={styles.content}>
        <Logo width={64} height={42} style={styles.logo} />
        <Text style={styles.t}>{name}</Text>
        <Text style={styles.sub}>{strings.available_soon}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  c: { flex: 1 },
  content: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  logo: { marginBottom: 16 },
  t: { fontSize: 18, color: colors.primary_blue },
  sub: { marginTop: 8, color: '#666' },
});

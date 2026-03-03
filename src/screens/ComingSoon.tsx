import React from 'react';
import { View, Text, StyleSheet, StatusBar } from 'react-native';
import { strings } from '../constants/strings';
import { colors } from '../constants/colors';
import Logo from '../components/Logo';

type P = { tab_name?: string };

export default function ComingSoon({ route }: { route: { params?: P } }) {
  const name = route.params?.tab_name ?? 'Feature';
  return (
    <View style={styles.c}>
      <StatusBar backgroundColor={colors.primary_blue} barStyle="light-content" />
      <Logo width={64} height={42} style={styles.logo} />
      <Text style={styles.t}>{name}</Text>
      <Text style={styles.sub}>{strings.available_soon}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  c: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  logo: { marginBottom: 16 },
  t: { fontSize: 18 },
  sub: { marginTop: 8, color: '#666' },
});

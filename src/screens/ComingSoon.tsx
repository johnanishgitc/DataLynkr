import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { strings } from '../constants/strings';

type P = { tab_name?: string };

export default function ComingSoon({ route }: { route: { params?: P } }) {
  const name = route.params?.tab_name ?? 'Feature';
  return (
    <View style={styles.c}>
      <Text style={styles.t}>{name}</Text>
      <Text style={styles.sub}>{strings.available_soon}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  c: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  t: { fontSize: 18 },
  sub: { marginTop: 8, color: '#666' },
});

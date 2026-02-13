/**
 * Reusable card for More Details screens - Figma: white bg, border #c4d4ff, rounded, p-3.
 * Section title 14px semibold #0e172b or #121212. Rows: label left 13px #6a7282, value right 13px #6a7282.
 */
import React from 'react';
import { View, Text, StyleSheet } from 'react-native';

const CARD_BORDER = '#c4d4ff';

export interface DetailRow {
  label: string;
  value: string;
}

export interface DetailCardProps {
  title: string;
  titleColor?: string;
  rows: DetailRow[];
}

export function DetailCard({
  title,
  titleColor = '#0e172b',
  rows,
}: DetailCardProps) {
  return (
    <View style={styles.card}>
      <Text style={[styles.title, { color: titleColor }]}>{title}</Text>
      <View style={styles.rows}>
        {rows.map((row, i) => (
          <View key={i} style={styles.row}>
            <Text style={styles.label} numberOfLines={2}>
              {row.label}
            </Text>
            <Text style={styles.value} numberOfLines={2}>
              {row.value}
            </Text>
          </View>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: '#ffffff',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: CARD_BORDER,
    padding: 12,
    width: '100%',
  },
  title: {
    fontSize: 14,
    fontWeight: '600',
    marginBottom: 8,
  },
  rows: {
    gap: 8,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  label: {
    fontSize: 13,
    fontWeight: '400',
    color: '#6a7282',
    flex: 1,
    marginRight: 8,
  },
  value: {
    fontSize: 13,
    fontWeight: '400',
    color: '#6a7282',
    flex: 1,
    textAlign: 'right',
  },
});

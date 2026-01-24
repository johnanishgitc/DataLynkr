/**
 * Metric Card Component
 * Simple metric display with icon
 * Ported from React TallyCatalyst MetricCard.js
 */

import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import Icon from 'react-native-vector-icons/MaterialIcons';

type ColorVariant = 'teal' | 'blue' | 'green' | 'orange' | 'coral' | 'purple';

interface MetricCardProps {
    title: string;
    value: string;
    icon: string;
    subtitle?: string;
    color?: ColorVariant;
}

const colorStyles: Record<ColorVariant, { background: string; color: string }> = {
    teal: { background: '#ccfbf1', color: '#0d6464' },
    blue: { background: '#dbeafe', color: '#3b82f6' },
    green: { background: '#dcfce7', color: '#16a34a' },
    orange: { background: '#fed7aa', color: '#c55a39' },
    coral: { background: '#fed7aa', color: '#c55a39' },
    purple: { background: '#e9d5ff', color: '#7c3aed' },
};

const MetricCard: React.FC<MetricCardProps> = ({
    title,
    value,
    icon,
    subtitle,
    color = 'teal',
}) => {
    const iconStyle = colorStyles[color] || colorStyles.teal;

    return (
        <View style={styles.container}>
            <View style={styles.content}>
                <Text style={styles.title}>{title.toUpperCase()}</Text>
                <Text style={styles.value}>{value}</Text>
                {subtitle && <Text style={styles.subtitle}>{subtitle}</Text>}
            </View>
            <View
                style={[styles.iconContainer, { backgroundColor: iconStyle.background }]}>
                <Icon name={icon} size={24} color={iconStyle.color} />
            </View>
        </View>
    );
};

const styles = StyleSheet.create({
    container: {
        backgroundColor: 'white',
        borderRadius: 12,
        padding: 20,
        borderWidth: 1,
        borderColor: '#e2e8f0',
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 1 },
        shadowOpacity: 0.1,
        shadowRadius: 3,
        elevation: 2,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
    },
    content: {
        flex: 1,
    },
    title: {
        fontSize: 12,
        fontWeight: '600',
        color: '#64748b',
        letterSpacing: 0.5,
        marginBottom: 4,
    },
    value: {
        fontSize: 24,
        fontWeight: '700',
        color: '#1e293b',
    },
    subtitle: {
        marginTop: 4,
        fontSize: 12,
        color: '#64748b',
    },
    iconContainer: {
        width: 48,
        height: 48,
        borderRadius: 12,
        alignItems: 'center',
        justifyContent: 'center',
    },
});

export default MetricCard;

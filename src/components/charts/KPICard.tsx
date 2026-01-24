/**
 * KPI Card Component
 * Displays key performance indicator with optional trend chart
 * Matches web dashboard design with colored backgrounds and sparklines
 */

import React, { useMemo } from 'react';
import { View, Text, StyleSheet, Dimensions } from 'react-native';
import Icon from 'react-native-vector-icons/MaterialIcons';

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const CARD_WIDTH = (SCREEN_WIDTH - 48) / 2; // 2 cards per row with padding

interface KPICardProps {
    title: string;
    value: number;
    target?: number;
    trendData?: number[];
    format?: (val: number) => string;
    unit?: string;
    iconName?: string;
    iconBgColor?: string;
    iconColor?: string;
    bgColor?: string;
    textColor?: string;
    variant?: 'default' | 'accent' | 'coral' | 'teal' | 'purple';
}

const VARIANT_COLORS = {
    default: {
        bg: '#ffffff',
        text: '#1e293b',
        border: '#e2e8f0',
    },
    accent: {
        bg: '#0d6464',
        text: '#ffffff',
        border: 'transparent',
    },
    coral: {
        bg: '#f97316',
        text: '#ffffff',
        border: 'transparent',
    },
    teal: {
        bg: '#0d9488',
        text: '#ffffff',
        border: 'transparent',
    },
    purple: {
        bg: '#7c3aed',
        text: '#ffffff',
        border: 'transparent',
    },
};

const KPICard: React.FC<KPICardProps> = ({
    title,
    value,
    target,
    trendData = [],
    format = val => val.toLocaleString(),
    unit = '',
    iconName,
    iconBgColor = '#dcfce7',
    iconColor = '#16a34a',
    bgColor,
    textColor,
    variant = 'default',
}) => {
    const colors = VARIANT_COLORS[variant];
    const cardBg = bgColor || colors.bg;
    const cardText = textColor || colors.text;
    const isLightBg = variant === 'default';

    const formattedValue = useMemo(() => format(value), [value, format]);

    // Generate sparkline path data
    const sparklinePoints = useMemo(() => {
        if (trendData.length < 2) return null;

        const data = trendData.slice(-12); // Last 12 data points
        const maxVal = Math.max(...data);
        const minVal = Math.min(...data);
        const range = maxVal - minVal || 1;
        const width = 80;
        const height = 40;
        const stepX = width / (data.length - 1);

        return data.map((d, i) => ({
            x: i * stepX,
            y: height - ((d - minVal) / range) * height,
        }));
    }, [trendData]);

    return (
        <View style={[
            styles.container,
            {
                backgroundColor: cardBg,
                borderColor: colors.border,
            },
        ]}>
            {/* Sparkline in background (for cards with trend data) */}
            {sparklinePoints && sparklinePoints.length > 1 && (
                <View style={styles.sparklineContainer}>
                    <View style={styles.sparklineWrapper}>
                        {sparklinePoints.map((point, index) => {
                            if (index === 0) return null;
                            const prev = sparklinePoints[index - 1];
                            const lineLength = Math.sqrt(
                                Math.pow(point.x - prev.x, 2) + Math.pow(point.y - prev.y, 2)
                            );
                            const angle = Math.atan2(point.y - prev.y, point.x - prev.x) * (180 / Math.PI);

                            return (
                                <View
                                    key={index}
                                    style={[
                                        styles.sparklineLine,
                                        {
                                            width: lineLength,
                                            left: prev.x,
                                            top: prev.y,
                                            transform: [{ rotate: `${angle}deg` }],
                                            backgroundColor: isLightBg ? 'rgba(13, 100, 100, 0.3)' : 'rgba(255, 255, 255, 0.3)',
                                        },
                                    ]}
                                />
                            );
                        })}
                    </View>
                </View>
            )}

            {/* Content */}
            <View style={styles.content}>
                <Text style={[styles.title, { color: isLightBg ? '#64748b' : 'rgba(255,255,255,0.8)' }]}>
                    {title.toUpperCase()}
                </Text>
                <Text style={[styles.value, { color: cardText }]}>
                    {formattedValue}
                    {unit && <Text style={styles.unit}>{unit}</Text>}
                </Text>
            </View>

            {/* Icon in bottom right */}
            {iconName && (
                <View style={[
                    styles.iconContainer,
                    { backgroundColor: isLightBg ? iconBgColor : 'rgba(255,255,255,0.2)' },
                ]}>
                    <Icon
                        name={iconName}
                        size={20}
                        color={isLightBg ? iconColor : '#ffffff'}
                    />
                </View>
            )}
        </View>
    );
};

const styles = StyleSheet.create({
    container: {
        position: 'relative',
        borderRadius: 12,
        padding: 14,
        borderWidth: 1,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.08,
        shadowRadius: 4,
        elevation: 3,
        minHeight: 100,
        width: CARD_WIDTH,
        justifyContent: 'space-between',
        overflow: 'hidden',
    },
    sparklineContainer: {
        position: 'absolute',
        bottom: 10,
        right: 50,
        width: 80,
        height: 40,
        opacity: 0.6,
    },
    sparklineWrapper: {
        position: 'relative',
        width: 80,
        height: 40,
    },
    sparklineLine: {
        position: 'absolute',
        height: 2,
        borderRadius: 1,
        transformOrigin: 'left center',
    },
    content: {
        zIndex: 1,
        flex: 1,
    },
    title: {
        fontSize: 10,
        fontWeight: '600',
        letterSpacing: 0.5,
        marginBottom: 6,
    },
    value: {
        fontSize: 22,
        fontWeight: '700',
        lineHeight: 28,
    },
    unit: {
        fontSize: 14,
        fontWeight: '500',
    },
    iconContainer: {
        position: 'absolute',
        bottom: 12,
        right: 12,
        width: 36,
        height: 36,
        borderRadius: 10,
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 2,
    },
});

export default KPICard;

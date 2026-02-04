/**
 * KPI Card Component
 * Colored cards with white text, dynamic line/area chart in background
 * (smooth trend line + filled area), icon bottom-right, optional visibility toggle.
 */

import React, { useMemo, useEffect, useRef } from 'react';
import { View, Text, StyleSheet, Dimensions, TouchableOpacity, Animated } from 'react-native';
import Svg, { Path, Rect } from 'react-native-svg';
import Icon from 'react-native-vector-icons/MaterialIcons';

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const CARD_WIDTH = (SCREEN_WIDTH - 48) / 2;
const CARD_MIN_HEIGHT = 110;
const CHART_WIDTH = 200;
const CHART_HEIGHT = 56;
const CHART_PADDING = 5;
const BAR_GAP = 2;

interface KPICardProps {
    title: string;
    value: number;
    target?: number | null;
    trendData?: number[];
    format?: (val: number) => string;
    unit?: string;
    iconName?: string;
    variant?: 'blue' | 'green' | 'purple' | 'default';
    chartType?: 'bar' | 'line';
    showVisibilityToggle?: boolean;
    onVisibilityToggle?: () => void;
    /** When provided, card is pressable and shows full value in a popup (handled by parent). */
    onPress?: () => void;
}

const VARIANT_COLORS = {
    blue: {
        bg: '#1e3a5f',
        chartFill: 'rgba(255,255,255,0.4)', // Higher opacity for bars
        chartLine: 'rgba(255,255,255,0.6)',
    },
    green: {
        bg: '#0d5c4a',
        chartFill: 'rgba(255,255,255,0.4)',
        chartLine: 'rgba(255,255,255,0.6)',
    },
    purple: {
        bg: '#4c1d95',
        chartFill: 'rgba(255,255,255,0.4)',
        chartLine: 'rgba(255,255,255,0.6)',
    },
    default: {
        bg: '#ffffff',
        chartFill: 'rgba(0,0,0,0.15)',
        chartLine: 'rgba(0,0,0,0.2)',
    },
};

const KPICard: React.FC<KPICardProps> = ({
    title,
    value,
    trendData = [],
    format = val => val.toLocaleString(),
    unit = '',
    iconName,
    variant = 'blue',
    chartType = 'line',
    showVisibilityToggle = false,
    onVisibilityToggle,
    onPress,
}) => {
    const colors = VARIANT_COLORS[variant];
    const isColored = variant !== 'default';
    const textColor = isColored ? '#ffffff' : '#1e293b';
    const titleColor = isColored ? 'rgba(255,255,255,0.85)' : '#64748b';

    const formattedValue = useMemo(() => format(value), [value, format]);

    const valueLength = (formattedValue + unit).length;
    const valueFontSize = valueLength > 12 ? 15 : valueLength > 8 ? 17 : 19;

    // Bar chart: vertical bars from trendData
    const barRects = useMemo(() => {
        if (trendData.length < 1 || chartType !== 'bar') return [];

        const data = trendData;
        const maxVal = Math.max(...data, 1);
        const barAreaWidth = CHART_WIDTH - 2 * CHART_PADDING;
        const n = data.length;

        // Soundwave style: for dense data (e.g. daily for a year), use minimal gap
        const isDense = n > 50;
        const gap = isDense ? 0.5 : BAR_GAP;

        // Calculate max possible bar width
        let barWidth = (barAreaWidth - (n - 1) * gap) / n;

        // Clamp bar width: min 1px if feasible, max 6px for sparse data
        // If data is extremely dense, let width go below 1px (SVG handles sub-pixel)
        if (!isDense) {
            barWidth = Math.min(6, Math.max(2, barWidth));
        }

        // Center the chart if total width is less than available area
        const totalContentWidth = n * barWidth + (n - 1) * gap;
        const startX = totalContentWidth < barAreaWidth
            ? (barAreaWidth - totalContentWidth) / 2 + CHART_PADDING
            : CHART_PADDING;

        return data.map((d, i) => {
            const x = startX + i * (barWidth + gap);
            // Minimum height 2 (dot) to show activity even if value is 0 or low
            const barHeight = Math.max(2, (d / maxVal) * (CHART_HEIGHT - 2 * CHART_PADDING));
            const y = CHART_HEIGHT - CHART_PADDING - barHeight;
            return { x, y, width: barWidth, height: barHeight };
        });
    }, [trendData, chartType]);

    // Line/area chart: points and paths (smooth curve, filled area + visible trend line)
    const { areaChartPath, linePath } = useMemo(() => {
        if (trendData.length < 2 || chartType !== 'line') {
            return { areaChartPath: '', linePath: '' };
        }

        const minVal = Math.min(...trendData);
        const maxVal = Math.max(...trendData);
        const range = maxVal - minVal || 1;

        const points = trendData.map((d, i) => {
            const x =
                (i / (trendData.length - 1)) * (CHART_WIDTH - 2 * CHART_PADDING) + CHART_PADDING;
            const y =
                CHART_HEIGHT -
                CHART_PADDING -
                ((d - minVal) / range) * (CHART_HEIGHT - 2 * CHART_PADDING);
            return { x, y };
        });

        let lineOnly = `M${points[0].x},${points[0].y}`;
        for (let i = 0; i < points.length - 1; i++) {
            const { x: x1, y: y1 } = points[i];
            const { x: x2, y: y2 } = points[i + 1];
            const midX = (x1 + x2) / 2;
            lineOnly += ` Q${x1},${y1} ${midX},${y1}`;
            lineOnly += ` T${x2},${y2}`;
        }

        const last = points[points.length - 1];
        const first = points[0];
        const areaPath = `${lineOnly} L${last.x},${CHART_HEIGHT} L${first.x},${CHART_HEIGHT} Z`;
        return { areaChartPath: areaPath, linePath: lineOnly };
    }, [trendData, chartType]);

    const hasChart = (chartType === 'bar' && barRects.length > 0) || (chartType === 'line' && trendData.length > 1);

    const chartOpacity = useRef(new Animated.Value(0)).current;
    useEffect(() => {
        if (!hasChart) return;
        chartOpacity.setValue(0);
        Animated.timing(chartOpacity, {
            toValue: 1,
            duration: 400,
            useNativeDriver: true,
        }).start();
    }, [hasChart, trendData.length]);

    const cardContent = (
        <View
            style={[
                styles.container,
                {
                    backgroundColor: colors.bg,
                    borderRadius: 12,
                    padding: 14,
                    minHeight: CARD_MIN_HEIGHT,
                    width: CARD_WIDTH,
                },
            ]}
        >
            {/* Dynamic line/area chart - lower half, smooth trend line + filled area */}
            {hasChart && (
                <Animated.View
                    style={[styles.chartContainer, { opacity: chartOpacity }]}
                    pointerEvents="none"
                >
                    <Svg
                        viewBox={`0 0 ${CHART_WIDTH} ${CHART_HEIGHT}`}
                        preserveAspectRatio="none"
                        style={styles.chartSvg}
                    >
                        {chartType === 'bar' &&
                            barRects.map((r, i) => (
                                <Rect
                                    key={i}
                                    x={r.x}
                                    y={r.y}
                                    width={r.width}
                                    height={r.height}
                                    rx={2}
                                    fill={colors.chartFill}
                                />
                            ))}
                        {chartType === 'line' && areaChartPath ? (
                            <>
                                <Path d={areaChartPath} fill={colors.chartFill} />
                                {linePath ? (
                                    <Path
                                        d={linePath}
                                        fill="none"
                                        stroke={colors.chartLine}
                                        strokeWidth={1.5}
                                        strokeLinecap="round"
                                        strokeLinejoin="round"
                                    />
                                ) : null}
                            </>
                        ) : null}
                    </Svg>
                </Animated.View>
            )}

            {/* Visibility toggle - top right */}
            {showVisibilityToggle && (
                <TouchableOpacity
                    style={styles.eyeButton}
                    onPress={onVisibilityToggle}
                    activeOpacity={0.7}
                    accessibilityLabel="Toggle visibility"
                >
                    <Icon name="visibility" size={18} color="#ffffff" />
                </TouchableOpacity>
            )}

            {/* Icon - bottom right, semi-transparent square */}
            {iconName && (
                <View style={styles.iconContainer}>
                    <Icon name={iconName} size={20} color="#ffffff" />
                </View>
            )}

            <View style={styles.content}>
                <Text style={[styles.title, { color: titleColor }]} numberOfLines={1}>
                    {title.toUpperCase()}
                </Text>
                <Text
                    style={[
                        styles.value,
                        { color: textColor, fontSize: valueFontSize },
                    ]}
                    numberOfLines={2}
                >
                    {formattedValue}
                    {unit}
                </Text>
            </View>
        </View>
    );

    if (onPress) {
        return (
            <TouchableOpacity onPress={onPress} activeOpacity={0.85}>
                {cardContent}
            </TouchableOpacity>
        );
    }
    return cardContent;
};

const styles = StyleSheet.create({
    container: {
        position: 'relative',
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.15,
        shadowRadius: 6,
        elevation: 4,
        overflow: 'hidden',
    },
    chartContainer: {
        position: 'absolute',
        bottom: 0,
        left: 0,
        right: 0,
        height: '58%',
        opacity: 0.9,
    },
    chartSvg: {
        width: '100%',
        height: '100%',
    },
    content: {
        position: 'relative',
        zIndex: 1,
    },
    title: {
        fontSize: 10,
        fontWeight: '600',
        letterSpacing: 0.6,
        marginBottom: 6,
    },
    value: {
        fontWeight: '700',
        lineHeight: 22,
    },
    iconContainer: {
        position: 'absolute',
        bottom: 12,
        right: 12,
        width: 36,
        height: 36,
        borderRadius: 8, // Slightly more squared
        backgroundColor: 'rgba(255,255,255,0.15)', // More transparent
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 2,
    },
    eyeButton: {
        position: 'absolute',
        top: 10,
        right: 10,
        width: 32,
        height: 32,
        borderRadius: 12, // Match icon container feel
        backgroundColor: 'rgba(255,255,255,0.15)',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 2,
    },
});

export default KPICard;

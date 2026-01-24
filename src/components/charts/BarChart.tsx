/**
 * Bar Chart Component
 * Horizontal bar chart using react-native-gifted-charts
 * Ported from React TallyCatalyst BarChart.js
 */

import React from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity } from 'react-native';
import { BarChart as GiftedBarChart } from 'react-native-gifted-charts';
import Icon from 'react-native-vector-icons/MaterialIcons';
import type { ChartDataPoint } from '../../types/sales';

interface BarChartProps {
    data: ChartDataPoint[];
    title: string;
    valuePrefix?: string;
    onBarClick?: (label: string) => void;
    onBackClick?: () => void;
    showBackButton?: boolean;
    formatValue?: (value: number, prefix: string) => string;
    maxBars?: number;
    horizontal?: boolean;
}

const BarChart: React.FC<BarChartProps> = ({
    data,
    title,
    valuePrefix = '₹',
    onBarClick,
    onBackClick,
    showBackButton = false,
    formatValue,
    maxBars = 10,
    horizontal = true,
}) => {
    // Default formatter
    const formatNumber = (value: number, prefix: string): string => {
        if (formatValue) {
            return formatValue(value, prefix);
        }
        const absValue = Math.abs(value);
        if (absValue >= 10000000) {
            return `${prefix}${(value / 10000000).toFixed(2)} Cr`;
        } else if (absValue >= 100000) {
            return `${prefix}${(value / 100000).toFixed(2)} L`;
        } else if (absValue >= 1000) {
            return `${prefix}${(value / 1000).toFixed(2)} K`;
        }
        return `${prefix}${value.toFixed(2)}`;
    };

    // Handle empty data
    if (!data || !Array.isArray(data) || data.length === 0) {
        return (
            <View style={styles.container}>
                <View style={styles.header}>
                    <Text style={styles.title}>{title}</Text>
                    {showBackButton && onBackClick && (
                        <TouchableOpacity onPress={onBackClick} style={styles.backButton}>
                            <Icon name="arrow-back" size={18} color="#475569" />
                        </TouchableOpacity>
                    )}
                </View>
                <View style={styles.emptyContainer}>
                    <Text style={styles.emptyText}>No data available</Text>
                </View>
            </View>
        );
    }

    // Limit data and prepare for chart
    const displayData = data.slice(0, maxBars);
    const maxValue = Math.max(...displayData.map(d => d.value || 0), 0);

    // Color palette
    const colors = [
        '#0d6464', '#2dd4bf', '#c55a39', '#f59e0b', '#16a34a',
        '#0891b2', '#dc2626', '#7c3aed', '#ea580c', '#059669',
    ];

    // Convert to gifted-charts format
    const chartData = displayData.map((item, index) => ({
        value: item.value || 0,
        label: item.label?.length > 12 ? item.label.substring(0, 12) + '...' : item.label,
        frontColor: item.color || colors[index % colors.length],
        onPress: () => onBarClick?.(item.label),
    }));

    if (horizontal) {
        // Render custom horizontal bars (gifted-charts horizontal is limited)
        return (
            <View style={styles.container}>
                <View style={styles.header}>
                    <Text style={styles.title}>{title}</Text>
                    {showBackButton && onBackClick && (
                        <TouchableOpacity onPress={onBackClick} style={styles.backButton}>
                            <Icon name="arrow-back" size={18} color="#475569" />
                        </TouchableOpacity>
                    )}
                </View>
                <ScrollView style={styles.scrollContent} nestedScrollEnabled>
                    {displayData.map((item, index) => {
                        const barWidth = maxValue > 0 ? ((item.value || 0) / maxValue) * 100 : 0;
                        const barColor = item.color || colors[index % colors.length];

                        return (
                            <TouchableOpacity
                                key={`${item.label}-${index}`}
                                style={styles.barRow}
                                onPress={() => onBarClick?.(item.label)}
                                activeOpacity={onBarClick ? 0.7 : 1}
                            >
                                <View style={styles.barLabelRow}>
                                    <Text style={styles.barLabel} numberOfLines={1}>
                                        {item.label}
                                    </Text>
                                    <Text style={styles.barValue}>
                                        {formatNumber(item.value || 0, valuePrefix)}
                                    </Text>
                                </View>
                                <View style={styles.barTrack}>
                                    <View
                                        style={[
                                            styles.barFill,
                                            {
                                                width: `${barWidth}%`,
                                                backgroundColor: barColor,
                                            },
                                        ]}
                                    />
                                </View>
                            </TouchableOpacity>
                        );
                    })}
                </ScrollView>
            </View>
        );
    }

    // Vertical bar chart using gifted-charts
    return (
        <View style={styles.container}>
            <View style={styles.header}>
                <Text style={styles.title}>{title}</Text>
                {showBackButton && onBackClick && (
                    <TouchableOpacity onPress={onBackClick} style={styles.backButton}>
                        <Icon name="arrow-back" size={18} color="#475569" />
                    </TouchableOpacity>
                )}
            </View>
            <ScrollView horizontal style={styles.chartScroll}>
                <GiftedBarChart
                    data={chartData}
                    barWidth={30}
                    spacing={20}
                    roundedTop
                    roundedBottom
                    hideRules
                    xAxisThickness={1}
                    xAxisColor="#e2e8f0"
                    yAxisThickness={0}
                    yAxisTextStyle={styles.axisText}
                    xAxisLabelTextStyle={styles.axisText}
                    noOfSections={4}
                    maxValue={maxValue * 1.1}
                    isAnimated
                    animationDuration={500}
                />
            </ScrollView>
        </View>
    );
};

const styles = StyleSheet.create({
    container: {
        backgroundColor: 'white',
        borderRadius: 16,
        borderWidth: 1,
        borderColor: '#e2e8f0',
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.1,
        shadowRadius: 6,
        elevation: 4,
        overflow: 'hidden',
    },
    header: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingHorizontal: 16,
        paddingVertical: 14,
        borderBottomWidth: 1,
        borderBottomColor: '#f1f5f9',
    },
    title: {
        fontSize: 16,
        fontWeight: '700',
        color: '#1e293b',
        letterSpacing: -0.25,
        flex: 1,
    },
    backButton: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: 10,
        paddingVertical: 6,
        backgroundColor: '#f1f5f9',
        borderRadius: 8,
        borderWidth: 1,
        borderColor: '#e2e8f0',
    },
    scrollContent: {
        padding: 16,
        maxHeight: 400,
    },
    chartScroll: {
        padding: 16,
    },
    emptyContainer: {
        padding: 40,
        alignItems: 'center',
        justifyContent: 'center',
    },
    emptyText: {
        fontSize: 14,
        color: '#94a3b8',
    },
    barRow: {
        marginBottom: 12,
    },
    barLabelRow: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        marginBottom: 4,
    },
    barLabel: {
        fontSize: 13,
        fontWeight: '600',
        color: '#1e293b',
        flex: 1,
        marginRight: 8,
    },
    barValue: {
        fontSize: 12,
        fontWeight: '600',
        color: '#1e293b',
    },
    barTrack: {
        height: 10,
        backgroundColor: '#e2e8f0',
        borderRadius: 4,
        overflow: 'hidden',
    },
    barFill: {
        height: 10,
        borderRadius: 4,
    },
    axisText: {
        fontSize: 10,
        color: '#64748b',
    },
});

export default BarChart;

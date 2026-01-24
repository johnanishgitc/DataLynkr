/**
 * Pie Chart Component
 * Donut/Pie chart using react-native-gifted-charts
 * Ported from React TallyCatalyst PieChart.js
 */

import React, { useMemo } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity } from 'react-native';
import { PieChart as GiftedPieChart } from 'react-native-gifted-charts';
import Icon from 'react-native-vector-icons/MaterialIcons';
import type { ChartDataPoint } from '../../types/sales';

interface PieChartProps {
    data: ChartDataPoint[];
    title: string;
    valuePrefix?: string;
    onSliceClick?: (label: string) => void;
    onBackClick?: () => void;
    showBackButton?: boolean;
    formatValue?: (value: number, prefix: string) => string;
    showLabels?: boolean;
    donut?: boolean;
    maxSlices?: number;
}

const PieChart: React.FC<PieChartProps> = ({
    data,
    title,
    valuePrefix = '₹',
    onSliceClick,
    onBackClick,
    showBackButton = false,
    formatValue,
    showLabels = true,
    donut = true,
    maxSlices = 8,
}) => {
    // Color palette
    const colors = useMemo(() => [
        '#0d6464', '#2dd4bf', '#c55a39', '#f59e0b', '#16a34a',
        '#0891b2', '#dc2626', '#7c3aed', '#ea580c', '#059669',
        '#0284c7', '#db2777', '#65a30d', '#6366f1', '#ca8a04',
    ], []);

    // Calculate total
    const total = useMemo(() => {
        if (!data || !Array.isArray(data)) return 0;
        return data.reduce((sum, d) => sum + (d.value || 0), 0);
    }, [data]);

    // Limit data to maxSlices
    const displayData = useMemo(() => {
        if (!data || !Array.isArray(data)) return [];

        // If data is within limit, return as is
        if (data.length <= maxSlices) {
            return data;
        }

        // Take top N slices and aggregate the rest into "Others"
        const topSlices = data.slice(0, maxSlices - 1);
        const remainingSlices = data.slice(maxSlices - 1);
        const othersValue = remainingSlices.reduce((sum, d) => sum + (d.value || 0), 0);

        if (othersValue > 0) {
            return [
                ...topSlices,
                {
                    label: `Others (${remainingSlices.length})`,
                    value: othersValue,
                    color: '#94a3b8', // gray color for "Others"
                },
            ];
        }

        return topSlices;
    }, [data, maxSlices]);

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
    if (!data || !Array.isArray(data) || data.length === 0 || total === 0) {
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

    // Convert to gifted-charts format
    const chartData = displayData.map((item, index) => ({
        value: item.value || 0,
        color: item.color || colors[index % colors.length],
        text: total > 0 ? `${((item.value / total) * 100).toFixed(0)}%` : '0%',
        onPress: () => onSliceClick?.(item.label),
    }));

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

            <View style={styles.chartContainer}>
                <GiftedPieChart
                    data={chartData}
                    donut={donut}
                    innerRadius={donut ? 50 : 0}
                    radius={80}
                    textColor="#ffffff"
                    textSize={10}
                    showText={showLabels}
                    focusOnPress
                    innerCircleBorderWidth={0}
                    innerCircleColor="#ffffff"
                    centerLabelComponent={() => (
                        <View style={styles.centerLabel}>
                            <Text style={styles.centerLabelText}>Total</Text>
                            <Text style={styles.centerLabelValue}>
                                {formatNumber(total, valuePrefix)}
                            </Text>
                        </View>
                    )}
                />
            </View>

            {/* Legend */}
            <ScrollView style={styles.legendContainer} nestedScrollEnabled>
                {displayData.map((item, index) => {
                    const percentage = total > 0 ? ((item.value / total) * 100).toFixed(1) : '0.0';
                    const itemColor = item.color || colors[index % colors.length];

                    return (
                        <TouchableOpacity
                            key={`${item.label}-${index}`}
                            style={styles.legendItem}
                            onPress={() => onSliceClick?.(item.label)}
                            activeOpacity={onSliceClick ? 0.7 : 1}
                        >
                            <View style={styles.legendLeft}>
                                <View
                                    style={[styles.legendColor, { backgroundColor: itemColor }]}
                                />
                                <Text style={styles.legendLabel} numberOfLines={1}>
                                    {item.label}
                                </Text>
                            </View>
                            <View style={styles.legendRight}>
                                <View style={styles.percentBadge}>
                                    <Text style={styles.percentText}>{percentage}%</Text>
                                </View>
                                <Text style={styles.legendValue}>
                                    {formatNumber(item.value || 0, valuePrefix)}
                                </Text>
                            </View>
                        </TouchableOpacity>
                    );
                })}
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
    chartContainer: {
        alignItems: 'center',
        justifyContent: 'center',
        paddingVertical: 20,
    },
    centerLabel: {
        alignItems: 'center',
    },
    centerLabelText: {
        fontSize: 10,
        color: '#64748b',
        fontWeight: '600',
    },
    centerLabelValue: {
        fontSize: 12,
        color: '#1e293b',
        fontWeight: '700',
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
    legendContainer: {
        paddingHorizontal: 16,
        paddingBottom: 16,
        maxHeight: 200,
    },
    legendItem: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingVertical: 10,
        paddingHorizontal: 12,
        backgroundColor: '#f8fafc',
        borderRadius: 8,
        borderWidth: 1,
        borderColor: '#e2e8f0',
        marginBottom: 8,
    },
    legendLeft: {
        flexDirection: 'row',
        alignItems: 'center',
        flex: 1,
    },
    legendColor: {
        width: 12,
        height: 12,
        borderRadius: 3,
        marginRight: 8,
    },
    legendLabel: {
        fontSize: 12,
        fontWeight: '600',
        color: '#475569',
        flex: 1,
    },
    legendRight: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
    },
    percentBadge: {
        backgroundColor: '#f1f5f9',
        paddingHorizontal: 6,
        paddingVertical: 2,
        borderRadius: 4,
    },
    percentText: {
        fontSize: 10,
        fontWeight: '600',
        color: '#64748b',
    },
    legendValue: {
        fontSize: 12,
        fontWeight: '700',
        color: '#1e293b',
        minWidth: 70,
        textAlign: 'right',
    },
});

export default PieChart;

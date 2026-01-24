/**
 * Line Chart Component
 * Line/Area chart using react-native-gifted-charts
 * Ported from React TallyCatalyst LineChart.js
 */

import React, { useMemo } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity } from 'react-native';
import { LineChart as GiftedLineChart } from 'react-native-gifted-charts';
import Icon from 'react-native-vector-icons/MaterialIcons';
import type { ChartDataPoint } from '../../types/sales';

interface LineChartProps {
    data: ChartDataPoint[];
    title: string;
    valuePrefix?: string;
    onPointClick?: (label: string) => void;
    onBackClick?: () => void;
    showBackButton?: boolean;
    formatValue?: (value: number, prefix: string) => string;
    showArea?: boolean;
    curved?: boolean;
    maxPoints?: number;
}

const LineChart: React.FC<LineChartProps> = ({
    data,
    title,
    valuePrefix = '₹',
    onPointClick,
    onBackClick,
    showBackButton = false,
    formatValue,
    showArea = true,
    curved = true,
    maxPoints = 24,
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

    // Compact format for Y-axis
    const formatCompact = (value: number): string => {
        const absValue = Math.abs(value);
        if (absValue >= 10000000) {
            return `${(value / 10000000).toFixed(1)}Cr`;
        } else if (absValue >= 100000) {
            return `${(value / 100000).toFixed(1)}L`;
        } else if (absValue >= 1000) {
            return `${(value / 1000).toFixed(1)}K`;
        }
        return value.toFixed(0);
    };

    // Calculate max value for scaling
    const maxValue = useMemo(() => {
        if (!data || data.length === 0) return 0;
        return Math.max(...data.map(d => d.value || 0), 0);
    }, [data]);

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

    // Limit data to maxPoints
    const displayData = data.slice(0, maxPoints);

    // Convert to gifted-charts format
    const chartData = displayData.map((item, index) => ({
        value: item.value || 0,
        label: item.label?.length > 8 ? item.label.substring(0, 6) + '..' : item.label,
        dataPointText: '',
        onPress: () => onPointClick?.(item.label),
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

            <ScrollView horizontal style={styles.chartScroll} showsHorizontalScrollIndicator={false}>
                <View style={styles.chartWrapper}>
                    <GiftedLineChart
                        data={chartData}
                        width={Math.max(300, displayData.length * 60)}
                        height={220}
                        spacing={50}
                        color="#0d6464"
                        thickness={3}
                        dataPointsColor="#0d6464"
                        dataPointsRadius={5}
                        curved={curved}
                        areaChart={showArea}
                        startFillColor="rgba(13, 100, 100, 0.3)"
                        endFillColor="rgba(13, 100, 100, 0.01)"
                        startOpacity={0.8}
                        endOpacity={0.1}
                        hideRules={false}
                        rulesType="dashed"
                        rulesColor="#e2e8f0"
                        xAxisThickness={1}
                        xAxisColor="#e2e8f0"
                        yAxisThickness={0}
                        yAxisTextStyle={styles.axisText}
                        xAxisLabelTextStyle={styles.xAxisText}
                        noOfSections={4}
                        maxValue={maxValue * 1.2}
                        isAnimated
                        animationDuration={500}
                        pointerConfig={{
                            pointerStripHeight: 160,
                            pointerStripColor: '#0d6464',
                            pointerStripWidth: 2,
                            pointerColor: '#0d6464',
                            radius: 6,
                            pointerLabelWidth: 120,
                            pointerLabelHeight: 70,
                            activatePointersOnLongPress: false,
                            autoAdjustPointerLabelPosition: true,
                            pointerLabelComponent: (items: Array<{ value: number; label?: string }>) => {
                                const item = items[0];
                                if (!item) return null;
                                return (
                                    <View style={styles.tooltip}>
                                        <Text style={styles.tooltipLabel}>
                                            {chartData[items.findIndex(i => i.value === item.value)]?.label || ''}
                                        </Text>
                                        <Text style={styles.tooltipValue}>
                                            {formatNumber(item.value, valuePrefix)}
                                        </Text>
                                    </View>
                                );
                            },
                        }}
                        formatYLabel={(value: string) => formatCompact(parseFloat(value))}
                    />
                </View>
            </ScrollView>

            {/* Data points list */}
            {displayData.length <= 12 && (
                <ScrollView style={styles.dataList} nestedScrollEnabled>
                    {displayData.map((item, index) => (
                        <TouchableOpacity
                            key={`${item.label}-${index}`}
                            style={styles.dataItem}
                            onPress={() => onPointClick?.(item.label)}
                            activeOpacity={onPointClick ? 0.7 : 1}
                        >
                            <View style={styles.dataLeft}>
                                <View style={styles.dataColor} />
                                <Text style={styles.dataLabel} numberOfLines={1}>
                                    {item.label}
                                </Text>
                            </View>
                            <Text style={styles.dataValue}>
                                {formatNumber(item.value || 0, valuePrefix)}
                            </Text>
                        </TouchableOpacity>
                    ))}
                </ScrollView>
            )}
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
    chartScroll: {
        paddingVertical: 16,
    },
    chartWrapper: {
        paddingLeft: 16,
        paddingRight: 32,
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
    axisText: {
        fontSize: 10,
        color: '#64748b',
    },
    xAxisText: {
        fontSize: 9,
        color: '#64748b',
        transform: [{ rotate: '-45deg' }],
    },
    tooltip: {
        backgroundColor: 'white',
        padding: 10,
        borderRadius: 8,
        borderWidth: 1,
        borderColor: '#e2e8f0',
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.1,
        shadowRadius: 4,
        elevation: 3,
    },
    tooltipLabel: {
        fontSize: 11,
        fontWeight: '600',
        color: '#64748b',
        marginBottom: 2,
    },
    tooltipValue: {
        fontSize: 13,
        fontWeight: '700',
        color: '#1e293b',
    },
    dataList: {
        paddingHorizontal: 16,
        paddingBottom: 16,
        maxHeight: 200,
    },
    dataItem: {
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
    dataLeft: {
        flexDirection: 'row',
        alignItems: 'center',
        flex: 1,
    },
    dataColor: {
        width: 12,
        height: 12,
        borderRadius: 3,
        backgroundColor: '#0d6464',
        marginRight: 8,
    },
    dataLabel: {
        fontSize: 12,
        fontWeight: '600',
        color: '#475569',
        flex: 1,
    },
    dataValue: {
        fontSize: 12,
        fontWeight: '700',
        color: '#1e293b',
    },
});

export default LineChart;

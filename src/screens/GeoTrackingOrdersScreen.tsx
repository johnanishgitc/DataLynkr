import React, { useCallback, useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  ActivityIndicator,
  Modal,
  Alert,
  RefreshControl,
  StatusBar,
  Platform,
} from 'react-native';
import SystemNavigationBar from '../utils/systemNavBar';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation, useFocusEffect } from '@react-navigation/native';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import { colors } from '../constants/colors';
import { useGlobalSidebar } from '../store/GlobalSidebarContext';
import { apiService, isUnauthorizedError } from '../api';
import { getCompany, getGuid, getTallylocId } from '../store/storage';

// ── Types ──────────────────────────────────────────────────────────────

interface GeoTrackingOrder {
  masterid: number;
  id: number;
  name: string;
  email: string;
  customers: string[];
  days: string[];
  dates?: string[];
  is_active: boolean;
  created_at: string;
  updated_at?: string;
}

// ── Component ──────────────────────────────────────────────────────────

export default function GeoTrackingOrdersScreen() {
  const insets = useSafeAreaInsets();
  const { openSidebar } = useGlobalSidebar();
  const navigation = useNavigation();

  const [orders, setOrders] = useState<GeoTrackingOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [detailOrder, setDetailOrder] = useState<GeoTrackingOrder | null>(null);
  const [deleting, setDeleting] = useState(false);

  // ── System Bar Shadow Effect ──
  useEffect(() => {
    if (detailOrder) {
      if (Platform.OS === 'android') {
        StatusBar.setBackgroundColor('#00000080', true);
        StatusBar.setBarStyle('light-content');
        SystemNavigationBar.setNavigationColor('#00000080', false);
      }
    } else {
      if (Platform.OS === 'android') {
        StatusBar.setBackgroundColor(colors.primary_blue, true);
        StatusBar.setBarStyle('light-content');
        SystemNavigationBar.setNavigationColor(colors.white, true);
      }
    }
  }, [detailOrder]);

  // ── Fetch list ──
  const fetchOrders = useCallback(async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true); else setLoading(true);
    try {
      const [tallyloc_id, company, guid] = await Promise.all([
        getTallylocId(), getCompany(), getGuid(),
      ]);
      if (!tallyloc_id || !company || !guid) return;
      const res = await apiService.listGeoTracking({
        tallyloc_id,
        company,
        guid,
      });
      setOrders(res.data?.data ?? []);
    } catch (e: unknown) {
      if (isUnauthorizedError(e)) return;
      console.warn('[GeoTrackingOrders] fetch failed:', e);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  // Refresh when screen comes into focus (e.g. after creating / updating)
  useFocusEffect(
    useCallback(() => {
      fetchOrders();
    }, [fetchOrders]),
  );

  // ── Delete ──
  const handleDelete = useCallback(async (order: GeoTrackingOrder) => {
    Alert.alert(
      'Delete Geo-Tracking',
      `Are you sure you want to delete the tracking for "${order.name}"?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            setDeleting(true);
            try {
              const [tallyloc_id, company, guid] = await Promise.all([
                getTallylocId(), getCompany(), getGuid(),
              ]);
              await apiService.deleteGeoTracking({
                masterid: order.masterid,
                tallyloc_id,
                company,
                guid,
              });
              setDetailOrder(null);
              fetchOrders();
            } catch (e: unknown) {
              if (isUnauthorizedError(e)) return;
              console.warn('[GeoTrackingOrders] delete failed:', e);
              Alert.alert('Error', 'Failed to delete geo-tracking order.');
            } finally {
              setDeleting(false);
            }
          },
        },
      ],
    );
  }, [fetchOrders]);

  // ── Navigate to edit ──
  const handleEdit = useCallback((order: GeoTrackingOrder) => {
    setDetailOrder(null);
    (navigation as any).navigate('GeoTrackingAddForm', {
      editData: {
        masterid: order.masterid,
        id: order.id,
        name: order.name,
        email: order.email,
        customers: order.customers,
        days: order.days,
        dates: order.dates ?? [],
      },
    });
  }, [navigation]);

  const handleAddGeoTracking = () => {
    (navigation as any).navigate('GeoTrackingAddForm');
  };

  // ── Format date ──
  const formatDate = (dateStr: string) => {
    try {
      const d = new Date(dateStr);
      return d.toLocaleDateString('en-IN', {
        day: '2-digit', month: 'short', year: 'numeric',
      });
    } catch { return dateStr; }
  };

  return (
    <View style={s.root}>
      <View style={[s.headerWrap, { paddingTop: insets.top }]}>
        <View style={s.headerTopRow}>
          <TouchableOpacity
            onPress={openSidebar}
            style={s.menuBtn}
            hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
            accessibilityLabel="Menu"
          >
            <Icon name="menu" size={24} color={colors.white} />
          </TouchableOpacity>
          <Text style={s.headerTitle}>Geo-Tracking Orders</Text>
        </View>
      </View>

      <ScrollView
        style={s.scroll}
        contentContainerStyle={[s.scrollContent, { paddingBottom: insets.bottom + 20 }]}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={() => fetchOrders(true)} colors={[colors.primary_blue]} />
        }
      >
        {/* List */}
        {loading && orders.length === 0 ? (
          <View style={s.centerWrap}>
            <ActivityIndicator size="large" color={colors.primary_blue} />
            <Text style={s.loadingText}>Loading orders...</Text>
          </View>
        ) : orders.length === 0 ? (
          <View style={s.centerWrap}>
            <Icon name="map-marker-off-outline" size={48} color={colors.text_disabled} />
            <Text style={s.emptyText}>No geo-tracking orders yet</Text>
          </View>
        ) : (
          orders.map((order) => (
            <TouchableOpacity
              key={order.masterid}
              style={s.card}
              activeOpacity={0.7}
              onPress={() => setDetailOrder(order)}
            >
              <View style={s.cardHeader}>
                <View style={s.cardHeaderLeft}>
                  <Icon name="account-outline" size={18} color={colors.primary_blue} />
                  <Text style={s.cardSalesName} numberOfLines={1}>{order.name}</Text>
                </View>
                <TouchableOpacity
                  onPress={() => setDetailOrder(order)}
                  hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                >
                  <Icon name="eye-outline" size={20} color={colors.primary_blue} />
                </TouchableOpacity>
              </View>

              <View style={s.cardRow}>
                <Icon name="account-group-outline" size={15} color={colors.text_secondary} />
                <Text style={s.cardRowLabel}>Customers:</Text>
                <Text style={s.cardRowValue} numberOfLines={1}>
                  {order.customers.length > 2
                    ? `${order.customers.slice(0, 2).join(', ')} +${order.customers.length - 2} more`
                    : order.customers.join(', ')}
                </Text>
              </View>

              <View style={s.cardRow}>
                <Icon name="calendar-week" size={15} color={colors.text_secondary} />
                <Text style={s.cardRowLabel}>Days:</Text>
                <Text style={s.cardRowValue} numberOfLines={1}>{order.days.join(', ')}</Text>
              </View>

              <Text style={s.cardDate}>Created {formatDate(order.created_at)}</Text>
            </TouchableOpacity>
          ))
        )}

        {/* Add button */}
        <View style={s.addBtnWrap}>
          <TouchableOpacity
            style={s.primaryBtn}
            activeOpacity={0.8}
            onPress={handleAddGeoTracking}
          >
            <Icon name="plus" size={20} color={colors.white} style={{ marginRight: 6 }} />
            <Text style={s.primaryBtnText}>Add Geo-Tracking</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>

      {/* Detail Modal */}
      <Modal
        visible={!!detailOrder}
        transparent
        statusBarTranslucent
        animationType="fade"
        onRequestClose={() => setDetailOrder(null)}
      >
        <TouchableOpacity
          style={s.modalOverlay}
          activeOpacity={1}
          onPress={() => setDetailOrder(null)}
        >
          <View style={s.modalContent} onStartShouldSetResponder={() => true}>
            {/* Modal Header */}
            <View style={s.modalHeader}>
              <Text style={s.modalHeaderTitle}>Geo-Tracking Details</Text>
              <TouchableOpacity onPress={() => setDetailOrder(null)} style={s.modalCloseBtn}>
                <Icon name="close" size={24} color={colors.white} />
              </TouchableOpacity>
            </View>

            {detailOrder && (
              <ScrollView style={s.modalBody}>
                {/* Sales Person */}
                <View style={s.detailBlock}>
                  <Text style={s.detailLabel}>Sales Person</Text>
                  <Text style={s.detailValue}>{detailOrder.name}</Text>
                  <Text style={s.detailSubValue}>{detailOrder.email}</Text>
                </View>

                {/* Customers */}
                <View style={s.detailBlock}>
                  <Text style={s.detailLabel}>
                    Customers ({detailOrder.customers.length})
                  </Text>
                  <View style={s.detailChipsWrap}>
                    {detailOrder.customers.map((c) => (
                      <View key={c} style={s.detailChip}>
                        <Text style={s.detailChipText}>{c}</Text>
                      </View>
                    ))}
                  </View>
                </View>

                {/* Days */}
                <View style={s.detailBlock}>
                  <Text style={s.detailLabel}>Days</Text>
                  <View style={s.detailChipsWrap}>
                    {detailOrder.days.map((d) => (
                      <View key={d} style={[s.detailChip, s.detailDayChip]}>
                        <Text style={[s.detailChipText, s.detailDayChipText]}>{d}</Text>
                      </View>
                    ))}
                  </View>
                </View>

                {/* Created date */}
                <View style={s.detailBlock}>
                  <Text style={s.detailLabel}>Created</Text>
                  <Text style={s.detailValue}>{formatDate(detailOrder.created_at)}</Text>
                </View>
              </ScrollView>
            )}

            {/* Action Buttons */}
            {detailOrder && (
              <View style={s.modalActions}>
                <TouchableOpacity
                  style={s.editBtn}
                  activeOpacity={0.8}
                  onPress={() => handleEdit(detailOrder)}
                >
                  <Icon name="pencil-outline" size={18} color={colors.white} />
                  <Text style={s.editBtnText}>Update</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={s.deleteBtn}
                  activeOpacity={0.8}
                  onPress={() => handleDelete(detailOrder)}
                  disabled={deleting}
                >
                  {deleting ? (
                    <ActivityIndicator size="small" color={colors.white} />
                  ) : (
                    <>
                      <Icon name="delete-outline" size={18} color={colors.white} />
                      <Text style={s.deleteBtnText}>Delete</Text>
                    </>
                  )}
                </TouchableOpacity>
              </View>
            )}
          </View>
        </TouchableOpacity>
      </Modal>
    </View>
  );
}

// ── Styles ──────────────────────────────────────────────────────────────

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.white },
  headerWrap: { backgroundColor: colors.primary_blue, paddingHorizontal: 16 },
  headerTopRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 12, minHeight: 47 },
  menuBtn: { marginRight: 12 },
  headerTitle: {
    fontFamily: 'Roboto', fontSize: 17, fontWeight: '600', color: colors.white,
  },
  scroll: { flex: 1, backgroundColor: colors.bg_page },
  scrollContent: { paddingHorizontal: 16, paddingTop: 16 },

  // Loading / Empty
  centerWrap: { alignItems: 'center', justifyContent: 'center', marginTop: 60 },
  loadingText: {
    fontFamily: 'Roboto', fontSize: 14, color: colors.text_secondary, marginTop: 10,
  },
  emptyText: {
    fontFamily: 'Roboto', fontSize: 15, color: colors.text_secondary, marginTop: 10,
  },

  // Card
  card: {
    backgroundColor: colors.white,
    borderRadius: 10,
    padding: 14,
    marginBottom: 10,
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.08,
    shadowRadius: 3,
    borderWidth: 1,
    borderColor: colors.border_light,
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  cardHeaderLeft: { flexDirection: 'row', alignItems: 'center', flex: 1, gap: 6 },
  cardSalesName: {
    fontFamily: 'Roboto', fontSize: 15, fontWeight: '600', color: colors.text_primary, flex: 1,
  },
  cardRow: {
    flexDirection: 'row', alignItems: 'center', gap: 5, marginBottom: 4,
  },
  cardRowLabel: {
    fontFamily: 'Roboto', fontSize: 12, color: colors.text_secondary, fontWeight: '500',
  },
  cardRowValue: {
    fontFamily: 'Roboto', fontSize: 12, color: colors.text_primary, flex: 1,
  },
  cardDate: {
    fontFamily: 'Roboto', fontSize: 11, color: colors.text_secondary, marginTop: 6, textAlign: 'right',
  },

  // Add button
  addBtnWrap: { alignItems: 'center', marginTop: 16 },
  primaryBtn: {
    flexDirection: 'row',
    backgroundColor: colors.primary_blue,
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
  },
  primaryBtnText: {
    fontFamily: 'Roboto', fontSize: 16, fontWeight: '600', color: colors.white,
  },

  // Modal
  modalOverlay: {
    flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', alignItems: 'center',
  },
  modalContent: {
    backgroundColor: colors.white,
    borderRadius: 12,
    width: '90%',
    maxHeight: '80%',
    overflow: 'hidden',
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: colors.primary_blue,
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  modalHeaderTitle: {
    fontFamily: 'Roboto', fontSize: 16, fontWeight: '600', color: colors.white,
  },
  modalCloseBtn: { padding: 4 },
  modalBody: { padding: 16 },

  // Detail blocks
  detailBlock: { marginBottom: 16 },
  detailLabel: {
    fontFamily: 'Roboto', fontSize: 12, fontWeight: '500', color: colors.text_secondary, marginBottom: 4,
    textTransform: 'uppercase', letterSpacing: 0.5,
  },
  detailValue: {
    fontFamily: 'Roboto', fontSize: 15, color: colors.text_primary, fontWeight: '500',
  },
  detailSubValue: {
    fontFamily: 'Roboto', fontSize: 13, color: colors.text_secondary, marginTop: 2,
  },
  detailChipsWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 4 },
  detailChip: {
    backgroundColor: colors.bg_light_blue,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 14,
  },
  detailChipText: {
    fontFamily: 'Roboto', fontSize: 12, color: colors.primary_blue,
  },
  detailDayChip: {
    backgroundColor: colors.primary_blue,
  },
  detailDayChipText: {
    color: colors.white,
  },

  // Action buttons
  modalActions: {
    flexDirection: 'row',
    padding: 16,
    gap: 10,
    borderTopWidth: 1,
    borderTopColor: colors.border_light,
  },
  editBtn: {
    flex: 1,
    flexDirection: 'row',
    backgroundColor: colors.primary_blue,
    height: 44,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },
  editBtnText: {
    fontFamily: 'Roboto', fontSize: 14, fontWeight: '600', color: colors.white,
  },
  deleteBtn: {
    flex: 1,
    flexDirection: 'row',
    backgroundColor: colors.reject_red,
    height: 44,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },
  deleteBtnText: {
    fontFamily: 'Roboto', fontSize: 14, fontWeight: '600', color: colors.white,
  },
});

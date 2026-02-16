import React, { useState, useCallback } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  FlatList,
  StyleSheet,
  ActivityIndicator,
  Alert,
  StatusBar,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { MainStackParamList } from '../navigation/types';
import type { UserConnection } from '../api';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import { apiService } from '../api';
import { useAuth } from '../store';
import { saveCompanyInfo, type CompanyInfo } from '../store/storage';
import { strings, connections_available } from '../constants/strings';
import { colors } from '../constants/colors';

type Nav = NativeStackNavigationProp<MainStackParamList, 'AdminDashboard'>;

function toCompanyInfo(c: UserConnection): CompanyInfo {
  return {
    tallyloc_id: c.tallyloc_id ?? 0,
    company: c.company ?? '',
    guid: c.guid ?? '',
    conn_name: c.conn_name ?? '',
    shared_email: c.shared_email ?? '',
    status: c.status ?? '',
    access_type: c.access_type ?? '',
    address: c.address ?? '',
    pincode: c.pincode ?? '',
    statename: c.statename ?? '',
    countryname: c.countryname ?? '',
    company_email: c.email ?? '',
    phonenumber: c.phonenumber ?? '',
    mobilenumbers: c.mobilenumbers ?? '',
    gstinno: c.gstinno ?? '',
    startingfrom: c.startingfrom ?? '',
    booksfrom: c.booksfrom ?? '',
    createdAt: c.createdAt ?? '',
  };
}

export default function AdminDashboard() {
  const insets = useSafeAreaInsets();
  const nav = useNavigation<Nav>();
  const { logout } = useAuth();
  const [all, setAll] = useState<UserConnection[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchConn = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await apiService.getUserConnections();
      const d = data as
        | { data?: UserConnection[] | null; createdByMe?: UserConnection[]; sharedWithMe?: UserConnection[]; error?: string | null; message?: string | null }
        | UserConnection[];
      if (d && !Array.isArray(d) && d?.error) {
        Alert.alert(strings.error, d.error);
        setAll([]);
        return;
      }
      let list: UserConnection[] = [];
      if (Array.isArray(d)) {
        list = d;
      } else if (d && typeof d === 'object') {
        list = d.data ?? [];
        if (list.length === 0 && (d.createdByMe || d.sharedWithMe)) {
          list = [...(d.createdByMe || []), ...(d.sharedWithMe || [])];
        }
      }
      setAll(list);
    } catch (e: unknown) {
      const msg = e && typeof e === 'object' && 'message' in e ? String((e as { message: string }).message) : strings.network_error;
      Alert.alert(strings.error, msg);
      setAll([]);
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => {
    fetchConn();
  }, [fetchConn]);

  const onRefresh = () => fetchConn();

  const onSelect = (c: UserConnection) => {
    if ((c.status ?? '').toLowerCase() !== 'connected') {
      Alert.alert('', 'This company is not connected');
      return;
    }
    saveCompanyInfo(toCompanyInfo(c)).then(() => {
      nav.replace('MainTabs');
    });
  };

  const doLogout = () => {
    Alert.alert(strings.logout, 'Are you sure?', [
      { text: strings.cancel, style: 'cancel' },
      { text: strings.logout, style: 'destructive', onPress: () => logout() },
    ]);
  };

  const availableCount = all.filter((c) => (c.status ?? '').toLowerCase() === 'connected').length;

  const renderItem = ({ item }: { item: UserConnection }) => {
    const isConnected = (item.status ?? '').toLowerCase() === 'connected';

    return (
      <TouchableOpacity style={styles.card} onPress={() => onSelect(item)} activeOpacity={0.7}>
        <View style={styles.cardRow}>
          <View style={styles.iconWrap}>
            <Text style={styles.iconLetter}>D</Text>
          </View>
          <Text style={styles.company} numberOfLines={1}>{item.company || '—'}</Text>
          {isConnected && (
            <View style={styles.connectedBadge}>
              <View style={styles.connectedDot} />
              <Text style={styles.connectedText}>{strings.connected}</Text>
            </View>
          )}
        </View>
      </TouchableOpacity>
    );
  };

  return (
    <View style={styles.root}>
      <StatusBar backgroundColor={colors.primary_blue} barStyle="light-content" />
      <View style={[styles.header, { paddingTop: insets.top || 12 }]}>
        <View style={styles.headerLeft}>
          <Text style={styles.title}>{strings.select_connection}</Text>
        </View>
        <View style={styles.headerRight}>
          <TouchableOpacity onPress={() => {}} hitSlop={12} style={styles.headerIconBtn}>
            <Icon name="dots-vertical" size={24} color="#ffffff" />
          </TouchableOpacity>
          <TouchableOpacity onPress={onRefresh} disabled={loading} hitSlop={12} style={styles.headerIconBtn}>
            <Icon name="refresh" size={24} color="#ffffff" />
          </TouchableOpacity>
        </View>
      </View>

      <View style={styles.countBar}>
        <View style={styles.countDot} />
        <Text style={styles.countText}>{connections_available(availableCount)}</Text>
      </View>

      {loading ? (
        <View style={styles.contentArea}>
          <ActivityIndicator size="large" color="#1e488f" />
        </View>
      ) : all.length === 0 ? (
        <View style={styles.contentArea}>
          <Text style={styles.empty}>{strings.no_connections_found}</Text>
        </View>
      ) : (
        <FlatList
          data={all}
          keyExtractor={(i) => String(i.tallyloc_id ?? '') + (i.company ?? '')}
          renderItem={renderItem}
          contentContainerStyle={[styles.list, { paddingBottom: 80 }]}
          showsVerticalScrollIndicator={false}
          style={styles.listContainer}
        />
      )}

      <View style={[styles.logoutFooter, { paddingBottom: Math.max(insets.bottom, 16) }]}>
        <TouchableOpacity style={styles.logoutBtn} onPress={doLogout} activeOpacity={0.8}>
          <Text style={styles.logoutBtnText}>{strings.logout}</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: '#ffffff',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingBottom: 12,
    backgroundColor: '#1e488f',
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  headerRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  headerIconBtn: {
    padding: 4,
  },
  title: {
    fontSize: 17,
    fontWeight: '700',
    color: '#ffffff',
  },
  countBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 16,
    paddingVertical: 10,
    marginHorizontal: 16,
    marginTop: 12,
    backgroundColor: '#f3f4f6',
    borderRadius: 4,
  },
  countDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#00c950',
  },
  countText: {
    fontSize: 13,
    color: '#374151',
  },
  contentArea: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  listContainer: {
    flex: 1,
  },
  list: {
    paddingHorizontal: 16,
    paddingTop: 12,
  },
  logoutFooter: {
    paddingHorizontal: 16,
    paddingTop: 16,
    backgroundColor: '#ffffff',
  },
  card: {
    backgroundColor: '#ffffff',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#e5e7eb',
    paddingVertical: 14,
    paddingHorizontal: 16,
    marginBottom: 12,
  },
  cardRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  iconWrap: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#1e498f',
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconLetter: {
    fontSize: 20,
    fontWeight: '700',
    color: '#ffffff',
  },
  company: {
    flex: 1,
    fontSize: 16,
    fontWeight: '400',
    color: '#374151',
  },
  connectedBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 5,
    backgroundColor: '#dcfce7',
    borderRadius: 9999,
  },
  connectedDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#22c55e',
  },
  connectedText: {
    fontSize: 12,
    color: '#16a34a',
  },
  logoutBtn: {
    paddingVertical: 10,
    backgroundColor: '#ffffff',
    borderRadius: 4,
    borderWidth: 1,
    borderColor: '#dc2626',
    alignItems: 'center',
  },
  logoutBtnText: {
    fontSize: 16,
    color: '#dc2626',
  },
  empty: {
    color: '#697282',
    fontSize: 14,
  },
});

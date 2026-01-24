import React, { useState, useCallback } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  FlatList,
  StyleSheet,
  ActivityIndicator,
  Alert,
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
    const siteId = item.conn_name || item.guid || '—';
    const accessType = item.access_type || '—';
    const sharedBy = item.shared_email || item.email || '—';

    return (
      <TouchableOpacity style={styles.card} onPress={() => onSelect(item)} activeOpacity={0.7}>
        <View style={styles.cardHeader}>
          <View style={styles.iconWrap}>
            <Icon name="domain" size={18} color="#ffffff" />
          </View>
          <View style={styles.cardTitleRow}>
            <Text style={styles.company} numberOfLines={1}>{item.company || '—'}</Text>
            {isConnected && (
              <View style={styles.connectedBadge}>
                <View style={styles.connectedDot} />
                <Text style={styles.connectedText}>{strings.connected}</Text>
              </View>
            )}
          </View>
        </View>

        <View style={styles.cardMeta}>
          <View style={styles.metaBlock}>
            <Text style={styles.metaLabel}>{strings.site_id}</Text>
            <View style={styles.pillBlue}>
              <Text style={styles.pillBlueText} numberOfLines={1}>{siteId}</Text>
            </View>
          </View>
          <View style={styles.metaBlock}>
            <Text style={styles.metaLabel}>{strings.access_type}</Text>
            <View style={styles.pillTeal}>
              <Text style={styles.pillTealText} numberOfLines={1}>{accessType}</Text>
            </View>
          </View>
        </View>

        <View style={styles.sharedBlock}>
          <Text style={styles.metaLabel}>{strings.shared_by_owner}</Text>
          <Text style={styles.sharedValue} numberOfLines={1}>{sharedBy}</Text>
        </View>
      </TouchableOpacity>
    );
  };

  const ListFooter = () => (
    <TouchableOpacity style={styles.logoutBtn} onPress={doLogout} activeOpacity={0.8}>
      <Text style={styles.logoutBtnText}>{strings.logout}</Text>
    </TouchableOpacity>
  );

  return (
    <View style={styles.root}>
      <View style={[styles.header, { paddingTop: insets.top || 12 }]}>
        <Text style={styles.title}>{strings.select_connection}</Text>
        <TouchableOpacity onPress={onRefresh} disabled={loading} hitSlop={12}>
          <Icon name="refresh" size={24} color="#ffffff" />
        </TouchableOpacity>
      </View>

      <View style={styles.countBar}>
        <View style={styles.countDot} />
        <Text style={styles.countText}>{connections_available(availableCount)}</Text>
      </View>

      {loading ? (
        <View style={styles.centered}>
          <ActivityIndicator size="large" color="#1e488f" />
        </View>
      ) : all.length === 0 ? (
        <View style={styles.emptyWrap}>
          <View style={styles.centered}>
            <Text style={styles.empty}>{strings.no_connections_found}</Text>
          </View>
          <ListFooter />
        </View>
      ) : (
        <FlatList
          data={all}
          keyExtractor={(i) => String(i.tallyloc_id ?? '') + (i.company ?? '')}
          renderItem={renderItem}
          ListFooterComponent={ListFooter}
          contentContainerStyle={styles.list}
          showsVerticalScrollIndicator={false}
        />
      )}
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
  title: {
    fontSize: 17,
    fontWeight: '600',
    color: '#ffffff',
  },
  countBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 16,
    paddingVertical: 8,
    marginHorizontal: 16,
    marginTop: 12,
    backgroundColor: '#e6ecfd',
    borderRadius: 4,
    borderWidth: 1,
    borderColor: '#e6ecfd',
  },
  countDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#00c950',
  },
  countText: {
    fontSize: 11,
    color: '#495565',
  },
  list: {
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 24,
  },
  card: {
    backgroundColor: '#ffffff',
    borderRadius: 4,
    borderWidth: 1,
    borderColor: '#e6ecfd',
    padding: 16,
    marginBottom: 12,
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 12,
  },
  iconWrap: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#1e488f',
    alignItems: 'center',
    justifyContent: 'center',
  },
  cardTitleRow: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  company: {
    fontSize: 18,
    fontWeight: '400',
    color: '#101727',
    flex: 1,
  },
  connectedBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 4,
    backgroundColor: '#dcfce7',
    borderRadius: 9999,
  },
  connectedDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#00c950',
  },
  connectedText: {
    fontSize: 12,
    color: '#008235',
  },
  cardMeta: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 12,
    marginBottom: 12,
  },
  metaBlock: {
    gap: 4,
  },
  metaLabel: {
    fontSize: 12,
    color: '#697282',
  },
  pillBlue: {
    alignSelf: 'flex-start',
    paddingHorizontal: 10,
    paddingVertical: 4,
    backgroundColor: '#dbeafe',
    borderRadius: 9999,
  },
  pillBlueText: {
    fontSize: 12,
    color: '#1347e5',
  },
  pillTeal: {
    alignSelf: 'flex-start',
    paddingHorizontal: 10,
    paddingVertical: 4,
    backgroundColor: '#cefafe',
    borderRadius: 9999,
  },
  pillTealText: {
    fontSize: 12,
    color: '#007594',
  },
  sharedBlock: {
    gap: 4,
  },
  sharedValue: {
    fontSize: 13,
    color: '#354152',
  },
  logoutBtn: {
    marginTop: 16,
    paddingVertical: 10,
    backgroundColor: '#ffffff',
    borderRadius: 4,
    borderWidth: 1,
    borderColor: '#1e488f',
    alignItems: 'center',
  },
  logoutBtnText: {
    fontSize: 16,
    color: '#1e488f',
  },
  emptyWrap: {
    flex: 1,
    paddingHorizontal: 16,
  },
  centered: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  empty: {
    color: '#697282',
    fontSize: 14,
  },
});

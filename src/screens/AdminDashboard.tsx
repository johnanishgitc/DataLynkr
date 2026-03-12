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
  BackHandler,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation, useFocusEffect } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { MainStackParamList } from '../navigation/types';
import type { UserConnection } from '../api';
import { apiService, isUnauthorizedError } from '../api';
import { RefreshIcon } from '../assets/connections';
import { useAuth } from '../store';
import { saveCompanyInfo, type CompanyInfo } from '../store/storage';
import { refreshAllDataManagementData } from '../cache';
import { strings, connections_available } from '../constants/strings';
const CONNECTIONS_TITLE = strings.connections;
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

  useFocusEffect(
    useCallback(() => {
      const onBackPress = () => {
        Alert.alert('Exit App', 'Are you sure you want to exit?', [
          { text: strings.cancel || 'Cancel', style: 'cancel' },
          { text: 'Exit', style: 'destructive', onPress: () => BackHandler.exitApp() },
        ]);
        return true;
      };

      BackHandler.addEventListener('hardwareBackPress', onBackPress);
      return () => BackHandler.removeEventListener('hardwareBackPress', onBackPress);
    }, [])
  );

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
      if (isUnauthorizedError(e)) {
        setAll([]);
        return;
      }
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
      nav.navigate('MainTabs');
      // Sync stock items, customers, and stock groups in background
      refreshAllDataManagementData().catch(() => { });
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
    const displayName = item.company || '—';

    return (
      <TouchableOpacity style={styles.card} onPress={() => onSelect(item)} activeOpacity={0.7}>
        <View style={styles.cardContent}>
          <Text style={styles.company} numberOfLines={1}>{displayName}</Text>
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
          <Text style={styles.title}>{CONNECTIONS_TITLE}</Text>
        </View>
        <TouchableOpacity onPress={onRefresh} disabled={loading} hitSlop={12} style={styles.headerIconBtn}>
          <RefreshIcon width={24} height={24} color="#ffffff" />
        </TouchableOpacity>
      </View>

      <View style={styles.countBar}>
        <View style={styles.countDot} />
        <Text style={styles.countText}>{connections_available(availableCount)}</Text>
      </View>

      {loading ? (
        <View style={styles.contentArea}>
          <ActivityIndicator size="large" color={colors.primary_blue} />
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
    backgroundColor: '#fdfdfe',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingBottom: 12,
    backgroundColor: colors.primary_blue,
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  headerIconBtn: {
    padding: 4,
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
    marginTop: 0,
    backgroundColor: '#fdfdfe',
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
  contentArea: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  listContainer: {
    flex: 1,
    backgroundColor: '#fdfdfe',
  },
  list: {
    paddingHorizontal: 16,
    paddingTop: 12,
  },
  logoutFooter: {
    paddingHorizontal: 16,
    paddingTop: 16,
    backgroundColor: '#fdfdfe',
  },
  card: {
    backgroundColor: '#ffffff',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#e6ecfd',
    paddingVertical: 10,
    paddingHorizontal: 16,
    marginBottom: 10,
  },
  cardContent: {
    flexDirection: 'column',
    gap: 6,
  },
  company: {
    fontSize: 15,
    fontWeight: '400',
    color: '#101727',
  },
  connectedBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 8,
    paddingVertical: 2,
    backgroundColor: '#dcfce7',
    borderRadius: 9999,
    alignSelf: 'flex-start',
  },
  connectedDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#00c950',
  },
  connectedText: {
    fontSize: 10,
    color: '#008235',
  },
  logoutBtn: {
    paddingVertical: 10,
    backgroundColor: '#ffffff',
    borderRadius: 4,
    borderWidth: 1,
    borderColor: '#ff383c',
    alignItems: 'center',
  },
  logoutBtnText: {
    fontSize: 16,
    color: '#ff383c',
  },
  empty: {
    color: '#697282',
    fontSize: 14,
  },
});

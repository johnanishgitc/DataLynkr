import React, { useState, useEffect, useCallback } from 'react';
import { View, Text, StyleSheet, ActivityIndicator, Alert } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { getTallylocId, getCompany, getGuid } from '../store/storage';
import { cacheManager } from '../cache';
import { apiService } from '../api';
import type { LedgerListResponse } from '../api';
import { CustNamesDropdown, StatusBarTopBar } from '../components';
import { colors } from '../constants/colors';

const DEFAULT_REPORT = 'Ledger Voucher';

function defaultFromDate(): number {
  const d = new Date();
  d.setDate(1);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

function defaultToDate(): number {
  return new Date().getTime();
}

export default function LedgerMain() {
  const nav = useNavigation();
  const [tallylocId, setTallylocId] = useState(0);
  const [company, setCompany] = useState('');
  const [guid, setGuid] = useState('');
  const [ledgerNames, setLedgerNames] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);

  const loadCompany = useCallback(async () => {
    const [t, c, g] = await Promise.all([getTallylocId(), getCompany(), getGuid()]);
    setTallylocId(t);
    setCompany(c);
    setGuid(g);
    return { tallylocId: t, company: c, guid: g };
  }, []);

  const fetchLedgers = useCallback(async () => {
    const { tallylocId: t, company: c, guid: g } = await loadCompany();
    if (t === 0 || !c || !g) {
      setLedgerNames([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const { data } = await apiService.getLedgerList({
        tallyloc_id: t,
        company: c,
        guid: g,
      });
      const res = data as LedgerListResponse;
      if (res?.error) {
        throw new Error(res.error);
      }
      // API returns { ledgers: [...] }; fallback to { data: [...] }
      const list = res?.ledgers ?? res?.data ?? [];
      setLedgerNames(list.map((i) => (i.NAME ?? '').trim()).filter(Boolean));
    } catch (e: unknown) {
      const msg = e && typeof e === 'object' && 'message' in e ? String((e as { message: string }).message) : 'Network error';
      try {
        const key = `ledgerlist-w-addrs_${t}_${c}`;
        const cached = await cacheManager.readCache<LedgerListResponse>(key);
        const raw = (cached as LedgerListResponse | null)?.ledgers ?? (cached as LedgerListResponse | null)?.data ?? (Array.isArray(cached) ? cached : []);
        const list = Array.isArray(raw) ? raw : [];
        setLedgerNames((list as { NAME?: string | null }[]).map((i) => String(i?.NAME ?? '').trim()).filter(Boolean));
      } catch {
        Alert.alert('', msg);
        setLedgerNames([]);
      }
    } finally {
      setLoading(false);
    }
  }, [loadCompany]);

  useEffect(() => {
    loadCompany();
  }, [loadCompany]);

  useEffect(() => {
    fetchLedgers();
  }, [fetchLedgers]);

  const onSelectLedger = (ledgerName: string) => {
    const params = {
      ledger_name: ledgerName,
      report_name: DEFAULT_REPORT,
      from_date: defaultFromDate(),
      to_date: defaultToDate(),
    };
    const tab = nav.getParent()?.getParent() as { navigate?: (a: string, b?: object) => void } | undefined;
    if (tab?.navigate) {
      tab.navigate('LedgerTab', { screen: 'LedgerEntries', params });
    } else {
      (nav.navigate as unknown as (a: string, b?: object) => void)('LedgerEntries', params);
    }
  };

  if (tallylocId === 0 || !company || !guid) {
    return (
      <View style={styles.root}>
        <StatusBarTopBar title="Ledger Book" rightIcons="share-bell" />
        <View style={styles.content}>
          <Text style={styles.msg}>Please configure company connection first.</Text>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.root}>
      <StatusBarTopBar title="Ledger Book" rightIcons="share-bell" />
      <View style={styles.content}>
        {loading ? (
          <View style={styles.centered}>
            <ActivityIndicator size="small" color={colors.primary_blue} />
            <Text style={styles.loadingTxt}>Loading…</Text>
          </View>
        ) : (
          <CustNamesDropdown
            items={ledgerNames}
            onSelect={onSelectLedger}
            placeholder="Select"
            searchable
            inline
          />
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.white },
  content: { flex: 1, padding: 16 },
  msg: { padding: 16, color: colors.text_secondary },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  loadingTxt: { marginTop: 8, color: colors.text_secondary },
});

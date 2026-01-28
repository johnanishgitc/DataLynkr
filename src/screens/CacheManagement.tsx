import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  Alert,
  Modal,
  FlatList,
  Platform,
} from 'react-native';
import RNFS from 'react-native-fs';
import Share from 'react-native-share';
import KeepAwake from 'react-native-keep-awake';
import { cacheManager, downloadCompleteSales, syncCustomers, syncItems, checkIncompleteDownload, clearDownloadProgress, pauseDownload, resumeDownload, cancelDownload, getDownloadControl, getCorruptedCacheKeys, clearCorruptedKeysList } from '../cache';
import type { CacheEntry } from '../cache';
import { getCompany, getTallylocId, getGuid, getCacheExpiryDays, setCacheExpiryDays, getBooksfrom } from '../store/storage';
import { SearchableDropdown } from '../components';
import { strings } from '../constants/strings';
import { colors } from '../constants/colors';
// Storage permission no longer needed - using app's cache directory for exports

const TIME_RANGE_OPTS = [
  'All Time (From Books Begin)',
  'Last 1 Year',
  'Last 2 Years',
  'Last 5 Years',
  'Last 10 Years',
  'Specific Financial Year',
];

const EXPIRY_OPTS = [
  { v: 'never', l: 'Never (Keep Forever)' },
  { v: '1', l: '1 Day' },
  { v: '3', l: '3 Days' },
  { v: '7', l: '7 Days' },
  { v: '14', l: '14 Days' },
  { v: '30', l: '30 Days' },
  { v: '60', l: '60 Days' },
  { v: '90', l: '90 Days' },
];

function formatBytes(n: number): string {
  if (n < 1024) return n + ' B';
  if (n < 1024 * 1024) return (n / 1024).toFixed(1) + ' KB';
  return (n / 1024 / 1024).toFixed(2) + ' MB';
}

function getFinancialYearOptions(booksfrom: string): string[] {
  const opts: string[] = [];
  let startYear = 2010;
  if (booksfrom && booksfrom.length >= 8) {
    const y = parseInt(booksfrom.slice(0, 4), 10);
    if (!isNaN(y)) startYear = y;
  }
  const now = new Date();
  const endYear = now.getMonth() >= 3 ? now.getFullYear() + 1 : now.getFullYear();
  for (let y = startYear; y < endYear; y++) opts.push(`${y}-${y + 1}`);
  return opts;
}

function formatAge(createdAt: number): string {
  const d = (Date.now() - createdAt) / (24 * 60 * 60 * 1000);
  if (d < 1) return 'Today';
  if (d < 2) return '1 day ago';
  return `${Math.floor(d)} days ago`;
}

function truncateGuid(g: string, len = 12): string {
  if (g.length <= len) return g;
  return g.slice(0, 8) + '…';
}

export default function CacheManagement() {
  const [company, setCompany] = useState('');
  const [tallylocId, setTallylocId] = useState(0);
  const [guid, setGuid] = useState('');
  const [booksfrom, setBooksfrom] = useState('');
  const [stats, setStats] = useState<{
    totalEntries: number;
    totalSizeBytes: number;
    salesEntries: number;
    dashboardEntries: number;
    ledgerEntries: number;
  } | null>(null);
  const [entries, setEntries] = useState<CacheEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [expiry, setExpiry] = useState('never');
  const [timeRange, setTimeRange] = useState(TIME_RANGE_OPTS[0]);
  const [selectedFY, setSelectedFY] = useState<string | null>(null);
  const [salesProgress, setSalesProgress] = useState('');
  const [salesProgressCurrent, setSalesProgressCurrent] = useState(0);
  const [salesProgressTotal, setSalesProgressTotal] = useState(-1);
  const [salesLoading, setSalesLoading] = useState(false);
  const [salesPaused, setSalesPaused] = useState(false);
  const [customersCount, setCustomersCount] = useState<number | null>(null);
  const [itemsCount, setItemsCount] = useState<number | null>(null);
  const [customersStatus, setCustomersStatus] = useState<'' | 'loading' | 'success' | 'error'>('');
  const [customersMessage, setCustomersMessage] = useState('');
  const [itemsStatus, setItemsStatus] = useState<'' | 'loading' | 'success' | 'error'>('');
  const [itemsMessage, setItemsMessage] = useState('');
  const [refreshing, setRefreshing] = useState(false);
  const [resumeModal, setResumeModal] = useState<{
    chunksCompleted: number;
    totalChunks: number;
  } | null>(null);
  const [corruptedKeys, setCorruptedKeys] = useState<string[]>([]);
  const [showDownloadWarning, setShowDownloadWarning] = useState(false);
  const [pendingDownloadAction, setPendingDownloadAction] = useState<{ isUpdate: boolean; startFresh: boolean } | null>(null);

  const fyOptions = getFinancialYearOptions(booksfrom);

  const load = useCallback(async () => {
    const [c, t, g, bf, e] = await Promise.all([
      getCompany(),
      getTallylocId(),
      getGuid(),
      getBooksfrom(),
      getCacheExpiryDays(),
    ]);
    setCompany(c);
    setTallylocId(t);
    setGuid(g);
    setBooksfrom(bf);
    setExpiry(e || 'never');
    const [s, list] = await Promise.all([cacheManager.getCacheStats(), cacheManager.listAllCacheEntries()]);
    setStats(s);
    setEntries(list);
    
    // Check for corrupted cache entries
    const corrupted = getCorruptedCacheKeys();
    setCorruptedKeys(corrupted);
    
    if (t > 0 && c) {
      const [cc, ic] = await Promise.all([cacheManager.getCustomersCount(t, c), cacheManager.getItemsCount(t, c)]);
      setCustomersCount(cc);
      setItemsCount(ic);
    } else {
      setCustomersCount(null);
      setItemsCount(null);
    }
  }, []);

  useEffect(() => {
    let m = true;
    setLoading(true);
    load().finally(async () => {
      if (m) {
        setLoading(false);
        // Check for incomplete downloads after loading
        const t = await getTallylocId();
        const g = await getGuid();
        if (t > 0 && g) {
          const incomplete = await checkIncompleteDownload(g, t);
          if (incomplete) {
            setResumeModal({
              chunksCompleted: incomplete.chunksCompleted,
              totalChunks: incomplete.totalChunks,
            });
          }
        }
      }
    });
    return () => {
      m = false;
    };
  }, [load]);

  const onRefresh = async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  };

  const onExpiryChange = async (v: string) => {
    setExpiry(v);
    await setCacheExpiryDays(v);
  };

  const onDownloadSales = async (isUpdate: boolean, startFresh = false) => {
    if (tallylocId === 0 || !company) {
      Alert.alert('', 'Company not selected');
      return;
    }
    
    // If starting fresh, clear any incomplete progress
    if (startFresh && guid) {
      await clearDownloadProgress(guid, tallylocId);
    }
    
    setResumeModal(null);
    setSalesLoading(true);
    setSalesPaused(false);
    setSalesProgress('Starting…');
    setSalesProgressCurrent(0);
    setSalesProgressTotal(-1);
    
    console.log('[UI] Starting download, isUpdate:', isUpdate);
    
    // Check download control state periodically
    const checkControlState = setInterval(async () => {
      if (guid && tallylocId) {
        const control = getDownloadControl(guid, tallylocId);
        setSalesPaused(control.isPaused);
      }
    }, 500);
    
    const r = await downloadCompleteSales(isUpdate, (phase, current, total, msg) => {
      console.log('[UI] Progress callback:', { phase, current, total, msg });
      const displayMsg = msg ?? (total >= 0 ? `${current}/${total}` : 'In progress…');
      setSalesProgress(displayMsg);
      setSalesProgressCurrent(current);
      setSalesProgressTotal(total);
      
      // Update pause state
      if (guid && tallylocId) {
        const control = getDownloadControl(guid, tallylocId);
        setSalesPaused(control.isPaused);
      }
    });
    
    clearInterval(checkControlState);
    
    console.log('[UI] Download completed, result:', r);
    setSalesLoading(false);
    
    // Only clear progress if we got a final state
    if (r.error || r.alreadyCached || r.voucherCount > 0) {
      setSalesProgress('');
      setSalesProgressCurrent(0);
      setSalesProgressTotal(-1);
    }
    if (r.error) {
      // Check if error suggests resume
      if (r.error.includes('Progress saved') || r.error.includes('Resume')) {
        Alert.alert('Download Interrupted', r.error, [
          { text: 'OK', onPress: async () => {
            // Re-check for incomplete download to show resume modal
            const incomplete = await checkIncompleteDownload(guid, tallylocId);
            if (incomplete) {
              setResumeModal({
                chunksCompleted: incomplete.chunksCompleted,
                totalChunks: incomplete.totalChunks,
              });
            }
          }},
        ]);
      } else {
        Alert.alert('', r.error);
      }
    } else {
      if (r.alreadyCached) {
        Alert.alert('Data Already Cached', `Sales data is already cached with ${r.voucherCount} vouchers. Use "Update Data" to fetch only new records since last download.`);
      } else {
        const verb = isUpdate ? 'updated' : 'downloaded';
        Alert.alert('', `Successfully ${verb} ${r.voucherCount} vouchers! Last Alter ID: ${r.lastAlterId ?? 'N/A'}`);
      }
      await load();
    }
  };

  const onRefreshCustomers = async () => {
    if (tallylocId === 0 || !company || !guid) return;
    setCustomersStatus('loading');
    setCustomersMessage('Downloading…');
    const r = await syncCustomers(tallylocId, company, guid, (msg) => setCustomersMessage(msg));
    setCustomersStatus(r.error ? 'error' : 'success');
    setCustomersMessage(r.error ? r.error : `Successfully downloaded ${r.count} customers`);
    await load();
  };

  const onRefreshItems = async () => {
    if (tallylocId === 0 || !company || !guid) return;
    setItemsStatus('loading');
    setItemsMessage('Downloading…');
    const r = await syncItems(tallylocId, company, guid, (msg) => setItemsMessage(msg));
    setItemsStatus(r.error ? 'error' : 'success');
    setItemsMessage(r.error ? r.error : `Successfully downloaded ${r.count} items`);
    await load();
  };

  const onClearAll = () => {
    Alert.alert('Clear all cache', 'Remove all cached data for all companies. This includes sales data and metadata.', [
      { text: strings.cancel, style: 'cancel' },
      { text: 'Clear All Cache', style: 'destructive', onPress: async () => { await cacheManager.clearCache(); await load(); } },
    ]);
  };

  const onClearCompany = () => {
    if (tallylocId === 0 || !company) {
      Alert.alert('', 'Company not selected');
      return;
    }
    Alert.alert('Clear company cache', `Remove all cached data for ${company}? This includes sales data.`, [
      { text: strings.cancel, style: 'cancel' },
      { text: 'Clear Company Cache', style: 'destructive', onPress: async () => { await cacheManager.clearCompanyCache(tallylocId, company); await load(); } },
    ]);
  };

  const onClearSales = () => {
    if (tallylocId === 0 || !company) {
      Alert.alert('', 'Company not selected');
      return;
    }
    Alert.alert('Clear sales cache', `Remove only sales data cache for ${company}?`, [
      { text: strings.cancel, style: 'cancel' },
      { text: 'Clear Sales Cache', style: 'destructive', onPress: async () => { await cacheManager.clearSalesCache(tallylocId, company); await load(); } },
    ]);
  };


  const onDeleteEntry = (key: string) => {
    Alert.alert('Delete', `Delete ${key}?`, [
      { text: strings.cancel, style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: async () => { await cacheManager.deleteCacheKey(key); await load(); } },
    ]);
  };

  const expiryLabel = EXPIRY_OPTS.find((o) => o.v === expiry)?.l ?? 'Never';
  const expiryStatus = expiry === 'never' ? 'Cache will never expire automatically' : `Cache will expire after ${expiry} days`;

  if (loading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color={colors.primary_blue} />
        <Text style={styles.loadingTxt}>{strings.loading}</Text>
      </View>
    );
  }

  // Determine if any download is in progress
  const isDownloading = salesLoading || customersStatus === 'loading' || itemsStatus === 'loading';

  return (
    <ScrollView style={styles.root} contentContainerStyle={styles.content}>
      {/* Keep screen awake while downloading */}
      {isDownloading && <KeepAwake />}
      
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Cache Management</Text>
        <Text style={styles.headerSub}>Manage and clear cached data stored</Text>
      </View>

      {/* Current Company */}
      <View style={styles.card}>
        <Text style={styles.cardTitle}>Current Company</Text>
        <Text style={styles.cardVal}>{company || '—'}</Text>
        <Text style={styles.cardSmall}>ID: {tallylocId || '—'} {guid ? `| GUID: ${truncateGuid(guid)}` : ''}</Text>
      </View>

      {/* Complete Sales Data */}
      <View style={styles.card}>
        <Text style={styles.cardTitle}>Complete Sales Data</Text>
        <Text style={styles.cardDesc}>
          Download and cache complete sales data from the beginning of your books. Update to fetch only new records since last download.
        </Text>
        <Text style={styles.syncNote}>Sync uses Books From → Today. Time range selectors are for future use.</Text>
        <Text style={styles.dropdownLabel}>Time Range</Text>
        <SearchableDropdown
          label=""
          items={TIME_RANGE_OPTS}
          selectedItem={timeRange}
          onSelect={setTimeRange}
          searchable={false}
          placeholder="Select time range"
        />
        {timeRange === 'Specific Financial Year' && (
          <>
            <Text style={styles.dropdownLabel}>Financial Year</Text>
            <SearchableDropdown
              label=""
              items={fyOptions}
              selectedItem={selectedFY}
              onSelect={setSelectedFY}
              searchable={false}
              placeholder="Select FY"
            />
          </>
        )}
        {salesLoading && (
          <View style={styles.progressBlock}>
            {salesProgressTotal > 1 ? (
              <>
                <View style={styles.progressBarOuter}>
                  <View
                    style={[
                      styles.progressBarInner,
                      {
                        width: `${Math.min(100, (salesProgressCurrent / Math.max(1, salesProgressTotal)) * 100)}%`,
                      },
                    ]}
                  />
                </View>
                <View style={styles.progressInfo}>
                  <Text style={styles.progressText}>
                    {salesProgressCurrent} / {salesProgressTotal} chunks
                  </Text>
                  <Text style={styles.progressPercent}>
                    {Math.round((salesProgressCurrent / Math.max(1, salesProgressTotal)) * 100)}%
                  </Text>
                </View>
                <View style={styles.downloadControls}>
                  {salesPaused ? (
                    <TouchableOpacity
                      style={[styles.controlBtn, styles.resumeBtn]}
                      onPress={() => {
                        if (guid && tallylocId) {
                          resumeDownload(guid, tallylocId);
                          setSalesPaused(false);
                        }
                      }}
                    >
                      <Text style={styles.controlBtnText}>Resume</Text>
                    </TouchableOpacity>
                  ) : (
                    <TouchableOpacity
                      style={[styles.controlBtn, styles.pauseBtn]}
                      onPress={() => {
                        if (guid && tallylocId) {
                          pauseDownload(guid, tallylocId);
                          setSalesPaused(true);
                        }
                      }}
                    >
                      <Text style={styles.controlBtnText}>Pause</Text>
                    </TouchableOpacity>
                  )}
                  <TouchableOpacity
                    style={[styles.controlBtn, styles.cancelBtn]}
                    onPress={() => {
                      Alert.alert(
                        'Cancel Download',
                        'Are you sure you want to cancel the download? Progress will be saved and you can resume later.',
                        [
                          { text: 'No', style: 'cancel' },
                          {
                            text: 'Yes, Cancel',
                            style: 'destructive',
                            onPress: () => {
                              if (guid && tallylocId) {
                                cancelDownload(guid, tallylocId);
                                setSalesPaused(false);
                              }
                            },
                          },
                        ]
                      );
                    }}
                  >
                    <Text style={styles.controlBtnText}>Cancel</Text>
                  </TouchableOpacity>
                </View>
              </>
            ) : (
              <ActivityIndicator size="small" color={colors.primary_blue} style={styles.progressSpinner} />
            )}
            <Text style={styles.progress}>{salesProgress || 'In progress…'}</Text>
          </View>
        )}
        <View style={styles.row}>
          <TouchableOpacity
            style={[styles.btn, styles.btnGreen, salesLoading && styles.btnDisabled]}
            onPress={() => {
              setPendingDownloadAction({ isUpdate: false, startFresh: false });
              setShowDownloadWarning(true);
            }}
            disabled={salesLoading}
          >
            <Text style={styles.btnTxt}>Download Complete Data</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.btn, styles.btnPurple, salesLoading && styles.btnDisabled]}
            onPress={() => {
              setPendingDownloadAction({ isUpdate: true, startFresh: false });
              setShowDownloadWarning(true);
            }}
            disabled={salesLoading}
          >
            <Text style={styles.btnTxt}>Update Data</Text>
          </TouchableOpacity>
        </View>
        
        {/* Download Warning Modal */}
        <Modal visible={showDownloadWarning} transparent animationType="fade">
          <TouchableOpacity 
            style={styles.modalOverlay} 
            activeOpacity={1} 
            onPress={() => {
              setShowDownloadWarning(false);
              setPendingDownloadAction(null);
            }}
          >
            <View style={styles.downloadWarningModal} onStartShouldSetResponder={() => true}>
              <Text style={styles.downloadWarningTitle}>Important: Keep App Active</Text>
              
              {/* Warning Section */}
              <View style={styles.downloadWarningSection}>
                <Text style={styles.downloadWarningSectionTitle}>Please do NOT during download:</Text>
                <View style={styles.downloadWarningList}>
                  <Text style={styles.downloadWarningListItem}>• Close this app or browser tab</Text>
                  <Text style={styles.downloadWarningListItem}>• Switch to other apps or tabs</Text>
                  <Text style={styles.downloadWarningListItem}>• Lock your phone or turn off screen</Text>
                  <Text style={styles.downloadWarningListItem}>• Turn off your device</Text>
                  <Text style={styles.downloadWarningListItem}>• Put the app in background</Text>
                </View>
                <View style={styles.downloadWarningCritical}>
                  <Text style={styles.downloadWarningCriticalIcon}>⚠️</Text>
                  <Text style={styles.downloadWarningCriticalText}>
                    Interrupting the download may cause data corruption or incomplete downloads.
                  </Text>
                </View>
              </View>

              {/* Info Section */}
              <View style={styles.downloadInfoSection}>
                <Text style={styles.downloadInfoIcon}>ℹ️</Text>
                <Text style={styles.downloadInfoText}>
                  Keep this screen open and your device active throughout the download process. You can monitor the progress bar below.
                </Text>
              </View>

              {/* Action Buttons */}
              <View style={styles.downloadWarningActions}>
                <TouchableOpacity
                  style={styles.downloadWarningCancelBtn}
                  onPress={() => {
                    setShowDownloadWarning(false);
                    setPendingDownloadAction(null);
                  }}
                >
                  <Text style={styles.downloadWarningCancelBtnText}>✕ Cancel</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.downloadWarningContinueBtn}
                  onPress={() => {
                    setShowDownloadWarning(false);
                    if (pendingDownloadAction) {
                      onDownloadSales(pendingDownloadAction.isUpdate, pendingDownloadAction.startFresh);
                    }
                    setPendingDownloadAction(null);
                  }}
                >
                  <Text style={styles.downloadWarningContinueBtnText}>✓ I Understand, Continue</Text>
                </TouchableOpacity>
              </View>
            </View>
          </TouchableOpacity>
        </Modal>

        {/* Resume Modal */}
        <Modal visible={!!resumeModal} transparent animationType="fade">
          <TouchableOpacity style={styles.modalOverlay} activeOpacity={1} onPress={() => setResumeModal(null)}>
            <View style={styles.modal} onStartShouldSetResponder={() => true}>
              <Text style={styles.modalTitle}>Resume Download?</Text>
              <View style={styles.modalBody}>
                <Text style={styles.modalBodyText}>
                  An incomplete download was found ({resumeModal?.chunksCompleted}/{resumeModal?.totalChunks} chunks completed).
                  {'\n\n'}
                  Would you like to resume from where it left off, or start fresh?
                </Text>
              </View>
              <View style={styles.modalActions}>
                <TouchableOpacity
                  style={[styles.btn, styles.btnSecondary]}
                  onPress={() => {
                    setResumeModal(null);
                    setPendingDownloadAction({ isUpdate: false, startFresh: true });
                    setShowDownloadWarning(true);
                  }}
                >
                  <Text style={styles.btnSecondaryTxt}>Start Fresh</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.btn, styles.btnPrimary]}
                  onPress={() => {
                    setResumeModal(null);
                    setPendingDownloadAction({ isUpdate: false, startFresh: false });
                    setShowDownloadWarning(true);
                  }}
                >
                  <Text style={styles.btnTxt}>Resume</Text>
                </TouchableOpacity>
              </View>
            </View>
          </TouchableOpacity>
        </Modal>
      </View>

      {/* Ledger Cache */}
      <View style={styles.card}>
        <Text style={styles.cardTitle}>Ledger Cache</Text>
        <Text style={styles.cardDesc}>
          Manage cached ledger data (customers and items) stored in SQLite. This data is stored securely and can handle large datasets.
        </Text>
        <View style={styles.ledgerRow}>
          <View style={styles.ledgerBlock}>
            <Text style={styles.ledgerLabel}>Customers</Text>
            <Text style={styles.ledgerCount}>{customersCount != null ? `${customersCount} cached` : '—'}</Text>
            {customersStatus === 'loading' && <ActivityIndicator size="small" color={colors.primary_blue} style={styles.ledgerLoader} />}
            {(customersStatus === 'success' || customersStatus === 'error') && (
              <View style={[styles.bar, customersStatus === 'error' ? styles.barError : styles.barSuccess]} />
            )}
            {customersMessage ? <Text style={styles.ledgerMsg}>{customersMessage}</Text> : null}
            <TouchableOpacity style={styles.btnSmall} onPress={onRefreshCustomers} disabled={customersStatus === 'loading'}>
              <Text style={styles.btnSmallTxt}>Refresh</Text>
            </TouchableOpacity>
          </View>
          <View style={styles.ledgerBlock}>
            <Text style={styles.ledgerLabel}>Items</Text>
            <Text style={styles.ledgerCount}>{itemsCount != null ? `${itemsCount} cached` : '—'}</Text>
            {itemsStatus === 'loading' && <ActivityIndicator size="small" color={colors.primary_blue} style={styles.ledgerLoader} />}
            {(itemsStatus === 'success' || itemsStatus === 'error') && (
              <View style={[styles.bar, itemsStatus === 'error' ? styles.barError : styles.barSuccess]} />
            )}
            {itemsMessage ? <Text style={styles.ledgerMsg}>{itemsMessage}</Text> : null}
            <TouchableOpacity style={styles.btnSmall} onPress={onRefreshItems} disabled={itemsStatus === 'loading'}>
              <Text style={styles.btnSmallTxt}>Refresh</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>

      {/* View Cache Contents */}
      <View style={styles.card}>
        <View style={styles.cardTitleRow}>
          <Text style={styles.cardTitle}>View Cache Contents</Text>
          <TouchableOpacity onPress={onRefresh} disabled={refreshing}>
            <Text style={styles.link}>{strings.refresh}</Text>
          </TouchableOpacity>
        </View>
        {stats && (
          <View style={styles.summaryRow}>
            <Text style={styles.summaryTxt}>Total Entries: {stats.totalEntries}</Text>
            <Text style={styles.summaryTxt}>Total Size: {formatBytes(stats.totalSizeBytes)}</Text>
            <Text style={styles.summaryTxt}>Sales: {stats.salesEntries}</Text>
            <Text style={styles.summaryTxt}>Dashboard: {stats.dashboardEntries}</Text>
          </View>
        )}
        {entries.length === 0 ? (
          <Text style={styles.muted}>No cache entries</Text>
        ) : (
          <FlatList
            data={entries}
            scrollEnabled={false}
            keyExtractor={(i) => i.cacheKey}
            renderItem={({ item }) => (
              <View style={styles.entry}>
                <View style={styles.entryRow}>
                  <View style={[styles.badge, item.category === 'sales' ? styles.badgeSales : item.category === 'dashboard' ? styles.badgeDash : styles.badgeLedger]}>
                    <Text style={styles.badgeTxt}>{item.category === 'sales' ? 'Sales' : item.category === 'dashboard' ? 'Dashboard' : 'Ledger'}</Text>
                  </View>
                  <Text style={styles.entryKey} numberOfLines={1}>{item.cacheKey}</Text>
                </View>
                <View style={styles.entryMetaRow}>
                  <Text style={styles.entryMeta}>{(item.startDate && item.endDate) ? `${item.startDate} – ${item.endDate}` : '—'}</Text>
                  <Text style={styles.entryMeta}>{formatBytes(item.size ?? 0)}</Text>
                  <Text style={styles.entryMeta}>{formatAge(item.createdAt)}</Text>
                  <Text style={styles.entryMeta}>{new Date(item.createdAt).toLocaleString()}</Text>
                </View>
                <View style={styles.entryActs}>
                  <TouchableOpacity
                    onPress={async () => {
                      try {
                        // Use app's cache directory (no permissions required on Android 10+)
                        const dir = RNFS.CachesDirectoryPath || RNFS.DocumentDirectoryPath;
                        const safeKey = item.cacheKey
                          .replace(/[^a-zA-Z0-9._-]+/g, '_')
                          .slice(0, 80);
                        const fileName = `datalynkr_${safeKey}.json`;
                        const filePath = `${dir}/${fileName}`;
                        
                        await cacheManager.exportCacheEntryToFile(
                          item.cacheKey,
                          filePath
                        );
                        
                        // Offer to share the file
                        Alert.alert(
                          'Export complete',
                          `File saved. Would you like to share it?`,
                          [
                            { text: 'Done', style: 'cancel' },
                            {
                              text: 'Share',
                              onPress: async () => {
                                try {
                                  await Share.open({
                                    title: 'Share DataLynkr Export',
                                    url: Platform.OS === 'android' ? `file://${filePath}` : filePath,
                                    type: 'application/json',
                                    filename: fileName,
                                  });
                                } catch (shareErr: unknown) {
                                  // User cancelled or share failed
                                  const err = shareErr as { message?: string };
                                  if (err?.message !== 'User did not share') {
                                    console.log('Share failed:', shareErr);
                                  }
                                }
                              },
                            },
                          ]
                        );
                      } catch (e) {
                        const msg =
                          e && typeof e === 'object' && 'message' in e
                            ? String((e as { message: string }).message)
                            : 'Export failed';
                        Alert.alert('Export failed', msg);
                      }
                    }}>
                    <Text style={styles.link}>Export</Text>
                  </TouchableOpacity>
                  <TouchableOpacity onPress={() => onDeleteEntry(item.cacheKey)}>
                    <Text style={styles.linkDanger}>Delete</Text>
                  </TouchableOpacity>
                </View>
              </View>
            )}
          />
        )}
      </View>

      {/* Corrupted Cache Warning */}
      {corruptedKeys.length > 0 && (
        <View style={[styles.card, styles.cardRed]}>
          <Text style={styles.cardTitle}>⚠️ Corrupted Cache Entries Detected</Text>
          <Text style={styles.cardDesc}>
            {corruptedKeys.length} cache {corruptedKeys.length === 1 ? 'entry is' : 'entries are'} corrupted and cannot be read.
            This can happen due to storage issues on the device. Please delete the corrupted entries and re-download the data.
          </Text>
          <View style={styles.corruptedList}>
            {corruptedKeys.map(key => (
              <Text key={key} style={styles.corruptedKey} numberOfLines={1}>• {key}</Text>
            ))}
          </View>
          <View style={styles.row}>
            <TouchableOpacity
              style={[styles.btn, styles.btnRed]}
              onPress={() => {
                Alert.alert(
                  'Delete Corrupted Entries?',
                  'This will delete all corrupted cache entries. You will need to re-download the data.',
                  [
                    { text: 'Cancel', style: 'cancel' },
                    {
                      text: 'Delete',
                      style: 'destructive',
                      onPress: async () => {
                        for (const key of corruptedKeys) {
                          await cacheManager.deleteCacheKey(key);
                        }
                        clearCorruptedKeysList();
                        await load();
                        Alert.alert('Done', 'Corrupted entries have been deleted. Please re-download your data.');
                      },
                    },
                  ]
                );
              }}
            >
              <Text style={styles.btnTxt}>Delete Corrupted Entries</Text>
            </TouchableOpacity>
          </View>
        </View>
      )}

      {/* Cache Expiry */}
      <View style={styles.card}>
        <Text style={styles.cardTitle}>Cache Expiry Period</Text>
        <Text style={styles.cardDesc}>
          Set how long cached data should be kept before automatically expiring. Set to 'Never' to keep cache indefinitely.
        </Text>
        <SearchableDropdown
          label=""
          items={EXPIRY_OPTS.map((o) => o.l)}
          selectedItem={expiryLabel}
          onSelect={(l) => onExpiryChange(EXPIRY_OPTS.find((o) => o.l === l)?.v ?? 'never')}
          searchable={false}
          placeholder="Select"
        />
        <Text style={styles.expiryStatus}>{expiryStatus}</Text>
      </View>

      {/* Clear cache — 3 cards */}
      <View style={styles.clearRow}>
        <View style={[styles.card, styles.cardRed]}>
          <Text style={styles.cardTitle}>Clear All Cache</Text>
          <Text style={styles.cardDesc}>Remove all cached data for all companies. This includes sales data and metadata.</Text>
          <TouchableOpacity style={[styles.btn, styles.btnRed]} onPress={onClearAll}>
            <Text style={styles.btnTxt}>Clear All Cache</Text>
          </TouchableOpacity>
        </View>
        <View style={[styles.card, styles.cardOrange]}>
          <Text style={styles.cardTitle}>Clear Company Cache</Text>
          <Text style={styles.cardDesc}>Remove all cached data for the currently selected company. This includes sales data.</Text>
          <TouchableOpacity style={[styles.btn, styles.btnOrange]} onPress={onClearCompany} disabled={!tallylocId || !company}>
            <Text style={styles.btnTxt}>Clear Company Cache</Text>
          </TouchableOpacity>
        </View>
        <View style={[styles.card, styles.cardBlue]}>
          <Text style={styles.cardTitle}>Clear Sales Cache</Text>
          <Text style={styles.cardDesc}>Remove only sales data cache for the currently selected company.</Text>
          <TouchableOpacity style={[styles.btn, styles.btnBlue]} onPress={onClearSales} disabled={!tallylocId || !company}>
            <Text style={styles.btnTxt}>Clear Sales Cache</Text>
          </TouchableOpacity>
        </View>
      </View>

    </ScrollView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg_light_blue || '#e6ecfd' },
  content: { padding: 16, paddingBottom: 48 },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  loadingTxt: { marginTop: 8, color: colors.text_secondary },
  header: { marginBottom: 16, paddingBottom: 12, borderBottomWidth: 2, borderBottomColor: colors.border_light },
  headerTitle: { fontSize: 22, fontWeight: '700', color: colors.text_primary },
  headerSub: { fontSize: 14, color: colors.text_secondary, marginTop: 4 },
  card: { backgroundColor: colors.white, borderRadius: 12, padding: 16, marginBottom: 16, borderWidth: 1, borderColor: colors.border_light },
  cardTitle: { fontSize: 16, fontWeight: '700', color: colors.text_primary, marginBottom: 8 },
  cardTitleRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 },
  cardVal: { fontSize: 15, fontWeight: '600', color: colors.text_primary },
  cardSmall: { fontSize: 12, color: colors.text_secondary, marginTop: 2 },
  cardDesc: { fontSize: 13, color: colors.text_secondary, marginBottom: 12 },
  syncNote: { fontSize: 12, fontStyle: 'italic', color: colors.text_secondary, marginBottom: 8 },
  dropdownLabel: { fontSize: 13, color: colors.text_primary, marginTop: 8, marginBottom: 4 },
  progressBlock: {
    marginVertical: 12,
    paddingVertical: 10,
    paddingHorizontal: 12,
    backgroundColor: '#f0f4ff',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  progressBarOuter: {
    height: 8,
    borderRadius: 4,
    backgroundColor: '#e2e8f0',
    overflow: 'hidden',
    marginBottom: 8,
  },
  progressBarInner: {
    height: 8,
    borderRadius: 4,
    backgroundColor: colors.primary_blue,
  },
  progressInfo: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  progressText: {
    fontSize: 13,
    color: colors.text_primary,
    fontWeight: '600',
  },
  progressPercent: {
    fontSize: 13,
    color: colors.text_primary,
    fontWeight: '600',
  },
  progressSpinner: { marginBottom: 8 },
  progress: { fontSize: 13, color: colors.text_primary, marginTop: 2, marginBottom: 0 },
  downloadControls: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 12,
    justifyContent: 'center',
  },
  controlBtn: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 6,
    minWidth: 80,
    alignItems: 'center',
  },
  pauseBtn: {
    backgroundColor: '#f59e0b',
  },
  resumeBtn: {
    backgroundColor: '#10b981',
  },
  cancelBtn: {
    backgroundColor: '#dc2626',
  },
  controlBtnText: {
    color: colors.white,
    fontSize: 14,
    fontWeight: '600',
  },
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginTop: 8 },
  btn: { borderRadius: 8, padding: 12, alignItems: 'center', marginTop: 8 },
  btnDisabled: { opacity: 0.6 },
  btnTxt: { color: colors.white, fontSize: 15 },
  btnGreen: { backgroundColor: '#10b981' },
  btnPurple: { backgroundColor: '#8b5cf6' },
  btnSmall: { alignSelf: 'flex-start', marginTop: 8 },
  btnSmallTxt: { color: colors.primary_blue, fontSize: 14 },
  ledgerRow: { flexDirection: 'row', gap: 16, flexWrap: 'wrap' },
  ledgerBlock: { flex: 1, minWidth: 140 },
  ledgerLabel: { fontSize: 14, fontWeight: '600', color: colors.text_primary },
  ledgerCount: { fontSize: 13, color: colors.text_secondary, marginTop: 2 },
  ledgerLoader: { marginTop: 6 },
  ledgerMsg: { fontSize: 12, color: colors.text_secondary, marginTop: 4 },
  bar: { height: 4, borderRadius: 2, marginTop: 6 },
  barSuccess: { backgroundColor: '#10b981' },
  barError: { backgroundColor: '#dc2626' },
  summaryRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 12, marginBottom: 12 },
  summaryTxt: { fontSize: 13, color: colors.text_primary },
  entry: { padding: 12, borderWidth: 1, borderColor: colors.border_light, borderRadius: 8, marginBottom: 8 },
  entryRow: { flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' },
  badge: { paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4 },
  badgeSales: { backgroundColor: '#dbeafe' },
  badgeDash: { backgroundColor: '#d1fae5' },
  badgeLedger: { backgroundColor: '#e0e7ff' },
  badgeTxt: { fontSize: 11, fontWeight: '600', color: colors.text_primary },
  entryKey: { fontSize: 12, color: colors.text_primary, flex: 1 },
  entryMetaRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 4 },
  entryMeta: { fontSize: 11, color: colors.text_secondary },
  entryActs: { flexDirection: 'row', gap: 12, marginTop: 8 },
  link: { color: colors.primary_blue, fontSize: 13 },
  linkDanger: { color: '#dc2626', fontSize: 13 },
  muted: { fontSize: 14, color: colors.text_secondary },
  expiryStatus: { fontSize: 12, fontStyle: 'italic', color: colors.text_secondary, marginTop: 8 },
  clearRow: { gap: 16 },
  cardRed: { borderLeftWidth: 4, borderLeftColor: '#dc2626' },
  cardOrange: { borderLeftWidth: 4, borderLeftColor: '#f59e0b' },
  cardBlue: { borderLeftWidth: 4, borderLeftColor: colors.primary_blue },
  btnRed: { backgroundColor: '#dc2626' },
  btnOrange: { backgroundColor: '#f59e0b' },
  btnBlue: { backgroundColor: colors.primary_blue },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', padding: 24 },
  modal: { backgroundColor: colors.white, borderRadius: 12, maxHeight: '80%' },
  modalTitle: { padding: 12, fontSize: 12, color: colors.text_secondary },
  modalBody: { maxHeight: 420, padding: 12 },
  modalBodyText: { fontSize: 14, color: colors.text_primary, lineHeight: 20 },
  modalActions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    paddingHorizontal: 12,
    paddingBottom: 12,
    gap: 8,
  },
  pre: { fontFamily: 'monospace', fontSize: 11 },
  preTruncated: { fontFamily: 'monospace', fontSize: 11, color: colors.text_secondary, marginTop: 8 },
  btnSecondary: {
    backgroundColor: colors.white,
    borderWidth: 1,
    borderColor: colors.primary_blue,
    paddingVertical: 10,
    paddingHorizontal: 16,
  },
  btnSecondaryTxt: {
    color: colors.primary_blue,
    fontSize: 14,
  },
  btnPrimary: {
    backgroundColor: colors.primary_blue,
  },
  corruptedList: {
    marginVertical: 8,
  },
  corruptedKey: {
    fontSize: 12,
    color: '#dc2626',
    marginBottom: 4,
  },
  downloadWarningModal: {
    backgroundColor: colors.white,
    borderRadius: 12,
    margin: 24,
    maxWidth: 500,
    alignSelf: 'center',
    width: '90%',
  },
  downloadWarningTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: colors.text_primary,
    padding: 20,
    paddingBottom: 16,
    textAlign: 'center',
  },
  downloadWarningSection: {
    backgroundColor: '#fff9e6',
    padding: 16,
    marginHorizontal: 20,
    marginBottom: 12,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#fde68a',
  },
  downloadWarningSectionTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: colors.text_primary,
    marginBottom: 12,
  },
  downloadWarningList: {
    marginBottom: 12,
  },
  downloadWarningListItem: {
    fontSize: 14,
    color: colors.text_primary,
    marginBottom: 6,
    lineHeight: 20,
  },
  downloadWarningCritical: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    backgroundColor: '#fff9e6',
    padding: 10,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#fbbf24',
  },
  downloadWarningCriticalIcon: {
    fontSize: 16,
    marginRight: 8,
    marginTop: 2,
  },
  downloadWarningCriticalText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#92400e',
    flex: 1,
    lineHeight: 18,
  },
  downloadInfoSection: {
    backgroundColor: '#e0f2fe',
    padding: 16,
    marginHorizontal: 20,
    marginBottom: 20,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#bae6fd',
    flexDirection: 'row',
    alignItems: 'flex-start',
  },
  downloadInfoIcon: {
    fontSize: 16,
    marginRight: 10,
    marginTop: 2,
  },
  downloadInfoText: {
    fontSize: 14,
    color: colors.text_primary,
    flex: 1,
    lineHeight: 20,
    fontWeight: '500',
  },
  downloadWarningActions: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingBottom: 20,
    gap: 12,
  },
  downloadWarningCancelBtn: {
    flex: 1,
    backgroundColor: colors.white,
    borderWidth: 1,
    borderColor: colors.border_gray,
    borderRadius: 8,
    padding: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  downloadWarningCancelBtnText: {
    color: colors.text_primary,
    fontSize: 15,
    fontWeight: '600',
  },
  downloadWarningContinueBtn: {
    flex: 1,
    backgroundColor: '#10b981',
    borderRadius: 8,
    padding: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  downloadWarningContinueBtnText: {
    color: colors.white,
    fontSize: 15,
    fontWeight: '600',
  },
});

/**
 * Shared app sidebar (hamburger menu).
 * Matches Figma design node 3414:109062 exactly.
 */
import React, { useEffect, useRef, useMemo, useState, useCallback } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Modal,
  FlatList,
  Animated,
  Dimensions,
  Pressable,
  Alert,
  PanResponder,
  StatusBar,
  ActivityIndicator,
  ScrollView,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import { colors } from '../constants/colors';
import { strings } from '../constants/strings';
import { useAuth } from '../store';
import { apiService } from '../api/client';
import { saveCompanyInfo, getCompany, getTallylocId, getGuid } from '../store/storage';
import type { UserConnection } from '../api/models/connections';
import FullYellowLogo from '../../assets/fullyellow.svg';
import DataLynkrTextSvg from '../../assets/DataLynkrTextWhiteNoPadding.svg';
import SystemNavigationBar from 'react-native-system-navigation-bar';
import { REPORT_OPTIONS } from '../screens/ledger';

const SIDEBAR_WIDTH = Math.min(Dimensions.get('window').width * 0.89, 348);

export interface AppSidebarMenuItem {
  id: string;
  label: string;
  target: string;
  icon: string;
  params?: object;
}

export interface AppSidebarProps {
  visible: boolean;
  onClose: () => void;
  menuItems: AppSidebarMenuItem[];
  /** Target string of the current screen (item will be highlighted) */
  activeTarget?: string;
  companyName?: string;
  onItemPress: (item: AppSidebarMenuItem) => void;
  onConnectionsPress?: () => void;
  /** Called when user selects a different company from the dropdown */
  onCompanyChange?: (companyName: string) => void;
}

export function AppSidebar({
  visible,
  onClose,
  menuItems,
  activeTarget,
  companyName = 'DataLynkr',
  onItemPress,
  onConnectionsPress,
  onCompanyChange,
}: AppSidebarProps) {
  const insets = useSafeAreaInsets();
  const anim = useRef(new Animated.Value(0)).current;
  const { logout } = useAuth();

  // Company dropdown state
  const [companies, setCompanies] = useState<UserConnection[]>([]);
  const [selectedCompany, setSelectedCompany] = useState(companyName);
  const [selectedTallylocId, setSelectedTallylocId] = useState<number>(0);
  const [selectedGuid, setSelectedGuid] = useState<string>('');
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [loadingCompanies, setLoadingCompanies] = useState(false);
  const [dashboardExpanded, setDashboardExpanded] = useState(false);
  const [ledgerExpanded, setLedgerExpanded] = useState(false);

  // Fetch companies when sidebar becomes visible
  useEffect(() => {
    if (visible) {
      setLoadingCompanies(true);
      apiService.getUserConnections()
        .then(res => {
          const d = res.data as
            | { data?: UserConnection[] | null; createdByMe?: UserConnection[]; sharedWithMe?: UserConnection[]; error?: string | null }
            | UserConnection[]
            | null
            | undefined;
          if (!d) {
            setCompanies([]);
            return;
          }
          if (Array.isArray(d)) {
            setCompanies(d);
            return;
          }
          if (d.error) {
            setCompanies([]);
            return;
          }
          let list: UserConnection[] = d.data ?? [];
          if (list.length === 0 && (d.createdByMe || d.sharedWithMe)) {
            list = [...(d.createdByMe || []), ...(d.sharedWithMe || [])];
          }
          // Show only connected companies in the sidebar dropdown
          const connectedOnly = list.filter(
            (c) => (c.status ?? '').toLowerCase() === 'connected',
          );
          setCompanies(connectedOnly);
        })
        .catch(err => console.warn('[AppSidebar] Failed to fetch companies:', err))
        .finally(() => setLoadingCompanies(false));
      // Also sync the current company and ids from storage
      Promise.all([getCompany(), getTallylocId(), getGuid()]).then(([c, id, g]) => {
        if (c) setSelectedCompany(c);
        setSelectedTallylocId(id);
        setSelectedGuid(g ?? '');
      });
    } else {
      setDropdownOpen(false);
      setDashboardExpanded(false);
      setLedgerExpanded(false);
    }
  }, [visible]);

  const handleSelectCompany = useCallback(async (connection: UserConnection) => {
    const name = connection.company || '';
    setSelectedCompany(name);
    setSelectedTallylocId(connection.tallyloc_id ?? 0);
    setSelectedGuid(connection.guid ?? '');
    setDropdownOpen(false);
    // Save all company info to storage
    try {
      await saveCompanyInfo({
        tallyloc_id: connection.tallyloc_id ?? 0,
        company: name,
        guid: connection.guid ?? '',
        conn_name: connection.conn_name ?? '',
        shared_email: connection.shared_email ?? '',
        status: connection.status ?? '',
        access_type: connection.access_type ?? '',
        address: connection.address ?? '',
        pincode: connection.pincode ?? '',
        statename: connection.statename ?? '',
        countryname: connection.countryname ?? '',
        company_email: connection.email ?? '',
        phonenumber: connection.phonenumber ?? '',
        mobilenumbers: connection.mobilenumbers ?? '',
        gstinno: connection.gstinno ?? '',
        startingfrom: connection.startingfrom ?? '',
        booksfrom: connection.booksfrom ?? '',
        createdAt: connection.createdAt ?? '',
      });
      onCompanyChange?.(name);
    } catch (err) {
      console.warn('[AppSidebar] Failed to save company info:', err);
    }
  }, [onCompanyChange]);

  const doLogout = () => {
    Alert.alert(strings.logout, 'Are you sure?', [
      { text: strings.cancel, style: 'cancel' },
      { text: strings.logout, style: 'destructive', onPress: () => { onClose(); logout(); } },
    ]);
  };

  // Swipe-left to close
  const panResponder = useMemo(() =>
    PanResponder.create({
      onStartShouldSetPanResponder: () => false,
      onMoveShouldSetPanResponder: (_, gestureState) => {
        // Only capture horizontal left swipes
        return gestureState.dx < -10 && Math.abs(gestureState.dy) < Math.abs(gestureState.dx);
      },
      onPanResponderRelease: (_, gestureState) => {
        if (gestureState.dx < -50 || gestureState.vx < -0.5) {
          onClose();
        }
      },
    }),
    [onClose]);

  useEffect(() => {
    if (visible) {
      SystemNavigationBar.setNavigationColor('#1f3a89', 'light');
    } else {
      SystemNavigationBar.setNavigationColor('#ffffff', 'dark');
    }
  }, [visible]);

  useEffect(() => {
    Animated.timing(anim, {
      toValue: visible ? 1 : 0,
      duration: 200,
      useNativeDriver: true,
    }).start();
  }, [visible, anim]);

  const overlayOpacity = anim.interpolate({ inputRange: [0, 1], outputRange: [0, 0.6] });
  const panelTranslateX = anim.interpolate({ inputRange: [0, 1], outputRange: [-SIDEBAR_WIDTH, 0] });

  return (
    <Modal visible={visible} transparent animationType="none" statusBarTranslucent>
      <StatusBar backgroundColor="#1f3a89" barStyle="light-content" />
      <Pressable style={StyleSheet.absoluteFill} onPress={onClose}>
        <Animated.View style={[styles.overlay, { opacity: overlayOpacity }]} />
      </Pressable>
      <Animated.View
        {...panResponder.panHandlers}
        style={[styles.panel, { width: SIDEBAR_WIDTH, transform: [{ translateX: panelTranslateX }] }]}
      >
        {/* Padded inner container matching Figma px-24 py-20 */}
        <View style={[styles.innerContainer, { paddingTop: insets.top + 20 }]}>
          {/* Logo + DataLynkr text row */}
          <View style={styles.logoRow}>
            <FullYellowLogo width={55} height={55} />
            <DataLynkrTextSvg width={150} height={35} />
          </View>

          {/* Company dropdown section */}
          <View style={styles.companySection}>
            <Text style={styles.companyTextLabel}>COMPANY</Text>
            <TouchableOpacity
              style={styles.companyInputBox}
              onPress={() => setDropdownOpen(!dropdownOpen)}
              activeOpacity={0.7}
            >
              <View style={styles.companyDropdownRow}>
                <Text style={styles.companyInputText} numberOfLines={1}>
                  {selectedCompany || 'Select Company'}
                </Text>
                <Icon
                  name={dropdownOpen ? 'chevron-up' : 'chevron-down'}
                  size={18}
                  color="#ffffff"
                />
              </View>
            </TouchableOpacity>
            {dropdownOpen && (
              <View style={styles.dropdownContainer}>
                {loadingCompanies ? (
                  <View style={styles.dropdownLoading}>
                    <ActivityIndicator size="small" color="#ffffff" />
                    <Text style={styles.dropdownLoadingText}>Loading...</Text>
                  </View>
                ) : companies.length === 0 ? (
                  <Text style={styles.dropdownEmptyText}>No companies found</Text>
                ) : (
                  <ScrollView style={styles.dropdownScroll} nestedScrollEnabled>
                    {companies.map((conn, idx) => {
                      const isSelected =
                        (selectedTallylocId !== 0 && selectedGuid !== ''
                          ? conn.tallyloc_id === selectedTallylocId && (conn.guid ?? '') === selectedGuid
                          : conn.company === selectedCompany);
                      return (
                        <TouchableOpacity
                          key={`company-${idx}-${conn.tallyloc_id ?? ''}-${conn.guid ?? ''}`}
                          style={[
                            styles.dropdownItem,
                            isSelected && styles.dropdownItemSelected,
                          ]}
                          onPress={() => handleSelectCompany(conn)}
                          activeOpacity={0.7}
                        >
                          <Text
                            style={[
                              styles.dropdownItemText,
                              isSelected && styles.dropdownItemTextSelected,
                            ]}
                            numberOfLines={1}
                          >
                            {conn.company || 'Unknown'}
                          </Text>
                          {isSelected && (
                            <Icon name="check" size={16} color="#ffffff" />
                          )}
                        </TouchableOpacity>
                      );
                    })}
                  </ScrollView>
                )}
              </View>
            )}
          </View>

          {/* Menu items + Customize shortcuts + Logout */}
          <View style={styles.menuAndLogoutContainer}>
            {/* Menu list */}
            <FlatList
              data={menuItems}
              keyExtractor={(item, index) => `${item.id}-${index}`}
              style={styles.list}
              contentContainerStyle={styles.listContent}
              showsVerticalScrollIndicator={false}
              renderItem={({ item }) => {
                const isDashboard = item.id === 'sales' && item.label === 'Dashboard';
                const isLedger = item.id === 'ledger' && item.label === 'Ledger Reports';
                const hasChevron = item.params && (item.params as any).hasChevron;
                if (isDashboard) {
                  return (
                    <View style={[styles.dashboardBlock, dashboardExpanded && styles.dashboardBlockExpanded]}>
                      <TouchableOpacity
                        style={styles.row}
                        onPress={() => setDashboardExpanded(!dashboardExpanded)}
                        activeOpacity={0.7}
                      >
                        <View style={styles.rowIconContainer}>
                          <Icon name={item.icon} size={24} color="#d1d5dc" />
                        </View>
                        <Text style={styles.rowLabel}>{item.label}</Text>
                        <Icon
                          name={dashboardExpanded ? 'chevron-up' : 'chevron-down'}
                          size={20}
                          color="#d1d5dc"
                        />
                      </TouchableOpacity>
                      {dashboardExpanded && (
                        <View style={styles.dashboardSubItems}>
                          <TouchableOpacity
                            style={styles.subItemBox}
                            onPress={() => onItemPress({ ...item, label: 'Sales' })}
                            activeOpacity={0.7}
                          >
                            <Text style={styles.subItemBoxText}>Sales</Text>
                          </TouchableOpacity>
                          <TouchableOpacity
                            style={styles.subItemBox}
                            onPress={() => onItemPress({ id: 'receivables', label: 'Receivables', target: 'ComingSoon', icon: item.icon, params: { tab_name: 'Receivables' } })}
                            activeOpacity={0.7}
                          >
                            <Text style={styles.subItemBoxText}>Receivables</Text>
                          </TouchableOpacity>
                        </View>
                      )}
                    </View>
                  );
                }
                if (isLedger) {
                  return (
                    <View style={[styles.dashboardBlock, ledgerExpanded && styles.dashboardBlockExpanded]}>
                      <TouchableOpacity
                        style={styles.row}
                        onPress={() => setLedgerExpanded(!ledgerExpanded)}
                        activeOpacity={0.7}
                      >
                        <View style={styles.rowIconContainer}>
                          <Icon name={item.icon} size={24} color="#d1d5dc" />
                        </View>
                        <Text style={styles.rowLabel}>{item.label}</Text>
                        <Icon
                          name={ledgerExpanded ? 'chevron-up' : 'chevron-down'}
                          size={20}
                          color="#d1d5dc"
                        />
                      </TouchableOpacity>
                      {ledgerExpanded && (
                        <View style={styles.dashboardSubItems}>
                          {REPORT_OPTIONS.map(report => (
                            <TouchableOpacity
                              key={report}
                              style={styles.subItemBox}
                              onPress={() => onItemPress({ ...item, params: { ...item.params, auto_open_customer: true, report_name: report } })}
                              activeOpacity={0.7}
                            >
                              <Text style={styles.subItemBoxText}>{report}</Text>
                            </TouchableOpacity>
                          ))}
                        </View>
                      )}
                    </View>
                  );
                }
                return (
                  <TouchableOpacity
                    style={styles.row}
                    onPress={() => onItemPress(item)}
                    activeOpacity={0.7}
                  >
                    <View style={styles.rowIconContainer}>
                      <Icon
                        name={item.icon}
                        size={24}
                        color="#d1d5dc"
                      />
                    </View>
                    <Text style={styles.rowLabel}>{item.label}</Text>
                    {hasChevron && (
                      <Icon name="chevron-right" size={20} color="#d1d5dc" />
                    )}
                  </TouchableOpacity>
                );
              }}
              ListFooterComponent={() => (
                <TouchableOpacity style={styles.customizeBtn} activeOpacity={0.7}>
                  <View style={styles.rowIconContainer}>
                    <Icon name="tune-variant" size={24} color="#ffffff" />
                  </View>
                  <Text style={styles.customizeText}>Customize shortcuts</Text>
                  <Icon name="chevron-right" size={20} color="#ffffff" />
                </TouchableOpacity>
              )}
            />

            {/* Logout button at bottom */}
            <View style={[styles.bottomContainer, { paddingBottom: Math.max(insets.bottom, 20) }]}>
              <TouchableOpacity style={styles.logoutBtn} onPress={doLogout} activeOpacity={0.7}>
                <View style={styles.logoutContent}>
                  <Icon name="logout" size={24} color="#d1d5dc" style={{ transform: [{ rotateY: '180deg' }] }} />
                  <Text style={styles.logoutText}>Logout</Text>
                </View>
                <Icon name="chevron-right" size={20} color="#d1d5dc" />
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Animated.View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: '#000000',
  },
  panel: {
    position: 'absolute',
    left: 0,
    top: 0,
    bottom: 0,
    backgroundColor: '#1f3a89',
  },
  innerContainer: {
    flex: 1,
    paddingHorizontal: 24,
  },
  logoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 40,
    marginBottom: 10,
    marginLeft: 30,
  },
  companySection: {
    gap: 6,
    marginTop: 10,
  },
  companyTextLabel: {
    fontSize: 10,
    fontWeight: '600',
    color: '#ffffff',
    fontFamily: 'Inter',
  },
  companyInputBox: {
    borderWidth: 1,
    borderColor: '#ffffff',
    borderRadius: 6,
    paddingHorizontal: 10,
    paddingVertical: 10,
  },
  companyDropdownRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  companyInputText: {
    color: '#ffffff',
    fontSize: 14,
    flex: 1,
    fontFamily: 'Inter',
  },
  dropdownContainer: {
    marginTop: 4,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.3)',
    borderRadius: 6,
    backgroundColor: 'rgba(255,255,255,0.1)',
    maxHeight: 180,
    overflow: 'hidden',
  },
  dropdownScroll: {
    maxHeight: 180,
  },
  dropdownItem: {
    paddingHorizontal: 12,
    paddingVertical: 10,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.1)',
  },
  dropdownItemSelected: {
    backgroundColor: 'rgba(255,255,255,0.15)',
  },
  dropdownItemText: {
    color: 'rgba(255,255,255,0.8)',
    fontSize: 13,
    fontFamily: 'Inter',
    flex: 1,
  },
  dropdownItemTextSelected: {
    color: '#ffffff',
    fontWeight: '600',
  },
  dropdownLoading: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    padding: 12,
  },
  dropdownLoadingText: {
    color: 'rgba(255,255,255,0.7)',
    fontSize: 13,
    fontFamily: 'Inter',
  },
  dropdownEmptyText: {
    color: 'rgba(255,255,255,0.5)',
    fontSize: 13,
    fontFamily: 'Inter',
    textAlign: 'center',
    padding: 12,
  },
  menuAndLogoutContainer: {
    flex: 1,
    marginTop: 10,
    justifyContent: 'space-between',
  },
  list: {
    flex: 1,
  },
  listContent: {
    gap: 5,
    paddingBottom: 10,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 10,
    borderRadius: 12,
    gap: 10,
  },
  rowIconContainer: {
    width: 24,
    height: 24,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rowLabel: {
    fontSize: 17,
    color: '#d1d5dc',
    fontWeight: '400',
    flex: 1,
    fontFamily: 'Roboto',
  },
  dashboardBlock: {
    marginBottom: 4,
    borderRadius: 12,
  },
  dashboardBlockExpanded: {
    backgroundColor: 'rgba(0,0,0,0.15)',
    paddingBottom: 8,
  },
  dashboardSubItems: {
    flexDirection: 'column',
    gap: 6,
    marginLeft: 10,
    marginRight: 10,
    marginTop: 0,
  },
  subItemBox: {
    backgroundColor: 'rgba(255,255,255,0.08)',
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 10,
    marginLeft: 0,
    marginRight: 0,
  },
  subItemBoxText: {
    fontSize: 15,
    color: '#e2e8f0',
    fontFamily: 'Roboto',
    marginLeft: 0, // Keep text alignment consistent with unexpanded list
  },
  customizeBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.15)',
    borderRadius: 12,
    padding: 10,
    gap: 10,
  },
  customizeText: {
    color: '#ffffff',
    fontSize: 17,
    fontWeight: '500',
    flex: 1,
    fontFamily: 'Roboto',
  },
  bottomContainer: {
    paddingTop: 16,
  },
  logoutBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderWidth: 1,
    borderColor: '#d1d5dc',
    borderRadius: 4,
    padding: 10,
  },
  logoutContent: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  logoutText: {
    color: '#d1d5dc',
    fontSize: 17,
    fontWeight: '400',
    fontFamily: 'Roboto',
  },
});

export { SIDEBAR_WIDTH };

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
  Easing,
  LayoutAnimation,
  Platform,
  UIManager,
  BackHandler,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import FontAwesome from 'react-native-vector-icons/FontAwesome';
import OrdersIcon from './footer-icons/OrdersIcon';
import LedgerIcon from './footer-icons/LedgerIcon';
import ApprovalsIcon from './footer-icons/ApprovalsIcon';
import SummaryIcon from './footer-icons/SummaryIcon';
import { colors } from '../constants/colors';
import { strings } from '../constants/strings';
import { useAuth } from '../store';
import { apiService } from '../api/client';
import { saveCompanyInfo, getCompany, getTallylocId, getGuid } from '../store/storage';
import type { UserConnection } from '../api/models/connections';
import FullYellowLogo from '../../assets/fullyellow.svg';
import DataLynkrTextSvg from '../../assets/DataLynkrTextWhiteNoPadding.svg';
import DataLynkrTextDarkBlueSvg from '../../assets/DataLynkrTextWhiteNoPaddingDarkBlue.svg';
import SystemNavigationBar from 'react-native-system-navigation-bar';
import { navigationRef } from '../navigation/navigationRef';
import { REPORT_OPTIONS, REPORT_MODULE_ACCESS_MAP } from '../screens/ledger/utils';
import { useModuleAccess } from '../store/ModuleAccessContext';
import { useBCommerceCart } from '../store/BCommerceCartContext';

const SIDEBAR_WIDTH = Math.min(Dimensions.get('window').width * 0.89, 348);
const ACTIVE_TAB_COLOR = '#EFC94F';
const DEFAULT_TAB_COLOR = '#d1d5dc';




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
  onItemPress: (item: AppSidebarMenuItem) => void;
  /** Target string of the current screen (item will be highlighted) */
  activeTarget?: string;
  companyName?: string;
  onConnectionsPress?: () => void;
  /** Called when user selects a different company from the dropdown */
  onCompanyChange?: (companyName: string) => void;
  /** When false, all module access checks are bypassed (items stay enabled) */
  restrictAccess?: boolean;
  /** Use darker #0E172B theme (e.g. when opened from BCommerce) */
  darkTheme?: boolean;
  /** Active ledger report name to highlight under Ledger Reports */
  activeLedgerReport?: string;
}

export function AppSidebar({
  visible,
  onClose,
  menuItems,
  onItemPress,
  activeTarget,
  companyName = 'DataLynkr',
  onConnectionsPress,
  onCompanyChange,
  restrictAccess = false,
  darkTheme = false,
  activeLedgerReport,
}: AppSidebarProps) {
  const panelBg = darkTheme ? '#0E172B' : '#1f3a89';
  const insets = useSafeAreaInsets();
  const anim = useRef(new Animated.Value(0)).current;
  const [showLogoutModal, setShowLogoutModal] = useState(false);
  const { logout, userName, userEmail } = useAuth();
  const { moduleAccess } = useModuleAccess();
  const { clearCart } = useBCommerceCart();

  // Needed on Android for LayoutAnimation to work.
  useEffect(() => {
    if (Platform.OS === 'android') {
      // TypeScript defs mark this as optional depending on RN version.
      const anyUIManager = UIManager as any;
      if (typeof anyUIManager.setLayoutAnimationEnabledExperimental === 'function') {
        anyUIManager.setLayoutAnimationEnabledExperimental(true);
      }
    }
  }, []);

  const getModuleKey = (target: string) => {
    switch (target) {
      case 'SalesTab': return 'sales_dashboard';
      case 'OrdersTab':
      case 'OrderEntry': return 'place_order';
      case 'BCommerce':
      case 'BCommerceCategories':
      case 'BCommerceItemDetail':
      case 'BCommerceCart':
      case 'BCommerceCheckout':
      case 'BCommerceOrderPlaced':
        return 'ecommerce_place_order';
      case 'LedgerTab': return 'ledger_book';
      case 'ApprovalsTab': return 'approvals';
      case 'StockSummaryTab':
      case 'SummaryTab': return 'stock_summary';
      case 'PaymentCollections': return 'vendor_expenses';
      default: return null;
    }
  };

  const ledgerReportEnabledMap = useMemo(() => {
    const map: Record<string, boolean> = {};
    REPORT_OPTIONS.forEach((report) => {
      const modKey = REPORT_MODULE_ACCESS_MAP[report];
      map[report] = modKey ? !!moduleAccess[modKey] : true;
    });
    return map;
  }, [moduleAccess]);

  /** Render same icons as footer bar for Orders, Ledger, Approvals, Stock; fallback to MaterialCommunityIcons. */
  const renderMenuItemIcon = (item: AppSidebarMenuItem, color: string, size: number) => {
    switch (item.id) {
      case 'orders':
        return <OrdersIcon color={color} size={size} />;
      case 'ledger':
        return <LedgerIcon color={color} size={size} strokeWidth={1.5} />;
      case 'approvals':
        return <ApprovalsIcon color={color} size={size} />;
      case 'summary':
        return <SummaryIcon color={color} size={size} />;
      case 'bcom':
        return <OrdersIcon color={color} size={size} />;
      default:
        return <Icon name={item.icon} size={size} color={color} />;
    }
  };

  // Company dropdown state
  const [companies, setCompanies] = useState<UserConnection[]>([]);
  const [selectedCompany, setSelectedCompany] = useState(companyName);
  const [selectedTallylocId, setSelectedTallylocId] = useState<number>(0);
  const [selectedGuid, setSelectedGuid] = useState<string>('');
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [loadingCompanies, setLoadingCompanies] = useState(false);
  const [dashboardExpanded, setDashboardExpanded] = useState(false);
  const [ledgerExpanded, setLedgerExpanded] = useState(false);
  const [paymentExpanded, setPaymentExpanded] = useState(false);
  const [showModal, setShowModal] = useState(visible);

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

      // Auto-expand sections when a child route is currently active,
      // so the selected sub-item highlight is visible immediately.
      if (activeLedgerReport) setLedgerExpanded(true);
      if (activeTarget === 'ExpenseClaims' || activeTarget === 'Payments' || activeTarget === 'Collections') {
        setPaymentExpanded(true);
      }
    } else {
      setDropdownOpen(false);
      setDashboardExpanded(false);
      setLedgerExpanded(false);
      setPaymentExpanded(false);
    }
  }, [visible, activeTarget, activeLedgerReport]);

  const handleSelectCompany = useCallback(async (connection: UserConnection) => {
    const name = connection.company || '';
    const nextTallylocId = connection.tallyloc_id ?? 0;
    const nextGuid = connection.guid ?? '';
    const didCompanyChange =
      nextTallylocId !== selectedTallylocId ||
      nextGuid !== selectedGuid ||
      name !== selectedCompany;

    setSelectedCompany(name);
    setSelectedTallylocId(nextTallylocId);
    setSelectedGuid(nextGuid);
    setDropdownOpen(false);
    // Save all company info to storage
    try {
      await saveCompanyInfo({
        tallyloc_id: nextTallylocId,
        company: name,
        guid: nextGuid,
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
      if (didCompanyChange) {
        clearCart();
        onCompanyChange?.(name);
      }
      onClose();
    } catch (err) {
      console.warn('[AppSidebar] Failed to save company info:', err);
    }
  }, [onCompanyChange, onClose, clearCart, selectedCompany, selectedGuid, selectedTallylocId]);

  const doLogout = () => {
    setShowLogoutModal(true);
  };

  // Swipe-left to close
  const panResponder = useMemo(() =>
    PanResponder.create({
      onStartShouldSetPanResponder: () => false,
      onMoveShouldSetPanResponderCapture: (_, gestureState) => {
        // Capture intentional horizontal left swipes early so nested scrollables
        // inside the sidebar do not block close gesture.
        return gestureState.dx < -10 && Math.abs(gestureState.dy) < Math.abs(gestureState.dx);
      },
      onMoveShouldSetPanResponder: (_, gestureState) => {
        // Only capture horizontal left swipes
        return gestureState.dx < -10 && Math.abs(gestureState.dy) < Math.abs(gestureState.dx);
      },
      onPanResponderTerminationRequest: () => false,
      onPanResponderRelease: (_, gestureState) => {
        if (gestureState.dx < -50 || gestureState.vx < -0.5) {
          onClose();
        }
      },
    }),
    [onClose]);

  useEffect(() => {
    if (showLogoutModal) {
      // Logout modal open: white nav bar
      SystemNavigationBar.setNavigationColor('#ffffff');
      SystemNavigationBar.setBarMode('dark');
    } else if (showModal) {
      // Sidebar open: transparent nav bar with light icons (sidebar has dark background)
      SystemNavigationBar.setNavigationColor('#00000000', true);
    } else {
      // Sidebar closed: restore white nav bar and force dark/gray buttons
      SystemNavigationBar.setNavigationColor('#ffffff');
      SystemNavigationBar.setBarMode('dark');
    }
  }, [showModal, showLogoutModal]);

  // Android: hardware back / back gesture closes the sidebar first (Modal onRequestClose is not always enough).
  useEffect(() => {
    if (Platform.OS !== 'android' || !visible) return;
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      onClose();
      return true;
    });
    return () => sub.remove();
  }, [visible, onClose]);

  useEffect(() => {
    if (visible) {
      setShowModal(true);
      Animated.timing(anim, {
        toValue: 1,
        duration: 280,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }).start();
    } else {
      Animated.timing(anim, {
        toValue: 0,
        duration: 280,
        easing: Easing.bezier(0.33, 0, 0.68, 0),
        useNativeDriver: true,
      }).start(() => {
        setShowModal(false);
      });
    }
  }, [visible, anim]);

  const overlayOpacity = anim.interpolate({ inputRange: [0, 1], outputRange: [0, 0.6] });
  const panelTranslateX = anim.interpolate({ inputRange: [0, 1], outputRange: [-SIDEBAR_WIDTH, 0] });

  return (
    <><Modal visible={showModal} transparent animationType="none" statusBarTranslucent onRequestClose={onClose}><StatusBar backgroundColor={panelBg} barStyle="light-content" /><Pressable style={StyleSheet.absoluteFill} onPress={onClose}><Animated.View style={[styles.overlay, { opacity: overlayOpacity }]} /></Pressable><Animated.View
      {...panResponder.panHandlers}
      style={[styles.panel, { width: SIDEBAR_WIDTH, backgroundColor: panelBg, transform: [{ translateX: panelTranslateX }] }]}
    >
      {/* Padded inner container matching Figma px-24 py-20 */}
      <View style={[styles.innerContainer, { paddingTop: insets.top + 20 }]}>
        {/* Logo + DataLynkr text row */}
        <View style={styles.logoRow}>
          <FullYellowLogo width={55} height={55} />
          {darkTheme ? (
            <DataLynkrTextDarkBlueSvg width={150} height={35} />
          ) : (
            <DataLynkrTextSvg width={150} height={35} />
          )}
        </View>

        {/* User Profile Section */}
        <View style={styles.profileSection}>
          <View style={styles.profileInfo}>
            <Text style={styles.profileName} numberOfLines={1}>
              {userName || 'User'}
            </Text>
            <Text style={styles.profileEmail} numberOfLines={1}>
              {userEmail || ''}
            </Text>
          </View>
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
              const isPaymentCollections = item.id === 'payment-collections';
              const hasChevron = item.params && (item.params as any).hasChevron;

              const isSelected = item.target === activeTarget;
              const modKey = getModuleKey(item.target);
              const isEnabled = restrictAccess ? (modKey ? !!moduleAccess[modKey] : true) : true;
              const isPaymentChildSelected =
                isPaymentCollections &&
                (activeTarget === 'ExpenseClaims' || activeTarget === 'Payments' || activeTarget === 'Collections');
              const rowStyles = [styles.row];

              if (isDashboard) {
                const dashRoute = navigationRef.getCurrentRoute();
                const dashLeaf = dashRoute?.name ?? '';
                const dashP = (dashRoute?.params ?? {}) as { tab_name?: string; params?: { tab_name?: string } };
                const dashTab = String(dashP.tab_name ?? dashP.params?.tab_name ?? '').trim();
                const isDashboardSalesChild = dashLeaf === 'SalesDashboard';
                const isDashboardReceivablesChild = dashLeaf === 'ComingSoon' && dashTab === 'Receivables';
                const dashboardContextActive = isDashboardSalesChild || isDashboardReceivablesChild;
                const dashboardParentHighlight = dashboardContextActive && !dashboardExpanded;
                const dashboardRowTint = dashboardParentHighlight ? ACTIVE_TAB_COLOR : DEFAULT_TAB_COLOR;
                const dashboardRowLabelStyles = [styles.rowLabel, dashboardParentHighlight && styles.rowLabelSelected];

                return (
                  <View style={[styles.dashboardBlock, dashboardExpanded && styles.dashboardBlockExpanded, !isEnabled && { opacity: 0.4 }]}>
                    <TouchableOpacity
                      style={rowStyles}
                      onPress={isEnabled
                        ? () => {
                          LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
                          setDashboardExpanded((v) => !v);
                        }
                        : undefined}
                      activeOpacity={isEnabled ? 0.7 : 1}
                    >
                      <View style={styles.rowIconContainer}>
                        {renderMenuItemIcon(item, dashboardRowTint, 24)}
                      </View>
                      <Text style={dashboardRowLabelStyles}>{item.label}</Text>
                      <Icon
                        name={dashboardExpanded ? 'chevron-up' : 'chevron-down'}
                        size={20}
                        color={dashboardRowTint}
                      />
                    </TouchableOpacity>
                    {dashboardExpanded && (
                      <View style={styles.dashboardSubItems}>
                        <TouchableOpacity
                          style={styles.subItemBox}
                          onPress={() => onItemPress({ ...item, label: 'Sales' })}
                          activeOpacity={0.7}
                        >
                          <Text
                            style={[
                              styles.subItemBoxText,
                              isDashboardSalesChild && styles.subItemBoxTextSelected,
                            ]}
                          >
                            Sales
                          </Text>
                        </TouchableOpacity>
                        <TouchableOpacity
                          style={styles.subItemBox}
                          onPress={() => onItemPress({ id: 'receivables', label: 'Receivables', target: 'ComingSoon', icon: item.icon, params: { tab_name: 'Receivables' } })}
                          activeOpacity={0.7}
                        >
                          <Text
                            style={[
                              styles.subItemBoxText,
                              isDashboardReceivablesChild && styles.subItemBoxTextSelected,
                            ]}
                          >
                            Receivables
                          </Text>
                        </TouchableOpacity>
                      </View>
                    )}
                  </View>
                );
              }
              if (isLedger) {
                const ledgerContextActive = activeTarget === 'LedgerTab';
                const ledgerParentHighlight = ledgerContextActive && !ledgerExpanded;
                const ledgerRowTint = ledgerParentHighlight ? ACTIVE_TAB_COLOR : DEFAULT_TAB_COLOR;
                const ledgerRowLabelStyles = [styles.rowLabel, ledgerParentHighlight && styles.rowLabelSelected];

                return (
                  <View style={[styles.dashboardBlock, ledgerExpanded && styles.dashboardBlockExpanded, !isEnabled && { opacity: 0.4 }]}>
                    <TouchableOpacity
                      style={rowStyles}
                      onPress={isEnabled
                        ? () => {
                          LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
                          setLedgerExpanded((v) => !v);
                        }
                        : undefined}
                      activeOpacity={isEnabled ? 0.7 : 1}
                    >
                      <View style={styles.rowIconContainer}>
                        {renderMenuItemIcon(item, ledgerRowTint, 24)}
                      </View>
                      <Text style={ledgerRowLabelStyles}>{item.label}</Text>
                      <Icon
                        name={ledgerExpanded ? 'chevron-up' : 'chevron-down'}
                        size={20}
                        color={ledgerRowTint}
                      />
                    </TouchableOpacity>
                    {ledgerExpanded && (
                      <View style={styles.dashboardSubItems}>
                        {REPORT_OPTIONS.map((report) => {
                          const isReportSelected = activeLedgerReport === report;
                          return (
                            <TouchableOpacity
                              key={report}
                              style={[
                                styles.subItemBox,
                                !ledgerReportEnabledMap[report] && { opacity: 0.45 },
                              ]}
                              onPress={
                                ledgerReportEnabledMap[report]
                                  ? () => onItemPress({ ...item, params: { ...item.params, auto_open_customer: true, report_name: report } })
                                  : undefined
                              }
                              activeOpacity={ledgerReportEnabledMap[report] ? 0.7 : 1}
                            >
                              <Text
                                style={[
                                  styles.subItemBoxText,
                                  isReportSelected && styles.subItemBoxTextSelected,
                                  !ledgerReportEnabledMap[report] && { color: 'rgba(226,232,240,0.6)' },
                                ]}
                              >
                                {report}
                              </Text>
                            </TouchableOpacity>
                          );
                        })}
                      </View>
                    )}
                  </View>
                );
              }
              if (isPaymentCollections) {
                const paymentParentHighlight = isPaymentChildSelected && !paymentExpanded;
                const paymentRowTint = paymentParentHighlight ? ACTIVE_TAB_COLOR : DEFAULT_TAB_COLOR;
                const paymentRowLabelStyles = [styles.rowLabel, paymentParentHighlight && styles.rowLabelSelected];

                return (
                  <View style={[styles.dashboardBlock, paymentExpanded && styles.dashboardBlockExpanded, !isEnabled && { opacity: 0.4 }]}>
                    <TouchableOpacity
                      style={rowStyles}
                      onPress={isEnabled
                        ? () => {
                          LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
                          setPaymentExpanded((v) => !v);
                        }
                        : undefined}
                      activeOpacity={isEnabled ? 0.7 : 1}
                    >
                      <View style={styles.rowIconContainer}>
                        {renderMenuItemIcon(item, paymentRowTint, 24)}
                      </View>
                      <Text style={paymentRowLabelStyles}>{item.label}</Text>
                      <Icon
                        name={paymentExpanded ? 'chevron-up' : 'chevron-down'}
                        size={20}
                        color={paymentRowTint}
                      />
                    </TouchableOpacity>
                    {paymentExpanded && (
                      <View style={styles.dashboardSubItems}>
                        {(() => {
                          const isExpenseClaimsSelected = activeTarget === 'ExpenseClaims';
                          const isPaymentsSelected = activeTarget === 'Payments';
                          const isCollectionsSelected = activeTarget === 'Collections';
                          return (
                            <>
                              <TouchableOpacity
                                style={styles.subItemBox}
                                onPress={
                                  isEnabled
                                    ? () =>
                                      onItemPress({
                                        id: 'expense-claims',
                                        label: 'Expense Claims',
                                        target: 'ExpenseClaims',
                                        icon: item.icon,
                                      })
                                    : undefined
                                }
                                activeOpacity={0.7}
                              >
                                <Text style={[styles.subItemBoxText, isExpenseClaimsSelected && styles.subItemBoxTextSelected]}>
                                  Expense Claims
                                </Text>
                              </TouchableOpacity>
                              <TouchableOpacity
                                style={styles.subItemBox}
                                onPress={
                                  isEnabled
                                    ? () => onItemPress({ id: 'payments', label: 'Payments', target: 'Payments', icon: item.icon })
                                    : undefined
                                }
                                activeOpacity={0.7}
                              >
                                <Text style={[styles.subItemBoxText, isPaymentsSelected && styles.subItemBoxTextSelected]}>
                                  Payments
                                </Text>
                              </TouchableOpacity>
                              <TouchableOpacity
                                style={styles.subItemBox}
                                onPress={
                                  isEnabled
                                    ? () =>
                                      onItemPress({ id: 'collections', label: 'Collections', target: 'Collections', icon: item.icon })
                                    : undefined
                                }
                                activeOpacity={0.7}
                              >
                                <Text style={[styles.subItemBoxText, isCollectionsSelected && styles.subItemBoxTextSelected]}>
                                  Collections
                                </Text>
                              </TouchableOpacity>
                            </>
                          );
                        })()}
                      </View>
                    )}
                  </View>
                );
              }
              const flatSelected = isSelected;
              const flatRowTint = flatSelected ? ACTIVE_TAB_COLOR : DEFAULT_TAB_COLOR;
              const flatRowLabelStyles = [styles.rowLabel, flatSelected && styles.rowLabelSelected];

              return (
                <TouchableOpacity
                  style={[styles.row, !isEnabled && { opacity: 0.4 }]}
                  onPress={isEnabled ? () => onItemPress(item) : undefined}
                  activeOpacity={isEnabled ? 0.7 : 1}
                >
                  <View style={styles.rowIconContainer}>
                    {renderMenuItemIcon(item, flatRowTint, 24)}
                  </View>
                  <Text style={flatRowLabelStyles}>{item.label}</Text>
                  {hasChevron && (
                    <Icon name="chevron-right" size={20} color={flatRowTint} />
                  )}
                </TouchableOpacity>
              );
            }}
            ListFooterComponent={() => null}
          />

          {/* Logout button at bottom */}
          <View style={[styles.bottomContainer, { paddingBottom: Math.max(insets.bottom, 12) }]}>
            <TouchableOpacity style={styles.logoutBtn} onPress={doLogout} activeOpacity={0.7}>
              <View style={styles.logoutContent}>
                <Icon name="logout" size={24} color="#d1d5dc" style={{ transform: [{ rotateY: '180deg' }] }} />
                <Text style={styles.logoutText}>Logout</Text>
              </View>
              <Icon name="chevron-right" size={20} color="#d1d5dc" />
            </TouchableOpacity>
          </View></View></View></Animated.View></Modal><Modal
            transparent
            statusBarTranslucent
            visible={showLogoutModal}
            animationType="fade"
            onRequestClose={() => setShowLogoutModal(false)}
          ><Pressable style={styles.modalOverlay} onPress={() => setShowLogoutModal(false)}><Pressable style={styles.modalCard} onPress={() => { }}><View style={styles.modalHeader}><Text style={styles.modalHeaderTitle}>Logout</Text></View><View style={styles.modalBody}><Text style={styles.modalMessage}>Are you sure you want to logout?</Text></View><View style={styles.modalActions}><TouchableOpacity style={[styles.actionBtn, styles.cancelBtn]} onPress={() => setShowLogoutModal(false)} activeOpacity={0.8}><Text style={styles.cancelBtnTxt}>CANCEL</Text></TouchableOpacity><TouchableOpacity style={[styles.actionBtn, styles.exitBtn]} onPress={() => { setShowLogoutModal(false); onClose(); logout(); }} activeOpacity={0.8}><Text style={styles.exitBtnTxt}>LOGOUT</Text></TouchableOpacity></View></Pressable></Pressable></Modal>
    </>
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
  profileSection: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
    borderRadius: 14,
    paddingHorizontal: 16, // Increased padding slightly since circle is gone
    paddingVertical: 10,
    marginTop: 10,
    marginBottom: 5,
  },
  profileInfo: {
    flex: 1,
    gap: 0,
  },
  profileName: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: '700',
    fontFamily: 'Inter',
  },
  profileEmail: {
    color: 'rgba(255, 255, 255, 0.5)',
    fontSize: 11,
    fontFamily: 'Inter',
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
    gap: 0,
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
  rowLabelSelected: {
    color: ACTIVE_TAB_COLOR,
    fontWeight: '500',
  },
  dashboardBlock: {
    marginBottom: 2,
    borderRadius: 12,
  },
  dashboardBlockExpanded: {
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
  subItemBoxTextSelected: {
    color: ACTIVE_TAB_COLOR,
    fontWeight: '500',
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
    paddingTop: 8,
    paddingHorizontal: 12,
    marginBottom: 10,
  },
  logoutBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderWidth: 1,
    borderColor: '#d1d5dc',
    borderRadius: 4,
    paddingVertical: 12,
    paddingHorizontal: 14,
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
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.45)',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 16,
  },
  modalCard: {
    width: '100%',
    maxWidth: 520,
    borderRadius: 8,
    backgroundColor: '#ffffff',
    overflow: 'hidden',
  },
  modalHeader: {
    backgroundColor: '#ffffff',
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  modalHeaderTitle: {
    color: '#111827',
    fontSize: 22,
    fontWeight: '500',
  },
  modalBody: {
    paddingHorizontal: 16,
    paddingVertical: 20,
  },
  modalMessage: {
    color: '#1f2937',
    fontSize: 17,
    lineHeight: 24,
  },
  modalActions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 10,
    paddingHorizontal: 16,
    paddingBottom: 16,
  },
  actionBtn: {
    minWidth: 96,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 6,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cancelBtn: {
    backgroundColor: '#E5E7EB',
  },
  cancelBtnTxt: {
    color: '#000000',
    fontSize: 16,
    fontWeight: '600',
  },
  exitBtn: {
    backgroundColor: 'transparent',
    borderWidth: 1,
    borderColor: colors.reject_red,
  },
  exitBtnTxt: {
    color: colors.reject_red,
    fontSize: 16,
    fontWeight: '700',
  },
});

export { SIDEBAR_WIDTH };

import React from 'react';
import {
  View,
  Text,
  Modal,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  ActivityIndicator,
} from 'react-native';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import { colors } from '../constants/colors';
import type { BankUpiResponse } from '../api';

const CARD_BG = '#f2f4f6';
const LABEL_COLOR = colors.text_secondary;
const VALUE_COLOR = colors.text_primary;
const ICON_COLOR = '#6b7a8c';

export interface BankUpiDetailsModalProps {
  visible: boolean;
  onClose: () => void;
  data: BankUpiResponse | null;
  loading: boolean;
  error: string | null;
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.row}>
      <Text style={styles.label} numberOfLines={1}>{label}</Text>
      <Text style={styles.value} numberOfLines={1}>{value || '-'}</Text>
    </View>
  );
}

export function BankUpiDetailsModal({
  visible,
  onClose,
  data,
  loading,
  error,
}: BankUpiDetailsModalProps) {
  const bankCount = data?.bankCount ?? data?.banks?.length ?? 0;
  const upiCount = data?.upiCount ?? data?.upis?.length ?? 0;
  const summary = `${bankCount} Bank${bankCount !== 1 ? 's' : ''} • ${upiCount} UPI${upiCount !== 1 ? 's' : ''}`;

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}
    >
      <View style={styles.overlay}>
        <View style={styles.sheet}>
          <View style={styles.header}>
            <View style={styles.headerTextWrap}>
              <Text style={styles.title}>Bank & UPI Details</Text>
              {!loading && !error && <Text style={styles.summary}>{summary}</Text>}
            </View>
            <TouchableOpacity
              onPress={onClose}
              hitSlop={12}
              style={styles.closeBtn}
              accessibilityLabel="Close"
            >
              <Icon name="close" size={24} color={VALUE_COLOR} />
            </TouchableOpacity>
          </View>

          {loading ? (
            <View style={styles.centered}>
              <ActivityIndicator size="small" color={colors.primary_blue} />
              <Text style={styles.loadingText}>Loading…</Text>
            </View>
          ) : error ? (
            <View style={styles.centered}>
              <Icon name="alert-circle-outline" size={40} color={colors.text_secondary} />
              <Text style={styles.errorText}>{error}</Text>
            </View>
          ) : data ? (
            <ScrollView
              style={styles.scroll}
              contentContainerStyle={styles.scrollContent}
              showsVerticalScrollIndicator={false}
            >
              {/* Bank Details section */}
              {data.banks && data.banks.length > 0 && (
                <View style={styles.section}>
                  <View style={styles.sectionHeader}>
                    <Icon name="bank" size={24} color={ICON_COLOR} style={styles.sectionIcon} />
                    <Text style={styles.sectionTitle}>Bank Details ({data.banks.length})</Text>
                  </View>
                  {data.banks.map((bank, idx) => (
                    <View key={idx} style={styles.card}>
                      <Text style={styles.cardHeading}>{bank.name}</Text>
                      <Row label="Bank Name" value={bank.bankname ?? bank.name} />
                      <Row label="Account No." value={bank.accountno ?? ''} />
                      <Row label="IFSC Code" value={bank.ifscode ?? ''} />
                      <Row label="Branch Name" value={bank.branchname ?? ''} />
                      <Row label="SWIFT Code" value={bank.swiftcode ?? ''} />
                      <Row label="Account Holder" value={bank.accholdername ?? ''} />
                    </View>
                  ))}
                </View>
              )}

              {/* UPI Details section */}
              {data.upis && data.upis.length > 0 && (
                <View style={styles.section}>
                  <View style={styles.sectionHeader}>
                    <Icon name="credit-card-outline" size={24} color={ICON_COLOR} style={styles.sectionIcon} />
                    <Text style={styles.sectionTitle}>UPI Details ({data.upis.length})</Text>
                  </View>
                  {data.upis.map((upi, idx) => (
                    <View key={idx} style={styles.card}>
                      <Text style={styles.cardHeading}>{upi.name}</Text>
                      <View style={styles.upiRow}>
                        <View style={styles.upiFields}>
                          <Row label="Merchant ID" value={upi.merchantid} />
                          <Row label="Merchant Name" value={upi.merchantname ?? upi.name} />
                        </View>
                        <View style={styles.qrBlock}>
                          <Text style={styles.qrLabel}>QR Code for {upi.merchantid}</Text>
                          <View style={styles.qrPlaceholder}>
                            <Icon name="qrcode" size={56} color={colors.border_gray} />
                          </View>
                          <Text style={styles.scanText}>Scan to pay</Text>
                        </View>
                      </View>
                    </View>
                  ))}
                </View>
              )}

              {(!data.banks || data.banks.length === 0) && (!data.upis || data.upis.length === 0) && (
                <Text style={styles.noData}>No bank or UPI details available.</Text>
              )}
            </ScrollView>
          ) : null}
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.4)',
    justifyContent: 'flex-end',
  },
  sheet: {
    backgroundColor: colors.bg_page,
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    maxHeight: '92%',
    minHeight: 680,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    paddingHorizontal: 24,
    paddingTop: 24,
    paddingBottom: 16,
    borderBottomWidth: 1,
    borderBottomColor: colors.border_light,
  },
  headerTextWrap: { flex: 1, minWidth: 0 },
  title: {
    fontSize: 22,
    fontWeight: '700',
    color: VALUE_COLOR,
  },
  summary: {
    fontSize: 15,
    color: LABEL_COLOR,
    marginTop: 6,
  },
  closeBtn: { padding: 4 },
  scroll: { flex: 1 },
  scrollContent: { padding: 20, paddingBottom: 32 },
  centered: {
    padding: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  loadingText: { marginTop: 10, fontSize: 15, color: LABEL_COLOR },
  errorText: { marginTop: 14, fontSize: 15, color: colors.reject_red, textAlign: 'center' },
  noData: { fontSize: 15, color: LABEL_COLOR, textAlign: 'center', paddingVertical: 28 },
  section: { marginBottom: 24 },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 14,
  },
  sectionIcon: { marginRight: 10 },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: VALUE_COLOR,
  },
  card: {
    backgroundColor: CARD_BG,
    borderRadius: 14,
    padding: 20,
    marginBottom: 14,
  },
  cardHeading: {
    fontSize: 18,
    fontWeight: '600',
    color: VALUE_COLOR,
    marginBottom: 14,
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  label: {
    fontSize: 15,
    color: LABEL_COLOR,
    flex: 1,
    marginRight: 12,
  },
  value: {
    fontSize: 15,
    color: VALUE_COLOR,
    flex: 1,
    textAlign: 'right',
  },
  upiRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 20,
  },
  upiFields: { flex: 1, minWidth: 0 },
  qrBlock: {
    alignItems: 'center',
    minWidth: 140,
  },
  qrLabel: {
    fontSize: 12,
    color: LABEL_COLOR,
    marginBottom: 8,
    textAlign: 'center',
  },
  qrPlaceholder: {
    width: 100,
    height: 100,
    backgroundColor: colors.white,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  scanText: {
    fontSize: 12,
    color: LABEL_COLOR,
    marginTop: 6,
  },
});

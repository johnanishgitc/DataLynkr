import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Alert, BackHandler, FlatList, Image, Keyboard, Modal, PermissionsAndroid, Platform, ScrollView, StyleSheet, Switch, Text, TextInput, TouchableOpacity, View, findNodeHandle } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import Geolocation from 'react-native-geolocation-service';
import SystemNavigationBar from 'react-native-system-navigation-bar';
import { StatusBarTopBar } from '../components/StatusBarTopBar';
import type { OrdersStackParamList } from '../navigation/types';
import { apiService } from '../api';
import { getCompany, getGuid, getTallylocId } from '../store/storage';
import countryStateData from '../assets/country_state.json';
import { sharedStyles } from './ledger';

type MasterStep = 1 | 2 | 3;
type DuplicateState = 'idle' | 'checking' | 'ok' | 'duplicate' | 'error';
type BubbleType = 'success' | 'error';
type CountryStateItem = { name?: string };
type CountryItem = {
  name?: string;
  countryCode?: string;
  countryCodeAlpha3?: string;
  phone?: string;
  currency?: string;
  flag?: string;
  symbol?: string;
  stateProvinces?: CountryStateItem[];
};

type BankDetailsItem = {
  accountNumber: string;
  ifscCode: string;
  bankName: string;
  swiftCode: string;
  paymentFavoring: string;
  defaultTransactionType: string;
};

type FormState = {
  // Step 1
  masterName: string;
  alias: string;
  group: string;
  addressType1: string;
  address: string;
  addressType2: string;
  coordinates: string;
  country: string;
  state: string;
  pincode: string;
  contactPerson: string;
  emailId: string;
  phoneNumber: string;
  countryCode: string;
  isDefaultWhatsApp: boolean;
  taxIdentificationType: string;
  gstNumber: string;
  panNumber: string;
  // Step 2
  narration: string;
  description: string;
  maintainBillByBill: boolean;
  defaultCreditPeriod: string;
  checkCreditDaysDuringVoucherEntry: boolean;
  specifyCreditLimit: boolean;
  creditLimitAmount: string;
  overrideCreditLimitUsingPdc: boolean;
  inventoryValuesAffected: boolean;
  priceLevelApplicable: boolean;
  priceLevel: string;
  registrationType: string;
  assesseeOfOtherTerritory: string;
  useLedgerAsCommonParty: string;
  setAlterAdditionalGstDetails: string;
  ignorePrefixSuffixInDocNo: string;
  setAlterMsmeRegistrationDetails: string;
  typeOfEnterprise: string;
  udyamRegistrationNumber: string;
  activityType: string;
  isTdsDeductable: string;
  deducteeType: string;
  natureOfPayment: string;
  deductTdsInSameVoucher: string;
  // Step 3
  accountNumber: string;
  ifscCode: string;
  bankName: string;
  swiftCode: string;
  paymentFavoring: string;
  defaultTransactionType: string;
};

const initialForm: FormState = {
  masterName: '',
  alias: '',
  group: '',
  addressType1: '',
  address: '',
  addressType2: '',
  coordinates: '',
  country: 'India',
  state: '',
  pincode: '',
  contactPerson: '',
  emailId: '',
  phoneNumber: '',
  countryCode: '91',
  isDefaultWhatsApp: false,
  taxIdentificationType: '',
  gstNumber: '',
  panNumber: '',
  narration: '',
  description: '',
  maintainBillByBill: false,
  defaultCreditPeriod: '',
  checkCreditDaysDuringVoucherEntry: false,
  specifyCreditLimit: false,
  creditLimitAmount: '',
  overrideCreditLimitUsingPdc: false,
  inventoryValuesAffected: false,
  priceLevelApplicable: false,
  priceLevel: '',
  registrationType: '',
  assesseeOfOtherTerritory: 'No',
  useLedgerAsCommonParty: 'No',
  setAlterAdditionalGstDetails: 'No',
  ignorePrefixSuffixInDocNo: 'No',
  setAlterMsmeRegistrationDetails: 'No',
  typeOfEnterprise: '',
  udyamRegistrationNumber: '',
  activityType: '',
  isTdsDeductable: 'No',
  deducteeType: '',
  natureOfPayment: '',
  deductTdsInSameVoucher: 'No',
  accountNumber: '',
  ifscCode: '',
  bankName: '',
  swiftCode: '',
  paymentFavoring: '',
  defaultTransactionType: '',
};

const taxOptions = ['PAN Number', 'GST Number'];
const DEFAULT_TRANSACTION_TYPE_OPTIONS = ['Inter Bank Transfer', 'Intra Bank Transfer', 'RTGS', 'NEFT', 'IMPS', 'UPI'];
const COUNTRY_STATE_DATA = countryStateData as CountryItem[];

export default function MasterCreation() {
  const navigation = useNavigation<NativeStackNavigationProp<OrdersStackParamList>>();
  const insets = useSafeAreaInsets();
  const [step, setStep] = useState<MasterStep>(1);
  const scrollRef = useRef<ScrollView>(null);
  const [form, setForm] = useState<FormState>(initialForm);
  const [additionalBankDetails, setAdditionalBankDetails] = useState<BankDetailsItem[]>([]);
  const [taxDropdownOpen, setTaxDropdownOpen] = useState(false);
  const [countryDropdownOpen, setCountryDropdownOpen] = useState(false);
  const [countrySearch, setCountrySearch] = useState('');
  const [stateDropdownOpen, setStateDropdownOpen] = useState(false);
  const [stateSearch, setStateSearch] = useState('');
  const [msmeDropdownOpen, setMsmeDropdownOpen] = useState(false);
  const [tdsDropdownOpen, setTdsDropdownOpen] = useState(false);
  const [deductTdsDropdownOpen, setDeductTdsDropdownOpen] = useState(false);
  const [additionalGstDropdownOpen, setAdditionalGstDropdownOpen] = useState(false);
  const [ignorePrefixesDropdownOpen, setIgnorePrefixesDropdownOpen] = useState(false);
  const [assesseeDropdownOpen, setAssesseeDropdownOpen] = useState(false);
  const [commonPartyDropdownOpen, setCommonPartyDropdownOpen] = useState(false);
  const [groupDropdownOpen, setGroupDropdownOpen] = useState(false);
  const [priceLevelDropdownOpen, setPriceLevelDropdownOpen] = useState(false);
  const [deducteeTypeDropdownOpen, setDeducteeTypeDropdownOpen] = useState(false);
  const [enterpriseTypeDropdownOpen, setEnterpriseTypeDropdownOpen] = useState(false);
  const [activityTypeDropdownOpen, setActivityTypeDropdownOpen] = useState(false);
  const [bankNameDropdownOpen, setBankNameDropdownOpen] = useState(false);
  const [extraBankNameDropdownIndex, setExtraBankNameDropdownIndex] = useState<number | null>(null);
  const [defaultTxnTypeDropdownOpen, setDefaultTxnTypeDropdownOpen] = useState(false);
  const [extraDefaultTxnDropdownIndex, setExtraDefaultTxnDropdownIndex] = useState<number | null>(null);
  const [groupSearch, setGroupSearch] = useState('');
  const [priceLevelSearch, setPriceLevelSearch] = useState('');
  const [enterpriseTypeSearch, setEnterpriseTypeSearch] = useState('');
  const [activityTypeSearch, setActivityTypeSearch] = useState('');
  const [deducteeTypeSearch, setDeducteeTypeSearch] = useState('');
  const [bankNameSearch, setBankNameSearch] = useState('');
  const [gstCursorPos, setGstCursorPos] = useState(0);
  const [panCursorPos, setPanCursorPos] = useState(0);
  const [keyboardVisible, setKeyboardVisible] = useState(false);
  const [groupNames, setGroupNames] = useState<string[]>([]);
  const [priceLevelNames, setPriceLevelNames] = useState<string[]>([]);
  const [deducteeTypeNames, setDeducteeTypeNames] = useState<string[]>([]);
  const [enterpriseTypeNames, setEnterpriseTypeNames] = useState<string[]>([]);
  const [activityTypeNames, setActivityTypeNames] = useState<string[]>([]);
  const [bankNames, setBankNames] = useState<string[]>([]);
  const [masterNameDupState, setMasterNameDupState] = useState<DuplicateState>('idle');
  const [aliasDupState, setAliasDupState] = useState<DuplicateState>('idle');
  const [masterNameCanProceed, setMasterNameCanProceed] = useState(true);
  const [aliasCanProceed, setAliasCanProceed] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [masterNameBubble, setMasterNameBubble] = useState<{ text: string; type: BubbleType } | null>(null);
  const [aliasBubble, setAliasBubble] = useState<{ text: string; type: BubbleType } | null>(null);
  const requestSeqRef = useRef({ masterName: 0, alias: 0 });
  const bubbleTimersRef = useRef<{ masterName?: ReturnType<typeof setTimeout>; alias?: ReturnType<typeof setTimeout> }>({});
  const groupFieldRef = useRef<View>(null);
  const priceLevelFieldRef = useRef<View>(null);
  const deducteeTypeFieldRef = useRef<View>(null);
  const enterpriseTypeFieldRef = useRef<View>(null);
  const activityTypeFieldRef = useRef<View>(null);
  const bankNameFieldRef = useRef<View>(null);

  useEffect(() => {
    if (Platform.OS !== 'android') return;
    SystemNavigationBar.setNavigationColor('#ffffff', 'dark');
    const t1 = setTimeout(() => SystemNavigationBar.setNavigationColor('#ffffff', 'dark'), 100);
    const t2 = setTimeout(() => SystemNavigationBar.setNavigationColor('#ffffff', 'dark'), 350);
    const t3 = setTimeout(() => SystemNavigationBar.setNavigationColor('#ffffff', 'dark'), 700);
    return () => { clearTimeout(t1); clearTimeout(t2); clearTimeout(t3); };
  }, []);

  useEffect(() => {
    let cancelled = false;
    const pickNames = (arr: Array<{ NAME?: string }> | undefined) =>
      Array.isArray(arr) ? arr.map((x) => (x?.NAME ?? '').trim()).filter(Boolean) : [];

    (async () => {
      try {
        const [tallyloc_id, company, guid] = await Promise.all([getTallylocId(), getCompany(), getGuid()]);
        if (!tallyloc_id || !company || !guid) return;
        const { data } = await apiService.getMasters({ tallyloc_id, company, guid });
        if (cancelled) return;
        setGroupNames(pickNames(data?.GROUPLIST?.GROUP));
        setPriceLevelNames(pickNames(data?.PRICELEVELLIST?.PRICELEVEL));
        setDeducteeTypeNames(pickNames(data?.TDSDEDUCTEETYPELIST?.TDSDEDUCTEETYPE));
        setEnterpriseTypeNames(pickNames(data?.MSMEENTRPTYPELIST?.MSMEENTRPTYPE));
        setActivityTypeNames(pickNames(data?.MSMEACTVTYPELIST?.MSMEACTVTYPE));
        setBankNames(pickNames(data?.BANKLIST?.BANK).sort((a, b) => a.localeCompare(b)));
      } catch {
        if (!cancelled) {
          setGroupNames([]);
          setPriceLevelNames([]);
          setDeducteeTypeNames([]);
          setEnterpriseTypeNames([]);
          setActivityTypeNames([]);
          setBankNames([]);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  const filteredCountries = useMemo(() => {
    const q = countrySearch.trim().toLowerCase();
    const list = COUNTRY_STATE_DATA
      .filter((c) => typeof c?.name === 'string' && c.name.trim().length > 0)
      .sort((a, b) => (a.name ?? '').localeCompare(b.name ?? ''));
    if (!q) return list;
    return list.filter((c) => (c.name ?? '').toLowerCase().includes(q));
  }, [countrySearch]);
  const selectedCountry = useMemo(
    () => COUNTRY_STATE_DATA.find((c) => (c.name ?? '').trim().toLowerCase() === form.country.trim().toLowerCase()),
    [form.country]
  );
  const stateOptions = useMemo(
    () =>
      (selectedCountry?.stateProvinces ?? [])
        .map((s) => (s?.name ?? '').trim())
        .filter(Boolean)
        .sort((a, b) => a.localeCompare(b)),
    [selectedCountry]
  );
  const filteredStates = useMemo(() => {
    const q = stateSearch.trim().toLowerCase();
    if (!q) return stateOptions;
    return stateOptions.filter((s) => s.toLowerCase().includes(q));
  }, [stateOptions, stateSearch]);
  const filteredGroupNames = useMemo(() => {
    const q = groupSearch.trim().toLowerCase();
    if (!q) return groupNames;
    return groupNames.filter((name) => name.toLowerCase().includes(q));
  }, [groupSearch, groupNames]);
  const filteredPriceLevelNames = useMemo(() => {
    const q = priceLevelSearch.trim().toLowerCase();
    if (!q) return priceLevelNames;
    return priceLevelNames.filter((name) => name.toLowerCase().includes(q));
  }, [priceLevelSearch, priceLevelNames]);
  const filteredDeducteeTypeNames = useMemo(() => {
    const q = deducteeTypeSearch.trim().toLowerCase();
    if (!q) return deducteeTypeNames;
    return deducteeTypeNames.filter((name) => name.toLowerCase().includes(q));
  }, [deducteeTypeSearch, deducteeTypeNames]);
  const filteredEnterpriseTypeNames = useMemo(() => {
    const q = enterpriseTypeSearch.trim().toLowerCase();
    if (!q) return enterpriseTypeNames;
    return enterpriseTypeNames.filter((name) => name.toLowerCase().includes(q));
  }, [enterpriseTypeSearch, enterpriseTypeNames]);
  const filteredActivityTypeNames = useMemo(() => {
    const q = activityTypeSearch.trim().toLowerCase();
    if (!q) return activityTypeNames;
    return activityTypeNames.filter((name) => name.toLowerCase().includes(q));
  }, [activityTypeSearch, activityTypeNames]);
  const filteredBankNames = useMemo(() => {
    const q = bankNameSearch.trim().toLowerCase();
    if (!q) return bankNames;
    return bankNames.filter((name) => name.toLowerCase().includes(q));
  }, [bankNameSearch, bankNames]);
  const defaultTxnTypeOptions = useMemo(() => {
    const seen = new Set<string>();
    return DEFAULT_TRANSACTION_TYPE_OPTIONS.filter((item) => {
      const key = item.trim().toLowerCase();
      if (!key || seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }, []);
  const selectedTaxType = form.taxIdentificationType.trim().toLowerCase();
  const isGstTypeSelected = selectedTaxType === 'gst number';
  const isPanTypeSelected = selectedTaxType === 'pan number';
  const gstRegex = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$/;
  const panRegex = /^[A-Z]{5}[0-9]{4}[A-Z]{1}$/;
  const gstPanPart = form.gstNumber.trim().toUpperCase().slice(2, 12);
  const gstIsInvalid = form.gstNumber.trim().length > 0 && !gstRegex.test(form.gstNumber.trim().toUpperCase());
  const panIsInvalid = isPanTypeSelected && form.panNumber.trim().length > 0 && !panRegex.test(form.panNumber.trim().toUpperCase());
  const gstNumericPositions = new Set([0, 1, 7, 8, 9, 10]);
  const panNumericPositions = new Set([5, 6, 7, 8]);
  const gstKeyboardType: 'default' | 'number-pad' =
    gstCursorPos < 15 && gstNumericPositions.has(gstCursorPos) ? 'number-pad' : 'default';
  const panKeyboardType: 'default' | 'number-pad' =
    panCursorPos < 10 && panNumericPositions.has(panCursorPos) ? 'number-pad' : 'default';

  const setField = <K extends keyof FormState>(key: K, value: FormState[K]) => {
    setForm((prev) => ({ ...prev, [key]: value }));
  };
  const setAdditionalBankField = <K extends keyof BankDetailsItem>(index: number, key: K, value: BankDetailsItem[K]) => {
    setAdditionalBankDetails((prev) => prev.map((item, i) => (i === index ? { ...item, [key]: value } : item)));
  };

  useEffect(() => {
    if (!isGstTypeSelected) return;
    setForm((prev) => ({ ...prev, panNumber: prev.gstNumber.trim().toUpperCase().slice(2, 12) }));
  }, [isGstTypeSelected, form.gstNumber]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ y: 0, animated: false });
  }, [step]);

  useEffect(() => {
    return () => {
      if (bubbleTimersRef.current.masterName) clearTimeout(bubbleTimersRef.current.masterName);
      if (bubbleTimersRef.current.alias) clearTimeout(bubbleTimersRef.current.alias);
    };
  }, []);

  useEffect(() => {
    const showSub = Keyboard.addListener('keyboardDidShow', () => {
      setKeyboardVisible(true);
      const focusedInput =
        typeof TextInput.State?.currentlyFocusedInput === 'function' ? TextInput.State.currentlyFocusedInput() : null;
      const scrollResponder = scrollRef.current as unknown as {
        scrollResponderScrollNativeHandleToKeyboard?: (nodeHandle: unknown, additionalOffset?: number, preventNegativeScrollOffset?: boolean) => void;
      } | null;
      if (!focusedInput || !scrollResponder?.scrollResponderScrollNativeHandleToKeyboard) return;
      setTimeout(() => {
        scrollResponder.scrollResponderScrollNativeHandleToKeyboard?.(focusedInput, 140, true);
      }, 50);
    });
    const hideSub = Keyboard.addListener('keyboardDidHide', () => setKeyboardVisible(false));
    return () => {
      showSub.remove();
      hideSub.remove();
    };
  }, []);

  const scrollToFieldRef = (targetRef: React.RefObject<View>, marginFromTop = 24) => {
    const scrollNode = findNodeHandle(scrollRef.current);
    const target = targetRef.current;
    if (!scrollNode || !target) return;
    requestAnimationFrame(() => {
      target.measureLayout(
        scrollNode,
        (_x, y) => {
          scrollRef.current?.scrollTo({ y: Math.max(0, y - marginFromTop), animated: true });
        },
        () => {}
      );
    });
  };

  useEffect(() => {
    if (!groupDropdownOpen) return;
    const t = setTimeout(() => scrollToFieldRef(groupFieldRef, 24), 100);
    return () => clearTimeout(t);
  }, [groupDropdownOpen]);
  useEffect(() => {
    if (!priceLevelDropdownOpen) return;
    const t = setTimeout(() => scrollToFieldRef(priceLevelFieldRef, 24), 100);
    return () => clearTimeout(t);
  }, [priceLevelDropdownOpen]);
  useEffect(() => {
    if (!deducteeTypeDropdownOpen) return;
    const t = setTimeout(() => scrollToFieldRef(deducteeTypeFieldRef, 24), 100);
    return () => clearTimeout(t);
  }, [deducteeTypeDropdownOpen]);
  useEffect(() => {
    if (!enterpriseTypeDropdownOpen) return;
    const t = setTimeout(() => scrollToFieldRef(enterpriseTypeFieldRef, 24), 100);
    return () => clearTimeout(t);
  }, [enterpriseTypeDropdownOpen]);
  useEffect(() => {
    if (!activityTypeDropdownOpen) return;
    const t = setTimeout(() => scrollToFieldRef(activityTypeFieldRef, 24), 100);
    return () => clearTimeout(t);
  }, [activityTypeDropdownOpen]);
  useEffect(() => {
    if (!bankNameDropdownOpen) return;
    const t = setTimeout(() => scrollToFieldRef(bankNameFieldRef, 24), 100);
    return () => clearTimeout(t);
  }, [bankNameDropdownOpen]);

  const showBubble = (field: 'masterName' | 'alias', text: string, type: BubbleType) => {
    if (field === 'masterName') {
      setMasterNameBubble({ text, type });
      if (bubbleTimersRef.current.masterName) clearTimeout(bubbleTimersRef.current.masterName);
      bubbleTimersRef.current.masterName = setTimeout(() => setMasterNameBubble(null), 3000);
      return;
    }
    setAliasBubble({ text, type });
    if (bubbleTimersRef.current.alias) clearTimeout(bubbleTimersRef.current.alias);
    bubbleTimersRef.current.alias = setTimeout(() => setAliasBubble(null), 3000);
  };

  const handleRecordLocation = async () => {
    try {
      if (Platform.OS === 'android') {
        const granted = await PermissionsAndroid.request(PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION, {
          title: 'Location Permission',
          message: 'Allow DataLynkr to access your current location coordinates.',
          buttonPositive: 'Allow',
          buttonNegative: 'Deny',
        });
        if (granted !== PermissionsAndroid.RESULTS.GRANTED) {
          Alert.alert('Location', 'Location permission denied.');
          return;
        }
      }

      const position = await new Promise<{ latitude: number; longitude: number }>((resolve, reject) => {
        Geolocation.getCurrentPosition(
          (pos) => resolve({ latitude: pos.coords.latitude, longitude: pos.coords.longitude }),
          (err) => reject(err),
          {
            enableHighAccuracy: true,
            timeout: 15000,
            maximumAge: 10000,
            forceRequestLocation: true,
            showLocationDialog: true,
          }
        );
      });

      if (typeof position.latitude !== 'number' || typeof position.longitude !== 'number') {
        Alert.alert('Location', 'Unable to fetch current location coordinates.');
        return;
      }
      const coordinates = `${position.latitude.toFixed(6)}, ${position.longitude.toFixed(6)}`;
      setField('coordinates', coordinates);
    } catch {
      Alert.alert('Location', 'Unable to fetch current location. Please enable GPS and try again.');
    }
  };

  const validateDuplicate = async (field: 'masterName' | 'alias', value: string) => {
    const trimmed = value.trim();
    const seq = requestSeqRef.current[field] + 1;
    requestSeqRef.current[field] = seq;

    const setState = field === 'masterName' ? setMasterNameDupState : setAliasDupState;
    const setCanProceed = field === 'masterName' ? setMasterNameCanProceed : setAliasCanProceed;

    if (!trimmed) {
      setState('idle');
      setCanProceed(true);
      return;
    }

    setState('checking');
    try {
      const [tallyloc_id, company, guid] = await Promise.all([getTallylocId(), getCompany(), getGuid()]);
      if (requestSeqRef.current[field] !== seq) return;
      if (!tallyloc_id || !company || !guid) {
        setState('error');
        setCanProceed(true);
        return;
      }

      const { data } = await apiService.checkLedgerDuplicate({
        tallyloc_id,
        company,
        guid,
        type: 'name',
        value: trimmed,
      });
      if (requestSeqRef.current[field] !== seq) return;

      const canProceed = data?.canProceed !== false;
      setCanProceed(canProceed);
      setState(canProceed ? 'ok' : 'duplicate');
      showBubble(
        field,
        field === 'masterName'
          ? canProceed
            ? 'Master Name available'
            : 'Duplicate Master Name found'
          : canProceed
            ? 'Alias available'
            : 'Duplicate Alias found',
        canProceed ? 'success' : 'error'
      );
    } catch {
      if (requestSeqRef.current[field] !== seq) return;
      setState('error');
      setCanProceed(true);
    }
  };

  useEffect(() => {
    validateDuplicate('masterName', form.masterName);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [form.masterName]);

  useEffect(() => {
    validateDuplicate('alias', form.alias);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [form.alias]);

  const isSubmitDisabled = !masterNameCanProceed || !aliasCanProceed || isSaving;

  const clearCurrentStep = () => {
    if (step === 1) {
      setForm((prev) => ({
        ...prev,
        masterName: '',
        alias: '',
        group: '',
        addressType1: '',
        address: '',
        addressType2: '',
        coordinates: '',
        country: 'India',
        state: '',
        pincode: '',
        contactPerson: '',
        emailId: '',
        phoneNumber: '',
        countryCode: '91',
        isDefaultWhatsApp: false,
        taxIdentificationType: '',
        gstNumber: '',
        panNumber: '',
      }));
      return;
    }
    if (step === 2) {
      setForm((prev) => ({
        ...prev,
        narration: '',
        description: '',
        maintainBillByBill: false,
        defaultCreditPeriod: '',
        checkCreditDaysDuringVoucherEntry: false,
        specifyCreditLimit: false,
        creditLimitAmount: '',
        overrideCreditLimitUsingPdc: false,
        inventoryValuesAffected: false,
        priceLevelApplicable: false,
        priceLevel: '',
        registrationType: '',
        assesseeOfOtherTerritory: 'No',
        useLedgerAsCommonParty: 'No',
        setAlterAdditionalGstDetails: 'No',
        ignorePrefixSuffixInDocNo: 'No',
        setAlterMsmeRegistrationDetails: 'No',
        typeOfEnterprise: '',
        udyamRegistrationNumber: '',
        activityType: '',
        isTdsDeductable: 'No',
        deducteeType: '',
        natureOfPayment: '',
        deductTdsInSameVoucher: 'No',
      }));
      return;
    }
    setForm((prev) => ({
      ...prev,
      accountNumber: '',
      ifscCode: '',
      bankName: '',
      swiftCode: '',
      paymentFavoring: '',
      defaultTransactionType: '',
    }));
    setAdditionalBankDetails([]);
  };

  const onHeaderBack = () => {
    if (step > 1) {
      setStep((prev) => (prev - 1) as MasterStep);
      return;
    }
    navigation.goBack();
  };

  const yesNo = (value: boolean) => (value ? 'Yes' : 'No') as 'Yes' | 'No';
  const toYesNoFromString = (value: string) => (value.trim().toLowerCase() === 'yes' ? 'Yes' : 'No') as 'Yes' | 'No';
  const sanitizeIfsc = (value: string) => value.replace(/[^a-zA-Z0-9]/g, '').toUpperCase().slice(0, 11);
  const sanitizeSwift = (value: string) => value.replace(/[^a-zA-Z0-9]/g, '').toUpperCase().slice(0, 11);

  const handleSave = async () => {
    if (isSaving) return;
    try {
      setIsSaving(true);
      const [tallyloc_id, company, guid] = await Promise.all([getTallylocId(), getCompany(), getGuid()]);
      if (!tallyloc_id || !company || !guid) {
        Alert.alert('Save', 'Missing company connection details.');
        return;
      }

      const languageNames = [form.masterName.trim(), form.alias.trim()].filter(Boolean);
      const formattedAddress = form.address
        .split(/\r?\n/)
        .map((s) => s.trim())
        .filter(Boolean)
        .join('|');
      const creditLimitNumber = Number(form.creditLimitAmount);
      const creditLimit = Number.isFinite(creditLimitNumber) && form.creditLimitAmount.trim() !== '' ? creditLimitNumber.toFixed(2) : '';

      const paymentBlocks: BankDetailsItem[] = [
        {
          accountNumber: form.accountNumber,
          ifscCode: form.ifscCode,
          bankName: form.bankName,
          swiftCode: form.swiftCode,
          paymentFavoring: form.paymentFavoring,
          defaultTransactionType: form.defaultTransactionType,
        },
        ...additionalBankDetails,
      ];

      const paymentDetails = paymentBlocks
        .filter((b) => [b.accountNumber, b.ifscCode, b.bankName, b.swiftCode, b.paymentFavoring, b.defaultTransactionType].some((v) => v.trim().length > 0))
        .map((b, index) => ({
          ifscCode: b.ifscCode.trim(),
          swiftCode: b.swiftCode.trim(),
          accountNumber: b.accountNumber.trim(),
          paymentFavouring: b.paymentFavoring.trim(),
          transactionName: index === 0 ? 'Primary' : 'Secondary',
          bankId: b.bankName.trim(),
          defaultTransactionType: b.defaultTransactionType.trim(),
        }));

      const msmeDetails =
        form.setAlterMsmeRegistrationDetails.trim().toLowerCase() === 'yes'
          ? [
              {
                enterpriseType: form.typeOfEnterprise.trim(),
                udyamRegNumber: form.udyamRegistrationNumber.trim(),
                msmeActivityType: form.activityType.trim(),
              },
            ]
          : [];

      const gstRegDetails =
        form.registrationType.trim() || form.gstNumber.trim()
          ? [
              {
                gstRegistrationType: form.registrationType.trim(),
                gstin: form.gstNumber.trim(),
              },
            ]
          : [];

      const phone = form.phoneNumber.trim();
      const payload = {
        tallyloc_id,
        company,
        guid,
        ledgerData: {
          name: form.masterName.trim(),
          languageNames,
          group: form.group.trim(),
          isBillWiseOn: yesNo(form.maintainBillByBill),
          billCreditPeriod: form.defaultCreditPeriod.trim(),
          isCreditDaysChkOn: yesNo(form.checkCreditDaysDuringVoucherEntry),
          creditLimit,
          overrideCreditLimit: yesNo(form.overrideCreditLimitUsingPdc),
          affectsStock: yesNo(form.inventoryValuesAffected),
          isCostCentresOn: 'No' as const,
          isTdsApplicable: toYesNoFromString(form.isTdsDeductable),
          tdsDeducteeType: form.deducteeType.trim(),
          natureOfPayment: form.natureOfPayment.trim(),
          address: formattedAddress,
          pincode: form.pincode.trim(),
          priorStateName: form.state.trim(),
          stateName: form.state.trim(),
          countryOfResidence: form.country.trim(),
          mailingName: form.masterName.trim(),
          contactPerson: form.contactPerson.trim(),
          phoneNo: phone,
          ...(phone ? { countryISDCode: `+${(form.countryCode || '').replace(/\D/g, '') || '91'}` } : {}),
          mobileNo: phone,
          email: form.emailId.trim(),
          emailCC: '',
          panNo: form.panNumber.trim(),
          nameOnPan: form.masterName.trim(),
          gstinNo: form.gstNumber.trim(),
          priceLevel: form.priceLevelApplicable ? form.priceLevel.trim() : '',
          narration: form.narration.trim(),
          description: form.description.trim(),
          doclist: { documents: [] as string[] },
          paymentDetails,
          msmeDetails,
          gstRegDetails,
        },
      };

      console.log('[MasterCreation][ledger-create] Full payload:', JSON.stringify(payload, null, 2));
      const { data } = await apiService.createLedger(payload);
      if (data?.success === true) {
        Alert.alert('Save', data?.message || 'Ledger created successfully.');
        navigation.goBack();
        return;
      }
      Alert.alert('Save', data?.message || 'Failed to create ledger.');
    } catch (e: any) {
      Alert.alert('Save', e?.message || 'Failed to create ledger.');
    } finally {
      setIsSaving(false);
    }
  };

  useEffect(() => {
    if (Platform.OS !== 'android') return;
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      if (step > 1) {
        setStep((prev) => (prev - 1) as MasterStep);
        return true;
      }
      return false;
    });
    return () => sub.remove();
  }, [step]);


  const renderStepOne = () => (
    <>
      <Field
        label="Master Name"
        required
        placeholder="Enter master name"
        value={form.masterName}
        onChangeText={(v) => setField('masterName', v)}
        status={masterNameDupState}
        bubble={masterNameBubble}
      />
      <Field
        label="Alias"
        placeholder="Enter Alias Name"
        value={form.alias}
        onChangeText={(v) => setField('alias', v)}
        status={aliasDupState}
        bubble={aliasBubble}
      />
      <View ref={groupFieldRef} style={styles.fieldWrap}>
        <Text style={styles.label}>Group</Text>
        <TouchableOpacity style={styles.input} activeOpacity={0.8} onPress={() => setGroupDropdownOpen(true)}>
          <Text style={[styles.inputText, !form.group && styles.placeholder]}>{form.group || 'Select Group'}</Text>
          <Icon name="chevron-down" size={18} color="#6a7282" />
        </TouchableOpacity>
      </View>
      <Field
        label="Address Type"
        placeholder="Enter address type (eg. A, B, C, Office, Home)"
        value={form.addressType1}
        onChangeText={(v) => setField('addressType1', v)}
      />
      <Field
        label="Address"
        placeholder="Enter complete address"
        value={form.address}
        onChangeText={(v) => setField('address', v)}
        multiline
      />
      <View style={styles.fieldWrap}>
        <TouchableOpacity style={styles.recordLocationButton} activeOpacity={0.85} onPress={handleRecordLocation}>
          <Icon name="crosshairs-gps" size={18} color="#1e488f" />
          <Text style={styles.recordLocationButtonText}>Record Location</Text>
        </TouchableOpacity>
      </View>
      <Field
        label="Coordinates"
        placeholder="Latitude, Longitude"
        value={form.coordinates}
        onChangeText={(v) => setField('coordinates', v)}
        editable={false}
      />
      <View style={styles.row}>
        <View style={[styles.fieldWrap, styles.halfField]}>
          <Text style={styles.label}>Country</Text>
          <TouchableOpacity style={styles.input} activeOpacity={0.8} onPress={() => setCountryDropdownOpen(true)}>
            <View style={styles.countryRow}>
              {selectedCountry?.flag ? <Image source={{ uri: selectedCountry.flag }} style={styles.countryFlag} /> : null}
              <Text style={styles.inputText}>{form.country || 'Select Country'}</Text>
            </View>
            <Icon name="chevron-down" size={18} color="#6a7282" />
          </TouchableOpacity>
        </View>
        <View style={[styles.fieldWrap, styles.halfField]}>
          <Text style={styles.label}>State</Text>
          <TouchableOpacity
            style={[styles.input, stateOptions.length === 0 && { opacity: 0.6 }]}
            activeOpacity={0.8}
            onPress={() => stateOptions.length > 0 && setStateDropdownOpen(true)}
            disabled={stateOptions.length === 0}
          >
            <Text style={[styles.inputText, !form.state && styles.placeholder]}>
              {form.state || (stateOptions.length > 0 ? 'Select State' : 'No states available')}
            </Text>
            <Icon name="chevron-down" size={18} color="#6a7282" />
          </TouchableOpacity>
        </View>
      </View>

      <Field
        label="Pincode"
        placeholder="Enter 6-digit pin code"
        value={form.pincode}
        onChangeText={(v) => setField('pincode', v.replace(/\D/g, '').slice(0, 6))}
        keyboardType="number-pad"
      />
      <Field
        label="Contact Person"
        placeholder="Enter contact person name"
        value={form.contactPerson}
        onChangeText={(v) => setField('contactPerson', v)}
      />
      <Field
        label="Email ID"
        placeholder="Enter email address"
        value={form.emailId}
        onChangeText={(v) => setField('emailId', v)}
        keyboardType="email-address"
      />
      <View style={styles.fieldWrap}>
        <Text style={styles.label}>Phone Number</Text>
        <View style={styles.phoneRow}>
          <View style={[styles.input, styles.countryCodeBox]}>
            <Text style={styles.countryCodePlus}>+</Text>
            <TextInput
              style={styles.countryCodeInput}
              value={form.countryCode}
              onChangeText={(v) => setField('countryCode', v.replace(/\D/g, '').slice(0, 4))}
              keyboardType="phone-pad"
              placeholder="91"
              placeholderTextColor="#6a7282"
            />
          </View>
          <TextInput
            style={[styles.input, styles.phoneNumberInput]}
            placeholder="Enter phone number"
            placeholderTextColor="#6a7282"
            value={form.phoneNumber}
            onChangeText={(v) => setField('phoneNumber', v.replace(/\D/g, '').slice(0, 15))}
            keyboardType="phone-pad"
          />
        </View>
      </View>

      <View style={styles.whatsappRow}>
        <Switch value={form.isDefaultWhatsApp} onValueChange={(v) => setField('isDefaultWhatsApp', v)} />
        <Text style={styles.whatsappLabel}>Set as default WhatsApp number</Text>
      </View>

      <View style={styles.fieldWrap}>
        <Text style={styles.label}>Tax Identification Type</Text>
        <TouchableOpacity style={styles.selectBoxLikeExpense} onPress={() => setTaxDropdownOpen((prev) => !prev)} activeOpacity={0.8}>
          <Text style={[styles.inputText, !form.taxIdentificationType && styles.placeholder]}>
            {form.taxIdentificationType || 'Select Tax Type'}
          </Text>
          <Icon name={taxDropdownOpen ? 'chevron-up' : 'chevron-down'} size={20} color="#6a7282" />
        </TouchableOpacity>
        {taxDropdownOpen && (
          <View style={styles.inlineDropdownLikeExpense}>
            {taxOptions.map((option) => (
              <TouchableOpacity
                key={option}
                style={styles.inlineDropdownItemLikeExpense}
                onPress={() => {
                  setField('taxIdentificationType', option);
                  setTaxDropdownOpen(false);
                }}
              >
                <Text style={styles.inlineDropdownItemTextLikeExpense}>{option}</Text>
              </TouchableOpacity>
            ))}
          </View>
        )}
      </View>

      {isGstTypeSelected ? (
        <>
          <View style={styles.fieldWrap}>
            <Text style={styles.label}>GST Number</Text>
            <TextInput
              style={[styles.input, gstIsInvalid && styles.invalidInput]}
              placeholder="22ABCDE1234A1Z5"
              placeholderTextColor="#6a7282"
              value={form.gstNumber}
              maxLength={15}
              autoCapitalize="characters"
              keyboardType={gstKeyboardType}
              onSelectionChange={(e) => setGstCursorPos(e.nativeEvent.selection.start)}
              onChangeText={(v) => setField('gstNumber', v.toUpperCase().replace(/[^A-Z0-9]/g, ''))}
            />
          </View>
          <View style={styles.fieldWrap}>
            <Text style={styles.label}>PAN Number (Auto filled from GST)</Text>
            <TextInput
              style={[styles.input, gstIsInvalid && styles.invalidInput, styles.readOnlyInput]}
              placeholder="Will be auto-filled from GST"
              placeholderTextColor="#6a7282"
              value={gstPanPart}
              editable={false}
              selectTextOnFocus={false}
            />
          </View>
        </>
      ) : null}
      {isPanTypeSelected ? (
        <View style={styles.fieldWrap}>
          <Text style={styles.label}>PAN Number</Text>
          <TextInput
            style={[styles.input, panIsInvalid && styles.invalidInput]}
            placeholder="ABCDE1234F"
            placeholderTextColor="#6a7282"
            value={form.panNumber}
            maxLength={10}
            autoCapitalize="characters"
            keyboardType={panKeyboardType}
            onSelectionChange={(e) => setPanCursorPos(e.nativeEvent.selection.start)}
            onChangeText={(v) => setField('panNumber', v.toUpperCase().replace(/[^A-Z0-9]/g, ''))}
          />
        </View>
      ) : null}
    </>
  );

  const renderStepTwo = () => (
    <>
      <Field label="Narration" placeholder="Enter narration" value={form.narration} onChangeText={(v) => setField('narration', v)} multiline />
      <Field label="Description" placeholder="Enter Description" value={form.description} onChangeText={(v) => setField('description', v)} multiline />

      <CheckRow
        label="Maintain balances bill-by-bill"
        checked={form.maintainBillByBill}
        onToggle={() => setField('maintainBillByBill', !form.maintainBillByBill)}
      />
      {form.maintainBillByBill ? (
        <View style={styles.nestedOptionBlock}>
          <Field
            label="Default credit period"
            placeholder="Enter credit period (e.g., 30 days)"
            value={form.defaultCreditPeriod}
            onChangeText={(v) => setField('defaultCreditPeriod', v)}
            keyboardType="number-pad"
          />
          <CheckRow
            label="Check for credit days during voucher entry"
            checked={form.checkCreditDaysDuringVoucherEntry}
            onToggle={() => setField('checkCreditDaysDuringVoucherEntry', !form.checkCreditDaysDuringVoucherEntry)}
          />
        </View>
      ) : null}

      <CheckRow
        label="Specify credit limit"
        checked={form.specifyCreditLimit}
        onToggle={() => setField('specifyCreditLimit', !form.specifyCreditLimit)}
      />
      {form.specifyCreditLimit ? (
        <View style={styles.nestedOptionBlock}>
          <Field
            label="Credit Limit Amount"
            placeholder="Enter credit limit amount"
            value={form.creditLimitAmount}
            onChangeText={(v) => setField('creditLimitAmount', v)}
            keyboardType="number-pad"
          />

          <CheckRow
            label="Override credit limit using post-dated transactions"
            checked={form.overrideCreditLimitUsingPdc}
            onToggle={() => setField('overrideCreditLimitUsingPdc', !form.overrideCreditLimitUsingPdc)}
          />
        </View>
      ) : null}
      <CheckRow
        label="Inventory values are affected"
        checked={form.inventoryValuesAffected}
        onToggle={() => setField('inventoryValuesAffected', !form.inventoryValuesAffected)}
      />

      <CheckRow
        label="Price levels applicable"
        checked={form.priceLevelApplicable}
        onToggle={() => setField('priceLevelApplicable', !form.priceLevelApplicable)}
      />
      {form.priceLevelApplicable ? (
        <View ref={priceLevelFieldRef} style={styles.fieldWrap}>
          <Text style={styles.label}>Price Level</Text>
          <TouchableOpacity style={styles.input} activeOpacity={0.8} onPress={() => setPriceLevelDropdownOpen(true)}>
            <Text style={[styles.inputText, !form.priceLevel && styles.placeholder]}>{form.priceLevel || 'Select Price Level'}</Text>
            <Icon name="chevron-down" size={18} color="#6a7282" />
          </TouchableOpacity>
        </View>
      ) : null}

      <Text style={styles.sectionTitle}>Tax Registration Details</Text>
      <SelectLike label="Registration type" value={form.registrationType} />
      <View style={styles.fieldWrap}>
        <Text style={styles.label}>Assessee of Other Territory</Text>
        <TouchableOpacity
          style={styles.selectBoxLikeExpense}
          activeOpacity={0.8}
          onPress={() => setAssesseeDropdownOpen((v) => !v)}
        >
          <Text style={styles.inputText}>{form.assesseeOfOtherTerritory || 'Select'}</Text>
          <Icon name={assesseeDropdownOpen ? 'chevron-up' : 'chevron-down'} size={20} color="#6a7282" />
        </TouchableOpacity>
        {assesseeDropdownOpen && (
          <View style={styles.inlineDropdownLikeExpense}>
            <TouchableOpacity
              style={styles.inlineDropdownItemLikeExpense}
              onPress={() => {
                setField('assesseeOfOtherTerritory', 'Yes');
                setAssesseeDropdownOpen(false);
              }}
            >
              <Text style={styles.inlineDropdownItemTextLikeExpense}>Yes</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.inlineDropdownItemLikeExpense}
              onPress={() => {
                setField('assesseeOfOtherTerritory', 'No');
                setAssesseeDropdownOpen(false);
              }}
            >
              <Text style={styles.inlineDropdownItemTextLikeExpense}>No</Text>
            </TouchableOpacity>
          </View>
        )}
      </View>
      <View style={styles.fieldWrap}>
        <Text style={styles.label}>Use Ledger as common Party</Text>
        <TouchableOpacity
          style={styles.selectBoxLikeExpense}
          activeOpacity={0.8}
          onPress={() => setCommonPartyDropdownOpen((v) => !v)}
        >
          <Text style={styles.inputText}>{form.useLedgerAsCommonParty || 'Select'}</Text>
          <Icon name={commonPartyDropdownOpen ? 'chevron-up' : 'chevron-down'} size={20} color="#6a7282" />
        </TouchableOpacity>
        {commonPartyDropdownOpen && (
          <View style={styles.inlineDropdownLikeExpense}>
            <TouchableOpacity
              style={styles.inlineDropdownItemLikeExpense}
              onPress={() => {
                setField('useLedgerAsCommonParty', 'Yes');
                setCommonPartyDropdownOpen(false);
              }}
            >
              <Text style={styles.inlineDropdownItemTextLikeExpense}>Yes</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.inlineDropdownItemLikeExpense}
              onPress={() => {
                setField('useLedgerAsCommonParty', 'No');
                setCommonPartyDropdownOpen(false);
              }}
            >
              <Text style={styles.inlineDropdownItemTextLikeExpense}>No</Text>
            </TouchableOpacity>
          </View>
        )}
      </View>
      <View style={styles.fieldWrap}>
        <Text style={styles.label}>Set/Alter additional GST details</Text>
        <TouchableOpacity
          style={styles.selectBoxLikeExpense}
          activeOpacity={0.8}
          onPress={() => setAdditionalGstDropdownOpen((v) => !v)}
        >
          <Text style={styles.inputText}>{form.setAlterAdditionalGstDetails || 'Select'}</Text>
          <Icon name={additionalGstDropdownOpen ? 'chevron-up' : 'chevron-down'} size={20} color="#6a7282" />
        </TouchableOpacity>
        {additionalGstDropdownOpen && (
          <View style={styles.inlineDropdownLikeExpense}>
            <TouchableOpacity
              style={styles.inlineDropdownItemLikeExpense}
              onPress={() => {
                setField('setAlterAdditionalGstDetails', 'Yes');
                setAdditionalGstDropdownOpen(false);
              }}
            >
              <Text style={styles.inlineDropdownItemTextLikeExpense}>Yes</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.inlineDropdownItemLikeExpense}
              onPress={() => {
                setField('setAlterAdditionalGstDetails', 'No');
                setAdditionalGstDropdownOpen(false);
              }}
            >
              <Text style={styles.inlineDropdownItemTextLikeExpense}>No</Text>
            </TouchableOpacity>
          </View>
        )}
      </View>
      <View style={styles.fieldWrap}>
        <Text style={styles.label}>Ignore prefixes and suffixes in Doc No. for reconciliation</Text>
        <TouchableOpacity
          style={styles.selectBoxLikeExpense}
          activeOpacity={0.8}
          onPress={() => setIgnorePrefixesDropdownOpen((v) => !v)}
        >
          <Text style={styles.inputText}>{form.ignorePrefixSuffixInDocNo || 'Select'}</Text>
          <Icon name={ignorePrefixesDropdownOpen ? 'chevron-up' : 'chevron-down'} size={20} color="#6a7282" />
        </TouchableOpacity>
        {ignorePrefixesDropdownOpen && (
          <View style={styles.inlineDropdownLikeExpense}>
            <TouchableOpacity
              style={styles.inlineDropdownItemLikeExpense}
              onPress={() => {
                setField('ignorePrefixSuffixInDocNo', 'Yes');
                setIgnorePrefixesDropdownOpen(false);
              }}
            >
              <Text style={styles.inlineDropdownItemTextLikeExpense}>Yes</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.inlineDropdownItemLikeExpense}
              onPress={() => {
                setField('ignorePrefixSuffixInDocNo', 'No');
                setIgnorePrefixesDropdownOpen(false);
              }}
            >
              <Text style={styles.inlineDropdownItemTextLikeExpense}>No</Text>
            </TouchableOpacity>
          </View>
        )}
      </View>
      <View style={styles.fieldWrap}>
        <Text style={styles.label}>Set/Alter MSME Registration Details</Text>
        <TouchableOpacity style={styles.selectBoxLikeExpense} activeOpacity={0.8} onPress={() => setMsmeDropdownOpen((v) => !v)}>
          <Text style={styles.inputText}>{form.setAlterMsmeRegistrationDetails || 'Select'}</Text>
          <Icon name={msmeDropdownOpen ? 'chevron-up' : 'chevron-down'} size={20} color="#6a7282" />
        </TouchableOpacity>
        {msmeDropdownOpen && (
          <View style={styles.inlineDropdownLikeExpense}>
            <TouchableOpacity
              style={styles.inlineDropdownItemLikeExpense}
              onPress={() => {
                setField('setAlterMsmeRegistrationDetails', 'Yes');
                setMsmeDropdownOpen(false);
              }}
            >
              <Text style={styles.inlineDropdownItemTextLikeExpense}>Yes</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.inlineDropdownItemLikeExpense}
              onPress={() => {
                setField('setAlterMsmeRegistrationDetails', 'No');
                setMsmeDropdownOpen(false);
              }}
            >
              <Text style={styles.inlineDropdownItemTextLikeExpense}>No</Text>
            </TouchableOpacity>
          </View>
        )}
      </View>
      {form.setAlterMsmeRegistrationDetails.trim().toLowerCase() === 'yes' ? (
        <>
          <View ref={enterpriseTypeFieldRef} style={styles.fieldWrap}>
            <Text style={styles.label}>Type of Enterprise</Text>
            <TouchableOpacity style={styles.input} activeOpacity={0.8} onPress={() => setEnterpriseTypeDropdownOpen(true)}>
              <Text style={[styles.inputText, !form.typeOfEnterprise && styles.placeholder]}>{form.typeOfEnterprise || 'Select Type'}</Text>
              <Icon name="chevron-down" size={18} color="#6a7282" />
            </TouchableOpacity>
          </View>
          <Field
            label="UDYAM Registration Number"
            placeholder="Enter UDYAM Registration Number"
            value={form.udyamRegistrationNumber}
            onChangeText={(v) => setField('udyamRegistrationNumber', v)}
          />
          <View ref={activityTypeFieldRef} style={styles.fieldWrap}>
            <Text style={styles.label}>Activity Type</Text>
            <TouchableOpacity style={styles.input} activeOpacity={0.8} onPress={() => setActivityTypeDropdownOpen(true)}>
              <Text style={[styles.inputText, !form.activityType && styles.placeholder]}>{form.activityType || 'Select Activity Type'}</Text>
              <Icon name="chevron-down" size={18} color="#6a7282" />
            </TouchableOpacity>
          </View>
        </>
      ) : null}
      <View style={styles.fieldWrap}>
        <Text style={styles.label}>Is TDS Deductable</Text>
        <TouchableOpacity style={styles.selectBoxLikeExpense} activeOpacity={0.8} onPress={() => setTdsDropdownOpen((v) => !v)}>
          <Text style={styles.inputText}>{form.isTdsDeductable || 'Select'}</Text>
          <Icon name={tdsDropdownOpen ? 'chevron-up' : 'chevron-down'} size={20} color="#6a7282" />
        </TouchableOpacity>
        {tdsDropdownOpen && (
          <View style={styles.inlineDropdownLikeExpense}>
            <TouchableOpacity
              style={styles.inlineDropdownItemLikeExpense}
              onPress={() => {
                setField('isTdsDeductable', 'Yes');
                setTdsDropdownOpen(false);
              }}
            >
              <Text style={styles.inlineDropdownItemTextLikeExpense}>Yes</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.inlineDropdownItemLikeExpense}
              onPress={() => {
                setField('isTdsDeductable', 'No');
                setTdsDropdownOpen(false);
              }}
            >
              <Text style={styles.inlineDropdownItemTextLikeExpense}>No</Text>
            </TouchableOpacity>
          </View>
        )}
      </View>
      {form.isTdsDeductable.trim().toLowerCase() === 'yes' ? (
        <>
          <View ref={deducteeTypeFieldRef} style={styles.fieldWrap}>
            <Text style={styles.label}>Deductee type</Text>
            <TouchableOpacity style={styles.input} activeOpacity={0.8} onPress={() => setDeducteeTypeDropdownOpen(true)}>
              <Text style={[styles.inputText, !form.deducteeType && styles.placeholder]}>{form.deducteeType || 'Select Deductee Type'}</Text>
              <Icon name="chevron-down" size={18} color="#6a7282" />
            </TouchableOpacity>
          </View>
          <Field
            label="Nature of Payment"
            placeholder="Enter nature of payment"
            value={form.natureOfPayment}
            onChangeText={(v) => setField('natureOfPayment', v)}
          />
          <View style={styles.fieldWrap}>
            <Text style={styles.label}>Deduct TDS in Same Voucher</Text>
            <TouchableOpacity
              style={styles.selectBoxLikeExpense}
              activeOpacity={0.8}
              onPress={() => setDeductTdsDropdownOpen((v) => !v)}
            >
              <Text style={styles.inputText}>{form.deductTdsInSameVoucher || 'Select'}</Text>
              <Icon name={deductTdsDropdownOpen ? 'chevron-up' : 'chevron-down'} size={20} color="#6a7282" />
            </TouchableOpacity>
            {deductTdsDropdownOpen && (
              <View style={styles.inlineDropdownLikeExpense}>
                <TouchableOpacity
                  style={styles.inlineDropdownItemLikeExpense}
                  onPress={() => {
                    setField('deductTdsInSameVoucher', 'Yes');
                    setDeductTdsDropdownOpen(false);
                  }}
                >
                  <Text style={styles.inlineDropdownItemTextLikeExpense}>Yes</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.inlineDropdownItemLikeExpense}
                  onPress={() => {
                    setField('deductTdsInSameVoucher', 'No');
                    setDeductTdsDropdownOpen(false);
                  }}
                >
                  <Text style={styles.inlineDropdownItemTextLikeExpense}>No</Text>
                </TouchableOpacity>
              </View>
            )}
          </View>
        </>
      ) : null}
    </>
  );

  const renderStepThree = () => (
    <>
      <View style={styles.bankHeadingRow}>
        <Text style={styles.sectionTitle}>{additionalBankDetails.length > 0 ? 'Bank Details #1' : 'Bank Details'}</Text>
        {additionalBankDetails.length > 0 ? (
          <TouchableOpacity
            onPress={() => {
              const [first, ...rest] = additionalBankDetails;
              if (!first) return;
              setForm((prev) => ({
                ...prev,
                accountNumber: first.accountNumber,
                ifscCode: first.ifscCode,
                bankName: first.bankName,
                swiftCode: first.swiftCode,
                paymentFavoring: first.paymentFavoring,
                defaultTransactionType: first.defaultTransactionType,
              }));
              setAdditionalBankDetails(rest);
            }}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          >
            <Text style={styles.removeBankText}>Remove</Text>
          </TouchableOpacity>
        ) : null}
      </View>
      <Field label="Account Number" placeholder="Enter account number" value={form.accountNumber} onChangeText={(v) => setField('accountNumber', v)} />
      <Field
        label="IFSC Code"
        placeholder="Enter IFSC code"
        value={form.ifscCode}
        onChangeText={(v) => setField('ifscCode', sanitizeIfsc(v))}
        autoCapitalize="characters"
      />
      <View ref={bankNameFieldRef} style={styles.fieldWrap}>
        <Text style={styles.label}>Bank Name</Text>
        <TouchableOpacity style={styles.input} activeOpacity={0.8} onPress={() => setBankNameDropdownOpen(true)}>
          <Text style={[styles.inputText, !form.bankName && styles.placeholder]}>{form.bankName || 'Select Bank Name'}</Text>
          <Icon name="chevron-down" size={18} color="#6a7282" />
        </TouchableOpacity>
      </View>
      <Field
        label="SWIFT Code"
        placeholder="Enter SWIFT code"
        value={form.swiftCode}
        onChangeText={(v) => setField('swiftCode', sanitizeSwift(v))}
        autoCapitalize="characters"
      />
      <Field
        label="Payment Favoring"
        placeholder="Enter payment favoring name"
        value={form.paymentFavoring}
        onChangeText={(v) => setField('paymentFavoring', v)}
      />
      <View style={styles.fieldWrap}>
        <Text style={styles.label}>Default Transaction Type</Text>
        <TouchableOpacity style={styles.input} activeOpacity={0.8} onPress={() => setDefaultTxnTypeDropdownOpen((v) => !v)}>
          <Text style={[styles.inputText, !form.defaultTransactionType && styles.placeholder]}>
            {form.defaultTransactionType || 'Select default transaction type'}
          </Text>
          <Icon name={defaultTxnTypeDropdownOpen ? 'chevron-up' : 'chevron-down'} size={18} color="#6a7282" />
        </TouchableOpacity>
        {defaultTxnTypeDropdownOpen && (
          <View style={styles.inlineDropdownLikeExpense}>
            {defaultTxnTypeOptions.map((item) => (
              <TouchableOpacity
                key={item}
                style={styles.inlineDropdownItemLikeExpense}
                onPress={() => {
                  setField('defaultTransactionType', item);
                  setDefaultTxnTypeDropdownOpen(false);
                }}
              >
                <Text style={styles.inlineDropdownItemTextLikeExpense}>{item}</Text>
              </TouchableOpacity>
            ))}
          </View>
        )}
      </View>
      {additionalBankDetails.map((bank, index) => (
        <View key={`extra-bank-${index}`} style={styles.extraBankWrap}>
          <View style={styles.bankHeadingRow}>
            <Text style={styles.sectionTitle}>Bank Details #{index + 2}</Text>
            <TouchableOpacity
              onPress={() => setAdditionalBankDetails((prev) => prev.filter((_, i) => i !== index))}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            >
              <Text style={styles.removeBankText}>Remove</Text>
            </TouchableOpacity>
          </View>
          <Field
            label="Account Number"
            placeholder="Enter account number"
            value={bank.accountNumber}
            onChangeText={(v) => setAdditionalBankField(index, 'accountNumber', v)}
          />
          <Field
            label="IFSC Code"
            placeholder="Enter IFSC code"
            value={bank.ifscCode}
            onChangeText={(v) => setAdditionalBankField(index, 'ifscCode', sanitizeIfsc(v))}
            autoCapitalize="characters"
          />
          <View style={styles.fieldWrap}>
            <Text style={styles.label}>Bank Name</Text>
            <TouchableOpacity
              style={styles.input}
              activeOpacity={0.8}
              onPress={() => {
                setExtraBankNameDropdownIndex(index);
                setBankNameDropdownOpen(true);
              }}
            >
              <Text style={[styles.inputText, !bank.bankName && styles.placeholder]}>{bank.bankName || 'Select Bank Name'}</Text>
              <Icon name="chevron-down" size={18} color="#6a7282" />
            </TouchableOpacity>
          </View>
          <Field
            label="SWIFT Code"
            placeholder="Enter SWIFT code"
            value={bank.swiftCode}
            onChangeText={(v) => setAdditionalBankField(index, 'swiftCode', sanitizeSwift(v))}
            autoCapitalize="characters"
          />
          <Field
            label="Payment Favoring"
            placeholder="Enter payment favoring name"
            value={bank.paymentFavoring}
            onChangeText={(v) => setAdditionalBankField(index, 'paymentFavoring', v)}
          />
          <View style={styles.fieldWrap}>
            <Text style={styles.label}>Default Transaction Type</Text>
            <TouchableOpacity
              style={styles.input}
              activeOpacity={0.8}
              onPress={() => setExtraDefaultTxnDropdownIndex((prev) => (prev === index ? null : index))}
            >
              <Text style={[styles.inputText, !bank.defaultTransactionType && styles.placeholder]}>
                {bank.defaultTransactionType || 'Select default transaction type'}
              </Text>
              <Icon name={extraDefaultTxnDropdownIndex === index ? 'chevron-up' : 'chevron-down'} size={18} color="#6a7282" />
            </TouchableOpacity>
            {extraDefaultTxnDropdownIndex === index && (
              <View style={styles.inlineDropdownLikeExpense}>
                {defaultTxnTypeOptions.map((item) => (
                  <TouchableOpacity
                    key={`${index}-${item}`}
                    style={styles.inlineDropdownItemLikeExpense}
                    onPress={() => {
                      setAdditionalBankField(index, 'defaultTransactionType', item);
                      setExtraDefaultTxnDropdownIndex(null);
                    }}
                  >
                    <Text style={styles.inlineDropdownItemTextLikeExpense}>{item}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            )}
          </View>
        </View>
      ))}
      <TouchableOpacity
        style={styles.addBankDetailsButton}
        activeOpacity={0.85}
        onPress={() =>
          setAdditionalBankDetails((prev) => [
            ...prev,
            {
              accountNumber: '',
              ifscCode: '',
              bankName: '',
              swiftCode: '',
              paymentFavoring: '',
              defaultTransactionType: '',
            },
          ])
        }
      >
        <Icon name="plus" size={18} color="#1e488f" />
        <Text style={styles.addBankDetailsButtonText}>Add Bank Details</Text>
      </TouchableOpacity>
    </>
  );

  return (
    <View style={styles.container}>
      <StatusBarTopBar
        title="Master Creation"
        leftIcon="back"
        rightIcons="none"
        onLeftPress={onHeaderBack}
      />
      <ScrollView
        ref={scrollRef}
        contentContainerStyle={[styles.content, { paddingTop: 14, paddingBottom: (keyboardVisible ? 260 : 40) + insets.bottom }]}
        keyboardShouldPersistTaps="handled"
      >
        {step === 1 && renderStepOne()}
        {step === 2 && renderStepTwo()}
        {step === 3 && renderStepThree()}

        <TouchableOpacity style={styles.clearButton} onPress={clearCurrentStep}>
          <Text style={styles.clearButtonText}>Clear All</Text>
        </TouchableOpacity>
        {step < 3 ? (
          <TouchableOpacity style={styles.nextButton} activeOpacity={0.8} onPress={() => setStep((prev) => (prev + 1) as MasterStep)}>
            <Text style={styles.nextButtonText}>Next</Text>
          </TouchableOpacity>
        ) : null}
        <TouchableOpacity
          style={[styles.saveButton, isSubmitDisabled && styles.saveButtonDisabled]}
          activeOpacity={0.8}
          onPress={handleSave}
          disabled={isSubmitDisabled}
        >
          <Text style={styles.saveButtonText}>{isSaving ? 'Saving...' : 'Save'}</Text>
        </TouchableOpacity>
      </ScrollView>
      <View
        pointerEvents="none"
        style={{
          position: 'absolute',
          left: 0,
          right: 0,
          bottom: insets.bottom,
          height: 1,
          backgroundColor: '#d1d5db',
        }}
      />

      <Modal
        visible={countryDropdownOpen}
        transparent
        animationType="fade"
        onRequestClose={() => {
          setCountryDropdownOpen(false);
          setCountrySearch('');
        }}
      >
        <TouchableOpacity
          style={sharedStyles.modalOverlay}
          activeOpacity={1}
          onPress={() => {
            setCountryDropdownOpen(false);
            setCountrySearch('');
          }}
        >
          <View style={[sharedStyles.modalContentFullWidth, { marginBottom: insets.bottom + 80 }]} onStartShouldSetResponder={() => true}>
            <View style={sharedStyles.modalHeaderRow}>
              <Text style={sharedStyles.modalHeaderTitle}>Select Country</Text>
              <TouchableOpacity
                style={sharedStyles.modalHeaderClose}
                onPress={() => {
                  setCountryDropdownOpen(false);
                  setCountrySearch('');
                }}
              >
                <Icon name="close" size={22} color="#ffffff" />
              </TouchableOpacity>
            </View>
            <View style={sharedStyles.modalSearchRow}>
              <TextInput
                style={sharedStyles.modalSearchInput}
                placeholder="Search countries..."
                placeholderTextColor="#6a7282"
                value={countrySearch}
                onChangeText={setCountrySearch}
              />
              <Icon name="magnify" size={20} color="#6a7282" style={sharedStyles.modalSearchIcon} />
            </View>
            <FlatList
              data={filteredCountries}
              keyExtractor={(item, index) => item.countryCode || item.countryCodeAlpha3 || item.name || `country-${index}`}
              keyboardShouldPersistTaps="handled"
              renderItem={({ item }) => (
                <TouchableOpacity
                  style={[sharedStyles.modalOpt, { paddingVertical: 12, minHeight: 40 }]}
                  onPress={() => {
                    setField('country', item.name ?? '');
                    setField('countryCode', String(item.phone ?? '91').replace(/\D/g, '') || '91');
                    setField('state', '');
                    setCountryDropdownOpen(false);
                    setCountrySearch('');
                  }}
                >
                  <View style={styles.countryRow}>
                    {item.flag ? <Image source={{ uri: item.flag }} style={styles.countryFlag} /> : null}
                    <Text style={sharedStyles.modalOptTxt}>{item.name}</Text>
                  </View>
                </TouchableOpacity>
              )}
            />
          </View>
        </TouchableOpacity>
      </Modal>
      <Modal
        visible={stateDropdownOpen}
        transparent
        animationType="fade"
        onRequestClose={() => {
          setStateDropdownOpen(false);
          setStateSearch('');
        }}
      >
        <TouchableOpacity
          style={sharedStyles.modalOverlay}
          activeOpacity={1}
          onPress={() => {
            setStateDropdownOpen(false);
            setStateSearch('');
          }}
        >
          <View style={[sharedStyles.modalContentFullWidth, { marginBottom: insets.bottom + 80 }]} onStartShouldSetResponder={() => true}>
            <View style={sharedStyles.modalHeaderRow}>
              <Text style={sharedStyles.modalHeaderTitle}>Select State</Text>
              <TouchableOpacity
                style={sharedStyles.modalHeaderClose}
                onPress={() => {
                  setStateDropdownOpen(false);
                  setStateSearch('');
                }}
              >
                <Icon name="close" size={22} color="#ffffff" />
              </TouchableOpacity>
            </View>
            <View style={sharedStyles.modalSearchRow}>
              <TextInput
                style={sharedStyles.modalSearchInput}
                placeholder="Search states..."
                placeholderTextColor="#6a7282"
                value={stateSearch}
                onChangeText={setStateSearch}
              />
              <Icon name="magnify" size={20} color="#6a7282" style={sharedStyles.modalSearchIcon} />
            </View>
            <FlatList
              data={filteredStates}
              keyExtractor={(item) => item}
              keyboardShouldPersistTaps="handled"
              renderItem={({ item }) => (
                <TouchableOpacity
                  style={[sharedStyles.modalOpt, { paddingVertical: 12, minHeight: 40 }]}
                  onPress={() => {
                    setField('state', item);
                    setStateDropdownOpen(false);
                    setStateSearch('');
                  }}
                >
                  <Text style={sharedStyles.modalOptTxt}>{item}</Text>
                </TouchableOpacity>
              )}
            />
          </View>
        </TouchableOpacity>
      </Modal>
      <Modal
        visible={groupDropdownOpen}
        transparent
        animationType="fade"
        onRequestClose={() => {
          setGroupDropdownOpen(false);
          setGroupSearch('');
        }}
      >
        <TouchableOpacity style={sharedStyles.modalOverlay} activeOpacity={1} onPress={() => { setGroupDropdownOpen(false); setGroupSearch(''); }}>
          <View style={[sharedStyles.modalContentFullWidth, { marginBottom: insets.bottom + 80 }]} onStartShouldSetResponder={() => true}>
            <View style={sharedStyles.modalHeaderRow}>
              <Text style={sharedStyles.modalHeaderTitle}>Select Group</Text>
              <TouchableOpacity style={sharedStyles.modalHeaderClose} onPress={() => { setGroupDropdownOpen(false); setGroupSearch(''); }}>
                <Icon name="close" size={22} color="#ffffff" />
              </TouchableOpacity>
            </View>
            <View style={sharedStyles.modalSearchRow}>
              <TextInput style={sharedStyles.modalSearchInput} placeholder="Search groups..." placeholderTextColor="#6a7282" value={groupSearch} onChangeText={setGroupSearch} />
              <Icon name="magnify" size={20} color="#6a7282" style={sharedStyles.modalSearchIcon} />
            </View>
            <FlatList
              data={filteredGroupNames}
              keyExtractor={(item) => item}
              keyboardShouldPersistTaps="handled"
              ListEmptyComponent={<Text style={sharedStyles.modalEmpty}>No matches found</Text>}
              renderItem={({ item }) => (
                <TouchableOpacity style={[sharedStyles.modalOpt, { paddingVertical: 12, minHeight: 40 }]} onPress={() => { setField('group', item); setGroupDropdownOpen(false); setGroupSearch(''); }}>
                  <Text style={sharedStyles.modalOptTxt}>{item}</Text>
                </TouchableOpacity>
              )}
            />
          </View>
        </TouchableOpacity>
      </Modal>
      <Modal
        visible={priceLevelDropdownOpen}
        transparent
        animationType="fade"
        onRequestClose={() => {
          setPriceLevelDropdownOpen(false);
          setPriceLevelSearch('');
        }}
      >
        <TouchableOpacity style={sharedStyles.modalOverlay} activeOpacity={1} onPress={() => { setPriceLevelDropdownOpen(false); setPriceLevelSearch(''); }}>
          <View style={[sharedStyles.modalContentFullWidth, { marginBottom: insets.bottom + 80 }]} onStartShouldSetResponder={() => true}>
            <View style={sharedStyles.modalHeaderRow}>
              <Text style={sharedStyles.modalHeaderTitle}>Select Price Level</Text>
              <TouchableOpacity style={sharedStyles.modalHeaderClose} onPress={() => { setPriceLevelDropdownOpen(false); setPriceLevelSearch(''); }}>
                <Icon name="close" size={22} color="#ffffff" />
              </TouchableOpacity>
            </View>
            <View style={sharedStyles.modalSearchRow}>
              <TextInput style={sharedStyles.modalSearchInput} placeholder="Search price levels..." placeholderTextColor="#6a7282" value={priceLevelSearch} onChangeText={setPriceLevelSearch} />
              <Icon name="magnify" size={20} color="#6a7282" style={sharedStyles.modalSearchIcon} />
            </View>
            <FlatList
              data={filteredPriceLevelNames}
              keyExtractor={(item) => item}
              keyboardShouldPersistTaps="handled"
              ListEmptyComponent={<Text style={sharedStyles.modalEmpty}>No matches found</Text>}
              renderItem={({ item }) => (
                <TouchableOpacity style={[sharedStyles.modalOpt, { paddingVertical: 12, minHeight: 40 }]} onPress={() => { setField('priceLevel', item); setPriceLevelDropdownOpen(false); setPriceLevelSearch(''); }}>
                  <Text style={sharedStyles.modalOptTxt}>{item}</Text>
                </TouchableOpacity>
              )}
            />
          </View>
        </TouchableOpacity>
      </Modal>
      <Modal
        visible={enterpriseTypeDropdownOpen}
        transparent
        animationType="fade"
        onRequestClose={() => {
          setEnterpriseTypeDropdownOpen(false);
          setEnterpriseTypeSearch('');
        }}
      >
        <TouchableOpacity style={sharedStyles.modalOverlay} activeOpacity={1} onPress={() => { setEnterpriseTypeDropdownOpen(false); setEnterpriseTypeSearch(''); }}>
          <View style={[sharedStyles.modalContentFullWidth, { marginBottom: insets.bottom + 80 }]} onStartShouldSetResponder={() => true}>
            <View style={sharedStyles.modalHeaderRow}>
              <Text style={sharedStyles.modalHeaderTitle}>Select Enterprise Type</Text>
              <TouchableOpacity style={sharedStyles.modalHeaderClose} onPress={() => { setEnterpriseTypeDropdownOpen(false); setEnterpriseTypeSearch(''); }}>
                <Icon name="close" size={22} color="#ffffff" />
              </TouchableOpacity>
            </View>
            <View style={sharedStyles.modalSearchRow}>
              <TextInput style={sharedStyles.modalSearchInput} placeholder="Search enterprise types..." placeholderTextColor="#6a7282" value={enterpriseTypeSearch} onChangeText={setEnterpriseTypeSearch} />
              <Icon name="magnify" size={20} color="#6a7282" style={sharedStyles.modalSearchIcon} />
            </View>
            <FlatList
              data={filteredEnterpriseTypeNames}
              keyExtractor={(item) => item}
              keyboardShouldPersistTaps="handled"
              ListEmptyComponent={<Text style={sharedStyles.modalEmpty}>No matches found</Text>}
              renderItem={({ item }) => (
                <TouchableOpacity style={[sharedStyles.modalOpt, { paddingVertical: 12, minHeight: 40 }]} onPress={() => { setField('typeOfEnterprise', item); setEnterpriseTypeDropdownOpen(false); setEnterpriseTypeSearch(''); }}>
                  <Text style={sharedStyles.modalOptTxt}>{item}</Text>
                </TouchableOpacity>
              )}
            />
          </View>
        </TouchableOpacity>
      </Modal>
      <Modal
        visible={activityTypeDropdownOpen}
        transparent
        animationType="fade"
        onRequestClose={() => {
          setActivityTypeDropdownOpen(false);
          setActivityTypeSearch('');
        }}
      >
        <TouchableOpacity style={sharedStyles.modalOverlay} activeOpacity={1} onPress={() => { setActivityTypeDropdownOpen(false); setActivityTypeSearch(''); }}>
          <View style={[sharedStyles.modalContentFullWidth, { marginBottom: insets.bottom + 80 }]} onStartShouldSetResponder={() => true}>
            <View style={sharedStyles.modalHeaderRow}>
              <Text style={sharedStyles.modalHeaderTitle}>Select Activity Type</Text>
              <TouchableOpacity style={sharedStyles.modalHeaderClose} onPress={() => { setActivityTypeDropdownOpen(false); setActivityTypeSearch(''); }}>
                <Icon name="close" size={22} color="#ffffff" />
              </TouchableOpacity>
            </View>
            <View style={sharedStyles.modalSearchRow}>
              <TextInput style={sharedStyles.modalSearchInput} placeholder="Search activity types..." placeholderTextColor="#6a7282" value={activityTypeSearch} onChangeText={setActivityTypeSearch} />
              <Icon name="magnify" size={20} color="#6a7282" style={sharedStyles.modalSearchIcon} />
            </View>
            <FlatList
              data={filteredActivityTypeNames}
              keyExtractor={(item) => item}
              keyboardShouldPersistTaps="handled"
              ListEmptyComponent={<Text style={sharedStyles.modalEmpty}>No matches found</Text>}
              renderItem={({ item }) => (
                <TouchableOpacity style={[sharedStyles.modalOpt, { paddingVertical: 12, minHeight: 40 }]} onPress={() => { setField('activityType', item); setActivityTypeDropdownOpen(false); setActivityTypeSearch(''); }}>
                  <Text style={sharedStyles.modalOptTxt}>{item}</Text>
                </TouchableOpacity>
              )}
            />
          </View>
        </TouchableOpacity>
      </Modal>
      <Modal
        visible={deducteeTypeDropdownOpen}
        transparent
        animationType="fade"
        onRequestClose={() => {
          setDeducteeTypeDropdownOpen(false);
          setDeducteeTypeSearch('');
        }}
      >
        <TouchableOpacity style={sharedStyles.modalOverlay} activeOpacity={1} onPress={() => { setDeducteeTypeDropdownOpen(false); setDeducteeTypeSearch(''); }}>
          <View style={[sharedStyles.modalContentFullWidth, { marginBottom: insets.bottom + 80 }]} onStartShouldSetResponder={() => true}>
            <View style={sharedStyles.modalHeaderRow}>
              <Text style={sharedStyles.modalHeaderTitle}>Select Deductee Type</Text>
              <TouchableOpacity style={sharedStyles.modalHeaderClose} onPress={() => { setDeducteeTypeDropdownOpen(false); setDeducteeTypeSearch(''); }}>
                <Icon name="close" size={22} color="#ffffff" />
              </TouchableOpacity>
            </View>
            <View style={sharedStyles.modalSearchRow}>
              <TextInput style={sharedStyles.modalSearchInput} placeholder="Search deductee types..." placeholderTextColor="#6a7282" value={deducteeTypeSearch} onChangeText={setDeducteeTypeSearch} />
              <Icon name="magnify" size={20} color="#6a7282" style={sharedStyles.modalSearchIcon} />
            </View>
            <FlatList
              data={filteredDeducteeTypeNames}
              keyExtractor={(item) => item}
              keyboardShouldPersistTaps="handled"
              ListEmptyComponent={<Text style={sharedStyles.modalEmpty}>No matches found</Text>}
              renderItem={({ item }) => (
                <TouchableOpacity style={[sharedStyles.modalOpt, { paddingVertical: 12, minHeight: 40 }]} onPress={() => { setField('deducteeType', item); setDeducteeTypeDropdownOpen(false); setDeducteeTypeSearch(''); }}>
                  <Text style={sharedStyles.modalOptTxt}>{item}</Text>
                </TouchableOpacity>
              )}
            />
          </View>
        </TouchableOpacity>
      </Modal>
      <Modal
        visible={bankNameDropdownOpen}
        transparent
        animationType="fade"
        onRequestClose={() => {
          setBankNameDropdownOpen(false);
          setBankNameSearch('');
          setExtraBankNameDropdownIndex(null);
        }}
      >
        <TouchableOpacity
          style={sharedStyles.modalOverlay}
          activeOpacity={1}
          onPress={() => {
            setBankNameDropdownOpen(false);
            setBankNameSearch('');
            setExtraBankNameDropdownIndex(null);
          }}
        >
          <View style={[sharedStyles.modalContentFullWidth, { marginBottom: insets.bottom + 80 }]} onStartShouldSetResponder={() => true}>
            <View style={sharedStyles.modalHeaderRow}>
              <Text style={sharedStyles.modalHeaderTitle}>Select Bank Name</Text>
              <TouchableOpacity
                style={sharedStyles.modalHeaderClose}
                onPress={() => {
                  setBankNameDropdownOpen(false);
                  setBankNameSearch('');
                  setExtraBankNameDropdownIndex(null);
                }}
              >
                <Icon name="close" size={22} color="#ffffff" />
              </TouchableOpacity>
            </View>
            <View style={sharedStyles.modalSearchRow}>
              <TextInput style={sharedStyles.modalSearchInput} placeholder="Search banks..." placeholderTextColor="#6a7282" value={bankNameSearch} onChangeText={setBankNameSearch} />
              <Icon name="magnify" size={20} color="#6a7282" style={sharedStyles.modalSearchIcon} />
            </View>
            <FlatList
              data={filteredBankNames}
              keyExtractor={(item) => item}
              keyboardShouldPersistTaps="handled"
              ListEmptyComponent={<Text style={sharedStyles.modalEmpty}>No matches found</Text>}
              renderItem={({ item }) => (
                <TouchableOpacity
                  style={[sharedStyles.modalOpt, { paddingVertical: 12, minHeight: 40 }]}
                  onPress={() => {
                    if (extraBankNameDropdownIndex !== null) {
                      setAdditionalBankField(extraBankNameDropdownIndex, 'bankName', item);
                    } else {
                      setField('bankName', item);
                    }
                    setBankNameDropdownOpen(false);
                    setBankNameSearch('');
                    setExtraBankNameDropdownIndex(null);
                  }}
                >
                  <Text style={sharedStyles.modalOptTxt}>{item}</Text>
                </TouchableOpacity>
              )}
            />
          </View>
        </TouchableOpacity>
      </Modal>
    </View>
  );
}

function MasterCreationScreen() {
  const insets = useSafeAreaInsets();
  return (
    <View style={{ flex: 1 }}>
      <MasterCreation />
      {Platform.OS === 'android' && insets.bottom > 0 && (
        <View
          style={{ position: 'absolute', bottom: 0, left: 0, right: 0, height: insets.bottom, backgroundColor: '#ffffff' }}
          pointerEvents="none"
        />
      )}
    </View>
  );
}

export { MasterCreationScreen };

type FieldProps = {
  label: string;
  placeholder: string;
  value: string;
  onChangeText: (value: string) => void;
  required?: boolean;
  multiline?: boolean;
  keyboardType?: 'default' | 'number-pad' | 'phone-pad' | 'email-address';
  autoCapitalize?: 'none' | 'sentences' | 'words' | 'characters';
  half?: boolean;
  status?: DuplicateState;
  bubble?: { text: string; type: BubbleType } | null;
  editable?: boolean;
};

function Field({
  label,
  placeholder,
  value,
  onChangeText,
  required = false,
  multiline = false,
  keyboardType = 'default',
  autoCapitalize = 'sentences',
  half = false,
  status = 'idle',
  bubble = null,
  editable = true,
}: FieldProps) {
  const showStatusIcon = status === 'ok' || status === 'duplicate';
  return (
    <View style={[styles.fieldWrap, half && styles.halfField]}>
      <Text style={styles.label}>
        {label}
        {required ? <Text style={styles.required}>*</Text> : null}
      </Text>
      <View style={styles.inputWrap}>
        <TextInput
          style={[styles.input, multiline && styles.multilineInput, showStatusIcon && !multiline && styles.inputWithStatus]}
          placeholder={placeholder}
          placeholderTextColor="#6a7282"
          value={value}
          onChangeText={onChangeText}
          multiline={multiline}
          keyboardType={keyboardType}
          autoCapitalize={autoCapitalize}
          editable={editable}
        />
        {showStatusIcon && !multiline ? (
          <View style={styles.statusIconWrap}>
            <Icon
              name={status === 'ok' ? 'check-circle' : 'close-circle'}
              size={18}
              color={status === 'ok' ? '#39b57c' : '#ef4444'}
            />
          </View>
        ) : null}
      </View>
      {bubble && showStatusIcon && !multiline ? (
        <Text style={[styles.statusHintText, bubble.type === 'success' ? styles.statusHintSuccess : styles.statusHintError]}>
          {bubble.text}
        </Text>
      ) : null}
    </View>
  );
}

function CheckRow({
  label,
  checked,
  onToggle,
}: {
  label: string;
  checked: boolean;
  onToggle: () => void;
}) {
  return (
    <View style={styles.checkRow}>
      <TouchableOpacity onPress={onToggle} activeOpacity={0.8}>
        <View style={[styles.checkBox, checked && styles.checkBoxChecked]}>
          {checked ? <Icon name="check" size={12} color="#ffffff" /> : null}
        </View>
      </TouchableOpacity>
      <Text style={styles.checkLabel}>{label}</Text>
    </View>
  );
}

function SelectLike({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.fieldWrap}>
      {label ? <Text style={styles.label}>{label}</Text> : null}
      <TouchableOpacity style={styles.input} activeOpacity={0.8}>
        <Text style={[styles.inputText, !value && styles.placeholder]}>{value || 'Select'}</Text>
        <Icon name="chevron-down" size={18} color="#6a7282" />
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#ffffff' },
  content: { paddingHorizontal: 16, gap: 12 },
  row: { flexDirection: 'row', gap: 12 },
  halfField: { flex: 1 },
  fieldWrap: { width: '100%' },
  label: { color: '#0e172b', fontSize: 14, marginBottom: 6, fontFamily: 'Roboto' },
  required: { fontWeight: '700' },
  input: {
    minHeight: 44,
    borderWidth: 1,
    borderColor: '#d3d3d3',
    borderRadius: 6,
    paddingHorizontal: 12,
    paddingVertical: 10,
    color: '#0e172b',
    fontSize: 15,
    fontFamily: 'Roboto',
    justifyContent: 'space-between',
    flexDirection: 'row',
    alignItems: 'center',
  },
  inputText: { color: '#0e172b', fontSize: 15, fontFamily: 'Roboto' },
  invalidInput: { borderColor: '#dc2626' },
  readOnlyInput: { backgroundColor: '#f8fafc' },
  inputWrap: { position: 'relative' },
  statusIconWrap: { position: 'absolute', right: 12, top: 13 },
  inputWithStatus: { paddingRight: 40 },
  statusHintText: {
    alignSelf: 'flex-end',
    marginTop: 4,
    fontSize: 12,
    fontFamily: 'Roboto',
  },
  statusHintSuccess: { color: '#15803d' },
  statusHintError: { color: '#dc2626' },
  placeholder: { color: '#6a7282' },
  multilineInput: { minHeight: 86, textAlignVertical: 'top' },
  whatsappRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 4 },
  whatsappLabel: { color: '#0e172b', fontSize: 13, fontFamily: 'Roboto', flex: 1 },
  dropdown: {
    borderWidth: 1,
    borderColor: '#d3d3d3',
    borderRadius: 6,
    marginTop: 4,
    overflow: 'hidden',
    backgroundColor: '#fff',
  },
  dropdownItem: { paddingHorizontal: 12, paddingVertical: 10 },
  clearButton: {
    marginTop: 8,
    height: 48,
    borderRadius: 6,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#d3d3d3',
  },
  clearButtonText: { color: '#0e172b', fontSize: 15, fontWeight: '500' },
  nextButton: {
    height: 48,
    borderRadius: 6,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#f1c74b',
  },
  nextButtonText: { color: '#0e172b', fontSize: 15, fontWeight: '500' },
  saveButton: {
    height: 48,
    borderRadius: 6,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#39b57c',
  },
  saveButtonDisabled: {
    backgroundColor: '#9ca3af',
  },
  saveButtonText: { color: '#ffffff', fontSize: 15, fontWeight: '600' },
  sectionTitle: { color: '#1e488f', fontSize: 26 / 1.529, fontWeight: '700', marginTop: 8, fontFamily: 'Roboto' },
  checkRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 2 },
  checkLabel: { flex: 1, color: '#0e172b', fontSize: 14, fontFamily: 'Roboto' },
  nestedOptionBlock: { marginLeft: 16, marginTop: 2 },
  checkBox: {
    width: 17,
    height: 17,
    borderRadius: 3,
    borderWidth: 1,
    borderColor: '#d3d3d3',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#ffffff',
  },
  checkBoxChecked: {
    backgroundColor: '#1e488f',
    borderColor: '#1e488f',
  },
  // Match inline Payment Mode dropdown style from Expense Claims
  selectBoxLikeExpense: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: '#d3d3d3',
    borderRadius: 4,
    padding: 12,
    minHeight: 44,
    gap: 8,
  },
  inlineDropdownLikeExpense: {
    marginTop: 6,
    borderWidth: 1,
    borderColor: '#d3d3d3',
    borderRadius: 4,
    backgroundColor: '#ffffff',
    overflow: 'hidden',
  },
  inlineDropdownScrollLikeExpense: {
    maxHeight: 220,
  },
  inlineDropdownItemLikeExpense: {
    paddingHorizontal: 12,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#eef2f7',
  },
  inlineDropdownItemTextLikeExpense: {
    fontFamily: 'Roboto',
    fontSize: 14,
    color: '#0e172b',
  },
  searchInputLikeExpense: {
    flex: 1,
    padding: 0,
    margin: 0,
    fontFamily: 'Roboto',
    fontSize: 14,
    color: '#0e172b',
  },
  emptyDropdownTextLikeExpense: {
    paddingHorizontal: 12,
    paddingVertical: 12,
    fontFamily: 'Roboto',
    fontSize: 13,
    color: '#6a7282',
  },
  recordLocationButton: {
    height: 42,
    borderWidth: 1,
    borderColor: '#c8d6ea',
    borderRadius: 6,
    backgroundColor: '#eef4ff',
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: 8,
  },
  recordLocationButtonText: {
    fontFamily: 'Roboto',
    fontSize: 14,
    color: '#1e488f',
    fontWeight: '600',
  },
  addBankDetailsButton: {
    marginTop: 6,
    height: 42,
    borderWidth: 1,
    borderColor: '#c8d6ea',
    borderRadius: 6,
    backgroundColor: '#eef4ff',
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: 8,
  },
  addBankDetailsButtonText: {
    fontFamily: 'Roboto',
    fontSize: 14,
    color: '#1e488f',
    fontWeight: '600',
  },
  extraBankWrap: {
    marginTop: 12,
  },
  bankHeadingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  phoneRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  countryCodeBox: {
    width: 86,
    minHeight: 44,
    justifyContent: 'flex-start',
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  countryCodePlus: {
    fontFamily: 'Roboto',
    fontSize: 15,
    color: '#0e172b',
    marginRight: 4,
  },
  countryCodeInput: {
    flex: 1,
    fontFamily: 'Roboto',
    fontSize: 15,
    color: '#0e172b',
    padding: 0,
  },
  phoneNumberInput: {
    flex: 1,
  },
  removeBankText: {
    fontFamily: 'Roboto',
    fontSize: 13,
    color: '#d12f2f',
    fontWeight: '600',
  },
  countryRow: { flexDirection: 'row', alignItems: 'center' },
  countryFlag: { width: 20, height: 14, borderRadius: 2, marginRight: 10, backgroundColor: '#f2f4f5' },
});

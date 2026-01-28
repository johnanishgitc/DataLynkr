import type { NativeStackScreenProps } from '@react-navigation/native-stack';

export type AuthStackParamList = {
  Login: undefined;
  Signup: undefined;
  ForgotPassword: undefined;
};

export type HomeStackParamList = {
  Home: undefined;
  CacheManagement: undefined;
  CacheManagement2: undefined;
  SalesDashboard: undefined;
  ComingSoon: { tab_name: string };
};

export type LedgerStackParamList = {
  LedgerMain: undefined;
  LedgerEntries: {
    ledger_name?: string;
    report_name?: string;
    from_date?: number;
    to_date?: number;
  };
  VoucherDetails: {
    voucher: object;
    ledger_name?: string;
    report_name?: string;
    from_date?: number;
    to_date?: number;
  };
};

export type OrdersStackParamList = {
  ComingSoon: { tab_name: string };
};

export type ApprovalsStackParamList = {
  ComingSoon: { tab_name: string };
};

export type MainTabsParamList = {
  HomeTab: undefined;
  OrdersTab: undefined;
  LedgerTab: undefined;
  ApprovalsTab: undefined;
};

export type MainStackParamList = {
  AdminDashboard: undefined;
  MainTabs: undefined;
};

export type RootStackParamList = {
  Auth: undefined;
  Main: undefined;
};

export type AuthStackScreenProps<T extends keyof AuthStackParamList> = NativeStackScreenProps<
  AuthStackParamList,
  T
>;
export type HomeStackScreenProps<T extends keyof HomeStackParamList> = NativeStackScreenProps<
  HomeStackParamList,
  T
>;
export type LedgerStackScreenProps<T extends keyof LedgerStackParamList> = NativeStackScreenProps<
  LedgerStackParamList,
  T
>;

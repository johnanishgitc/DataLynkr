# DataLynkr

A React Native app for ledger management with authentication, company connections, ledger book, voucher details, cache management, and export (PDF, Excel, Print). Supports **Android** and **iOS**.

## Features

- **Authentication**: Login, Signup, Forgot Password with API integration
- **Admin Dashboard**: List user connections, search, select company
- **Home**: Navigate to Ledger Book, Cache management, Sales Dashboard, Orders, Approvals (coming soon)
- **Ledger**: Cache-first ledger list, filter by ledger/report/date range, ledger entries table, voucher details with bill/inventory allocations
- **Cache Management**: View stats, list/delete entries, sales download, cache expiry, clear all/company/sales
- **Export**: PDF, Excel, Print from Ledger Entries

## API

- **Base URL**: `https://itcatalystindia.com/Development/CustomerPortal_API/`
- Endpoints: `api/login`, `api/signup`, `api/forget-password`, `api/tally/ledgerlist-w-addrs`, `api/tally/led_statbillrep`, `api/tally/user-connections`, `api/tally/voucherdata/getvoucherdata`, `api/reports/salesextract`, and others.

## Setup

### Prerequisites

- Node.js >= 18
- For Android: Android Studio, JDK 17, Android SDK (API 24+)
- For iOS: Xcode, CocoaPods

### Install

```bash
npm install --legacy-peer-deps
```

### iOS

```bash
cd ios && pod install && cd ..
```

### Run

**Start Metro:**

```bash
npm start
```

**Android:**

```bash
npm run android
```

**iOS:**

```bash
npm run ios
```

## Project structure

```
src/
├── api/           # API client, models, deserializers
├── cache/         # CacheManager, CacheUtils, CacheSyncManager, SQLite
├── components/    # SearchableDropdown, DatePickerDropdown, ExportMenu, VoucherTypeDropdown
├── constants/     # colors, strings
├── navigation/    # Auth, Main, Tabs, Stacks
├── screens/       # Login, Signup, ForgotPassword, AdminDashboard, Home, LedgerMain, LedgerEntries, VoucherDetails, CacheManagement, ComingSoon
├── store/         # AsyncStorage wrapper, AuthContext
└── utils/         # dateUtils
```

## Build / config

- **Android**: `applicationId` `com.datalynkr`, `minSdk` 24, `targetSdk` 34. Permissions: `INTERNET`, `ACCESS_NETWORK_STATE`. Vector icons: `react-native-vector-icons/fonts.gradle` applied in `android/app/build.gradle`.
- **iOS**: Run `pod install` in `ios/`. For `react-native-vector-icons`, ensure fonts are linked (see package docs if icons are missing).

## Scripts

- `npm start` – Metro bundler
- `npm run android` – Run on Android
- `npm run ios` – Run on iOS
- `npm run lint` – ESLint
- `npm test` – Jest

import AsyncStorage from '@react-native-async-storage/async-storage';

const PREFS = 'DataLynkrPrefs';

// Keys
const K = {
  auth_token: '@DataLynkr/auth_token',
  is_logged_in: '@DataLynkr/is_logged_in',
  user_name: '@DataLynkr/user_name',
  user_email: '@DataLynkr/user_email',
  user_id: '@DataLynkr/user_id',
  user_mobile: '@DataLynkr/user_mobile',
  tallyloc_id: '@DataLynkr/tallyloc_id',
  company: '@DataLynkr/company',
  guid: '@DataLynkr/guid',
  conn_name: '@DataLynkr/conn_name',
  shared_email: '@DataLynkr/shared_email',
  status: '@DataLynkr/status',
  access_type: '@DataLynkr/access_type',
  address: '@DataLynkr/address',
  pincode: '@DataLynkr/pincode',
  statename: '@DataLynkr/statename',
  countryname: '@DataLynkr/countryname',
  company_email: '@DataLynkr/company_email',
  phonenumber: '@DataLynkr/phonenumber',
  mobilenumbers: '@DataLynkr/mobilenumbers',
  gstinno: '@DataLynkr/gstinno',
  startingfrom: '@DataLynkr/startingfrom',
  booksfrom: '@DataLynkr/booksfrom',
  lastvoucherdate: '@DataLynkr/lastvoucherdate',
  createdAt: '@DataLynkr/createdAt',
  cacheExpiryDays: '@DataLynkr/cacheExpiryDays',
  user_access_permissions: '@DataLynkr/user_access_permissions',
};

export const storage = {
  async getItem(key: string): Promise<string | null> {
    return AsyncStorage.getItem(key);
  },
  async setItem(key: string, value: string): Promise<void> {
    await AsyncStorage.setItem(key, value);
  },
  async removeItem(key: string): Promise<void> {
    await AsyncStorage.removeItem(key);
  },
  async clear(): Promise<void> {
    const all = await AsyncStorage.getAllKeys();
    const ours = all.filter((k) => k.startsWith('@DataLynkr/'));
    await AsyncStorage.multiRemove(ours);
  },
};

// Auth
export async function getAuthToken(): Promise<string | null> {
  return storage.getItem(K.auth_token);
}

export async function setAuthToken(token: string): Promise<void> {
  await storage.setItem(K.auth_token, token);
  await storage.setItem(K.is_logged_in, 'true');
}

export async function isLoggedIn(): Promise<boolean> {
  const v = await storage.getItem(K.is_logged_in);
  return v === 'true';
}

export async function setUserName(name: string): Promise<void> {
  await storage.setItem(K.user_name, name);
}

export async function setUserEmail(email: string): Promise<void> {
  await storage.setItem(K.user_email, email);
}

export async function getUserName(): Promise<string | null> {
  return storage.getItem(K.user_name);
}

export async function getUserEmail(): Promise<string | null> {
  return storage.getItem(K.user_email);
}

export async function logoutStorage(): Promise<void> {
  await storage.setItem(K.is_logged_in, 'false');
  await storage.removeItem(K.auth_token);
}

// Company (full)
export interface CompanyInfo {
  tallyloc_id: number;
  company: string;
  guid: string;
  conn_name: string;
  shared_email: string;
  status: string;
  access_type: string;
  address: string;
  pincode: string;
  statename: string;
  countryname: string;
  company_email: string;
  phonenumber: string;
  mobilenumbers: string;
  gstinno: string;
  startingfrom: string;
  booksfrom: string;
  createdAt: string;
}

export async function saveCompanyInfo(info: CompanyInfo): Promise<void> {
  await storage.setItem(K.tallyloc_id, String(info.tallyloc_id));
  await storage.setItem(K.company, info.company);
  await storage.setItem(K.guid, info.guid);
  await storage.setItem(K.conn_name, info.conn_name);
  await storage.setItem(K.shared_email, info.shared_email);
  await storage.setItem(K.status, info.status);
  await storage.setItem(K.access_type, info.access_type);
  await storage.setItem(K.address, info.address);
  await storage.setItem(K.pincode, info.pincode);
  await storage.setItem(K.statename, info.statename);
  await storage.setItem(K.countryname, info.countryname);
  await storage.setItem(K.company_email, info.company_email);
  await storage.setItem(K.phonenumber, info.phonenumber);
  await storage.setItem(K.mobilenumbers, info.mobilenumbers);
  await storage.setItem(K.gstinno, info.gstinno);
  await storage.setItem(K.startingfrom, info.startingfrom);
  await storage.setItem(K.booksfrom, info.booksfrom);
  await storage.setItem(K.createdAt, info.createdAt);
}

export async function getTallylocId(): Promise<number> {
  const v = await storage.getItem(K.tallyloc_id);
  if (v == null || v === '') return 0;
  const n = parseInt(v, 10);
  return isNaN(n) ? 0 : n;
}

export async function getCompany(): Promise<string> {
  return (await storage.getItem(K.company)) ?? '';
}

export async function getGuid(): Promise<string> {
  return (await storage.getItem(K.guid)) ?? '';
}

/** Books from date (YYYYMMDD) for cache date ranges. */
export async function getBooksfrom(): Promise<string> {
  return (await storage.getItem(K.booksfrom)) ?? '';
}

/** Last voucher date (YYYYMMDD). Defaults to today if not set. */
export async function getLastVoucherDate(): Promise<string> {
  const stored = await storage.getItem(K.lastvoucherdate);
  if (stored) return stored;
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}${m}${day}`;
}

export async function setLastVoucherDate(value: string): Promise<void> {
  await storage.setItem(K.lastvoucherdate, value);
}

// Cache config
export async function getCacheExpiryDays(): Promise<string> {
  return (await storage.getItem(K.cacheExpiryDays)) ?? 'never';
}

export async function setCacheExpiryDays(days: string): Promise<void> {
  const v = days == null || days === '' || days === 'never' ? 'never' : String(days);
  await storage.setItem(K.cacheExpiryDays, v);
}

// User access permissions
export async function saveUserAccessPermissions(permissions: Record<string, boolean>): Promise<void> {
  await storage.setItem(K.user_access_permissions, JSON.stringify(permissions));
}

export async function getUserAccessPermissions(): Promise<Record<string, boolean>> {
  const raw = await storage.getItem(K.user_access_permissions);
  if (!raw) return {};
  try {
    return JSON.parse(raw) as Record<string, boolean>;
  } catch {
    return {};
  }
}

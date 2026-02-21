import axios, { AxiosInstance, InternalAxiosRequestConfig } from 'axios';
import type {
  LoginRequest,
  LoginResponse,
  SignupRequest,
  SignupResponse,
  ForgotPasswordRequest,
  ForgotPasswordResponse,
  LedgerListRequest,
  LedgerListResponse,
  LedgerReportRequest,
  LedgerReportResponse,
  UserConnectionsResponse,
  VoucherDataRequest,
  VoucherDataResponse,
  VoucherViewRequest,
  SalesExtractRequest,
  SalesExtractResponse,
  VoucherSyncRequest,
  VoucherSyncResponse,
  DeletedVouchersRequest,
  DeletedVouchersResponse,
  StockItemRequest,
  StockItemResponse,
  ExternalUserCacheEnabledResponse,
  SalesOrderOutstandingRequest,
  SalesOrderOutstandingResponse,
  GodownStockRequest,
  GodownStockResponse,
  CompanyStockRequest,
  CompanyStockResponse,
  SalesOrderReportRequest,
  SalesOrderReportResponse,
  VoucherTypeRequest,
  VoucherTypeResponse,
  CreditDaysLimitRequest,
  CreditDaysLimitResponse,
  GodownListRequest,
  GodownListResponse,
  ItemwiseBatchwiseBalRequest,
  ItemwiseBatchwiseBalResponse,
  PlaceOrderRequest,
  PlaceOrderResponse,
  PendVchAuthRequest,
  PendVchAuthResponse,
  VchAuthActionRequest,
  VchAuthActionResponse,
} from './models';

const BASE_URL = 'https://itcatalystindia.com/Development/CustomerPortal_API/';

export type GetToken = () => Promise<string | null>;
export type OnUnauthorized = () => void;

let getToken: GetToken = async () => null;
let onUnauthorized: OnUnauthorized = () => { };

export function setAuthHandlers(tokenFn: GetToken, unauthFn: OnUnauthorized) {
  getToken = tokenFn;
  onUnauthorized = unauthFn;
}

function createClient(timeoutMs = 60000): AxiosInstance {
  const client = axios.create({
    baseURL: BASE_URL,
    headers: { 'Content-Type': 'application/json' },
    timeout: timeoutMs,
  });

  client.interceptors.request.use(
    async (config: InternalAxiosRequestConfig) => {
      const token = await getToken();
      if (token) {
        config.headers.Authorization = `Bearer ${token}`;
      }

      // Log API request
      const method = config.method?.toUpperCase() || 'GET';
      const url = `${config.baseURL || ''}${config.url || ''}`;
      const params = config.params ? `?${new URLSearchParams(config.params).toString()}` : '';
      console.log(`[API REQUEST] ${method} ${url}${params}`);
      if (config.data && method !== 'GET') {
        const dataStr = typeof config.data === 'string' ? config.data : JSON.stringify(config.data);
        const preview = dataStr.length > 200 ? dataStr.slice(0, 200) + '...' : dataStr;
        console.log(`[API REQUEST] Body: ${preview}`);
      }

      return config;
    },
    (e) => Promise.reject(e)
  );

  client.interceptors.response.use(
    (r) => {
      // Log successful API response
      const method = r.config.method?.toUpperCase() || 'GET';
      const url = `${r.config.baseURL || ''}${r.config.url || ''}`;
      const status = r.status;
      const dataSize = r.data ? JSON.stringify(r.data).length : 0;
      console.log(`[API RESPONSE] ${method} ${url} → ${status} (${dataSize} bytes)`);
      return r;
    },
    (e) => {
      // Log API error
      const method = e?.config?.method?.toUpperCase() || 'GET';
      const url = e?.config ? `${e.config.baseURL || ''}${e.config.url || ''}` : 'unknown';
      const status = e?.response?.status || 'NO_RESPONSE';
      const message = e?.response?.data?.error || e?.response?.data?.message || e?.message || 'Unknown error';
      console.warn(`[API ERROR] ${method} ${url} → ${status}: ${message}`);

      // Enhance error object with network error detection
      if (e && typeof e === 'object') {
        // Check for network errors (no response, timeout, connection issues)
        const isNetworkError =
          status === 'NO_RESPONSE' ||
          e.code === 'ECONNABORTED' ||
          e.code === 'ERR_NETWORK' ||
          e.code === 'NETWORK_ERROR' ||
          message.includes('Network') ||
          message.includes('network') ||
          message.includes('timeout') ||
          message.includes('Timeout');

        if (isNetworkError) {
          (e as { isNetworkError?: boolean }).isNetworkError = true;
        }
      }

      if (e?.response?.status === 401) {
        onUnauthorized();
      }
      return Promise.reject(e);
    }
  );

  return client;
}

let api: AxiosInstance | null = null;

function getApi(): AxiosInstance {
  if (!api) api = createClient();
  return api;
}

// Separate client for long-running download requests with extended timeout
let downloadApi: AxiosInstance | null = null;
function getDownloadApi(): AxiosInstance {
  if (!downloadApi) {
    downloadApi = createClient(300000); // 5 minutes timeout for downloads
    // Copy interceptors from main client
    downloadApi.interceptors.request.use(
      async (config: InternalAxiosRequestConfig) => {
        const token = await getToken();
        if (token) {
          config.headers.Authorization = `Bearer ${token}`;
        }
        return config;
      },
      (e) => Promise.reject(e)
    );
    downloadApi.interceptors.response.use(
      (r) => r,
      (e) => {
        if (e?.response?.status === 401) {
          onUnauthorized();
        }
        return Promise.reject(e);
      }
    );
  }
  return downloadApi;
}

export const apiService = {
  login: (body: LoginRequest) =>
    getApi().post<LoginResponse>('api/login', body),

  signup: (body: SignupRequest) =>
    getApi().post<SignupResponse>('api/signup', body),

  forgotPassword: (body: ForgotPasswordRequest) =>
    getApi().post<ForgotPasswordResponse>('api/forget-password', body),

  getLedgerList: (body: LedgerListRequest) =>
    getApi().post<LedgerListResponse>('api/tally/ledgerlist-w-addrs', body),

  getLedgerReport: (body: LedgerReportRequest) =>
    getApi().post<LedgerReportResponse>('api/tally/led_statbillrep', body),

  /** Sales Order Ledger Outstandings (orders outstanding) */
  getSalesOrderOutstanding: (body: SalesOrderOutstandingRequest) =>
    getApi().post<SalesOrderOutstandingResponse>('api/tally/orders/ordersoutstanding', body),

  getUserConnections: () =>
    getApi().get<UserConnectionsResponse>('api/tally/user-connections'),

  getVoucherData: (body: VoucherDataRequest) =>
    getApi().post<VoucherDataResponse>('api/tally/voucherdata/getvoucherdata', body),

  /** Voucher view – returns HTML string. */
  getVoucherView: (body: VoucherViewRequest) =>
    getApi().post<string>('api/tally/vchauth/voucherview', body, { responseType: 'text' }),

  getSalesExtract: (body: SalesExtractRequest, ts?: number) =>
    getDownloadApi().post<SalesExtractResponse>('api/reports/salesextract', body, {
      params: ts != null ? { ts } : undefined,
    }),

  syncVouchers: (body: VoucherSyncRequest, ts?: number) =>
    getApi().post<VoucherSyncResponse>('api/reports/voucherextract_sync', body, {
      params: ts != null ? { ts } : undefined,
    }),

  getDeletedVouchers: (body: DeletedVouchersRequest, ts?: number) =>
    getApi().post<DeletedVouchersResponse>('api/reports/deletedvouchers', body, {
      params: ts != null ? { ts } : undefined,
    }),

  getStockItems: (body: StockItemRequest, ts?: number) =>
    getApi().post<StockItemResponse>('api/tally/stockitem', body, {
      params: ts != null ? { ts } : undefined,
    }),

  getExternalUserCacheEnabled: (email: string, ts?: number) =>
    getApi().get<ExternalUserCacheEnabledResponse>('api/tally/external-user-cache-enabled', {
      params: { email, ...(ts != null && { ts }) },
    }),

  /** Godown-wise stock breakdown for an item */
  getGodownStock: (body: GodownStockRequest) =>
    getApi().post<GodownStockResponse>('api/tally/godownStock', body),

  /** Company-wise stock breakdown for an item */
  getCompanyStock: (body: CompanyStockRequest) =>
    getApi().post<CompanyStockResponse>('api/tally/companystock', body),

  /** Past Orders: sales order list by date range */
  getSalesOrderReport: (body: SalesOrderReportRequest) =>
    getApi().post<SalesOrderReportResponse>('api/reports/salesorder', body),

  /** Voucher types list (NAME for dropdown); each has VOUCHERCLASSLIST[].CLASSNAME for Class */
  getVoucherTypes: (body: VoucherTypeRequest) =>
    getApi().post<VoucherTypeResponse>('api/tally/vouchertype', body),

  /** Credit limit and closing balance for a ledger (Order Entry) */
  getCreditDaysLimit: (body: CreditDaysLimitRequest) =>
    getApi().post<CreditDaysLimitResponse>('api/tally/creditdayslimit', body),

  /** Godown list for Order Entry Item Detail dropdown */
  getGodownList: (body: GodownListRequest) =>
    getApi().post<GodownListResponse>('api/tally/godown-list', body),

  /** Item-wise batch-wise balance for Batch dropdown and Mfd/Expiry (Order Entry Item Detail) */
  getItemwiseBatchwiseBal: (body: ItemwiseBatchwiseBalRequest) =>
    getApi().post<ItemwiseBatchwiseBalResponse>('api/tally/itemwise-batchwise-bal', body),

  /** Place order – create sales order in Tally */
  placeOrder: (body: PlaceOrderRequest) =>
    getApi().post<PlaceOrderResponse>('api/tally/place_order', body),

  /** Pending voucher authorizations (Approvals screen) */
  getPendVchAuth: (body: PendVchAuthRequest) =>
    getApi().post<PendVchAuthResponse>('api/tally/pend-vch-auth', body),

  /** Authorize (approve) a voucher */
  authVoucher: (body: VchAuthActionRequest) =>
    getApi().post<VchAuthActionResponse>('api/tally/vchauth/auth', body),

  /** Reject a voucher */
  rejectVoucher: (body: VchAuthActionRequest) =>
    getApi().post<VchAuthActionResponse>('api/tally/vchauth/reject', body),
};

export default apiService;

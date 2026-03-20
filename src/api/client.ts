import axios, { AxiosInstance, InternalAxiosRequestConfig } from 'axios';
import type {
  LoginRequest,
  LoginResponse,
  SignupRequest,
  SignupResponse,
  ForgotPasswordRequest,
  ForgotPasswordResponse,
  ChangePasswordRequest,
  ChangePasswordResponse,
  SendOtpRequest,
  SendOtpResponse,
  VerifyOtpRequest,
  VerifyOtpResponse,
  LedgerListRequest,
  LedgerListResponse,
  LedgerReportRequest,
  LedgerReportResponse,
  AccountingLedgerListRequest,
  AccountingLedgerListResponse,
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
  StockGroupsRequest,
  StockGroupsResponse,
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
  StockSummaryRequest,
  StockSummaryResponse,
  MonthlySummaryRequest,
  MonthlySummaryResponse,
  StockItemVouchersRequest,
  StockItemVouchersResponse,
  BankUpiRequest,
  BankUpiResponse,
} from './models';

const BASE_URL = 'https://itcatalystindia.com/Development/CustomerPortal_API/';

export type GetToken = () => Promise<string | null>;
export type OnUnauthorized = () => void;

/** Use in catch blocks to skip showing error UI when session expired (401); logout will redirect to login. */
export function isUnauthorizedError(e: unknown): boolean {
  if (e && typeof e === 'object') {
    const err = e as { response?: { status?: number }; isUnauthorized?: boolean };
    return err.response?.status === 401 || err.isUnauthorized === true;
  }
  return false;
}

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
      // Allow per-request token (e.g. change-password after background login)
      const existingAuth = config.headers?.Authorization;
      if (!existingAuth) {
        const token = await getToken();
        if (token) {
          config.headers.Authorization = `Bearer ${token}`;
        }
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
        (e as { isUnauthorized?: boolean }).isUnauthorized = true;
        const skipRedirect = (e.config as InternalAxiosRequestConfig & { skipUnauthorizedRedirect?: boolean })?.skipUnauthorizedRedirect;
        if (!skipRedirect) {
          onUnauthorized();
        }
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
          (e as { isUnauthorized?: boolean }).isUnauthorized = true;
          onUnauthorized();
        }
        return Promise.reject(e);
      }
    );
  }
  return downloadApi;
}

export const apiService = {
  /** Optional requestConfig.skipUnauthorizedRedirect: true to avoid triggering logout on 401 (e.g. background login for change-password). */
  login: (body: LoginRequest, requestConfig?: { skipUnauthorizedRedirect?: boolean }) =>
    getApi().post<LoginResponse>('api/login', body, requestConfig as any),

  signup: (body: SignupRequest) =>
    getApi().post<SignupResponse>('api/signup', body),

  forgotPassword: (body: ForgotPasswordRequest) =>
    getApi().post<ForgotPasswordResponse>('api/forget-password', body),

  /** Change password. Pass optional token when calling after a background login (token not persisted). */
  changePassword: (body: ChangePasswordRequest, token?: string) =>
    getApi().post<ChangePasswordResponse>('api/change-password', body, token ? { headers: { Authorization: `Bearer ${token}` } } : undefined),

  sendOtp: (body: SendOtpRequest) =>
    getApi().post<SendOtpResponse>('api/login/send-otp', body),

  verifyOtp: (body: VerifyOtpRequest) =>
    getApi().post<VerifyOtpResponse>('api/login/verify-otp', body),

  getLedgerList: (body: LedgerListRequest) =>
    getApi().post<LedgerListResponse>('api/tally/ledgerlist-w-addrs', body),

  /** Accounting ledgers master list (Sales/Purchase etc.) */
  getAccountingLedgers: (body: AccountingLedgerListRequest) =>
    getApi().post<AccountingLedgerListResponse>('api/tally/masterdata/accountingledger-list', body),

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
    getApi().post<StockItemResponse>('api/tally/stockitem-loop', body, {
      params: ts != null ? { ts } : undefined,
    }),

  /** Stock groups list (api/tally/stockgroups) for Data Management – index MASTERID, NAME, GROUPLIST. */
  getStockGroups: (body: StockGroupsRequest) =>
    getApi().post<StockGroupsResponse>('api/tally/stockgroups', body),

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

  /** Resend a rejected voucher */
  resendVoucher: (body: VchAuthActionRequest) =>
    getApi().post<VchAuthActionResponse>('api/tally/vchauth/resend', body),

  /** Stock Summary – groups & items list (drill-down via stockitem param) */
  getStockSummary: (body: StockSummaryRequest) =>
    getApi().post<StockSummaryResponse>('api/tally/stocksummary', body),

  /** Stock Item Monthly Summary – monthly breakdown for a stock item */
  getMonthlySummary: (body: MonthlySummaryRequest) =>
    getApi().post<MonthlySummaryResponse>('api/tally/monthlysummary', body),

  /** Stock Item Vouchers – voucher list for a stock item */
  getStockItemVouchers: (body: StockItemVouchersRequest) =>
    getApi().post<StockItemVouchersResponse>('api/tally/stockitemvouchers', body),

  /** Upload document to Google Drive via api/upload-doc (form-data: file, location_id, type, company_name, co_guid) */
  uploadDocument: (formData: FormData) =>
    getApi().post<import('./models').UploadDocResponse>('api/upload-doc', formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
      timeout: 120000,
    }),

  /** Bank & UPI details for Ledger Reports header (companyinfo) */
  getBankUpi: (body: BankUpiRequest) =>
    getApi().post<BankUpiResponse>('api/tally/masterdata/companyinfo', body),

  /** Expense ledgers list for Expense Claim dropdown (name field). */
  getExpenseLedgers: (body: { tallyloc_id: number; company: string; guid: string }) =>
    getApi().post<{ success?: boolean; data?: Array<{ masterId?: string; name?: string; parent?: string }> }>(
      'api/tally/vendor-mang/expense-ledgers',
      body,
    ),

  /** Cash/Bank ledgers list for Payment Mode dropdown (name field). */
  getCashBankLedgers: (body: { tallyloc_id: number; company: string; guid: string }) =>
    getApi().post<{ success?: boolean; data?: Array<{ masterId?: string; name?: string; parent?: string }> }>(
      'api/tally/vendor-mang/cash-bank-ledgers',
      body,
    ),

  /** Payment voucher types list for Voucher type dropdown (name field). */
  getPaymentVoucherTypes: (body: { tallyloc_id: number; company: string; guid: string }) =>
    getApi().post<{ success?: boolean; data?: Array<{ masterId?: string; name?: string; parent?: string }> }>(
      'api/tally/vendor-mang/payment-voucher-types',
      body,
    ),

  /** Create Payment Voucher for Payment/Expense Claims/Collections. */
  createPaymentVoucher: (body: any) =>
    getApi().post<{ success?: boolean | string; message?: string; data?: unknown }>(
      'api/tally/vendor-mang/payment-voucher/create',
      body,
    ),

  /** User access permissions (access-control/user-access) for module & field-level controls */
  getUserAccess: (params: { tallylocId: number | string; co_guid: string }) =>
    getApi().get('api/access-control/user-access', {
      params: { ...params, _t: Date.now() },
      headers: { 'Cache-Control': 'no-cache, no-store', Pragma: 'no-cache' },
    }),

  /**
   * Request Tally voucher PDF generation. Poll getTallyPdfStatus(request_id) until status is "ready"
   * and pdf_base64 is present.
   */
  requestTallyPdf: (body: {
    tallyloc_id: number;
    company: string;
    guid: string;
    master_id: string;
  }) =>
    getApi().post<{
      success?: boolean;
      request_id?: string;
      status?: string;
      message?: string;
      callback_url?: string;
    }>('api/tally/pdf/request', body),

  /** Poll PDF generation status; when status === 'ready', response includes pdf_base64. */
  getTallyPdfStatus: (requestId: string) =>
    getApi().get<{
      request_id?: string;
      status?: string;
      transaction_id?: string;
      created_at?: string;
      ready_at?: string;
      pdf_base64?: string;
    }>(`api/tally/pdf/status/${requestId}`, {
      params: { _t: Date.now() },
    }),

  /**
   * Create short share link for voucher. Client builds encrptyurl (shared-voucher/{shareId}#data=...);
   * server returns encrptyid for public URL and expirydate.
   */
  createTallydataShare: (body: {
    tallyloc_id: number;
    company: string;
    guid: string;
    encrptyurl: string;
  }) =>
    getApi().post<{ encrptyid?: string; expirydate?: string }>('api/tallydata_share/create', body),

  /** S3 attachment: step 1 – get presigned upload URL */
  getImageUploadUrl: (body: import('./models').ImageUploadUrlRequest) =>
    getApi().post<import('./models').ImageUploadUrlResponse>('api/images/upload-url', body),

  /** S3 attachment: step 2 – upload file binary to S3 presigned URL (PUT) */
  uploadToS3: (uploadUrl: string, fileBlob: Blob | { uri: string; type: string; name: string }, contentType: string) =>
    axios.put(uploadUrl, fileBlob, {
      headers: { 'Content-Type': contentType },
      timeout: 120000,
    }),

  /** S3 attachment: step 3 – confirm upload and get viewUrl */
  confirmImageUpload: (body: import('./models').ImageConfirmRequest) =>
    getApi().post<import('./models').ImageConfirmResponse>('api/images/confirm', body),
};

export default apiService;

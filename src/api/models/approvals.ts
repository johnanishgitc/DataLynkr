/** Pending Voucher Authorization API models */

export interface PendVchAuthRequest {
    tallyloc_id: number;
    company: string;
    guid: string;
    fromdate: number;  // YYYYMMDD
    todate: number;    // YYYYMMDD
}

export interface VoucherActivityEntry {
    email: string;
    comments: string | null;
    apprv_status: string;   // "approved", "rejected", etc.
    created_at: string;     // ISO datetime
}

export interface PendVchAuthItem {
    MASTERID: string;
    VCHTYPE: string;
    AMOUNT: string;
    VCHNO: string;
    SUBMITTER: string;
    DATE: string;
    ORIGINALNARRATION: string;
    DEBITAMT?: string;
    CREDITAMT?: string;
    STATUS: string;      // "pending", "waiting", "approved", "rejected"
    REJECTION_REASON?: string;
    VOUCHER_ACTIVITY_HISTORY?: VoucherActivityEntry[];
    [key: string]: unknown;
}

export interface PendVchAuthResponse {
    pendingVchAuth?: PendVchAuthItem[];
    error?: string;
    success?: boolean;
}

/** Approve / Reject voucher authorization request */
export interface VchAuthActionRequest {
    tallyloc_id: number;
    company: string;
    guid: string;
    date: number;       // YYYYMMDD
    masterid: number;
    narration: string;
    comments: string;
}

export interface VchAuthActionResponse {
    success?: boolean;
    message?: string;
    response?: unknown;
    error?: string;
}

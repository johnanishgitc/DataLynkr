import { useState, useEffect, useCallback } from 'react';
import { apiService } from '../api';
import { getTallylocId, getGuid } from '../store/storage';

/**
 * Converts a value from the API (boolean, number, or "Yes"/"No" string) to a boolean.
 */
function toBool(val: unknown): boolean {
    if (val === true || val === 1 || val === '1') return true;
    if (typeof val === 'string') {
        const s = val.trim().toLowerCase();
        return s === 'yes' || s === 'true' || s === '1';
    }
    return false;
}

/**
 * Permissions for the `place_order` module extracted from the
 * `access-control/user-access` API response.
 *
 * Permissions are NEVER cached. They are fetched fresh from the API every
 * time the hook mounts (i.e. every time Order Entry is opened).
 * If a permission is absent from the API response it defaults to false,
 * unless the user is an owner (is_owner: true) in which case most permissions
 * default to true. Some permissions always require an explicit API grant
 * regardless of ownership (show_ClsStck_yesno, show_itemdesc, show_itemshasqty).
 */
export type PlaceOrderPermissions = {
    show_rateamt_Column: boolean;
    edit_rate: boolean;
    show_disc_Column: boolean;
    edit_discount: boolean;
    show_ClsStck_Column: boolean;
    show_ClsStck_yesno: boolean;
    show_godownbrkup: boolean;
    show_multicobrkup: boolean;
    show_itemdesc: boolean;
    show_itemshasqty: boolean;
    allow_vchtype: boolean;
    show_ordduedate: boolean;
    show_creditdayslimit: boolean;
    /** When true, hide/disable file attachments in order entry and item detail (from permission_key "disable_attachemnt"). */
    disable_attachment: boolean;
    /** When true, show batch & godown fields on item details (from permission_key "enbale_batchGodown"). */
    enable_batchGodown: boolean;
};

/**
 * Transaction configuration for place_order from the API.
 */
export type PlaceOrderTransConfig = {
    vouchertype?: string;
    class?: string;
    /** Lowercase voucher type → default class from `trans_config.place_order` rows (matched to current voucher type). */
    placeOrderDefaultClassByVoucherType?: Record<string, string>;
    /** Default quantity for new items in OrderEntryItemDetail (from configuration/permissions, e.g. permission_key "def_qty"). */
    defaultQty?: number;
    /** When true, new orders are saved as Optional by default (from configuration/permissions, e.g. permission_key "save_optional"). */
    saveOptionalByDefault?: boolean;
    /** Behaviour when credit limit / days are exceeded (from configuration key "ctrl_creditdayslimit"). */
    creditDaysLimitMode?: 'Post as Optional' | 'Restrict generation of transaction';
};

/** Fallback when permissions are not available (e.g. OrderEntryItemDetail using params from OrderEntry). All restricted. */
export const DEFAULT_PLACE_ORDER_PERMISSIONS: PlaceOrderPermissions = {
    show_rateamt_Column: false,
    edit_rate: false,
    show_disc_Column: false,
    edit_discount: false,
    show_ClsStck_Column: false,
    show_ClsStck_yesno: false,
    show_godownbrkup: false,
    show_multicobrkup: false,
    show_itemdesc: false,
    show_itemshasqty: false,
    allow_vchtype: false,
    show_ordduedate: false,
    show_creditdayslimit: false,
    disable_attachment: false,
    enable_batchGodown: false,
};

/**
 * Shown while the API call is in flight.
 * Most are true so the UI looks fully unlocked during the brief loading moment.
 * The "always explicit" flags stay false so they never flash on then off.
 */
const LOADING_PERMISSIONS: PlaceOrderPermissions = {
    show_rateamt_Column: true,
    edit_rate: true,
    show_disc_Column: true,
    edit_discount: true,
    show_ClsStck_Column: true,
    show_ClsStck_yesno: false,  // must be explicit
    show_godownbrkup: true,
    show_multicobrkup: true,
    show_itemdesc: false,        // must be explicit
    show_itemshasqty: false,     // must be explicit
    allow_vchtype: true,
    show_ordduedate: true,
    show_creditdayslimit: true,
    disable_attachment: false,
    enable_batchGodown: false,
};

/** Module-level enabled flags (from the top-level `modules` array). */
export type ModuleAccess = {
    place_order: boolean;
    ledger_book: boolean;
    approvals: boolean;
    stock_summary: boolean;
    sales_dashboard: boolean;
    [key: string]: boolean;
};

const DEFAULT_MODULE_ACCESS: ModuleAccess = {
    place_order: false,
    ledger_book: false,
    approvals: false,
    stock_summary: false,
    sales_dashboard: true,
};

/**
 * Maps API `module_name` values to internal ModuleAccess keys.
 * If an API name isn't listed here, it is stored as-is.
 */
const MODULE_NAME_MAP: Record<string, string> = {
    place_order: 'place_order',
    ledger_voucher: 'ledger_book',
    voucher_authorization: 'approvals',
    sales_dashboard: 'sales_dashboard',
};

type UseUserAccessReturn = {
    permissions: PlaceOrderPermissions;
    moduleAccess: ModuleAccess;
    transConfig: PlaceOrderTransConfig;
    loading: boolean;
    refresh: () => void;
};

/**
 * Fetches user-access permissions fresh from the API every time it is called.
 * No caching – permissions always reflect the latest server configuration.
 */
export function useUserAccess(): UseUserAccessReturn {
    const [permissions, setPermissions] = useState<PlaceOrderPermissions>(LOADING_PERMISSIONS);
    const [moduleAccess, setModuleAccess] = useState<ModuleAccess>(DEFAULT_MODULE_ACCESS);
    const [transConfig, setTransConfig] = useState<PlaceOrderTransConfig>({});
    const [loading, setLoading] = useState(true);
    const [refreshKey, setRefreshKey] = useState(0);

    const refresh = useCallback(() => setRefreshKey((k) => k + 1), []);

    useEffect(() => {
        let cancelled = false;

        // Reset to loading state at the start of each fetch.
        setPermissions(LOADING_PERMISSIONS);
        setLoading(true);

        (async () => {
            const [tallylocId, co_guid] = await Promise.all([getTallylocId(), getGuid()]);
            if (!tallylocId || !co_guid || cancelled) {
                setLoading(false);
                return;
            }

            try {
                // Debug: log token and params for comparison with Postman
                const { getAuthToken } = require('../store/storage');
                const token = await getAuthToken();
                console.log('[useUserAccess] REQUEST params:', { tallylocId, co_guid });
                console.log('[useUserAccess] AUTH TOKEN (last 20):', token ? '...' + String(token).slice(-20) : 'NO TOKEN');

                const { data: responseData } = await apiService.getUserAccess({ tallylocId, co_guid });
                if (cancelled) return;

                console.log('[useUserAccess] LIVE API RESPONSE:', JSON.stringify(responseData, null, 2));

                const body = responseData as Record<string, unknown> | undefined;
                const data = (body?.data ?? body) as Record<string, unknown> | undefined;
                const modules = (data?.modules ?? []) as Array<Record<string, unknown>>;

                // Detect owner status – owners get all permissions by default.
                const accessSummary = data?.access_summary as Record<string, unknown> | undefined;
                const tallyLoc = data?.tally_location as Record<string, unknown> | undefined;
                const isOwner = toBool(accessSummary?.is_owner ?? tallyLoc?.is_owner ?? data?.is_owner);

                // --- trans_config extraction + default quantity from configuration (if present) ---
                const transConfigArr = (data?.trans_config ?? []) as Array<Record<string, unknown>>;
                let pOrderTransConfig: PlaceOrderTransConfig = {};
                let defaultQty: number | undefined;
                let saveOptionalByDefault = false;
                let creditDaysLimitMode: 'Post as Optional' | 'Restrict generation of transaction' | undefined;

                if (transConfigArr.length > 0) {
                    const firstConfig = transConfigArr[0];

                    // Voucher type / class defaults: every place_order row with vouchertype+class (plus permission rows).
                    if (Array.isArray((firstConfig as any)?.place_order) && (firstConfig as any).place_order.length > 0) {
                        const poConfigArr = (firstConfig as any).place_order as Array<Record<string, unknown>>;
                        const classByVt: Record<string, string> = {};
                        let firstPairVt: string | undefined;
                        let firstPairCl: string | undefined;
                        for (const cfg of poConfigArr) {
                            const vt = String((cfg as any).vouchertype ?? '').trim();
                            const cl = String((cfg as any).class ?? '').trim();
                            if (vt && cl) {
                                classByVt[vt.toLowerCase()] = cl;
                                if (firstPairVt === undefined) {
                                    firstPairVt = vt;
                                    firstPairCl = cl;
                                }
                            }
                        }
                        const poConfig = poConfigArr[0] ?? {};
                        pOrderTransConfig = {
                            vouchertype: (firstPairVt ?? (poConfig?.vouchertype as string | undefined)) as string | undefined,
                            class: (firstPairCl ?? (poConfig?.class as string | undefined)) as string | undefined,
                            placeOrderDefaultClassByVoucherType:
                                Object.keys(classByVt).length > 0 ? classByVt : undefined,
                        };

                        // Try to find configuration entries such as:
                        // {
                        //   "permission_key": "def_qty",
                        //   "display_name": "Set Default Qty Value",
                        //   "sort_order": "180",
                        //   "granted": true,
                        //   "permission_value": "3"
                        // }
                        // and:
                        // {
                        //   "permission_key": "save_optional",
                        //   "display_name": "Save Order by default as Optional",
                        //   "sort_order": "201",
                        //   "granted": true,
                        //   "permission_value": null
                        // }
                        for (const cfg of poConfigArr) {
                            const key = String((cfg as any).permission_key ?? (cfg as any).key ?? '').trim();
                            if (key === 'def_qty') {
                                const rawVal = (cfg as any).permission_value ?? (cfg as any).value;
                                const num = rawVal != null ? Number(rawVal) : NaN;
                                if (!Number.isNaN(num)) {
                                    defaultQty = num;
                                }
                            } else if (key === 'save_optional') {
                                const grantedRaw = (cfg as any).is_granted ?? (cfg as any).granted ?? (cfg as any).value;
                                if (toBool(grantedRaw)) {
                                    saveOptionalByDefault = true;
                                }
                            } else if (key === 'ctrl_creditdayslimit' && creditDaysLimitMode === undefined) {
                                const rawVal = (cfg as any).permission_value ?? (cfg as any).value;
                                const val = rawVal != null ? String(rawVal).trim() : '';
                                // Ignore when permission_value is "null" (string) or empty.
                                if (val && val.toLowerCase() !== 'null') {
                                    if (val === 'Post as Optional' || val === 'Restrict generation of transaction') {
                                        creditDaysLimitMode = val;
                                    }
                                }
                            }
                        }
                    }
                }

                // --- Module-level access ---
                const modAccess: ModuleAccess = { ...DEFAULT_MODULE_ACCESS };
                let approvalsApproveReject = false;
                let approvalsDateRangeValue: string | undefined;
                for (const mod of modules) {
                    const name = String(mod.module_name ?? mod.module_key ?? '').trim();
                    if (name) {
                        const mappedKey = MODULE_NAME_MAP[name] ?? name;
                        const isEnabledRaw = mod.is_enabled ?? mod.enabled ?? mod.is_granted ?? mod.granted;
                        // If the API omits the enabled flag entirely, assume it's true because the module is listed.
                        modAccess[mappedKey] = isEnabledRaw !== undefined ? toBool(isEnabledRaw) : true;

                        // Extract Approvals-specific permission: def_apprvrej from voucher_authorization module
                        const lowerName = name.toLowerCase();
                        if (lowerName === 'voucher_authorization') {
                            const permsArr = (mod.permissions ?? []) as Array<Record<string, unknown>>;
                            for (const p of permsArr) {
                                const key = String(p.permission_key ?? p.permission_name ?? '').trim();
                                if (key === 'def_apprvrej') {
                                    const granted = toBool(p.is_granted ?? p.granted ?? p.value);
                                    if (granted) {
                                        approvalsApproveReject = true;
                                    }
                                } else if (key === 'def_daterange') {
                                    const granted = toBool(p.is_granted ?? p.granted ?? p.value);
                                    if (granted) {
                                        const rawVal = p.permission_value ?? (p as any).permissionValue ?? p.value;
                                        const s = rawVal == null ? '' : String(rawVal).trim();
                                        approvalsDateRangeValue = s && s.toLowerCase() !== 'null' ? s : undefined;
                                    }
                                }
                            }
                        }
                    }
                }
                // Expose Approvals approve/reject option flag via moduleAccess
                (modAccess as any).approvals_def_apprvrej = approvalsApproveReject;
                // Expose Approvals default period value via moduleAccess
                (modAccess as any).approvals_def_daterange = approvalsDateRangeValue;
                if (!cancelled) setModuleAccess(modAccess);

                // --- Place-order field permissions ---
                const placeOrderModule = modules.find((m) => {
                    const mName = String(m.module_name ?? m.module_key ?? '').trim().toLowerCase();
                    return mName === 'place_order' || mName === 'placeorder';
                });

                if (placeOrderModule) {
                    const perms = (placeOrderModule.permissions ?? []) as Array<Record<string, unknown>>;
                    const permMap: Record<string, boolean> = {};
                    for (const p of perms) {
                        const pName = String(p.permission_name ?? p.permission_key ?? '').trim();
                        if (pName) {
                            permMap[pName] = toBool(p.is_granted ?? p.granted);
                        }

                        // Also allow some configuration values to be driven via permission entries when present.
                        if (pName === 'def_qty' && defaultQty === undefined) {
                            // {
                            //   "permission_key": "def_qty",
                            //   "display_name": "Set Default Qty Value",
                            //   "sort_order": "180",
                            //   "granted": true,
                            //   "permission_value": "3"
                            // }
                            const rawVal = (p as any).permission_value ?? (p as any).value;
                            const num = rawVal != null ? Number(rawVal) : NaN;
                            if (!Number.isNaN(num)) {
                                defaultQty = num;
                            }
                        } else if (pName === 'save_optional' && !saveOptionalByDefault) {
                            // {
                            //   "permission_key": "save_optional",
                            //   "display_name": "Save Order by default as Optional",
                            //   "sort_order": "201",
                            //   "granted": true,
                            //   "permission_value": null
                            // }
                            const grantedRaw = (p as any).is_granted ?? (p as any).granted ?? (p as any).value;
                            if (toBool(grantedRaw)) {
                                saveOptionalByDefault = true;
                            }
                        } else if (pName === 'ctrl_creditdayslimit' && creditDaysLimitMode === undefined) {
                            const rawVal = (p as any).permission_value ?? (p as any).value;
                            const val = rawVal != null ? String(rawVal).trim() : '';
                            if (val && val.toLowerCase() !== 'null') {
                                if (val === 'Post as Optional' || val === 'Restrict generation of transaction') {
                                    creditDaysLimitMode = val;
                                }
                            }
                        }
                    }

                    // Permissions are strictly driven by the API response.
                    // If a key is absent, it is false – no owner fallback.
                    // API sends permission_key "disable_attachemnt" (typo) – when granted true, hide attachments.
                    const resolved: PlaceOrderPermissions = {
                        show_rateamt_Column: permMap.show_rateamt_Column ?? false,
                        edit_rate: permMap.edit_rate ?? false,
                        show_disc_Column: permMap.show_disc_Column ?? false,
                        edit_discount: permMap.edit_discount ?? false,
                        show_ClsStck_Column: permMap.show_ClsStck_Column ?? false,
                        show_ClsStck_yesno: permMap.show_ClsStck_yesno ?? false,
                        show_godownbrkup: permMap.show_godownbrkup ?? false,
                        show_multicobrkup: permMap.show_multicobrkup ?? false,
                        show_itemdesc: permMap.show_itemdesc ?? false,
                        show_itemshasqty: permMap.show_itemshasqty ?? false,
                        allow_vchtype: permMap.allow_vchtype ?? false,
                        show_ordduedate: permMap.show_ordduedate ?? false,
                        show_creditdayslimit: permMap.show_creditdayslimit ?? false,
                        disable_attachment: toBool(permMap.disable_attachemnt),
                        enable_batchGodown: toBool(permMap.enbale_batchGodown),
                    };

                    if (!cancelled) setPermissions(resolved);
                } else {
                    // place_order module not found in response: lock everything down.
                    if (!cancelled) setPermissions({ ...LOADING_PERMISSIONS, show_ClsStck_yesno: false, show_itemdesc: false, show_itemshasqty: false });
                }

                // Finally, publish transaction configuration including default quantity (if any).
                if (!cancelled) {
                    setTransConfig({
                        ...pOrderTransConfig,
                        defaultQty,
                        saveOptionalByDefault,
                        creditDaysLimitMode,
                    });
                }
            } catch (err) {
                console.warn('[useUserAccess] Failed to fetch permissions', err);
            } finally {
                if (!cancelled) setLoading(false);
            }
        })();

        return () => {
            cancelled = true;
        };
    }, [refreshKey]);

    return { permissions, moduleAccess, transConfig, loading, refresh };
}

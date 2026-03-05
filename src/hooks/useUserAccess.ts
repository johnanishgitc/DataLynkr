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
    place_order: true,
    ledger_book: true,
    approvals: true,
    stock_summary: true,
    sales_dashboard: true,
};

type UseUserAccessReturn = {
    permissions: PlaceOrderPermissions;
    moduleAccess: ModuleAccess;
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

                // For owners: missing permissions default to true (fully unlocked).
                // For non-owners: missing permissions default to false (hidden).
                const fallback = isOwner;

                // --- Module-level access ---
                const modAccess: ModuleAccess = { ...DEFAULT_MODULE_ACCESS };
                for (const mod of modules) {
                    const name = String(mod.module_name ?? mod.module_key ?? '').trim();
                    if (name) {
                        modAccess[name] = toBool(mod.is_enabled ?? mod.enabled ?? mod.is_granted ?? mod.granted);
                    }
                }
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
                    }

                    const resolved: PlaceOrderPermissions = {
                        show_rateamt_Column: permMap.show_rateamt_Column ?? fallback,
                        edit_rate: permMap.edit_rate ?? fallback,
                        show_disc_Column: permMap.show_disc_Column ?? fallback,
                        edit_discount: permMap.edit_discount ?? fallback,
                        show_ClsStck_Column: permMap.show_ClsStck_Column ?? fallback,
                        show_ClsStck_yesno: permMap.show_ClsStck_yesno ?? false, // always explicit
                        show_godownbrkup: permMap.show_godownbrkup ?? fallback,
                        show_multicobrkup: permMap.show_multicobrkup ?? fallback,
                        show_itemdesc: permMap.show_itemdesc ?? false, // always explicit
                        show_itemshasqty: permMap.show_itemshasqty ?? false, // always explicit
                        allow_vchtype: permMap.allow_vchtype ?? fallback,
                        show_ordduedate: permMap.show_ordduedate ?? fallback,
                        show_creditdayslimit: permMap.show_creditdayslimit ?? fallback,
                    };

                    if (!cancelled) setPermissions(resolved);
                } else {
                    // place_order module not found in response: lock everything down.
                    if (!cancelled) setPermissions({ ...LOADING_PERMISSIONS, show_ClsStck_yesno: false, show_itemdesc: false, show_itemshasqty: false });
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

    return { permissions, moduleAccess, loading, refresh };
}

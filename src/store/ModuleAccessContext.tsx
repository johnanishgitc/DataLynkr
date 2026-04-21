import React, { createContext, useContext, ReactNode } from 'react';
import { useUserAccess, type ModuleAccess, type PlaceOrderPermissions, type PlaceOrderTransConfig, type EcommercePlaceOrderAccess } from '../hooks/useUserAccess';

type ModuleAccessContextValue = {
    moduleAccess: ModuleAccess;
    permissions: PlaceOrderPermissions;
    transConfig: PlaceOrderTransConfig;
    ecommercePlaceOrderAccess: EcommercePlaceOrderAccess;
    loading: boolean;
    refresh: (resetAccess?: boolean) => void;
    refreshAndWait: (resetAccess?: boolean) => Promise<void>;
};

const ModuleAccessContext = createContext<ModuleAccessContextValue | null>(null);

/** Provides module-level access flags and place-order permissions to the whole tab tree. */
export function ModuleAccessProvider({ children }: { children: ReactNode }) {
    const { moduleAccess, permissions, transConfig, ecommercePlaceOrderAccess, loading, refresh, refreshAndWait } = useUserAccess();
    return (
        <ModuleAccessContext.Provider value={{ moduleAccess, permissions, transConfig, ecommercePlaceOrderAccess, loading, refresh, refreshAndWait }}>
            {children}
        </ModuleAccessContext.Provider>
    );
}

/** Read module access flags anywhere under ModuleAccessProvider. Falls back to all-enabled. */
export function useModuleAccess(): ModuleAccessContextValue {
    const ctx = useContext(ModuleAccessContext);
    if (!ctx) {
        // No provider above (e.g. Payments/Collections/ExpenseClaims screens in the root stack).
        // Default all modules to enabled so the sidebar items are clickable.
        // These screens are not gated by configurations so this is safe.
        return {
            moduleAccess: {
                place_order: true, ledger_book: true, approvals: true,
                stock_summary: true, sales_dashboard: true, vendor_expenses: true,
            },
            permissions: {
                show_rateamt_Column: true, edit_rate: true, show_disc_Column: true, edit_discount: true,
                show_ClsStck_Column: true, show_ClsStck_yesno: false, show_godownbrkup: true,
                show_multicobrkup: true, show_itemdesc: false, show_itemshasqty: false,
                allow_vchtype: true, show_ordduedate: true, show_creditdayslimit: true,
                disable_attachment: false,
                enable_batchGodown: false,
            },
            transConfig: {},
            ecommercePlaceOrderAccess: {
                show_itemdesc: false,
                show_rateamt_Column: true,
                show_image: false,
                upload_images: false,
                defaultQty: undefined,
                saveOptionalForPlaceOrder: false,
            },
            loading: false,
            refresh: () => { },
            refreshAndWait: async () => { },
        };
    }
    return ctx;
}

import React, { createContext, useContext, ReactNode } from 'react';
import { useUserAccess, type ModuleAccess, type PlaceOrderPermissions } from '../hooks/useUserAccess';

type ModuleAccessContextValue = {
    moduleAccess: ModuleAccess;
    permissions: PlaceOrderPermissions;
};

const ModuleAccessContext = createContext<ModuleAccessContextValue | null>(null);

/** Provides module-level access flags and place-order permissions to the whole tab tree. */
export function ModuleAccessProvider({ children }: { children: ReactNode }) {
    const { moduleAccess, permissions } = useUserAccess();
    return (
        <ModuleAccessContext.Provider value={{ moduleAccess, permissions }}>
            {children}
        </ModuleAccessContext.Provider>
    );
}

/** Read module access flags anywhere under ModuleAccessProvider. Falls back to all-enabled. */
export function useModuleAccess(): ModuleAccessContextValue {
    const ctx = useContext(ModuleAccessContext);
    if (!ctx) {
        return {
            moduleAccess: {
                place_order: true, ledger_book: true, approvals: true,
                stock_summary: true, sales_dashboard: true,
            },
            permissions: {
                show_rateamt_Column: true, edit_rate: true, show_disc_Column: true, edit_discount: true,
                show_ClsStck_Column: true, show_ClsStck_yesno: false, show_godownbrkup: true,
                show_multicobrkup: true, show_itemdesc: false, show_itemshasqty: false,
                allow_vchtype: true, show_ordduedate: true, show_creditdayslimit: true,
            },
        };
    }
    return ctx;
}

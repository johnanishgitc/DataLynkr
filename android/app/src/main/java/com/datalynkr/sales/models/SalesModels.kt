package com.datalynkr.sales.models

import kotlinx.serialization.Serializable
import java.util.Date

/**
 * Core sales voucher data model
 * Translated from JavaScript object structure in SalesDashboard.js
 */
@Serializable
data class SalesVoucher(
    val masterid: String? = null,
    val alterid: String? = null,
    val vouchernumber: String? = null,
    val vouchertypename: String? = null,
    val date: String? = null, // Format: YYYY-MM-DD
    val cp_date: String? = null, // Format: YYYY-MM-DD  
    val partyledgername: String? = null, // Customer name
    val partyledgernameid: String? = null,
    val partygstin: String? = null,
    val pincode: String? = null,
    val state: String? = null,
    val country: String? = null,
    val amount: Double = 0.0, // Total invoice amount
    val quantity: Double = 0.0,
    val profit: Double? = null,
    val profitmargin: Double? = null,
    val salesperson: String? = null, // Calculated from UDF
    val ledgerentries: List<LedgerEntry> = emptyList(),
    val allinventoryentries: List<InventoryEntry> = emptyList(),
    // UDF fields (dynamically added)
    val udfFields: Map<String, Any?> = emptyMap()
) {
    // Helper computed properties
    val customer: String get() = partyledgername ?: "Unknown"
    val invoiceDate: String get() = cp_date ?: date ?: ""
    val totalAmount: Double get() = amount
    val profitAmount: Double get() = profit ?: 0.0
    val margin: Double get() = profitmargin ?: 0.0
}

@Serializable
data class LedgerEntry(
    val ledgername: String? = null,
    val ledgergroup: String? = null,
    val amount: Double = 0.0,
    val billallocations: List<BillAllocation> = emptyList()
)

@Serializable
data class BillAllocation(
    val name: String? = null,
    val amount: Double = 0.0,
    val billtype: String? = null
)

@Serializable
data class InventoryEntry(
    val stockitemname: String? = null,
    val stockitemnameid: String? = null,
    val stockitemgroup: String? = null,
    val stockitemcategory: String? = null,
    val quantity: Double = 0.0,
    val rate: Double = 0.0,
    val amount: Double = 0.0,
    val actualqty: Double = 0.0,
    val billedqty: Double = 0.0,
    val profit: Double? = null,
    val batchallocation: List<BatchAllocation> = emptyList(),
    val accountingallocation: List<AccountingAllocation> = emptyList()
)

@Serializable
data class BatchAllocation(
    val batchname: String? = null,
    val godownname: String? = null,
    val amount: Double = 0.0,
    val quantity: Double = 0.0
)

@Serializable
data class AccountingAllocation(
    val ledgername: String? = null,
    val ledgergroup: String? = null,
    val amount: Double = 0.0
)

/**
 * Field metadata for dynamic field extraction
 * Translated from fieldExtractor.js
 */
data class FieldMetadata(
    val value: String, // Field path (e.g., "ledgerentries.amount")
    val label: String, // Human-readable label
    val type: FieldType, // "category" or "value"
    val path: String, // Parent path
    val hierarchy: String, // Hierarchy level (voucher, ledgerentries, etc.)
    val aggregation: AggregationType? = null // For value fields
)

enum class FieldType {
    CATEGORY, // String/categorical data
    VALUE      // Numeric data
}

enum class AggregationType {
    SUM,
    AVERAGE,
    COUNT,
    MIN,
    MAX
}

/**
 * Hierarchy mapping for field grouping
 * Maps to HIERARCHY_MAP in fieldExtractor.js
 */
object FieldHierarchy {
    const val VOUCHER = "voucher"
    const val LEDGER_ENTRIES = "ledgerentries"
    const val BILL_ALLOCATIONS = "billallocations"
    const val INVENTORY_ENTRIES = "allinventoryentries"
    const val BATCH_ALLOCATION = "batchallocation"
    const val ACCOUNTING_ALLOCATION = "accountingallocation"
    const val ADDRESS = "address"
    
    val HIERARCHY_MAP = mapOf(
        VOUCHER to "Voucher Fields",
        LEDGER_ENTRIES to "Ledger Entries",
        BILL_ALLOCATIONS to "Bill Allocations",
        INVENTORY_ENTRIES to "Inventory Entries",
        BATCH_ALLOCATION to "Batch Allocations",
        ACCOUNTING_ALLOCATION to "Accounting Allocations",
        ADDRESS to "Address"
    )
}

/**
 * KPI data model for metric cards
 */
data class KPIData(
    val title: String,
    val value: Double,
    val target: Double? = null,
    val additionalData: Double? = null,
    val trendData: List<Double> = emptyList(),
    val format: (Double) -> String = { it.toString() },
    val unit: String = "",
    val iconName: String? = null,
    val iconBgColor: String = "#dcfce7",
    val iconColor: String = "#16a34a"
)

/**
 * Chart data models
 */
data class ChartDataPoint(
    val label: String,
    val value: Double,
    val color: String? = null,
    val segments: List<ChartSegment> = emptyList() // For stacked charts
)

data class ChartSegment(
    val label: String,
    val value: Double,
    val color: String
)

/**
 * Multi-axis series data for revenue vs profit charts
 */
data class MultiAxisSeries(
    val name: String,
    val type: String, // "bar" or "line"
    val data: List<Double>,
    val axis: String, // "left" or "right"
    val color: String
)

/**
 * Date range selection
 */
data class DateRange(
    val start: String, // YYYY-MM-DD format
    val end: String    // YYYY-MM-DD format
)

/**
 * Filter state
 */
data class SalesFilters(
    val dateRange: DateRange,
    val selectedCustomer: String = "all",
    val selectedItem: String = "all",
    val selectedStockGroup: String = "all",
    val selectedRegion: String = "all",
    val selectedCountry: String = "all",
    val selectedPincode: String? = null,
    val selectedPeriod: String? = null, // Format: "YYYY-MM"
    val selectedLedgerGroup: String = "all",
    val selectedSalesperson: String? = null,
    val genericFilters: Map<String, String> = emptyMap()
)

/**
 * Cache metadata
 */
data class CacheMetadata(
    val timestamp: Long,
    val company: String,
    val guid: String,
    val voucherCount: Int,
    val dateRange: DateRange
)

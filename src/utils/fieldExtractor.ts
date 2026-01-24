/**
 * Hierarchical Field Extractor Utility
 * Translated from React TallyCatalyst fieldExtractor.js
 * Extracts all fields from nested voucher structures in cache data
 * Supports hierarchical field paths with dot notation
 */

import type {
    SalesVoucher,
    FieldMetadata,
    FieldGroup,
    ExtractedFields,
} from '../types/sales';

// Hierarchy mapping for field grouping
export const HIERARCHY_MAP: Record<string, string> = {
    voucher: 'Voucher Fields',
    ledgerentries: 'Ledger Entries',
    billallocations: 'Bill Allocations',
    allinventoryentries: 'Inventory Entries',
    inventoryentries: 'Inventory Entries',
    batchallocation: 'Batch Allocations',
    accountingallocation: 'Accounting Allocations',
    address: 'Address',
    customers: 'Customers Table',
    stockitems: 'Stock Items Table',
};

// Fields that should always be categories (even if numeric)
const FORCE_CATEGORY_FIELDS = [
    // Date fields
    'date', 'cp_date', 'cpdate', 'transaction_date', 'voucher_date', 'bill_date',
    // Location fields
    'pincode', 'pin_code', 'pin', 'zipcode', 'zip',
    // Voucher/ID fields
    'vouchernumber', 'vchno', 'voucher_number', 'masterid', 'alterid',
    'partyledgernameid', 'partyid', 'stockitemnameid', 'itemid',
    'partygstin', 'gstin', 'gst_no', 'pan',
    // Contact fields
    'phone', 'mobile', 'telephone', 'contact',
    // Reference fields
    'reference', 'ref_no', 'invoice_no', 'bill_no',
    // Address fields
    'address', 'basicbuyeraddress', 'buyer_address',
    // Other category fields
    'reservedname', 'vchtype', 'vouchertypename', 'issales',
];

/**
 * Determines if a field should be treated as a value (numeric) or category
 */
function determineFieldType(value: unknown, fieldName: string): 'category' | 'value' | null {
    const lowerFieldName = fieldName.toLowerCase();

    // Check if field should be forced to category
    const shouldBeCategory = FORCE_CATEGORY_FIELDS.some(
        cat => lowerFieldName === cat || lowerFieldName.includes(cat) || cat.includes(lowerFieldName)
    );

    if (shouldBeCategory) {
        return 'category';
    }

    // Check value type
    if (value === null || value === undefined || value === '') {
        return null; // Cannot determine type
    }

    if (typeof value === 'number') {
        return 'value';
    }

    if (typeof value === 'string') {
        // Check if it's a numeric string
        const numValue = parseFloat(value);
        if (!isNaN(numValue) && isFinite(numValue)) {
            return 'value';
        }
        return 'category';
    }

    if (typeof value === 'boolean') {
        return 'category';
    }

    if (Array.isArray(value)) {
        return 'category'; // Arrays are typically categories (lists of items)
    }

    return 'category'; // Default to category
}

/**
 * Gets default aggregation for a numeric field
 */
function getDefaultAggregation(fieldName: string): 'sum' | 'average' {
    const lowerFieldName = fieldName.toLowerCase();
    if (
        lowerFieldName.includes('rate') ||
        lowerFieldName.includes('price') ||
        lowerFieldName.includes('margin') ||
        lowerFieldName.includes('percent')
    ) {
        return 'average';
    }
    return 'sum';
}

/**
 * Gets hierarchy level from field path
 */
export function getHierarchyLevel(fieldPath: string): string {
    const parts = fieldPath.split('.');
    const firstPart = parts[0].toLowerCase();

    // Map to hierarchy names
    if (firstPart === 'ledgerentries' || firstPart === 'allledgerentries') {
        if (parts.length > 1 && parts[1].toLowerCase() === 'billallocations') {
            return 'billallocations';
        }
        return 'ledgerentries';
    }

    if (firstPart === 'allinventoryentries' || firstPart === 'inventoryentries') {
        if (parts.length > 1) {
            const secondPart = parts[1].toLowerCase();
            if (secondPart === 'batchallocation') {
                return 'batchallocation';
            }
            if (secondPart === 'accountingallocation') {
                return 'accountingallocation';
            }
        }
        return 'allinventoryentries';
    }

    if (firstPart === 'address') {
        return 'address';
    }

    // Detect stock item/inventory fields even when flattened
    const stockItemFieldPatterns = [
        'stockitem',
        '^item$',
        '^itemid$',
        '^category$',
        '^quantity$',
        '^qty$',
        'billedqty',
        'actualqty',
        '^uom$',
        'grosscost',
        'grossexpense',
        '^profit$',
        'ledgergroup',
        'accountingallocation',
        'batchallocation',
        'rate',
        'mrp',
        'discount',
        'mfgdate',
        'expdate',
        'batch',
        'godown',
        'location',
        'isdeemedpositive',
    ];

    const isStockItemField = stockItemFieldPatterns.some(pattern => {
        const regex = new RegExp(pattern, 'i');
        return regex.test(firstPart);
    });

    // Exclude voucher-level fields
    const voucherLevelExceptions = [
        'vouchernumber', 'vchno', 'voucher_number', 'voucher',
        'partyledger', 'customer', 'party', 'partyname', 'partyid',
        'date', 'cp_date', 'referencedate',
        'salesperson', 'salesprsn',
        'country', 'state', 'region', 'pincode',
        'reference', 'alterid', 'masterid', 'mstid',
        'reservedname', 'vouchertype', 'vchtype', 'vouchertypename',
        'iscancelled', 'isoptional',
        'department', 'consigneecountryname', 'consigneestatename',
        'basicbuyeraddress', 'gstno', 'partygstin',
        'amount',
    ];

    const isVoucherLevelException = voucherLevelExceptions.some(exception => {
        const exceptionLower = exception.toLowerCase();
        return firstPart.includes(exceptionLower) || firstPart === exceptionLower;
    });

    if (isStockItemField && !isVoucherLevelException) {
        return 'allinventoryentries';
    }

    return 'voucher';
}

/**
 * Formats field label from path
 */
function formatFieldLabel(fieldPath: string): string {
    const parts = fieldPath.split('.');
    const lastPart = parts[parts.length - 1];

    // Convert camelCase/snake_case to Title Case
    const formatted = lastPart
        .replace(/([A-Z])/g, ' $1')
        .replace(/_/g, ' ')
        .replace(/\b\w/g, l => l.toUpperCase())
        .trim();

    // If nested, show hierarchy
    if (parts.length > 1) {
        const hierarchyName = HIERARCHY_MAP[getHierarchyLevel(fieldPath)] || getHierarchyLevel(fieldPath);
        return `${hierarchyName} → ${formatted}`;
    }

    return formatted;
}

/**
 * Recursively traverses an object to extract all fields
 */
function traverseObject(
    obj: unknown,
    path: string,
    fields: Map<string, FieldMetadata>,
    hierarchy: Record<string, unknown>,
    maxDepth: number = 5,
    currentDepth: number = 0
): void {
    if (!obj || currentDepth >= maxDepth) {
        return;
    }

    // Handle arrays - traverse first item to get structure
    if (Array.isArray(obj)) {
        if (obj.length > 0 && typeof obj[0] === 'object') {
            traverseObject(obj[0], path, fields, hierarchy, maxDepth, currentDepth);
        }
        return;
    }

    // Handle objects
    if (typeof obj === 'object' && obj !== null) {
        const record = obj as Record<string, unknown>;
        Object.keys(record).forEach(key => {
            const value = record[key];
            const fieldPath = path ? `${path}.${key}` : key;

            // Skip internal/metadata fields
            if (key.startsWith('_') || key.startsWith('$')) {
                return;
            }

            // Determine field type
            const fieldType = determineFieldType(value, fieldPath);

            if (fieldType) {
                const fieldKey = fieldPath.toLowerCase();
                if (!fields.has(fieldKey)) {
                    const field: FieldMetadata = {
                        value: fieldPath,
                        label: formatFieldLabel(fieldPath),
                        type: fieldType,
                        path: path,
                        hierarchy: getHierarchyLevel(fieldPath),
                    };

                    // Add default aggregation for value fields
                    if (fieldType === 'value') {
                        field.aggregation = getDefaultAggregation(fieldPath);
                    }

                    fields.set(fieldKey, field);
                }
            }

            // Recursively traverse nested objects and arrays
            if (value !== null && value !== undefined) {
                if (Array.isArray(value)) {
                    if (value.length > 0 && typeof value[0] === 'object') {
                        traverseObject(value[0], fieldPath, fields, hierarchy, maxDepth, currentDepth + 1);
                    }
                } else if (typeof value === 'object') {
                    traverseObject(value, fieldPath, fields, hierarchy, maxDepth, currentDepth + 1);
                }
            }
        });
    }
}

/**
 * Groups fields by hierarchy level
 */
function groupFieldsByHierarchy(fields: FieldMetadata[]): Record<string, FieldGroup> {
    const grouped: Record<string, FieldGroup> = {};

    fields.forEach(field => {
        const level = field.hierarchy || 'voucher';
        if (!grouped[level]) {
            grouped[level] = {
                name: HIERARCHY_MAP[level] || level,
                level: level,
                fields: [],
            };
        }
        grouped[level].fields.push(field);
    });

    // Sort fields within each group
    Object.keys(grouped).forEach(level => {
        grouped[level].fields.sort((a, b) => a.label.localeCompare(b.label));
    });

    return grouped;
}

/**
 * Main function to extract all fields from cache data
 */
export function extractAllFieldsFromCache(cacheData: SalesVoucher[]): ExtractedFields {
    if (!cacheData || !Array.isArray(cacheData) || cacheData.length === 0) {
        return {
            fields: [],
            hierarchy: {},
            grouped: {},
        };
    }

    const fields = new Map<string, FieldMetadata>();
    const hierarchy: Record<string, unknown> = {};

    // Process first few records to extract field structure
    const sampleSize = Math.min(10, cacheData.length);
    for (let i = 0; i < sampleSize; i++) {
        const record = cacheData[i];
        if (record) {
            traverseObject(record, '', fields, hierarchy);
        }
    }

    // Convert Map to Array
    const fieldsArray = Array.from(fields.values());

    // Sort fields
    const hierarchyOrder = [
        'voucher', 'ledgerentries', 'billallocations',
        'allinventoryentries', 'batchallocation', 'accountingallocation', 'address',
    ];

    fieldsArray.sort((a, b) => {
        const aOrder = hierarchyOrder.indexOf(a.hierarchy) >= 0 ? hierarchyOrder.indexOf(a.hierarchy) : 999;
        const bOrder = hierarchyOrder.indexOf(b.hierarchy) >= 0 ? hierarchyOrder.indexOf(b.hierarchy) : 999;

        if (aOrder !== bOrder) {
            return aOrder - bOrder;
        }

        return a.label.localeCompare(b.label);
    });

    // Group by hierarchy
    const grouped = groupFieldsByHierarchy(fieldsArray);

    return {
        fields: fieldsArray,
        hierarchy: hierarchy,
        grouped: grouped,
    };
}

// Helper functions for case conversion
function toCamelCase(str: string): string {
    return str.charAt(0).toLowerCase() + str.slice(1);
}

function toPascalCase(str: string): string {
    return str.charAt(0).toUpperCase() + str.slice(1);
}

/**
 * Gets field value from nested object using dot notation path
 * Handles nested arrays by returning the first value found
 */
export function getNestedFieldValue(obj: unknown, fieldPath: string): unknown {
    if (!obj || !fieldPath) {
        return null;
    }

    const parts = fieldPath.split('.');

    function findValue(currentObj: unknown, pathParts: string[], currentIndex: number = 0): unknown {
        if (!currentObj || currentIndex >= pathParts.length) {
            return null;
        }

        const part = pathParts[currentIndex];
        const isLastPart = currentIndex === pathParts.length - 1;
        const record = currentObj as Record<string, unknown>;

        // Try multiple case variations
        const value =
            record[part] ||
            record[part.toLowerCase()] ||
            record[part.toUpperCase()] ||
            record[toCamelCase(part)] ||
            record[toPascalCase(part)];

        if (value === undefined || value === null) {
            return null;
        }

        // If this is the last part, return the value
        if (isLastPart) {
            if (Array.isArray(value)) {
                return value.length > 0 ? value[0] : null;
            }
            return value;
        }

        // Continue traversing
        if (Array.isArray(value)) {
            if (value.length > 0 && value[0] && typeof value[0] === 'object') {
                return findValue(value[0], pathParts, currentIndex + 1);
            }
            return null;
        } else if (value && typeof value === 'object') {
            return findValue(value, pathParts, currentIndex + 1);
        }

        return null;
    }

    return findValue(obj, parts);
}

/**
 * Gets all values from nested array field (handles nested arrays recursively)
 */
export function getNestedFieldValues(obj: unknown, fieldPath: string): unknown[] {
    if (!obj || !fieldPath) {
        return [];
    }

    const parts = fieldPath.split('.');

    function extractValues(currentObj: unknown, pathParts: string[], currentIndex: number = 0): unknown[] {
        if (!currentObj || currentIndex >= pathParts.length) {
            return [];
        }

        const part = pathParts[currentIndex];
        const isLastPart = currentIndex === pathParts.length - 1;
        const record = currentObj as Record<string, unknown>;

        // Try multiple case variations
        const value =
            record[part] ||
            record[part.toLowerCase()] ||
            record[part.toUpperCase()] ||
            record[toCamelCase(part)] ||
            record[toPascalCase(part)];

        if (value === undefined || value === null) {
            return [];
        }

        // If this is the last part, extract the field value
        if (isLastPart) {
            if (Array.isArray(value)) {
                return value.filter((v): v is NonNullable<typeof v> => v !== null && v !== undefined);
            }
            return [value];
        }

        // Continue traversing
        const results: unknown[] = [];

        if (Array.isArray(value)) {
            value.forEach(item => {
                if (item && typeof item === 'object') {
                    const nestedValues = extractValues(item, pathParts, currentIndex + 1);
                    results.push(...nestedValues);
                }
            });
        } else if (value && typeof value === 'object') {
            const nestedValues = extractValues(value, pathParts, currentIndex + 1);
            results.push(...nestedValues);
        }

        return results;
    }

    return extractValues(obj, parts).filter((v): v is NonNullable<typeof v> => v !== null && v !== undefined);
}

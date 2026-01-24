package com.datalynkr.sales.utils

import com.datalynkr.sales.models.*

/**
 * Field Extractor Utility
 * Strictly translated from fieldExtractor.js
 * Extracts all fields from nested voucher structures in cache data
 * Supports hierarchical field paths with dot notation
 */
object FieldExtractor {
    
    // Fields that should always be categories (even if numeric)
    private val FORCE_CATEGORY_FIELDS = setOf(
        // Date fields
        "date", "cp_date", "cpdate", "transaction_date", "voucher_date", "bill_date",
        // Location fields
        "pincode", "pin_code", "pin", "zipcode", "zip",
        // Voucher/ID fields
        "vouchernumber", "vchno", "voucher_number", "masterid", "alterid",
        "partyledgernameid", "partyid", "stockitemnameid", "itemid",
        "partygstin", "gstin", "gst_no", "pan",
        // Contact fields
        "phone", "mobile", "telephone", "contact",
        // Reference fields
        "reference", "ref_no", "invoice_no", "bill_no",
        // Address fields
        "address", "basicbuyeraddress", "buyer_address",
        // Other category fields
        "reservedname", "vchtype", "vouchertypename", "issales"
    )
    
    /**
     * Determines if a field should be treated as a value (numeric) or category
     */
    fun determineFieldType(value: Any?, fieldName: String): FieldType? {
        val lowerFieldName = fieldName.lowercase()
        
        // Check if field should be forced to category
        val shouldBeCategory = FORCE_CATEGORY_FIELDS.any { cat ->
            lowerFieldName == cat || lowerFieldName.contains(cat) || cat.contains(lowerFieldName)
        }
        
        if (shouldBeCategory) {
            return FieldType.CATEGORY
        }
        
        // Check value type
        return when (value) {
            null -> null // Cannot determine type
            is Number -> FieldType.VALUE
            is String -> {
                // Check if it's a numeric string
                val numValue = value.toDoubleOrNull()
                if (numValue != null && numValue.isFinite()) {
                    FieldType.VALUE
                } else {
                    FieldType.CATEGORY
                }
            }
            is Boolean -> FieldType.CATEGORY
            is List<*> -> FieldType.CATEGORY // Arrays are typically categories
            else -> FieldType.CATEGORY // Default to category
        }
    }
    
    /**
     * Gets default aggregation for a numeric field
     */
    fun getDefaultAggregation(fieldName: String): AggregationType {
        val lowerFieldName = fieldName.lowercase()
        return if (lowerFieldName.contains("rate") || 
                   lowerFieldName.contains("price") || 
                   lowerFieldName.contains("margin") || 
                   lowerFieldName.contains("percent")) {
            AggregationType.AVERAGE
        } else {
            AggregationType.SUM
        }
    }
    
    /**
     * Gets hierarchy level from field path
     */
    fun getHierarchyLevel(fieldPath: String): String {
        val parts = fieldPath.split(".")
        val firstPart = parts[0].lowercase()
        
        // Map to hierarchy names
        when {
            firstPart == "ledgerentries" || firstPart == "allledgerentries" -> {
                if (parts.size > 1 && parts[1].lowercase() == "billallocations") {
                    return FieldHierarchy.BILL_ALLOCATIONS
                }
                return FieldHierarchy.LEDGER_ENTRIES
            }
            firstPart == "allinventoryentries" || firstPart == "inventoryentries" -> {
                if (parts.size > 1) {
                    when (parts[1].lowercase()) {
                        "batchallocation" -> return FieldHierarchy.BATCH_ALLOCATION
                        "accountingallocation" -> return FieldHierarchy.ACCOUNTING_ALLOCATION
                    }
                }
                return FieldHierarchy.INVENTORY_ENTRIES
            }
            firstPart == "address" -> return FieldHierarchy.ADDRESS
        }
        
        // Detect stock item/inventory fields even when flattened to top level
        val stockItemFieldPatterns = listOf(
            "stockitem", "^item$", "^itemid$", "^category$", 
            "quantity", "qty", "billedqty", "actualqty",
            "uom", "grosscost", "grossexpense", "^profit$",
            "ledgergroup", "accountingallocation", "batchallocation",
            "rate", "mrp", "discount", "mfgdate", "expdate",
            "batch", "godown", "location", "isdeemedpositive"
        )
        
        val isStockItemField = stockItemFieldPatterns.any { pattern ->
            if (pattern.startsWith("^") && pattern.endsWith("$")) {
                firstPart == pattern.substring(1, pattern.length - 1)
            } else {
                firstPart.contains(pattern.lowercase())
            }
        }
        
        // Exclude fields that are clearly voucher-level
        val voucherLevelExceptions = setOf(
            "vouchernumber", "vchno", "voucher_number", "voucher",
            "partyledger", "customer", "party", "partyname", "partyid",
            "date", "cp_date", "referencedate",
            "salesperson", "salesprsn",
            "country", "state", "region", "pincode",
            "reference", "alterid", "masterid", "mstid",
            "reservedname", "vouchertype", "vchtype", "vouchertypename", "vouchertypeidentify",
            "iscancelled", "isoptional",
            "department", "consigneecountryname", "consigneestatename",
            "basicbuyeraddress", "gstno", "partygstin",
            "amount"
        )
        
        val isVoucherLevelException = voucherLevelExceptions.any { exception ->
            firstPart.contains(exception.lowercase()) || firstPart == exception.lowercase()
        }
        
        if (isStockItemField && !isVoucherLevelException) {
            return FieldHierarchy.INVENTORY_ENTRIES
        }
        
        // Default to voucher level
        return FieldHierarchy.VOUCHER
    }
    
    /**
     * Formats field label from path
     */
    fun formatFieldLabel(fieldPath: String): String {
        val parts = fieldPath.split(".")
        val lastPart = parts.last()
        
        // Convert camelCase/snake_case to Title Case
        val formatted = lastPart
            .replace(Regex("([A-Z])"), " $1")
            .replace("_", " ")
            .split(" ")
            .joinToString(" ") { it.replaceFirstChar { char -> char.uppercase() } }
            .trim()
        
        // If nested, show hierarchy
        if (parts.size > 1) {
            val hierarchyName = FieldHierarchy.HIERARCHY_MAP[getHierarchyLevel(fieldPath)] 
                ?: getHierarchyLevel(fieldPath)
            return "$hierarchyName → $formatted"
        }
        
        return formatted
    }
    
    /**
     * Extracts all fields from cache data
     * @param cacheData Array of voucher objects from cache
     * @return Map of field metadata grouped by hierarchy
     */
    fun extractAllFieldsFromCache(cacheData: List<SalesVoucher>): Map<String, List<FieldMetadata>> {
        if (cacheData.isEmpty()) {
            return emptyMap()
        }
        
        val fields = mutableMapOf<String, FieldMetadata>()
        
        // Process first few records to extract field structure
        val sampleSize = minOf(10, cacheData.size)
        for (i in 0 until sampleSize) {
            val record = cacheData[i]
            traverseObject(record, "", fields)
        }
        
        // Group by hierarchy
        return groupFieldsByHierarchy(fields.values.toList())
    }
    
    /**
     * Recursively traverses an object to extract all fields
     */
    private fun traverseObject(
        obj: Any?,
        path: String,
        fields: MutableMap<String, FieldMetadata>,
        maxDepth: Int = 5,
        currentDepth: Int = 0
    ) {
        if (obj == null || currentDepth >= maxDepth) return
        
        when (obj) {
            is List<*> -> {
                if (obj.isNotEmpty()) {
                    traverseObject(obj[0], path, fields, maxDepth, currentDepth)
                }
            }
            is Map<*, *> -> {
                obj.forEach { (key, value) ->
                    val keyStr = key.toString()
                    if (keyStr.startsWith("_") || keyStr.startsWith("$")) return@forEach
                    
                    val fieldPath = if (path.isEmpty()) keyStr else "$path.$keyStr"
                    val fieldType = determineFieldType(value, fieldPath)
                    
                    if (fieldType != null) {
                        val fieldKey = fieldPath.lowercase()
                        if (!fields.containsKey(fieldKey)) {
                            fields[fieldKey] = FieldMetadata(
                                value = fieldPath,
                                label = formatFieldLabel(fieldPath),
                                type = fieldType,
                                path = path,
                                hierarchy = getHierarchyLevel(fieldPath),
                                aggregation = if (fieldType == FieldType.VALUE) {
                                    getDefaultAggregation(fieldPath)
                                } else null
                            )
                        }
                    }
                    
                    // Recursively traverse nested objects
                    when (value) {
                        is List<*> -> {
                            if (value.isNotEmpty() && value[0] is Map<*, *>) {
                                traverseObject(value[0], fieldPath, fields, maxDepth, currentDepth + 1)
                            }
                        }
                        is Map<*, *> -> {
                            traverseObject(value, fieldPath, fields, maxDepth, currentDepth + 1)
                        }
                    }
                }
            }
        }
    }
    
    /**
     * Groups fields by hierarchy level
     */
    private fun groupFieldsByHierarchy(fields: List<FieldMetadata>): Map<String, List<FieldMetadata>> {
        val grouped = fields.groupBy { it.hierarchy }
        
        // Sort fields within each group
        return grouped.mapValues { (_, fieldsList) ->
            fieldsList.sortedBy { it.label }
        }
    }
    
    /**
     * Gets field value from nested object using dot notation path
     * Handles nested arrays by returning the first value found
     */
    fun getNestedFieldValue(obj: Any?, fieldPath: String): Any? {
        if (obj == null || fieldPath.isEmpty()) return null
        
        val parts = fieldPath.split(".")
        return findValue(obj, parts, 0)
    }
    
    private fun findValue(currentObj: Any?, pathParts: List<String>, currentIndex: Int): Any? {
        if (currentObj == null || currentIndex >= pathParts.size) return null
        
        val part = pathParts[currentIndex]
        val isLastPart = currentIndex == pathParts.size - 1
        
        // Try multiple case variations for property access
        val value = when (currentObj) {
            is Map<*, *> -> {
                currentObj[part] 
                    ?: currentObj[part.lowercase()] 
                    ?: currentObj[part.uppercase()]
                    ?: currentObj[part.toCamelCase()]
                    ?: currentObj[part.toPascalCase()]
            }
            else -> null
        }
        
        if (value == null) return null
        
        // If this is the last part, return the value
        if (isLastPart) {
            return when (value) {
                is List<*> -> value.firstOrNull() // Return first item of array
                else -> value
            }
        }
        
        // Continue traversing
        return when (value) {
            is List<*> -> {
                if (value.isNotEmpty() && value[0] is Map<*, *>) {
                    findValue(value[0], pathParts, currentIndex + 1)
                } else null
            }
            is Map<*, *> -> findValue(value, pathParts, currentIndex + 1)
            else -> null
        }
    }
    
    /**
     * Gets all values from nested array field (handles nested arrays recursively)
     */
    fun getNestedFieldValues(obj: Any?, fieldPath: String): List<Any> {
        if (obj == null || fieldPath.isEmpty()) return emptyList()
        
        val parts = fieldPath.split(".")
        return extractValues(obj, parts, 0)
    }
    
    private fun extractValues(currentObj: Any?, pathParts: List<String>, currentIndex: Int): List<Any> {
        if (currentObj == null || currentIndex >= pathParts.size) return emptyList()
        
        val part = pathParts[currentIndex]
        val isLastPart = currentIndex == pathParts.size - 1
        
        val value = when (currentObj) {
            is Map<*, *> -> {
                currentObj[part] 
                    ?: currentObj[part.lowercase()] 
                    ?: currentObj[part.uppercase()]
                    ?: currentObj[part.toCamelCase()]
                    ?: currentObj[part.toPascalCase()]
            }
            else -> null
        }
        
        if (value == null) return emptyList()
        
        // If this is the last part, extract the field value
        if (isLastPart) {
            return when (value) {
                is List<*> -> value.filterNotNull()
                else -> listOf(value)
            }
        }
        
        // Continue traversing
        val results = mutableListOf<Any>()
        when (value) {
            is List<*> -> {
                value.forEach { item ->
                    if (item is Map<*, *>) {
                        results.addAll(extractValues(item, pathParts, currentIndex + 1))
                    }
                }
            }
            is Map<*, *> -> {
                results.addAll(extractValues(value, pathParts, currentIndex + 1))
            }
        }
        
        return results.filterNotNull()
    }
}

// Extension functions for case conversion
private fun String.toCamelCase(): String {
    return this.replaceFirstChar { it.lowercase() }
}

private fun String.toPascalCase(): String {
    return this.replaceFirstChar { it.uppercase() }
}

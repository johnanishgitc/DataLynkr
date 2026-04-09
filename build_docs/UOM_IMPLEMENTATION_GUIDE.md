# Unit of Measurement (UOM) Implementation Guide

## Table of Contents
1. [Overview](#overview)
2. [Data Structures](#data-structures)
3. [Supported Scenarios](#supported-scenarios)
4. [Core Functions](#core-functions)
5. [Calculation Formulas](#calculation-formulas)
6. [Implementation Details](#implementation-details)
7. [Usage Examples](#usage-examples)

---

## Overview

This document describes a comprehensive Unit of Measurement (UOM) system that supports:
- **Simple Units**: Single unit types (e.g., "box", "nos", "ML")
- **Compound Units**: Units composed of multiple parts (e.g., "LTR of 1000 ML", "pkt of 10 nos")
- **Primary and Alternative Units**: Items can have a base unit and an additional unit with conversion ratios
- **Custom Conversion Override**: Users can define custom conversion ratios (e.g., "10 box = 22 nos")
- **Flexible Input Parsing**: Supports various input formats including abbreviations and no-space formats
- **Decimal Place Validation**: Enforces decimal place rules based on unit configuration
- **Dynamic Rate UOM Selection**: Rate can be specified in any configured unit

### Key Features
- Tally-like quantity input field (single field instead of multiple fields)
- Automatic conversion between units
- Real-time validation and formatting
- Support for all 6 ordering permutations of compound units
- Abbreviation support (e.g., "L" for "LTR", "M" for "ML")
- Hyphenated display format for compound units (e.g., "2-500.000 LTR")

---

## Data Structures

### Stock Item Structure
```javascript
{
  "MASTERID": "225",
  "NAME": "Item with Compound + Simple",
  "BASEUNITS": "pkt of 10 nos",        // Primary unit (can be compound)
  "ADDITIONALUNITS": "box",             // Alternative unit (can be compound)
  "DENOMINATOR": "100",                 // Base unit quantity
  "CONVERSION": "1",                    // Additional unit quantity
  "CLOSINGSTOCK": 0,
  "IGST": 0,
  "STDPRICE": "MA==",                  // Obfuscated price
  "LASTPRICE": "MA==",                  // Obfuscated price
  "PRICELEVELS": []                     // Customer-specific pricing
}
```

**Conversion Formula**: `DENOMINATOR BASEUNITS = CONVERSION ADDITIONALUNITS`
- Example: `100 nos = 1 box` means `DENOMINATOR: 100`, `CONVERSION: 1`

### Unit Structure (from Units Array)
```javascript
{
  "NAME": "pkt of 10 nos",             // Unit name
  "ISSIMPLEUNIT": "No",                 // "Yes" or "No"
  "DECIMALPLACES": 0,                   // Number of decimal places allowed
  "BASEUNITS": "pkt",                   // Main component (for compound units)
  "ADDITIONALUNITS": "nos",             // Sub component (for compound units)
  "CONVERSION": "10"                    // Conversion factor (e.g., 1 pkt = 10 nos)
}
```

### Unit Config Structure (Built from Item + Units Array)
```javascript
{
  "BASEUNITS": "pkt of 10 nos",
  "ADDITIONALUNITS": "box",
  "DENOMINATOR": "100",
  "CONVERSION": "1",
  "BASEUNIT_DECIMAL": 0,                // Decimal places for base unit
  "ADDITIONALUNITS_DECIMAL": 0,         // Decimal places for additional unit
  "BASEUNITHASCOMPOUNDUNIT": "Yes",     // Whether base unit is compound
  "BASEUNITCOMP_BASEUNIT": "pkt",        // Base component of compound base unit
  "BASEUNITCOMP_ADDLUNIT": "nos",       // Sub component of compound base unit
  "BASEUNITCOMP_CONVERSION": "10",      // Conversion for compound base unit
  "BASEUNITCOMP_ADDLUNIT_DECIMAL": 0,   // Decimal places for sub component
  "ADDITIONALUNITHASCOMPOUNDUNIT": "No", // Whether additional unit is compound
  "ADDLUNITCOMP_BASEUNIT": "",          // Base component of compound additional unit
  "ADDLUNITCOMP_ADDLUNIT": "",          // Sub component of compound additional unit
  "ADDLUNITCOMP_CONVERSION": ""         // Conversion for compound additional unit
}
```

---

## Supported Scenarios

### Scenario 1: Simple Base Unit (with/without decimal places)
**Configuration**:
- `BASEUNITS`: Simple unit (e.g., "box", "nos", "ML")
- `ADDITIONALUNITS`: Empty or simple unit
- `DECIMALPLACES`: 0 or more

**Input Examples**:
- `10` → Uses base unit
- `10 box` → Explicit base unit
- `10.5 ML` → Decimal allowed if `DECIMALPLACES > 0`

**Display**:
- Quantity field: `10 box`
- Alternative quantity: `(25 nos)` (if ADDITIONALUNITS exists)

**Rate UOM**: Defaults to `'base'`

---

### Scenario 2: Compound Base Unit
**Configuration**:
- `BASEUNITS`: Compound unit (e.g., "LTR of 1000 ML", "pkt of 25 nos")
- `ADDITIONALUNITS`: Empty or simple unit
- Compound unit has: `BASEUNITS: "LTR"`, `ADDITIONALUNITS: "ML"`, `CONVERSION: "1000"`

**Input Examples**:
- `2 LTR 500 ML` → Compound format
- `2LTR 500ML` → No space format
- `2L500M` → Abbreviated format
- `2500 ML` → Sub-component only
- `2.5 LTR` → Main component only
- `2-500.000 LTR` → Hyphenated display format

**Display**:
- Quantity field: `2-500.000 LTR` (hyphenated format)
- Alternative quantity: `(25 box)` (if ADDITIONALUNITS exists)

**Rate UOM**: Defaults to `'component-main'` (e.g., "LTR")
- Options: `'component-main'`, `'component-sub'`, `'additional'` (if exists)

**Amount Calculation**:
- Rate per LTR: `quantityInLTR * rate`
- Rate per ML: `(quantityInLTR * 1000) * rate`
- Rate per box: `(quantityInBaseUnits * conversion/denominator) * rate`

---

### Scenario 3: Simple Base Unit + Simple Additional Unit
**Configuration**:
- `BASEUNITS`: Simple unit (e.g., "box")
- `ADDITIONALUNITS`: Simple unit (e.g., "nos")
- `DENOMINATOR`: "10"
- `CONVERSION`: "25"

**Conversion**: `10 box = 25 nos`

**Input Examples**:
- `10 box` → Base unit
- `25 nos` → Additional unit (auto-converts to base)
- `10 box = 22 nos` → Custom conversion override
- `10b=22n` → Abbreviated custom conversion

**Display**:
- Quantity field: Always shows base unit (e.g., `10 box`)
- Alternative quantity: Always shows additional unit (e.g., `(25 nos)`)

**Rate UOM**: Defaults to `'base'`
- Options: `'base'`, `'additional'`

**Amount Calculation**:
- Rate per box: `quantityInBox * rate`
- Rate per nos: `(quantityInBox * conversion/denominator) * rate`

**Custom Conversion**:
- When user enters `10 box = 22 nos`, this overrides the default `10 box = 25 nos`
- Custom conversion is stored as: `{ baseQty: 10, addlQty: 22, denominator: 10, conversion: 22 }`
- Amount calculation uses custom conversion values when active

---

### Scenario 4: Compound Base Unit + Simple Additional Unit
**Configuration**:
- `BASEUNITS`: Compound unit (e.g., "pkt of 10 nos")
- `ADDITIONALUNITS`: Simple unit (e.g., "box")
- `DENOMINATOR`: "100"
- `CONVERSION`: "1"

**Conversion**: `100 nos = 1 box` (DENOMINATOR refers to sub-component "nos")

**Input Examples**:
- `5 pkt 3 nos` → Compound base unit only
- `5 pkt 3 nos 2 box` → Compound base + simple additional
- `9p 2n 3b` → Abbreviated format (all 6 orderings supported)
- `2n 9p 3b` → Reversed order

**Display**:
- Quantity field: `9-2 pkt` (hyphenated format, preserves compound structure)
- Alternative quantity: `(3 box)`

**Rate UOM**: Defaults to `'component-main'` (e.g., "pkt")
- Options: `'component-main'`, `'component-sub'`, `'additional'`

**Amount Calculation**:
- Rate per pkt: Uses `compoundBaseQty` (e.g., 5.3 pkt from "5 pkt 3 nos")
- Rate per nos: `compoundBaseQty * baseUnitObj.CONVERSION * rate` (e.g., 5.3 * 10 * rate)
- Rate per box: Uses `customAddlQty` (e.g., 2 box * rate)

**Key State Variables**:
- `compoundBaseQty`: Stores compound base quantity (e.g., 5.3 pkt)
- `customAddlQty`: Stores additional unit quantity (e.g., 2 box)
- `baseQtyOnly`: Not used (only for simple base + compound additional)

---

### Scenario 5: Simple Base Unit + Compound Additional Unit
**Configuration**:
- `BASEUNITS`: Simple unit (e.g., "box")
- `ADDITIONALUNITS`: Compound unit (e.g., "pkt of 10 nos")
- `DENOMINATOR`: "1"
- `CONVERSION`: "100"

**Conversion**: `1 box = 100 nos` (CONVERSION refers to sub-component "nos" of compound additional unit)

**Input Examples**:
- `3 box` → Base unit only
- `3 box 9 pkt 7 nos` → Base + compound additional
- `25 pkt` → Component unit of compound additional (auto-converts)
- `55 nos` → Sub-component unit (auto-converts, displays as "2-5 pkt")

**Display**:
- Quantity field: `3 box` (always shows base unit)
- Alternative quantity: `(25-0 pkt)` (hyphenated format for compound additional)

**Rate UOM**: Defaults to `'base'` (e.g., "box")
- Options: `'base'`, `'additional-component-main'`, `'additional-component-sub'`

**Amount Calculation**:
- Rate per box: Uses `baseQtyOnly` (e.g., 3 box from "3 box 9 pkt 7 nos")
- Rate per pkt: Uses `compoundAddlQty` (e.g., 9.7 pkt * rate)
- Rate per nos: `compoundAddlQty * addlCompoundConversion * rate` (e.g., 9.7 * 10 * rate)

**Key State Variables**:
- `baseQtyOnly`: Stores only base quantity (e.g., 3 box)
- `compoundAddlQty`: Stores compound additional quantity (e.g., 9.7 pkt)
- `customAddlQty`: Also stores compound additional quantity (for compatibility)

---

## Core Functions

### 1. `buildUnitConfig(item, unitsArray)`
**Purpose**: Builds a comprehensive unit configuration object from a stock item and the units array.

**Parameters**:
- `item`: Stock item object
- `unitsArray`: Array of unit objects

**Returns**: Unit config object with all decimal places and compound unit details

**Key Logic**:
1. Creates base config from item properties
2. Looks up base unit in units array (case-insensitive)
3. Extracts decimal places and compound unit details
4. Looks up additional unit if present
5. Handles both string and number `DECIMALPLACES`

**Example**:
```javascript
const unitConfig = buildUnitConfig(selectedItem, units);
// Returns: { BASEUNITS: "pkt of 10 nos", BASEUNIT_DECIMAL: 0, ... }
```

---

### 2. `parseQuantityInput(input, unitConfig, unitsArray)`
**Purpose**: Parses user input into a structured quantity object.

**Parameters**:
- `input`: User input string (e.g., "10 box", "2 LTR 500 ML")
- `unitConfig`: Unit configuration object
- `unitsArray`: Array of unit objects

**Returns**: Parsed quantity object:
```javascript
{
  qty: 10,                    // Main quantity
  subQty: 2,                  // Sub quantity (for compound units)
  uom: 'base',                // 'base' or 'additional'
  isCompound: true,           // Whether it's a compound unit
  parts: [...],               // Array of {qty, unit} pairs
  isCustomConversion: false,   // Whether it's a custom conversion
  customAddlQty: 3,           // Additional unit quantity (if applicable)
  totalQty: 13,                // Total quantity in base units (for calculations)
  compoundAddlQty: 25.7,      // Compound additional quantity (if applicable)
  compoundAddlMainQty: 25,    // Main component of compound additional
  compoundAddlSubQty: 0,      // Sub component of compound additional
  isComponentUnit: false,     // Whether user entered a component unit
  componentType: 'main'       // 'main' or 'sub' (for component units)
}
```

**Supported Input Formats**:
1. Simple number: `"10"` → Uses base unit
2. Number + unit: `"10 box"`, `"10ML"`, `"10M"` (auto-completes)
3. Compound unit: `"2 LTR 500 ML"`, `"2LTR500ML"`, `"2L500M"`, `"20ML2L"`
4. Hyphenated format: `"2-500.000 LTR"`
5. Custom conversion: `"10 box = 22 nos"`, `"10b=22n"`
6. Compound + simple: `"9 pkt 2 nos 3 box"` (all 6 orderings)
7. Simple + compound: `"3 box 9 pkt 7 nos"` (all 6 orderings)
8. Component unit: `"25 pkt"` (for compound additional), `"55 nos"` (for compound base)

**Key Logic**:
1. Trims and normalizes input
2. Checks for hyphenated format first
3. Checks for custom conversion format
4. Checks for compound base + simple additional pattern
5. Checks for simple base + compound additional pattern
6. Checks for compound unit pattern
7. Checks for simple unit pattern
8. Handles component unit inputs (e.g., "25 pkt" for compound additional)
9. Returns structured object with all relevant quantities

---

### 3. `validateQuantityInput(input, unitConfig, unitsArray, isBlur)`
**Purpose**: Validates and formats quantity input in real-time.

**Parameters**:
- `input`: User input string
- `unitConfig`: Unit configuration object
- `unitsArray`: Array of unit objects
- `isBlur`: Whether validation is on blur (true) or while typing (false)

**Returns**: Validated and formatted input string, or empty string if invalid

**Key Logic**:
1. Filters invalid characters (allows: `0-9`, `.`, spaces, `A-Za-z`, `=`)
2. Handles decimal point at end (allows while typing, removes on blur if invalid)
3. Validates simple number input (applies decimal place rules)
4. Validates unit names against allowed units
5. Auto-completes partial unit names (e.g., "M" → "ML")
6. Applies decimal place validation based on unit's `DECIMALPLACES`
7. Rounds to integer if `DECIMALPLACES === 0` (only on blur)
8. Formats custom conversion strings
9. Validates compound unit inputs
10. Returns formatted string or empty string if invalid

**Decimal Place Handling**:
- `DECIMALPLACES === 0`: Rounds to nearest integer on blur
- `DECIMALPLACES > 0`: Limits to specified decimal places, applies `toFixed()` on blur

---

### 4. `convertToPrimaryQty(parsedQty, unitConfig, customConversion, unitsArray)`
**Purpose**: Converts any parsed quantity to the primary base unit.

**Parameters**:
- `parsedQty`: Parsed quantity object from `parseQuantityInput`
- `unitConfig`: Unit configuration object
- `customConversion`: Custom conversion object (if applicable)
- `unitsArray`: Array of unit objects

**Returns**: Quantity in primary base units (number)

**Key Logic**:
1. If `parsedQty.totalQty` exists, use it (for compound + simple scenarios)
2. If custom conversion is active, use its `denominator` and `conversion`
3. If base unit is compound:
   - Converts compound quantity to base units using `CONVERSION` from units array
   - Handles `effectiveDenominator` when `DENOMINATOR` refers to sub-component
4. If additional unit is entered:
   - Converts to base units using `DENOMINATOR` and `CONVERSION`
   - If additional unit is compound, handles nested conversion
5. Rounds based on base unit's `DECIMALPLACES` before returning

**Formula for Simple Units**:
```
baseQty = (addlQty * denominator) / conversion
```

**Formula for Compound Base Units**:
```
// If DENOMINATOR refers to sub-component:
effectiveDenominator = denominator / compoundConversion
baseQty = (compoundQty * effectiveDenominator) / conversion

// If DENOMINATOR refers to compound unit:
baseQty = (compoundQty * denominator) / conversion
```

---

### 5. `convertToAlternativeQty(baseQty, unitConfig, unitsArray, customConversion)`
**Purpose**: Converts base quantity to alternative unit quantity.

**Parameters**:
- `baseQty`: Quantity in base units
- `unitConfig`: Unit configuration object
- `unitsArray`: Array of unit objects
- `customConversion`: Custom conversion object (if applicable)

**Returns**: Alternative quantity object:
```javascript
{
  qty: "25-0",    // Formatted quantity (hyphenated for compound units)
  unit: "pkt"     // Unit name (base component for compound units)
}
```

**Key Logic**:
1. Uses custom conversion if active
2. Calculates `effectiveDenominator` if base unit is compound
3. If additional unit is compound:
   - Converts to compound additional unit
   - Formats as hyphenated: `"mainQty-subQty BASEUNIT"`
4. If additional unit is simple:
   - Converts directly
   - Formats based on `DECIMALPLACES`
5. Returns formatted string with unit name

**Formula**:
```
// For simple additional unit:
alternativeQty = baseQty * (conversion / effectiveDenominator)

// For compound additional unit:
// First convert to sub-component:
qtyInSubComponent = baseQty * (conversion / effectiveDenominator)
// Then convert to compound unit:
alternativeQty = qtyInSubComponent / addlCompoundConversion
```

---

### 6. `formatCompoundBaseUnit(qty, subQty, unitConfig, unitsArray)`
**Purpose**: Formats compound base unit for display (e.g., "2-500.000 LTR").

**Parameters**:
- `qty`: Main quantity
- `subQty`: Sub quantity
- `unitConfig`: Unit configuration object
- `unitsArray`: Array of unit objects

**Returns**: Formatted string (e.g., "2-500.000 LTR")

**Key Logic**:
1. Gets decimal places for sub-unit from units array
2. Formats sub quantity based on decimal places
3. Uses base component unit name (e.g., "LTR") instead of full compound name
4. Returns hyphenated format: `"mainQty-formattedSubQty BASEUNIT"`

---

### 7. `formatCompoundAdditionalUnit(qty, unitConfig, unitsArray)`
**Purpose**: Formats compound additional unit for display (e.g., "25-0 pkt").

**Parameters**:
- `qty`: Quantity in compound additional units
- `unitConfig`: Unit configuration object
- `unitsArray`: Array of unit objects

**Returns**: Formatted string (e.g., "25-0 pkt")

**Key Logic**:
1. Extracts compound additional unit from units array
2. Calculates main and sub quantities
3. Formats sub quantity based on sub-unit's `DECIMALPLACES`
4. Uses base component unit name (e.g., "pkt") for display
5. Returns hyphenated format: `"mainQty-formattedSubQty BASEUNIT"`

---

## Calculation Formulas

### Amount Calculation

The amount is calculated based on the selected Rate UOM:

```javascript
amount = quantityInRateUOM * rate
```

#### Scenario 1: Simple Base + Simple Additional

**Rate UOM = 'base'**:
```
quantityInRateUOM = itemQuantity (already in base units)
amount = itemQuantity * rate
```

**Rate UOM = 'additional'**:
```
quantityInRateUOM = itemQuantity * (conversion / denominator)
amount = quantityInRateUOM * rate
```

**With Custom Conversion**:
```
// Use custom conversion values instead of default
quantityInRateUOM = itemQuantity * (customConversion.conversion / customConversion.denominator)
amount = quantityInRateUOM * rate
```

---

#### Scenario 2: Compound Base + Simple Additional

**Rate UOM = 'component-main'** (e.g., rate per pkt):
```
quantityInRateUOM = compoundBaseQty (e.g., 5.3 pkt from "5 pkt 3 nos")
amount = compoundBaseQty * rate
```

**Rate UOM = 'component-sub'** (e.g., rate per nos):
```
quantityInRateUOM = compoundBaseQty * baseUnitObj.CONVERSION (e.g., 5.3 * 10 = 53 nos)
amount = quantityInRateUOM * rate
```

**Rate UOM = 'additional'** (e.g., rate per box):
```
quantityInRateUOM = customAddlQty (e.g., 2 box)
amount = customAddlQty * rate
```

**Key**: `compoundBaseQty` stores only the compound base part, `customAddlQty` stores only the additional part.

---

#### Scenario 3: Simple Base + Compound Additional

**Rate UOM = 'base'** (e.g., rate per box):
```
quantityInRateUOM = baseQtyOnly (e.g., 3 box from "3 box 9 pkt 7 nos")
amount = baseQtyOnly * rate
```

**Rate UOM = 'additional-component-main'** (e.g., rate per pkt):
```
quantityInRateUOM = compoundAddlQty (e.g., 9.7 pkt)
amount = compoundAddlQty * rate
```

**Rate UOM = 'additional-component-sub'** (e.g., rate per nos):
```
quantityInRateUOM = compoundAddlQty * addlCompoundConversion (e.g., 9.7 * 10 = 97 nos)
amount = quantityInRateUOM * rate
```

**Key**: `baseQtyOnly` stores only the base part, `compoundAddlQty` stores the compound additional part.

---

### Effective Denominator Calculation

When `BASEUNITS` is compound and `DENOMINATOR` refers to the sub-component unit:

```javascript
effectiveDenominator = denominator / compoundConversion
```

**Example**:
- Item: `BASEUNITS: "pkt of 10 nos"`, `DENOMINATOR: "100"`, `CONVERSION: "1"`
- Compound unit: `CONVERSION: "10"` (1 pkt = 10 nos)
- `effectiveDenominator = 100 / 10 = 10` (10 pkt = 1 box)

This ensures the conversion formula works correctly:
```
10 pkt (effectiveDenominator) = 1 box (conversion)
```

---

## Implementation Details

### State Management

**Key State Variables**:
```javascript
const [quantityInput, setQuantityInput] = useState('');        // User input string
const [itemQuantity, setItemQuantity] = useState(1);           // Quantity in base units
const [rateUOM, setRateUOM] = useState('base');               // Rate unit of measurement
const [customConversion, setCustomConversion] = useState(null); // Custom conversion override
const [customAddlQty, setCustomAddlQty] = useState(null);      // Additional unit quantity
const [compoundBaseQty, setCompoundBaseQty] = useState(null);  // Compound base quantity
const [compoundAddlQty, setCompoundAddlQty] = useState(null);  // Compound additional quantity
const [baseQtyOnly, setBaseQtyOnly] = useState(null);          // Base quantity only (for simple base + compound additional)
```

### useEffect Hooks

**1. Quantity Parsing and Conversion**:
```javascript
useEffect(() => {
  if (!quantityInput || !selectedItemUnitConfig) {
    setItemQuantity(1);
    return;
  }
  
  const parsedQty = parseQuantityInput(quantityInput, selectedItemUnitConfig, units);
  const primaryQty = convertToPrimaryQty(parsedQty, selectedItemUnitConfig, customConversion, units);
  
  // Round based on base unit's decimal places
  const roundedPrimaryQty = baseUnitDecimal === 0 
    ? Math.round(primaryQty)
    : parseFloat(primaryQty.toFixed(baseUnitDecimal));
  
  setItemQuantity(roundedPrimaryQty);
  
  // Store compound quantities for amount calculation
  // ... (see full implementation)
}, [quantityInput, selectedItemUnitConfig, units, customConversion]);
```

**2. Amount Calculation**:
```javascript
useEffect(() => {
  if (!itemQuantity || !itemRate || !selectedItemUnitConfig) {
    setItemAmount(0);
    return;
  }
  
  let quantityInRateUOM = itemQuantity;
  
  // Calculate quantityInRateUOM based on rateUOM
  // ... (see calculation formulas above)
  
  const calculatedAmount = quantityInRateUOM * itemRate;
  setItemAmount(calculatedAmount);
}, [itemQuantity, itemRate, rateUOM, selectedItemUnitConfig, customConversion, compoundBaseQty, compoundAddlQty, baseQtyOnly, units]);
```

**3. Item Selection**:
```javascript
useEffect(() => {
  if (selectedItem && stockItems.length > 0) {
    const selectedStockItem = stockItems.find(item => item.NAME === selectedItem);
    if (selectedStockItem) {
      const unitConfig = buildUnitConfig(selectedStockItem, units);
      setSelectedItemUnitConfig(unitConfig);
      
      // Set default Rate UOM
      if (unitConfig) {
        const baseUnitObj = units.find(u => u.NAME === unitConfig.BASEUNITS);
        const hasCompoundBaseUnit = baseUnitObj && baseUnitObj.ISSIMPLEUNIT === 'No';
        
        if (hasCompoundBaseUnit) {
          setRateUOM('component-main');
        } else {
          setRateUOM('base');
        }
      }
    }
  }
}, [selectedItem, stockItems, units]);
```

### Input Handlers

**onChange Handler**:
```javascript
const handleQuantityChange = (e) => {
  const input = e.target.value;
  const validated = validateQuantityInput(input, selectedItemUnitConfig, units, false);
  if (validated !== '') {
    setQuantityInput(validated);
  }
};
```

**onBlur Handler**:
```javascript
const handleQuantityBlur = (e) => {
  const input = e.target.value;
  const validated = validateQuantityInput(input, selectedItemUnitConfig, units, true);
  
  if (validated && selectedItemUnitConfig) {
    const originalParsedQty = parseQuantityInput(input, selectedItemUnitConfig, units);
    const parsedQty = parseQuantityInput(validated, selectedItemUnitConfig, units);
    
    // Always convert to BASEUNITS format for display
    if (parsedQty.isCompound && parsedQty.qty !== undefined && parsedQty.subQty !== undefined) {
      // Format as hyphenated: "9-2 pkt"
      const formatted = formatCompoundBaseUnit(
        parsedQty.qty,
        parsedQty.subQty,
        selectedItemUnitConfig,
        units
      );
      setQuantityInput(formatted);
    } else if (parsedQty.uom === 'base') {
      // Simple base unit: "10 box"
      const baseUnitDecimal = /* get from units array */;
      const formattedQty = baseUnitDecimal === 0 
        ? Math.round(parsedQty.qty).toString()
        : parsedQty.qty.toFixed(baseUnitDecimal);
      setQuantityInput(`${formattedQty} ${selectedItemUnitConfig.BASEUNITS}`);
    } else if (parsedQty.uom === 'additional') {
      // Convert to base unit for display
      const baseQty = convertToPrimaryQty(parsedQty, selectedItemUnitConfig, null, units);
      const formattedQty = /* format based on decimal places */;
      setQuantityInput(`${formattedQty} ${selectedItemUnitConfig.BASEUNITS}`);
    }
    
    // Preserve custom conversion and compound quantities
    // ... (see full implementation)
  }
};
```

---

## Usage Examples

### Example 1: Simple Unit with Decimal Places
```javascript
// Item: BASEUNITS = "ML", DECIMALPLACES = 3
// User input: "10.5 ML"
// Parsed: { qty: 10.5, uom: 'base', isCompound: false }
// Display: "10.500 ML"
// itemQuantity: 10.5
```

### Example 2: Compound Unit Input
```javascript
// Item: BASEUNITS = "LTR of 1000 ML"
// User input: "2LTR500ML"
// Parsed: { qty: 2, subQty: 500, uom: 'base', isCompound: true }
// Display: "2-500.000 LTR"
// itemQuantity: 2.5 (in LTR)
```

### Example 3: Custom Conversion
```javascript
// Item: BASEUNITS = "box", ADDITIONALUNITS = "nos", DENOMINATOR = "10", CONVERSION = "25"
// Default: 10 box = 25 nos
// User input: "10 box = 22 nos"
// Parsed: { qty: 10, uom: 'base', isCustomConversion: true, customAddlQty: 22 }
// customConversion: { baseQty: 10, addlQty: 22, denominator: 10, conversion: 22 }
// Display: "10 box"
// Alternative: "(22 nos)"
// Amount calculation uses custom conversion (22 nos instead of 25 nos)
```

### Example 4: Compound Base + Simple Additional
```javascript
// Item: BASEUNITS = "pkt of 10 nos", ADDITIONALUNITS = "box", DENOMINATOR = "100", CONVERSION = "1"
// User input: "5 pkt 3 nos 2 box"
// Parsed: {
//   qty: 5,
//   subQty: 3,
//   uom: 'base',
//   isCompound: true,
//   customAddlQty: 2,
//   totalQty: 5.3 (in pkt) + converted box quantity
// }
// compoundBaseQty: 5.3 (pkt)
// customAddlQty: 2 (box)
// Display: "5-3 pkt"
// Alternative: "(2 box)"
// Amount calculation:
//   - Rate per pkt: 5.3 * rate
//   - Rate per nos: 5.3 * 10 * rate
//   - Rate per box: 2 * rate
```

### Example 5: Simple Base + Compound Additional
```javascript
// Item: BASEUNITS = "box", ADDITIONALUNITS = "pkt of 10 nos", DENOMINATOR = "1", CONVERSION = "100"
// User input: "3 box 9 pkt 7 nos"
// Parsed: {
//   qty: 3,
//   uom: 'base',
//   isCompound: false,
//   customAddlQty: 9.7,
//   totalQty: 3 + converted pkt quantity
// }
// baseQtyOnly: 3 (box)
// compoundAddlQty: 9.7 (pkt)
// Display: "3 box"
// Alternative: "(9-7 pkt)"
// Amount calculation:
//   - Rate per box: 3 * rate
//   - Rate per pkt: 9.7 * rate
//   - Rate per nos: 9.7 * 10 * rate
```

### Example 6: Component Unit Input
```javascript
// Item: BASEUNITS = "box", ADDITIONALUNITS = "pkt of 10 nos"
// User input: "25 pkt"
// Parsed: {
//   qty: /* converted to base units */,
//   uom: 'base',
//   isComponentUnit: true,
//   componentType: 'main',
//   compoundAddlQty: 25,
//   compoundAddlMainQty: 25,
//   compoundAddlSubQty: 0
// }
// Display: "3 box" (converted)
// Alternative: "(25-0 pkt)" (preserved from input)
```

---

## Best Practices

1. **Always use `buildUnitConfig`** to create unit configuration from items and units array
2. **Validate input in real-time** using `validateQuantityInput` (pass `isBlur: false` while typing)
3. **Parse input** using `parseQuantityInput` before any calculations
4. **Convert to primary quantity** using `convertToPrimaryQty` for internal calculations
5. **Display alternative quantity** using `convertToAlternativeQty` for UI
6. **Store compound quantities separately** for accurate amount calculation
7. **Preserve custom conversions** across input reformatting
8. **Round quantities** based on unit's `DECIMALPLACES` before calculations
9. **Handle component unit inputs** specially (e.g., "25 pkt" for compound additional)
10. **Use `effectiveDenominator`** when `DENOMINATOR` refers to sub-component of compound unit

---

## Testing Checklist

### Scenario 1: Simple Base Unit
- [ ] Input: `10` → Displays base unit
- [ ] Input: `10.5` → Respects decimal places
- [ ] Input: `10.5` with `DECIMALPLACES: 0` → Rounds to `11`
- [ ] Alternative quantity displays correctly (if ADDITIONALUNITS exists)

### Scenario 2: Compound Base Unit
- [ ] Input: `2 LTR 500 ML` → Displays `2-500.000 LTR`
- [ ] Input: `2LTR500ML` → Parses correctly
- [ ] Input: `2500 ML` → Converts and displays correctly
- [ ] Input: `2-500.000 LTR` → Parses hyphenated format
- [ ] Rate UOM defaults to `'component-main'`
- [ ] Amount calculation for all rate UOM options

### Scenario 3: Simple Base + Simple Additional
- [ ] Input: `10 box` → Displays base, shows alternative
- [ ] Input: `25 nos` → Converts to base, shows alternative
- [ ] Input: `10 box = 22 nos` → Custom conversion works
- [ ] Amount calculation uses custom conversion when active
- [ ] Rate UOM defaults to `'base'`

### Scenario 4: Compound Base + Simple Additional
- [ ] Input: `5 pkt 3 nos 2 box` → Displays `5-3 pkt`, shows `(2 box)`
- [ ] All 6 orderings work (e.g., `9p 2n 3b`, `2n 9p 3b`)
- [ ] Abbreviations work (e.g., `9p 2n 3b`)
- [ ] Amount calculation:
  - [ ] Rate per pkt: Uses `compoundBaseQty`
  - [ ] Rate per nos: Converts `compoundBaseQty` to nos
  - [ ] Rate per box: Uses `customAddlQty`

### Scenario 5: Simple Base + Compound Additional
- [ ] Input: `3 box 9 pkt 7 nos` → Displays `3 box`, shows `(9-7 pkt)`
- [ ] Input: `25 pkt` → Displays converted base, shows `(25-0 pkt)`
- [ ] Input: `55 nos` → Displays converted base, shows `(2-5 pkt)` (for "pkt of 25 nos")
- [ ] Amount calculation:
  - [ ] Rate per box: Uses `baseQtyOnly`
  - [ ] Rate per pkt: Uses `compoundAddlQty`
  - [ ] Rate per nos: Converts `compoundAddlQty` to nos
- [ ] Rate UOM defaults to `'base'`

---

## Conclusion

This UOM system provides a comprehensive solution for handling complex unit of measurement scenarios in business applications. It supports:

- Simple and compound units
- Primary and alternative units
- Custom conversion overrides
- Flexible input parsing
- Accurate amount calculations
- Real-time validation and formatting

The implementation is modular and reusable, making it suitable for integration into other applications that require similar UOM functionality.


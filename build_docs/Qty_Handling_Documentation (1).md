
# Quantity Handling Documentation (Production Version)

---

# 1. Authoritative API Schema

```json
{
  "stockItems": [],
  "units": [],
  "obfuscation": {}
}
```

Qty logic depends ONLY on:

- stockItems[].BASEUNITS
- stockItems[].ADDITIONALUNITS
- stockItems[].DENOMINATOR
- stockItems[].CONVERSION
- units[]

Pricing and obfuscation do NOT affect quantity calculations.

---

# 2. Unit Master Structure

## Simple Unit

```json
{
  "NAME": "box",
  "ISSIMPLEUNIT": "Yes",
  "DECIMALPLACES": 0
}
```

## Compound Unit

```json
{
  "NAME": "pkt of 10 nos",
  "ISSIMPLEUNIT": "No",
  "BASEUNITS": "pkt",
  "ADDITIONALUNITS": "nos",
  "CONVERSION": 10,
  "DECIMALPLACES": 0
}
```

Compound Formula:

finalQty = mainQty + (subQty / CONVERSION)

---

# 3. Stock Item Conversion Structure

```json
{
  "BASEUNITS": "box",
  "ADDITIONALUNITS": "nos",
  "DENOMINATOR": 1,
  "CONVERSION": 50
}
```

Meaning:

1 box = 50 nos

Forward Conversion:

alternateQty = baseQty * (CONVERSION / DENOMINATOR)

Reverse Conversion:

baseQty = alternateQty * (DENOMINATOR / CONVERSION)

---

# 4. Alternate Quantity Field Behavior

## 4.1 Visibility Rule

Show Alternate Qty Field IF:

- stockItem.ADDITIONALUNITS exists
- AND DENOMINATOR > 0
- AND CONVERSION > 0

---

## 4.2 Base → Alternate Auto Calculation

alternateQty = baseQty * (CONVERSION / DENOMINATOR)

---

## 4.3 Alternate → Base Reverse Calculation

baseQty = alternateQty * (DENOMINATOR / CONVERSION)

---

## 4.4 Compound + Alternate Case

1. Convert compound to decimal base
2. Apply conversion formula
3. Display alternate value

---

## 4.5 Infinite Loop Prevention

Use source tracking when syncing both fields.

---

## 4.6 Rounding Rules

- Base rounding → BASE unit DECIMALPLACES
- Alternate rounding → ADDITIONAL unit DECIMALPLACES
- Compound rounding → compound DECIMALPLACES

---

# 5. Rate UOM Dropdown Logic (NEW SECTION)

This section defines how Rate UOM dropdown is built and how rate impacts amount.

---

## 5.1 Available Rate UOM Options

Dropdown options depend on unit configuration.

Always include:
- Base Unit

Include if exists:
- Additional Unit
- Base Compound Sub-unit
- Additional Compound Sub-unit

---

## 5.2 Rate Calculation Based on Selected UOM

### Case 1: Rate Per Base

amount = baseQty * rate

---

### Case 2: Rate Per Additional

amount = alternateQty * rate

---

### Case 3: Rate Per Base Sub-unit (Compound)

totalSubUnits = baseQty * compoundConversion  
amount = totalSubUnits * rate

---

### Case 4: Rate Per Additional Sub-unit

totalSubUnits = alternateQty * compoundConversion  
amount = totalSubUnits * rate

---

## 5.3 Rate UOM Change Behavior

When user changes Rate UOM:

- Quantity must NOT change
- Only amount recalculates
- Rate may auto-adjust if preserving economic value

Example:

If 1 box = 50 nos  
Rate per box = 100  

Then rate per nos should auto-adjust:

100 / 50 = 2 per nos

---

## 5.4 Rounding Rules for Rate

- Apply unit decimal places
- Apply currency rounding separately
- Amount rounding happens at final calculation stage

---

# 6. Internal Derived Runtime Model

This is created at runtime by merging:

- stockItems[]
- units[]

Not stored in API.

---

# 7. Edge Case Matrix

| Scenario | Base Field | Alternate Field | Compound | Rate Options |
|----------|------------|----------------|----------|--------------|
| Simple Only | Yes | No | No | Base |
| Base + Additional | Yes | Yes | No | Base, Additional |
| Compound Only | Yes | No | Yes | Base, Sub |
| Compound + Additional | Yes | Yes | Yes | Base, Additional, Sub variants |

---

# 8. Final Confirmation

Qty and Rate UOM logic depend only on:

- units[]
- stockItems[] conversion fields

Pricing obfuscation does not affect quantity behavior.

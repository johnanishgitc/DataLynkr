/**
 * UOM (Unit of Measurement) utilities per build_docs/UOM_IMPLEMENTATION_GUIDE.md.
 * Supports simple/compound units, base + additional units, custom conversion, rate UOM, amount calculation.
 */
import type { StockItem, StockItemUnit } from '../api';

/** Unit configuration built from item + units array (guide: Unit Config Structure). */
export type UnitConfig = {
  BASEUNITS: string;
  ADDITIONALUNITS: string;
  DENOMINATOR: string;
  CONVERSION: string;
  BASEUNIT_DECIMAL: number;
  ADDITIONALUNITS_DECIMAL: number;
  BASEUNITHASCOMPOUNDUNIT: string;
  BASEUNITCOMP_BASEUNIT: string;
  BASEUNITCOMP_ADDLUNIT: string;
  BASEUNITCOMP_CONVERSION: string;
  BASEUNITCOMP_ADDLUNIT_DECIMAL: number;
  ADDITIONALUNITHASCOMPOUNDUNIT: string;
  ADDLUNITCOMP_BASEUNIT: string;
  ADDLUNITCOMP_ADDLUNIT: string;
  ADDLUNITCOMP_CONVERSION: string;
  [key: string]: string | number;
};

/** Custom conversion override: e.g. 10 box = 22 nos → { baseQty: 10, addlQty: 22, denominator: 10, conversion: 22 }. */
export type CustomConversion = {
  baseQty: number;
  addlQty: number;
  denominator: number;
  conversion: number;
};

/** Parsed quantity from user input (guide: parseQuantityInput Returns). */
export type ParsedQuantity = {
  qty?: number;
  subQty?: number;
  uom?: 'base' | 'additional';
  isCompound?: boolean;
  isCustomConversion?: boolean;
  customAddlQty?: number;
  totalQty?: number;
  compoundAddlQty?: number;
  compoundAddlMainQty?: number;
  compoundAddlSubQty?: number;
  isComponentUnit?: boolean;
  componentType?: 'main' | 'sub';
  customUnit1?: string;
  customUnit2?: string;
};

const NUM = '([0-9]+(?:\\.[0-9]*)?|\\.[0-9]+)';
const WS = '\\s*';
const WORD = '([A-Za-z][A-Za-z0-9]*)';

/** Find unit by name (case-insensitive), optionally prefix match for abbreviations. */
function findUnit(units: StockItemUnit[], name: string): StockItemUnit | undefined {
  const n = (name || '').trim();
  if (!n) return undefined;
  const lower = n.toLowerCase();
  const exact = units.find((u) => (u.NAME ?? '').toLowerCase() === lower);
  if (exact) return exact;
  return units.find((u) => (u.NAME ?? '').toLowerCase().startsWith(lower));
}

/** Get decimal places for a unit (number). */
function getDecimal(unit: StockItemUnit | undefined): number {
  if (!unit) return 0;
  const d = unit.DECIMALPLACES;
  if (typeof d === 'number' && !Number.isNaN(d) && d >= 0) return d;
  if (typeof d === 'string') {
    const n = parseInt(d, 10);
    return Number.isNaN(n) ? 0 : Math.max(0, n);
  }
  return 0;
}

/**
 * Build unit config from stock item and units array (guide: buildUnitConfig).
 */
export function buildUnitConfig(
  item: StockItem | null | undefined,
  unitsArray: StockItemUnit[]
): UnitConfig | null {
  if (!item || typeof item !== 'object') return null;
  const baseUnits = String(item.BASEUNITS ?? '').trim();
  const additionalUnits = String(item.ADDITIONALUNITS ?? '').trim();
  const denominator = String(item.DENOMINATOR ?? '1').trim() || '1';
  const conversion = String(item.CONVERSION ?? '1').trim() || '1';

  const baseUnitObj = findUnit(unitsArray, baseUnits) ?? unitsArray.find((u) => (u.NAME ?? '').toLowerCase() === baseUnits.toLowerCase());
  const addlUnitObj = additionalUnits ? (findUnit(unitsArray, additionalUnits) ?? unitsArray.find((u) => (u.NAME ?? '').toLowerCase() === additionalUnits.toLowerCase())) : undefined;

  const baseDecimal = getDecimal(baseUnitObj);
  const addlDecimal = getDecimal(addlUnitObj);
  const baseIsCompound = (baseUnitObj?.ISSIMPLEUNIT ?? '').toString().toLowerCase() === 'no';
  const addlIsCompound = (addlUnitObj?.ISSIMPLEUNIT ?? '').toString().toLowerCase() === 'no';

  const baseCompBase = baseIsCompound && baseUnitObj ? String(baseUnitObj.BASEUNITS ?? '').trim() : '';
  const baseCompAddl = baseIsCompound && baseUnitObj ? String(baseUnitObj.ADDITIONALUNITS ?? '').trim() : '';
  const baseCompConv = baseIsCompound && baseUnitObj ? String(baseUnitObj.CONVERSION ?? '1').trim() : '';
  const baseSubUnit = unitsArray.find((u) => (u.NAME ?? '').toLowerCase() === baseCompAddl.toLowerCase());
  const baseSubDecimal = getDecimal(baseSubUnit);

  const addlCompBase = addlIsCompound && addlUnitObj ? String(addlUnitObj.BASEUNITS ?? '').trim() : '';
  const addlCompAddl = addlIsCompound && addlUnitObj ? String(addlUnitObj.ADDITIONALUNITS ?? '').trim() : '';
  const addlCompConv = addlIsCompound && addlUnitObj ? String(addlUnitObj.CONVERSION ?? '1').trim() : '';

  return {
    BASEUNITS: baseUnits,
    ADDITIONALUNITS: additionalUnits,
    DENOMINATOR: denominator,
    CONVERSION: conversion,
    BASEUNIT_DECIMAL: baseDecimal,
    ADDITIONALUNITS_DECIMAL: addlDecimal,
    BASEUNITHASCOMPOUNDUNIT: baseIsCompound ? 'Yes' : 'No',
    BASEUNITCOMP_BASEUNIT: baseCompBase,
    BASEUNITCOMP_ADDLUNIT: baseCompAddl,
    BASEUNITCOMP_CONVERSION: baseCompConv,
    BASEUNITCOMP_ADDLUNIT_DECIMAL: baseSubDecimal,
    ADDITIONALUNITHASCOMPOUNDUNIT: addlIsCompound ? 'Yes' : 'No',
    ADDLUNITCOMP_BASEUNIT: addlCompBase,
    ADDLUNITCOMP_ADDLUNIT: addlCompAddl,
    ADDLUNITCOMP_CONVERSION: addlCompConv,
  };
}

/**
 * Parse quantity input string into structured object (guide: parseQuantityInput).
 * Supports: "10", "10 box", "2 LTR 500 ML", "2-500.000 LTR", "10 box = 22 nos", "5 pkt 3 nos 2 box", "3 box 9 pkt 7 nos".
 */
export function parseQuantityInput(
  input: string,
  unitConfig: UnitConfig | null,
  unitsArray: StockItemUnit[]
): ParsedQuantity {
  const raw = (input ?? '').trim();
  if (!raw) return { uom: 'base', isCompound: false };

  if (!unitConfig) {
    const n = parseFloat(raw.replace(/[^0-9.-]/g, ''));
    return { qty: Number.isFinite(n) ? n : undefined, uom: 'base', isCompound: false };
  }

  const base = unitConfig.BASEUNITS;
  const addl = unitConfig.ADDITIONALUNITS;
  const baseIsCompound = unitConfig.BASEUNITHASCOMPOUNDUNIT === 'Yes';
  const addlIsCompound = unitConfig.ADDITIONALUNITHASCOMPOUNDUNIT === 'Yes';
  const baseMain = unitConfig.BASEUNITCOMP_BASEUNIT;
  const baseSub = unitConfig.BASEUNITCOMP_ADDLUNIT;
  const baseConv = parseFloat(String(unitConfig.BASEUNITCOMP_CONVERSION || 1)) || 1;
  const denom = parseFloat(String(unitConfig.DENOMINATOR)) || 1;
  const conv = parseFloat(String(unitConfig.CONVERSION)) || 1;

  // Hyphenated: "2-500.000 LTR" or "9-2 pkt"
  const hyphenMatch = raw.match(new RegExp(`^${NUM}-${NUM}${WS}(${WORD}(?:\\s+${WORD})*)$`, 'i'));
  if (hyphenMatch) {
    const mainQty = parseFloat(hyphenMatch[1]);
    const subQty = parseFloat(hyphenMatch[2]);
    const unitPart = (hyphenMatch[3] ?? '').trim();
    if (Number.isFinite(mainQty) && Number.isFinite(subQty)) {
      const unitName = unitPart.split(/\s+/)[0] ?? '';
      if (unitName && (base.toLowerCase().includes(unitName.toLowerCase()) || (baseMain && baseMain.toLowerCase() === unitName.toLowerCase()))) {
        return { qty: mainQty, subQty, uom: 'base', isCompound: true };
      }
    }
  }

  // Custom conversion: "10 box = 22 nos" or "10b=22n"
  const eqIdx = raw.indexOf('=');
  if (eqIdx > 0) {
    const left = raw.slice(0, eqIdx).trim();
    const right = raw.slice(eqIdx + 1).trim();
    const leftMatch = left.match(new RegExp(`^${NUM}${WS}(.*)$`));
    const rightMatch = right.match(new RegExp(`^${NUM}${WS}(.*)$`));
    if (leftMatch && rightMatch) {
      const q1 = parseFloat(leftMatch[1]);
      const q2 = parseFloat(rightMatch[1]);
      const unit1 = (leftMatch[2] ?? '').trim().toLowerCase();
      const unit2 = (rightMatch[2] ?? '').trim().toLowerCase();
      if (Number.isFinite(q1) && Number.isFinite(q2) && q1 > 0 && q2 > 0) {
        // Base matches
        const isBase1 = !unit1 || base.toLowerCase().includes(unit1) || (baseMain && baseMain.toLowerCase().includes(unit1));
        const isBase2 = !unit2 || base.toLowerCase().includes(unit2) || (baseMain && baseMain.toLowerCase().includes(unit2));
        // Addl matches
        const isAddl1 = !unit1 || (addl && addl.toLowerCase().includes(unit1));
        const isAddl2 = !unit2 || (addl && addl.toLowerCase().includes(unit2));

        if (isBase1 && isAddl2) {
          return { qty: q1, uom: 'base', isCompound: false, isCustomConversion: true, customAddlQty: q2, customUnit1: unit1, customUnit2: unit2 };
        } else if (isAddl1 && isBase2) {
          // Reversed: e.g. "25p = 1c" where base is 'Cases' (c) and addl is 'PCS' (p)
          // Store it internally as baseQty = q2, customAddlQty = q1
          return { qty: q2, uom: 'base', isCompound: false, isCustomConversion: true, customAddlQty: q1, customUnit1: unit2, customUnit2: unit1 };
        } else {
          // Forgiving fallback: user typed X = Y but units didn't perfectly match base/addl configs.
          if (isBase2) {
            return { qty: q2, uom: 'base', isCompound: false, isCustomConversion: true, customAddlQty: q1, customUnit1: unit2, customUnit2: unit1 };
          }
          // Default: assume left is base, right is addl
          return { qty: q1, uom: 'base', isCompound: false, isCustomConversion: true, customAddlQty: q2, customUnit1: unit1, customUnit2: unit2 };
        }
      }
    }
  }

  // Compound base + simple additional: "5 pkt 3 nos 2 box" (main-sub-addl order)
  if (baseIsCompound && addl) {
    const mainUnit = baseMain || base.split(/\s+of\s+/i)[0]?.trim() || base;
    const subUnit = baseSub || base.split(/\s+of\s+/i)[1]?.trim() || '';
    const UNIT = '([A-Za-z]+)';
    const match = raw.match(new RegExp(`^(?<m>${NUM})${WS}(?<mu>${UNIT})${WS}(?<s>${NUM})?${WS}(?<su>${UNIT})${WS}(?<a>${NUM})${WS}(?<au>${UNIT})$`, 'i'));
    if (match) {
      const mQ = parseFloat(match[1]);
      const mu = (match[2] ?? '').trim().toLowerCase();
      const sQ = match[3] != null ? parseFloat(match[3]) : 0;
      const su = (match[4] ?? '').trim().toLowerCase();
      const aQ = parseFloat(match[5]);
      const au = (match[6] ?? '').trim().toLowerCase();
      const mainMatch = mainUnit.toLowerCase().startsWith(mu) || mu.startsWith(mainUnit.toLowerCase());
      const subMatch = !su || subUnit.toLowerCase().startsWith(su) || su.startsWith(subUnit.toLowerCase());
      const addlMatch = addl.toLowerCase().startsWith(au) || au.startsWith(addl.toLowerCase());
      if (mainMatch && subMatch && addlMatch && Number.isFinite(mQ)) {
        const compoundBaseQty = mQ + (Number.isFinite(sQ) ? sQ / baseConv : 0);
        return {
          qty: mQ,
          subQty: Number.isFinite(sQ) ? sQ : 0,
          uom: 'base',
          isCompound: true,
          customAddlQty: Number.isFinite(aQ) ? aQ : undefined,
          totalQty: compoundBaseQty,
        };
      }
    }
  }

  // Simple base + compound additional: "3 box 9 pkt 7 nos"
  if (!baseIsCompound && addlIsCompound && addl) {
    const addlMain = unitConfig.ADDLUNITCOMP_BASEUNIT || addl.split(/\s+of\s+/i)[0]?.trim() || '';
    const addlSub = unitConfig.ADDLUNITCOMP_ADDLUNIT || addl.split(/\s+of\s+/i)[1]?.trim() || '';
    const addlConv = parseFloat(String(unitConfig.ADDLUNITCOMP_CONVERSION)) || 1;
    const UNIT = '([A-Za-z]+)';
    const match = raw.match(new RegExp(`^(?<b>${NUM})${WS}(?<bu>${UNIT})${WS}(?<m>${NUM})${WS}(?<mu>${UNIT})${WS}(?<s>${NUM})?${WS}(?<su>${UNIT})$`, 'i'));
    if (match) {
      const bQ = parseFloat(match[1]);
      const mQ = parseFloat(match[3]);
      const sQ = match[5] != null ? parseFloat(match[5]) : 0;
      const compoundAddlQty = mQ + (Number.isFinite(sQ) ? sQ / addlConv : 0);
      return {
        qty: bQ,
        uom: 'base',
        isCompound: false,
        compoundAddlQty,
        compoundAddlMainQty: mQ,
        compoundAddlSubQty: Number.isFinite(sQ) ? sQ : 0,
        totalQty: bQ,
      };
    }
  }

  // Compound only: "2 LTR 500 ML" or "2500 ML"
  if (baseIsCompound && baseMain && baseSub) {
    const hyphen = raw.replace(/\s+/g, ' ');
    const parts: { qty: number; unit: string }[] = [];
    const tokenRe = new RegExp(`${NUM}${WS}([A-Za-z]+)`, 'g');
    let tok;
    while ((tok = tokenRe.exec(hyphen)) !== null) {
      const q = parseFloat(tok[1]);
      const u = (tok[2] ?? '').trim();
      if (Number.isFinite(q)) parts.push({ qty: q, unit: u });
    }
    if (parts.length >= 1) {
      const mainUnitLower = baseMain.toLowerCase();
      const subUnitLower = baseSub.toLowerCase();
      let mainQty = 0;
      let subQty = 0;
      for (const p of parts) {
        const ul = p.unit.toLowerCase();
        if (mainUnitLower.startsWith(ul) || ul.startsWith(mainUnitLower)) mainQty += p.qty;
        else if (subUnitLower.startsWith(ul) || ul.startsWith(subUnitLower)) subQty += p.qty;
      }
      if (mainQty > 0 || subQty > 0)
        return { qty: mainQty, subQty, uom: 'base', isCompound: true, totalQty: mainQty + subQty / baseConv };
    }
    // Single number with compound base → treat as sub unit (e.g. "2500" with "LTR of 1000 ML")
    const singleNum = parseFloat(raw.replace(/[^0-9.]/g, ''));
    if (Number.isFinite(singleNum) && raw.replace(/\s/g, '') === String(singleNum))
      return { qty: 0, subQty: singleNum, uom: 'base', isCompound: true, totalQty: singleNum / baseConv };
  }

  // Simple: "10", "10 box", "25 nos", "1p" (Tally-style: abbreviation like p→PCS, b→box)
  const simpleMatch = raw.match(new RegExp(`^${NUM}${WS}(.*)$`));
  if (simpleMatch) {
    const q = parseFloat(simpleMatch[1]);
    const unitPart = (simpleMatch[2] ?? '').trim().toLowerCase();
    if (!Number.isFinite(q)) return { uom: 'base', isCompound: false };
    if (!unitPart) return { qty: q, uom: 'base', isCompound: false };
    const baseLower = base?.toLowerCase() ?? '';
    const addlLower = addl?.toLowerCase() ?? '';
    const matchBase = baseLower && (baseLower.includes(unitPart) || unitPart.includes(baseLower) || baseLower.startsWith(unitPart) || unitPart.startsWith(baseLower));
    const matchAddl = addlLower && (addlLower.includes(unitPart) || unitPart.includes(addlLower) || addlLower.startsWith(unitPart) || unitPart.startsWith(addlLower));
    if (matchBase) return { qty: q, subQty: baseIsCompound ? 0 : undefined, uom: 'base', isCompound: baseIsCompound };
    if (matchAddl) return { qty: q, uom: 'additional', isCompound: false };
    return { qty: q, uom: 'base', isCompound: false };
  }

  return { uom: 'base', isCompound: false };
}

/**
 * Validate and optionally format quantity input (guide: validateQuantityInput).
 * Allows: 0-9, ., spaces, A-Za-z, =. Returns validated string or '' if invalid.
 */
export function validateQuantityInput(
  input: string,
  _unitConfig: UnitConfig | null,
  _unitsArray: StockItemUnit[],
  isBlur: boolean
): string {
  let s = (input ?? '').trim();
  s = s.replace(/[^0-9.\sA-Za-z=]/g, '');
  if (isBlur && s.endsWith('.')) s = s.slice(0, -1);
  return s;
}

/**
 * Convert parsed quantity to primary (base) quantity (guide: convertToPrimaryQty).
 */
export function convertToPrimaryQty(
  parsedQty: ParsedQuantity,
  unitConfig: UnitConfig | null,
  customConversion: CustomConversion | null,
  unitsArray: StockItemUnit[]
): number {
  if (!unitConfig) return parsedQty.qty ?? 0;
  const denom = parseFloat(String(unitConfig.DENOMINATOR)) || 1;
  const conv = parseFloat(String(unitConfig.CONVERSION)) || 1;
  const baseIsCompound = unitConfig.BASEUNITHASCOMPOUNDUNIT === 'Yes';
  const baseConv = parseFloat(String(unitConfig.BASEUNITCOMP_CONVERSION)) || 1;

  if (parsedQty.totalQty != null && parsedQty.totalQty > 0) {
    return parsedQty.totalQty;
  }

  if (parsedQty.isCustomConversion && customConversion) {
    // When a custom conversion is entered (e.g. 1 CAR = 60 PCS), the entered base quantity is `parsedQty.qty`.
    // We should return just the base quantity because primary quantity is ALWAYS in terms of the base UOM.
    return parsedQty.qty ?? 0;
  }

  if (baseIsCompound && (parsedQty.qty != null || parsedQty.subQty != null)) {
    const main = parsedQty.qty ?? 0;
    const sub = parsedQty.subQty ?? 0;
    const compoundQty = main + sub / baseConv;
    // Return quantity in base sub-component (e.g. PCS when base is CAR of 40 PCS) so 1 CAR → 40 PCS
    return compoundQty * baseConv;
  }

  if (parsedQty.uom === 'additional' && parsedQty.qty != null) {
    return (parsedQty.qty * denom) / conv;
  }

  return parsedQty.qty ?? 0;
}

/**
 * Convert base quantity to alternative unit for display (guide: convertToAlternativeQty).
 */
export function convertToAlternativeQty(
  baseQty: number,
  unitConfig: UnitConfig | null,
  unitsArray: StockItemUnit[],
  customConversion: CustomConversion | null
): { qty: string; unit: string } {
  if (!unitConfig || !unitConfig.ADDITIONALUNITS) return { qty: String(baseQty), unit: unitConfig?.BASEUNITS ?? '' };
  const denom = parseFloat(String(unitConfig.DENOMINATOR)) || 1;
  const conv = parseFloat(String(unitConfig.CONVERSION)) || 1;
  const baseIsCompound = unitConfig.BASEUNITHASCOMPOUNDUNIT === 'Yes';
  const baseConv = parseFloat(String(unitConfig.BASEUNITCOMP_CONVERSION)) || 1;
  const effectiveDenom = baseIsCompound ? denom / baseConv : denom;
  const addlIsCompound = unitConfig.ADDITIONALUNITHASCOMPOUNDUNIT === 'Yes';
  const addlConv = parseFloat(String(unitConfig.ADDLUNITCOMP_CONVERSION)) || 1;

  if (customConversion) {
    const altQty = baseQty * (customConversion.conversion / customConversion.denominator);
    return { qty: String(altQty), unit: unitConfig.ADDITIONALUNITS };
  }

  // When base is compound and additional unit is the base's sub-unit (from response), primary is already in that unit
  const addlName = (unitConfig.ADDITIONALUNITS ?? '').trim().toLowerCase();
  const baseSubName = (unitConfig.BASEUNITCOMP_ADDLUNIT ?? '').trim().toLowerCase();
  if (baseIsCompound && addlName && baseSubName && addlName === baseSubName) {
    return { qty: String(baseQty), unit: unitConfig.ADDITIONALUNITS };
  }

  if (addlIsCompound) {
    const qtyInSub = baseQty * (conv / effectiveDenom);
    const compoundQty = qtyInSub / addlConv;
    const main = Math.floor(compoundQty);
    const sub = (compoundQty - main) * addlConv;
    return { qty: `${main}-${sub}`, unit: unitConfig.ADDLUNITCOMP_BASEUNIT || unitConfig.ADDITIONALUNITS };
  }

  const altQty = baseQty * (conv / effectiveDenom);
  return { qty: String(altQty), unit: unitConfig.ADDITIONALUNITS };
}

/**
 * Format compound base unit for display, e.g. "2-500.000 LTR" (guide: formatCompoundBaseUnit).
 */
export function formatCompoundBaseUnit(
  qty: number,
  subQty: number,
  unitConfig: UnitConfig | null,
  unitsArray: StockItemUnit[]
): string {
  if (!unitConfig || unitConfig.BASEUNITHASCOMPOUNDUNIT !== 'Yes') return `${qty} ${unitConfig?.BASEUNITS ?? ''}`;
  const subUnitName = unitConfig.BASEUNITCOMP_ADDLUNIT;
  const subUnit = unitsArray.find((u) => (u.NAME ?? '').toLowerCase() === subUnitName.toLowerCase());
  const decimals = getDecimal(subUnit);
  const subStr = decimals === 0 ? String(Math.round(subQty)) : subQty.toFixed(decimals);
  const mainName = unitConfig.BASEUNITCOMP_BASEUNIT || unitConfig.BASEUNITS;
  return `${qty}-${subStr} ${mainName}`;
}

/**
 * Format compound additional unit for display, e.g. "25-0 pkt" (guide: formatCompoundAdditionalUnit).
 */
export function formatCompoundAdditionalUnit(
  qty: number,
  unitConfig: UnitConfig | null,
  unitsArray: StockItemUnit[]
): string {
  if (!unitConfig || unitConfig.ADDITIONALUNITHASCOMPOUNDUNIT !== 'Yes') return `${qty} ${unitConfig?.ADDITIONALUNITS ?? ''}`;
  const conv = parseFloat(String(unitConfig.ADDLUNITCOMP_CONVERSION)) || 1;
  const main = Math.floor(qty);
  const sub = (qty - main) * conv;
  const subUnitName = unitConfig.ADDLUNITCOMP_ADDLUNIT;
  const subUnit = unitsArray.find((u) => (u.NAME ?? '').toLowerCase() === subUnitName.toLowerCase());
  const decimals = getDecimal(subUnit);
  const subStr = decimals === 0 ? String(Math.round(sub)) : sub.toFixed(decimals);
  const mainName = unitConfig.ADDLUNITCOMP_BASEUNIT || unitConfig.ADDITIONALUNITS;
  return `${main}-${subStr} ${mainName}`;
}

/**
 * Get quantity in the selected rate UOM for amount calculation (guide: amount = quantityInRateUOM * rate).
 */
export function getQuantityInRateUOM(
  itemQuantity: number,
  rateUOM: string,
  unitConfig: UnitConfig | null,
  unitsArray: StockItemUnit[],
  opts: {
    compoundBaseQty?: number | null;
    compoundAddlQty?: number | null;
    baseQtyOnly?: number | null;
    enteredAddlQty?: number | null;
    customAddlQty?: number | null;
    customConversion?: CustomConversion | null;
  }
): number {
  if (!unitConfig) return itemQuantity;
  const denom = parseFloat(String(unitConfig.DENOMINATOR)) || 1;
  const conv = parseFloat(String(unitConfig.CONVERSION)) || 1;
  const baseIsCompound = unitConfig.BASEUNITHASCOMPOUNDUNIT === 'Yes';
  const baseConv = parseFloat(String(unitConfig.BASEUNITCOMP_CONVERSION)) || 1;
  const effectiveDenom = baseIsCompound ? denom / baseConv : denom;
  const { compoundBaseQty, compoundAddlQty, baseQtyOnly, enteredAddlQty, customAddlQty, customConversion } = opts;

  switch (rateUOM) {
    case 'base':
      if (unitConfig.ADDITIONALUNITHASCOMPOUNDUNIT === 'Yes' && baseQtyOnly != null) return baseQtyOnly;
      if (enteredAddlQty != null) return enteredAddlQty / (conv / effectiveDenom);
      return itemQuantity;
    case 'additional': {
      const addlName = (unitConfig.ADDITIONALUNITS ?? '').trim().toLowerCase();
      const baseSubName = (unitConfig.BASEUNITCOMP_ADDLUNIT ?? '').trim().toLowerCase();
      if (baseIsCompound && addlName && baseSubName && addlName === baseSubName) return itemQuantity;
      if (enteredAddlQty != null) return enteredAddlQty;
      if (customAddlQty != null) return customAddlQty;
      if (customConversion)
        return itemQuantity * (customConversion.conversion / customConversion.denominator);
      return itemQuantity * (conv / effectiveDenom);
    }
    case 'component-main':
      if (compoundBaseQty != null) return compoundBaseQty;
      return itemQuantity;
    case 'component-sub':
      if (compoundBaseQty != null) return compoundBaseQty * baseConv;
      return itemQuantity * baseConv;
    case 'additional-component-main':
      if (compoundAddlQty != null) return compoundAddlQty;
      return itemQuantity * (conv / effectiveDenom);
    case 'additional-component-sub': {
      const addlConv = parseFloat(String(unitConfig.ADDLUNITCOMP_CONVERSION)) || 1;
      if (compoundAddlQty != null) return compoundAddlQty * addlConv;
      return itemQuantity * (conv / effectiveDenom) * addlConv;
    }
    default:
      return itemQuantity;
  }
}

/**
 * Default rate UOM for an item: 'component-main' when base unit is compound, else 'base'.
 */
export function getDefaultRateUOM(unitConfig: UnitConfig | null): string {
  if (!unitConfig) return 'base';
  return unitConfig.BASEUNITHASCOMPOUNDUNIT === 'Yes' ? 'component-main' : 'base';
}

/**
 * Rate UOM options for the current item (for dropdown/segments).
 * Returns array of { value, label } e.g. [{ value: 'base', label: 'box' }, { value: 'additional', label: 'nos' }].
 * When unitConfig is null, returns a single option; pass fallbackBaseLabel (e.g. item's unit) to avoid hardcoded "1".
 */
export function getRateUOMOptions(
  unitConfig: UnitConfig | null,
  unitsArray: StockItemUnit[],
  fallbackBaseLabel?: string
): { value: string; label: string }[] {
  const fallback = fallbackBaseLabel?.trim() || '1';
  if (!unitConfig) return [{ value: 'base', label: fallback }];
  const base = unitConfig.BASEUNITS;
  const addl = unitConfig.ADDITIONALUNITS;
  const baseIsCompound = unitConfig.BASEUNITHASCOMPOUNDUNIT === 'Yes';
  const addlIsCompound = unitConfig.ADDITIONALUNITHASCOMPOUNDUNIT === 'Yes';
  const options: { value: string; label: string }[] = [];

  if (baseIsCompound) {
    options.push({ value: 'component-main', label: unitConfig.BASEUNITCOMP_BASEUNIT || base });
    options.push({ value: 'component-sub', label: unitConfig.BASEUNITCOMP_ADDLUNIT || 'sub' });
  } else {
    options.push({ value: 'base', label: base || fallback });
  }
  if (addl) {
    if (addlIsCompound) {
      options.push({ value: 'additional-component-main', label: unitConfig.ADDLUNITCOMP_BASEUNIT || addl });
      options.push({ value: 'additional-component-sub', label: unitConfig.ADDLUNITCOMP_ADDLUNIT || 'sub' });
    } else {
      options.push({ value: 'additional', label: addl });
    }
  }
  return options.length ? options : [{ value: 'base', label: base || fallback }];
}

/**
 * Map API unit name (e.g. RATEUNIT, STDPRICEUNIT, LASTPRICEUNIT) to rateUOM value.
 * Matches PlaceOrder.js mapUnitToRateUOM: base, additional, component-main, component-sub,
 * additional-component-main, additional-component-sub.
 */
export function getRateUOMFromUnitName(
  unitName: string | undefined | null,
  unitConfig: UnitConfig | null,
  unitsArray: StockItemUnit[]
): string | null {
  if (!unitName || !unitConfig) return null;
  const name = String(unitName).toLowerCase().trim();
  if (!name) return null;

  const baseUnitObj = unitsArray?.length
    ? unitsArray.find((u) => (u.NAME ?? '').toLowerCase() === (unitConfig.BASEUNITS ?? '').toLowerCase())
    : null;
  const hasCompoundBaseUnit = baseUnitObj && (baseUnitObj as { ISSIMPLEUNIT?: string }).ISSIMPLEUNIT === 'No';
  const addlUnitObj =
    unitsArray?.length && unitConfig.ADDITIONALUNITS
      ? unitsArray.find((u) => (u.NAME ?? '').toLowerCase() === (unitConfig.ADDITIONALUNITS ?? '').toLowerCase())
      : null;
  const hasCompoundAddlUnit = addlUnitObj && (addlUnitObj as { ISSIMPLEUNIT?: string }).ISSIMPLEUNIT === 'No';

  if (hasCompoundBaseUnit && baseUnitObj) {
    const baseCompBase = ((baseUnitObj as { BASEUNITS?: string }).BASEUNITS ?? '').toLowerCase().trim();
    const baseCompAddl = ((baseUnitObj as { ADDITIONALUNITS?: string }).ADDITIONALUNITS ?? '').toLowerCase().trim();
    if (name === baseCompBase) return 'component-main';
    if (name === baseCompAddl) return 'component-sub';
  } else {
    const baseUnitName = (unitConfig.BASEUNITS ?? '').toLowerCase().trim();
    if (name === baseUnitName) return 'base';
  }

  if (hasCompoundAddlUnit && addlUnitObj) {
    const addlCompBase = ((addlUnitObj as { BASEUNITS?: string }).BASEUNITS ?? '').toLowerCase().trim();
    const addlCompAddl = ((addlUnitObj as { ADDITIONALUNITS?: string }).ADDITIONALUNITS ?? '').toLowerCase().trim();
    if (name === addlCompBase) return 'additional-component-main';
    if (name === addlCompAddl) return 'additional-component-sub';
  } else if (unitConfig.ADDITIONALUNITS) {
    const addlUnitName = (unitConfig.ADDITIONALUNITS ?? '').toLowerCase().trim();
    if (name === addlUnitName) return 'additional';
  }

  return null;
}

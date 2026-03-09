import { parseQuantityInput } from './src/utils/uomUtils';

const mockUnits = [
    { NAME: 'Cases', DECIMALPLACES: '0' },
    { NAME: 'PCS', DECIMALPLACES: '0' }
] as any[];

const mockUnitConfig = {
    BASEUNITS: 'Cases',
    ADDITIONALUNITS: 'PCS',
    DENOMINATOR: '10',
    CONVERSION: '1',
    BASEUNIT_DECIMAL: 0,
    ADDITIONALUNITS_DECIMAL: 0,
    BASEUNITHASCOMPOUNDUNIT: 'No',
    BASEUNITCOMP_BASEUNIT: '',
    BASEUNITCOMP_ADDLUNIT: '',
    BASEUNITCOMP_CONVERSION: '',
    BASEUNITCOMP_ADDLUNIT_DECIMAL: 0,
    ADDITIONALUNITHASCOMPOUNDUNIT: 'No',
    ADDLUNITCOMP_BASEUNIT: '',
    ADDLUNITCOMP_ADDLUNIT: '',
    ADDLUNITCOMP_CONVERSION: '',
} as any;

console.log('Test 1:', parseQuantityInput('1cases=50pcs', mockUnitConfig, mockUnits));
console.log('Test 2:', parseQuantityInput('1 cases = 50 pcs', mockUnitConfig, mockUnits));

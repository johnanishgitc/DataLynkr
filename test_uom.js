const { parseQuantityInput, validateQuantityInput, buildUnitConfig } = require('./src/utils/uomUtils');

const units = [
    { NAME: 'Cases', ISSIMPLEUNIT: 'Yes', DECIMALPLACES: 0 },
    { NAME: 'PCS', ISSIMPLEUNIT: 'Yes', DECIMALPLACES: 0 },
    { NAME: 'box of 10 pcs', ISSIMPLEUNIT: 'No', BASEUNITS: 'box', ADDITIONALUNITS: 'pcs', CONVERSION: '10' },
    { NAME: 'car', ISSIMPLEUNIT: 'Yes', DECIMALPLACES: 0 },
];

const config1 = {
    BASEUNITS: 'Cases',
    ADDITIONALUNITS: 'PCS',
    DENOMINATOR: '1',
    CONVERSION: '10',
    BASEUNIT_DECIMAL: 0,
    ADDLUNITCOMP_BASEUNIT: '',
    BASEUNITHASCOMPOUNDUNIT: 'No',
    ADDITIONALUNITHASCOMPOUNDUNIT: 'No'
};

const config2 = {
    BASEUNITS: 'box of 10 pcs',
    ADDITIONALUNITS: 'car',
    DENOMINATOR: '1',
    CONVERSION: '5',
    BASEUNITHASCOMPOUNDUNIT: 'Yes',
    BASEUNITCOMP_BASEUNIT: 'box',
    BASEUNITCOMP_ADDLUNIT: 'pcs',
    BASEUNITCOMP_CONVERSION: '10',
    ADDITIONALUNITHASCOMPOUNDUNIT: 'No'
};

console.log("TEST 1 Cases = 25 PCS");
console.log(parseQuantityInput("1 Cases = 25 PCS", config1, units));

console.log("TEST 1p=25c");
console.log(parseQuantityInput("1p=25c", config1, units));

console.log("TEST 1box 3car 20pcs (Base: compound, Addl: simple, wait, what is base?)");
console.log(parseQuantityInput("1box 3car 20pcs", config2, units));

console.log("TEST 1b3c20p");
console.log(parseQuantityInput("1b3c20p", config2, units));

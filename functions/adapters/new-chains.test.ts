/**
 * Shipped Burger King adapter entry points.
 * Run: npx tsx functions/adapters/new-chains.test.ts
 */
import { mapBkStore } from './burger-king-uk';
import { extractGenericUnits, isComboName, penceToPounds } from './generic-fastfood';
import { isUkPostalQuery } from './uk-location';

function assert(cond: unknown, msg: string): asserts cond {
  if (!cond) throw new Error(msg);
}

const bk = mapBkStore({
  storeId: '33001',
  number: '33001',
  name: 'Strand - Great Britain',
  latitude: 51.509,
  longitude: -0.124,
  physicalAddress: { address1: '60 Strand', city: 'London', postalCode: 'WC2N 5LR' },
  hasMobileOrdering: true,
});
assert(bk && bk.id === '33001' && /Burger King/i.test(bk.name), `BK map ${JSON.stringify(bk)}`);
assert(bk.city === 'London' && bk.tierId === 'london_central', 'BK London tier');

assert(penceToPounds(499) === 4.99, `pence ${penceToPounds(499)}`);
assert(isComboName('Whopper Meal') === true, 'combo name');
assert(extractGenericUnits('9 Chicken Nuggets').nugget === 9, 'generic nuggets');

assert(isUkPostalQuery('WA15') && isUkPostalQuery('M1') && isUkPostalQuery('WA15 7RF'), 'postal queries');
assert(!isUkPostalQuery('Manchester'), 'city is not a postal query');

console.log('new-chains.test.ts ok', { bk: bk.id });

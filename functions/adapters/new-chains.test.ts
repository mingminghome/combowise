/**
 * Shipped McD / BK adapter entry points.
 * Run: npx tsx functions/adapters/new-chains.test.ts
 */
import { mapBkStore } from './burger-king-uk';
import { mapMcdFeature, mapOsmMcd, mcdonaldsMenuCatalogue, normalizeMcdMenuItems } from './mcdonalds-uk';
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

const mcd = mapMcdFeature({
  properties: {
    identifier: '8260427',
    name: "McDonald's Leicester Square",
    city: 'London',
    addressLine1: '48 Leicester Square',
    postcode: 'WC2H 7LU',
  },
  geometry: { coordinates: [-0.128, 51.51] },
});
assert(mcd && mcd.id === '8260427' && /McDonald/i.test(mcd.name), `McD map ${JSON.stringify(mcd)}`);
const mcdLocale = mapMcdFeature({
  properties: { identifier: '195500090825:en-GB', name: 'Strand', city: 'London' },
});
assert(mcdLocale && mcdLocale.id === '195500090825', `strip locale ${mcdLocale?.id}`);

const osm = mapOsmMcd({
  id: 99,
  lat: 53.48,
  lon: -2.24,
  tags: {
    name: "McDonald's",
    'addr:city': 'Manchester',
    'addr:street': 'Market Street',
    'addr:postcode': 'M1 1WA',
    website: 'https://www.mcdonalds.com/gb/en-gb/location/8260999.html',
  },
});
assert(osm && osm.id === '8260999' && osm.city === 'Manchester', `OSM McD ${JSON.stringify(osm)}`);

const mcdItems = normalizeMcdMenuItems({
  categories: [
    {
      products: [
        { productName: 'Big Mac', productCode: 'big-mac', price: 4.79 },
        { name: '20 Chicken McNuggets', id: 'n20', productPrice: 6.49 },
        { title: 'Large Fries', displayPrice: '1.89' },
        { name: 'Free sample', price: 0 },
      ],
    },
  ],
});
assert(mcdItems.length === 3, `McD items ${mcdItems.length}`);
assert(
  mcdItems.every((i: { price: number; name: string }) => i.price > 0 && i.name),
  'McD priced names'
);
assert(mcdItems.find((i: { name: string }) => i.name === '20 Chicken McNuggets')?.atomicUnits?.nugget === 20, 'nugget units');

assert(penceToPounds(499) === 4.99, `pence ${penceToPounds(499)}`);
assert(isComboName('Whopper Meal') === true, 'combo name');
assert(extractGenericUnits('9 Chicken Nuggets').nugget === 9, 'generic nuggets');

const mcdEmpty = mcdonaldsMenuCatalogue('8260427', [], 'mcd_unavailable');
assert(mcdEmpty.id === 'mcdonalds_uk' && Array.isArray(mcdEmpty.items) && mcdEmpty.items.length === 0, 'McD empty catalogue');
assert(!('error' in mcdEmpty), 'McD empty is not a structured error');

assert(isUkPostalQuery('WA15') && isUkPostalQuery('M1') && isUkPostalQuery('WA15 7RF'), 'postal queries');
assert(!isUkPostalQuery('Manchester'), 'city is not a postal query');

console.log('new-chains.test.ts ok', {
  bk: bk.id,
  mcd: mcd.id,
  osm: osm.id,
  mcdItems: mcdItems.length,
});

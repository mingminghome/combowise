/**
 * Shipped McD / BK / Tim Hortons adapter entry points.
 * Run: npx tsx functions/adapters/new-chains.test.ts
 */
import { mapBkStore } from './burger-king-uk';
import { mapMcdFeature, mapOsmMcd, mcdonaldsMenuCatalogue, normalizeMcdMenuItems } from './mcdonalds-uk';
import { parseThLocatorHtml, parseThMenuHtml, timHortonsMenuCatalogue } from './tim-hortons-uk';
import { extractGenericUnits, isComboName, penceToPounds } from './generic-fastfood';
import {
  filterJeRestaurants,
  isJeMenuSlug,
  isUkPostalQuery,
  mapJeRestaurant,
  normalizeJeMenuItems,
} from './just-eat-uk';

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

const thHtml = `
<div class="box" data-module-role="location" data-module-lat="51.5074" data-module-lng="-0.1278">
  <p class="location-city">London Bridge</p>
  <p class="location-address">1 Tooley Street<br>London<br>SE1 2AA<br>Hours: 6am-10pm</p>
</div>
<div class="box" data-module-role="location" data-module-lat="53.48" data-module-lng="-2.24">
  <p class="location-city">Manchester</p>
  <p class="location-address">Market Street, Manchester, M1 1WA</p>
</div>`;
const thStores = parseThLocatorHtml(thHtml);
assert(thStores.length === 2, `TH stores ${thStores.length}`);
assert(
  thStores.every((s: { id: string; name: string }) => s.id && s.name),
  `TH store shape ${JSON.stringify(thStores)}`
);
assert(thStores[0].postcode === 'SE1 2AA', `TH postcode ${thStores[0].postcode}`);

const thMenu = parseThMenuHtml(`
<img alt="Iced Capp" src="x.jpg"> something £2.49
<img alt="Boston Cream Donut" src="y.jpg"> £1.79
<div data-price="3.29" data-name="Farmers Breakfast Wrap"></div>
<p>£1.99 Breakfast every morning</p>
`);
assert(thMenu.length >= 3, `TH priced items ${thMenu.length} ${JSON.stringify(thMenu.map((i: { name: string }) => i.name))}`);
assert(thMenu.every((i: { price: number; name: string }) => i.price > 0 && i.name), 'TH prices');

assert(penceToPounds(499) === 4.99, `pence ${penceToPounds(499)}`);
assert(isComboName('Whopper Meal') === true, 'combo name');
assert(extractGenericUnits('9 Chicken Nuggets').nugget === 9, 'generic nuggets');

const mcdEmpty = mcdonaldsMenuCatalogue('8260427', [], 'mcd_unavailable');
assert(mcdEmpty.id === 'mcdonalds_uk' && Array.isArray(mcdEmpty.items) && mcdEmpty.items.length === 0, 'McD empty catalogue');
assert(!('error' in mcdEmpty), 'McD empty is not a structured error');

const thEmpty = timHortonsMenuCatalogue('london-se1', []);
assert(thEmpty.items.length === 0, `TH empty catalogue, got ${thEmpty.items.length}`);
assert(!('error' in thEmpty), 'TH empty is not a structured error');

assert(isUkPostalQuery('WA15') && isUkPostalQuery('WA15 7RF') && isUkPostalQuery('M1'), 'postal queries');
assert(!isUkPostalQuery('Manchester') && !isUkPostalQuery(''), 'non-postal queries');
assert(isJeMenuSlug('mcdonalds-baguely-2-manchester'), 'JE slug');
assert(!isJeMenuSlug('8260427') && !isJeMenuSlug('33001'), 'official numeric ids are not JE slugs');

const jeMcd = mapJeRestaurant(
  {
    id: '179442',
    name: "McDonald's - Baguley McDelivery Kitchen",
    uniqueName: 'mcdonalds-baguely-2-manchester',
    address: {
      city: 'Manchester',
      firstLine: '1 Crew Road',
      postalCode: 'M23 9BE',
      location: { type: 'Point', coordinates: [-2.297525, 53.404628] },
    },
    driveDistanceMeters: 3525,
  },
  'mcdonalds'
);
assert(jeMcd && jeMcd.id === 'mcdonalds-baguely-2-manchester', `JE McD ${JSON.stringify(jeMcd)}`);
assert(jeMcd.postcode === 'M23 9BE' && jeMcd.city === 'Manchester', 'JE McD address');
assert(jeMcd.distanceMiles === 2.2, `JE miles ${jeMcd.distanceMiles}`);
assert(mapJeRestaurant(jeMcd, 'tim_hortons') === null, 'brand filter rejects McD as TH');

const jeFiltered = filterJeRestaurants(
  [
    { name: "McDonald's - A", uniqueName: 'mcdonalds-a' },
    { name: 'Burger King - B', uniqueName: 'burger-king-b' },
    { name: 'Tim Hortons - C', uniqueName: 'tim-hortons-uk-c' },
  ],
  'burger_king'
);
assert(jeFiltered.length === 1 && jeFiltered[0].id === 'burger-king-b', 'filter BK only');

const jeItems = normalizeJeMenuItems(
  {
    Items: [
      {
        Id: 'aaa',
        Name: 'Big Mac',
        Type: 'menuitem',
        Variations: [{ BasePrice: 4.79, DealOnly: false }],
      },
      {
        Id: 'bbb',
        Name: 'Deal-only box',
        Type: 'menuitem',
        Variations: [{ BasePrice: 9.99, DealOnly: true }],
      },
      {
        Id: 'ccc',
        Name: '20 Chicken McNuggets',
        Type: 'menuitem',
        Variations: [{ BasePrice: 6.49 }],
      },
      { Id: 'ddd', Name: 'Free sample', Type: 'menuitem', Variations: [{ BasePrice: 0 }] },
    ],
  },
  'mcd'
);
assert(jeItems.length === 2, `JE items ${jeItems.length}`);
assert(jeItems.find((i: { name: string }) => i.name === '20 Chicken McNuggets')?.atomicUnits?.nugget === 20, 'JE nugget units');
assert(jeItems.every((i: { price: number }) => i.price > 0), 'JE priced only');

const thPriced = timHortonsMenuCatalogue('x', [
  { id: 'a', name: 'Iced Capp', price: 2.49 },
  { id: 'b', name: 'Donut', price: 1.79 },
  { id: 'c', name: 'Wrap', price: 3.29 },
]);
assert(thPriced.items.length === 3, 'TH priced catalogue kept');

console.log('new-chains.test.ts ok', {
  bk: bk.id,
  mcd: mcd.id,
  osm: osm.id,
  mcdItems: mcdItems.length,
  thStores: thStores.length,
  thMenu: thMenu.length,
  jeMcd: jeMcd.id,
  jeItems: jeItems.length,
});

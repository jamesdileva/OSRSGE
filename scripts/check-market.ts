/**
 * Live verification script for Sprint 2 (roadmap §4).
 * Run with `npm run check:market`. Hits the real Wiki API — this is a
 * manual verification tool, NOT a test (tests must stay offline, guide §46).
 */
import { ItemMetadataStore } from '../core/items/itemMetadata.ts';
import { WikiPriceProvider } from '../core/market/providers/WikiPriceProvider.ts';

const SPOT_CHECK_ID = 4151; // Abyssal whip

const provider = new WikiPriceProvider();
const latest = await provider.getLatest();
const itemIds = Object.keys(latest.entries);

console.log(`Items received: ${itemIds.length}`);
console.log(`Timestamp: ${new Date(latest.fetchedAt).toISOString()}`);
console.log(
  `API status: OK (invalid records skipped: ${latest.invalidRecords})`,
);

const spot = latest.entries[SPOT_CHECK_ID];
if (spot === undefined) {
  throw new Error(`Spot-check item ${SPOT_CHECK_ID} missing from /latest`);
}
console.log(
  `Spot check #${SPOT_CHECK_ID}: high=${String(spot.high)} low=${String(spot.low)}`,
);

const metadata = new ItemMetadataStore(provider);
const allItems = await metadata.getAllItems();
console.log(
  `Metadata: ${allItems.length} items; #${SPOT_CHECK_ID} = ${await metadata.getItemName(SPOT_CHECK_ID)}`,
);

if (itemIds.length === 0) {
  throw new Error('No items received from /latest');
}
if (allItems.length === 0) {
  throw new Error('No items received from /mapping');
}

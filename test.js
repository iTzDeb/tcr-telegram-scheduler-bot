const assert = require('assert');

// Mock googleapis before requiring api/index if not installed
try {
  require.resolve('googleapis');
} catch (e) {
  const Module = require('module');
  const originalRequire = Module.prototype.require;
  Module.prototype.require = function (path) {
    if (path === 'googleapis') {
      return {
        google: {
          auth: { GoogleAuth: class {} },
          sheets: () => ({})
        }
      };
    }
    return originalRequire.apply(this, arguments);
  };
}

const { _normalizeText: normalizeText, _matchesFilter: matchesFilter } = require('./api/index');

console.log('Running search/filter normalization tests...');

// 1. Date normalization tests (leading zero handling & month abbrev)
assert.strictEqual(normalizeText('01 Oct 2026'), '1 oct 2026');
assert.strictEqual(normalizeText('1 Oct 2026'), '1 oct 2026');
assert.strictEqual(normalizeText('06 September 2026'), '6 sep 2026');
assert.strictEqual(normalizeText('06 Sept 2026'), '6 sep 2026');
assert.strictEqual(normalizeText('21 Oct 2026'), '21 oct 2026');

// 2. Filter matching tests for "01 Oct 2026"
const row1 = '1 Oct 2026 | 04:30PM - 06:30PM | Laxmi Nagar | CLAT - English (Meenakshi Maam)';
const row21 = '21 Oct 2026 | 05:00PM - 07:00PM | Laxmi Nagar | AIBE - IEA/BSA (SHIVAM SIR)';

// "01 Oct 2026" should match row 1 ("1 Oct 2026")
assert.strictEqual(matchesFilter(row1, '01 Oct 2026'), true, '01 Oct 2026 should match 1 Oct 2026 row');

// "01 Oct 2026" should NOT match row 21 ("21 Oct 2026")
assert.strictEqual(matchesFilter(row21, '01 Oct 2026'), false, '01 Oct 2026 should NOT match 21 Oct 2026 row');

// "1 Oct 2026" should match row 1 ("1 Oct 2026")
assert.strictEqual(matchesFilter(row1, '1 Oct 2026'), true, '1 Oct 2026 should match 1 Oct 2026 row');

// "1 Oct 2026" should NOT match row 21 ("21 Oct 2026")
assert.strictEqual(matchesFilter(row21, '1 Oct 2026'), false, '1 Oct 2026 should NOT match 21 Oct 2026 row');

// 3. Month variation tests
const rowSept = '06 Sept 2026 | 4:00 - 6:00PM | Laxmi Nagar | CLAT';
assert.strictEqual(matchesFilter(rowSept, '6 September 2026'), true, '6 September 2026 should match 06 Sept 2026 row');
assert.strictEqual(matchesFilter(rowSept, '06 Sep 2026'), true, '06 Sep 2026 should match 06 Sept 2026 row');

// 4. Other keyword filters
assert.strictEqual(matchesFilter(row1, 'Laxmi Nagar'), true, 'Laxmi Nagar filter should match');
assert.strictEqual(matchesFilter(row1, 'Pitampura'), false, 'Pitampura filter should not match');
assert.strictEqual(matchesFilter(row1, 'CLAT'), true, 'CLAT filter should match');

console.log('All search/filter normalization tests passed successfully!');

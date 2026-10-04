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

const { _normalizeText: normalizeText, _matchesFilter: matchesFilter, _parseCreateArgs: parseCreateArgs } = require('./api/index');

console.log('Running search/filter & natural input parsing tests...');

// 1. Date normalization tests (leading zero handling & month abbrev)
assert.strictEqual(normalizeText('01 Oct 2026'), '1 oct 2026');
assert.strictEqual(normalizeText('1 Oct 2026'), '1 oct 2026');
assert.strictEqual(normalizeText('06 September 2026'), '6 sep 2026');
assert.strictEqual(normalizeText('06 Sept 2026'), '6 sep 2026');
assert.strictEqual(normalizeText('21 Oct 2026'), '21 oct 2026');

// 2. Filter matching tests for "01 Oct 2026" & "4 Oct 2026"
const row1Date = '1 Oct 2026';
const row1 = '1 Oct 2026 04:30PM - 06:30PM Laxmi Nagar CLAT - English (Meenakshi Maam)';

const row21Date = '21 Oct 2026';
const row21 = '21 Oct 2026 05:00PM - 07:00PM Laxmi Nagar AIBE - IEA/BSA (SHIVAM SIR)';

const row73Date = '1 Oct 2026';
const row73 = '1 Oct 2026 04:30PM - 06:30PM Laxmi Nagar CLAT - English (Meenakshi Maam)';

const row80Date = '04 Oct 2026';
const row80 = '04 Oct 2026 02:30PM - 04:30PM Laxmi Nagar CLAT - TCR CLAT Alumnus MOCK';

// "01 Oct 2026" should match row 1 ("1 Oct 2026")
assert.strictEqual(matchesFilter(row1Date, row1, '01 Oct 2026'), true, '01 Oct 2026 should match 1 Oct 2026 row');

// "01 Oct 2026" should NOT match row 21 ("21 Oct 2026")
assert.strictEqual(matchesFilter(row21Date, row21, '01 Oct 2026'), false, '01 Oct 2026 should NOT match 21 Oct 2026 row');

// "4 oct 2026" should match row 80 ("04 Oct 2026")
assert.strictEqual(matchesFilter(row80Date, row80, '4 oct 2026'), true, '4 oct 2026 should match 04 Oct 2026 row');

// "4 oct 2026" should NOT match row 73 ("1 Oct 2026" with 04:30PM time)
assert.strictEqual(matchesFilter(row73Date, row73, '4 oct 2026'), false, '4 oct 2026 should NOT match 1 Oct 2026 row with 04:30PM time');

// 3. Natural / Flexible /create input parsing
const expectedParsed = {
  date: '06 Sept 2026',
  time: '4:00 - 6:00PM',
  center: 'Laxmi Nagar',
  course: 'CLAT',
  subject: 'Legal',
  faculty: 'Shivam Sir'
};

// Pipe separated
assert.deepStrictEqual(
  parseCreateArgs('06 Sept 2026 | 4:00 - 6:00PM | Laxmi Nagar | CLAT | Legal | Shivam Sir'),
  expectedParsed
);

// Comma separated
assert.deepStrictEqual(
  parseCreateArgs('06 Sept 2026, 4:00 - 6:00PM, Laxmi Nagar, CLAT, Legal, Shivam Sir'),
  expectedParsed
);

// Newline separated
assert.deepStrictEqual(
  parseCreateArgs('06 Sept 2026\n4:00 - 6:00PM\nLaxmi Nagar\nCLAT\nLegal\nShivam Sir'),
  expectedParsed
);

// Key-Value multi-line
assert.deepStrictEqual(
  parseCreateArgs('Date: 06 Sept 2026\nTime: 4:00 - 6:00PM\nCenter: Laxmi Nagar\nCourse: CLAT\nSubject: Legal\nFaculty: Shivam Sir'),
  expectedParsed
);

console.log('All search/filter & natural input parsing tests passed successfully!');

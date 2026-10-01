const { google } = require('googleapis');
const https = require('https');

// Configuration Constants
const SPREADSHEET_ID = process.env.SPREADSHEET_ID || '1n4feZRy9p0pEhApto8BdNsQLSU0-92WHdsT44Ob9Zzc';
const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN || '8093638286:AAHslkVd7Y3KBDiNseWM703Kyih2ycF1Yxs';
const AUTHORIZED_CHAT_ID = process.env.AUTHORIZED_CHAT_ID || '499900380';
const DEFAULT_SHEET_TAB = 'Schedule';

// Helper to authenticate with Google Sheets API
function getSheetsClient() {
  let auth;
  if (process.env.GOOGLE_SERVICE_ACCOUNT_KEY) {
    let rawKey = process.env.GOOGLE_SERVICE_ACCOUNT_KEY.trim();
    
    // Step 1: Base64 decode if passed as base64 string
    if (!rawKey.startsWith('{') && !rawKey.startsWith('"') && !rawKey.startsWith("'")) {
      try {
        const decoded = Buffer.from(rawKey, 'base64').toString('utf8');
        if (decoded.includes('{')) {
          rawKey = decoded.trim();
        }
      } catch (e) {
        console.error('Base64 decode attempt failed:', e.message);
      }
    }

    // Step 2: Strip surrounding quotes if present
    if ((rawKey.startsWith('"') && rawKey.endsWith('"')) || (rawKey.startsWith("'") && rawKey.endsWith("'"))) {
      rawKey = rawKey.substring(1, rawKey.length - 1).trim();
    }

    // Step 3: Extract valid JSON substring from first '{' to last '}'
    const firstBrace = rawKey.indexOf('{');
    const lastBrace = rawKey.lastIndexOf('}');
    if (firstBrace !== -1 && lastBrace > firstBrace) {
      rawKey = rawKey.substring(firstBrace, lastBrace + 1);
    }

    // Step 4: Parse JSON
    let credentials = JSON.parse(rawKey);

    // Step 5: Format newlines in private_key
    if (credentials.private_key && typeof credentials.private_key === 'string') {
      credentials.private_key = credentials.private_key.replace(/\\n/g, '\n');
    }

    auth = new google.auth.GoogleAuth({
      credentials,
      scopes: ['https://www.googleapis.com/auth/spreadsheets']
    });
  } else {
    auth = new google.auth.GoogleAuth({
      scopes: ['https://www.googleapis.com/auth/spreadsheets']
    });
  }
  return google.sheets({ version: 'v4', auth });
}

// Dynamically resolve target sheet tab name and sheet ID
async function resolveSheetDetails(sheets) {
  try {
    const spreadsheet = await sheets.spreadsheets.get({ spreadsheetId: SPREADSHEET_ID });
    const sheetList = spreadsheet.data.sheets || [];
    
    // Match 'Schedule' or fallback to first sheet tab
    const matchedSheet = sheetList.find(s => s.properties.title.trim().toLowerCase() === DEFAULT_SHEET_TAB.toLowerCase()) || sheetList[0];
    
    return {
      title: matchedSheet.properties.title,
      sheetId: matchedSheet.properties.sheetId
    };
  } catch (e) {
    return { title: DEFAULT_SHEET_TAB, sheetId: 0 };
  }
}

// Telegram Message Sender Helper
function sendTelegramMessage(chatId, text, parseMode = 'Markdown') {
  return new Promise((resolve, reject) => {
    const data = JSON.stringify({
      chat_id: chatId,
      text: text,
      parse_mode: parseMode
    });

    const options = {
      hostname: 'api.telegram.org',
      port: 443,
      path: `/bot${TELEGRAM_BOT_TOKEN}/sendMessage`,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(data)
      }
    };

    const req = https.request(options, (res) => {
      let body = '';
      res.on('data', chunk => body += chunk);
      res.on('end', () => resolve(body));
    });

    req.on('error', (e) => reject(e));
    req.write(data);
    req.end();
  });
}

function isAuthorized(chatId, userId) {
  const strChatId = String(chatId);
  const strUserId = String(userId || '');
  return strChatId === String(AUTHORIZED_CHAT_ID) || strUserId === String(AUTHORIZED_CHAT_ID);
}

// Helper to normalize search/filter text and row data for fuzzy date and boundary matching
function normalizeText(text) {
  if (!text) return '';
  return text
    .toLowerCase()
    .replace(/\bseptember\b|\bsept\b/g, 'sep')
    .replace(/\boctober\b/g, 'oct')
    .replace(/\bjanuary\b/g, 'jan')
    .replace(/\bfebruary\b/g, 'feb')
    .replace(/\bmarch\b/g, 'mar')
    .replace(/\bapril\b/g, 'apr')
    .replace(/\bjune\b/g, 'jun')
    .replace(/\bjuly\b/g, 'jul')
    .replace(/\baugust\b/g, 'aug')
    .replace(/\bnovember\b/g, 'nov')
    .replace(/\bdecember\b/g, 'dec')
    // Strip leading zeros from day numbers / numeric tokens (e.g., "01" -> "1", "06" -> "6")
    .replace(/\b0([1-9])\b/g, '$1');
}

function matchesFilter(rowText, filterText) {
  const normRow = normalizeText(rowText);
  const normFilter = normalizeText(filterText);
  if (!normFilter) return true;

  const tokens = normFilter.split(/\s+/).filter(Boolean);

  return tokens.every(token => {
    const escaped = token.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&');
    if (/^[a-z0-9]+$/i.test(token)) {
      const regex = new RegExp('\\b' + escaped + '\\b', 'i');
      return regex.test(normRow);
    } else {
      return normRow.includes(token);
    }
  });
}

// Vercel Serverless Entry Point
module.exports = async (req, res) => {
  if (req.method !== 'POST') {
    res.status(200).send('TCR Telegram Bot Webhook API is running.');
    return;
  }

  try {
    const payload = req.body || {};

    if (payload.message && payload.message.text) {
      const message = payload.message;
      const text = message.text.trim();
      const chatId = message.chat.id;
      const userId = message.from ? message.from.id : null;

      // Access Authorization Check
      if (!isAuthorized(chatId, userId)) {
        await sendTelegramMessage(chatId, `🚫 *Access Denied.* Your Chat ID (\`${chatId}\`) is not authorized to interact with this bot.`);
        res.status(200).json({ ok: true });
        return;
      }

      await handleTelegramCommand(chatId, text);
    }

    res.status(200).json({ ok: true });
  } catch (err) {
    console.error('Webhook Handler Error:', err);
    res.status(200).json({ ok: true, error: err.message });
  }
};

// Slash Command Routing Logic
async function handleTelegramCommand(chatId, text) {
  const parts = text.split(' ');
  const command = parts[0].toLowerCase();
  const argsStr = text.substring(parts[0].length).trim();

  if (command === '/start' || command === '/help') {
    const helpMsg = 
      `🤖 *TCR Class Scheduler Bot*\n\n` +
      `Here are the available commands:\n\n` +
      `📌 */list* _[date or filter]_\n` +
      `View schedule. Examples:\n` +
      `• \`/list\` - List all upcoming classes\n` +
      `• \`/list 30 Aug 2026\` - List classes for specific date\n` +
      `• \`/list Laxmi Nagar\` - List classes by center\n\n` +
      `📌 */create* _Date | Time | Center | Course | Subject | Faculty_\n` +
      `Add a new class row. Example:\n` +
      `• \`/create 06 Sept 2026 | 4:00 - 6:00PM | Laxmi Nagar | CLAT | Legal | Shivam Sir\`\n\n` +
      `📌 */update* _RowNumber Field NewValue_ OR _RowNumber Date | Time | ..._\n` +
      `Update an existing class row. Examples:\n` +
      `• \`/update 15 Time 5:00 - 7:00PM\`\n` +
      `• \`/update 15 Faculty Anand Sir\`\n` +
      `• \`/update 15 06 Sept 2026 | 4:00 - 6:00PM | Laxmi Nagar | CLAT | Legal | Shivam Sir\`\n\n` +
      `📌 */delete* _RowNumber_\n` +
      `Delete class row. Example:\n` +
      `• \`/delete 15\`\n\n` +
      `📌 */check*\n` +
      `Check system online status and count of pending classes.`;
    
    await sendTelegramMessage(chatId, helpMsg);
    return;
  }

  try {
    if (command === '/check') {
      const sheets = getSheetsClient();
      const sheetDetails = await resolveSheetDetails(sheets);
      const response = await sheets.spreadsheets.values.get({
        spreadsheetId: SPREADSHEET_ID,
        range: `'${sheetDetails.title}'!A1:G`
      });

      const rows = response.data.values || [];
      let pendingCount = 0;

      for (let i = 1; i < rows.length; i++) {
        if (rows[i][0] && String(rows[i][6] || '').trim() !== 'SENT') {
          pendingCount++;
        }
      }

      const msg = `📊 *TCR Class Scheduler Bot*\n\n*System is online.* There are *${pendingCount}* pending classes in tab \`${sheetDetails.title}\` waiting for dispatch.`;
      await sendTelegramMessage(chatId, msg);
      return;
    }

    if (command === '/list') {
      await handleListCommand(chatId, argsStr);
      return;
    }

    if (command === '/create' || command === '/add') {
      await handleCreateCommand(chatId, argsStr);
      return;
    }

    if (command === '/update') {
      await handleUpdateCommand(chatId, argsStr);
      return;
    }

    if (command === '/delete') {
      await handleDeleteCommand(chatId, argsStr);
      return;
    }

    await sendTelegramMessage(chatId, `⚠️ Unknown command. Type /help to see all available commands.`);
  } catch (err) {
    console.error('Command Execution Error:', err);
    await sendTelegramMessage(chatId, `⚠️ *Google Sheets API Error:* \`${err.message}\`\n\n_Please check that your Service Account email is shared on the Google Sheet as Editor._`);
  }
}

async function handleListCommand(chatId, filterText) {
  const sheets = getSheetsClient();
  const sheetDetails = await resolveSheetDetails(sheets);
  const response = await sheets.spreadsheets.values.get({
    spreadsheetId: SPREADSHEET_ID,
    range: `'${sheetDetails.title}'!A1:G`
  });

  const rows = response.data.values || [];
  if (rows.length <= 1) {
    await sendTelegramMessage(chatId, `📅 No classes found in the schedule.`);
    return;
  }

  const matchingRows = [];

  for (let i = 1; i < rows.length; i++) {
    const row = rows[i];
    const dateStr = String(row[0] || '').trim();
    if (!dateStr) continue;

    const timeStr = String(row[1] || '').trim();
    const centerStr = String(row[2] || '').trim();
    const courseStr = String(row[3] || '').trim();
    const subjectStr = String(row[4] || '').trim();
    const facultyStr = String(row[5] || '').trim();
    const statusStr = String(row[6] || '').trim();

    const fullRowText = `${dateStr} ${timeStr} ${centerStr} ${courseStr} ${subjectStr} ${facultyStr} ${statusStr}`;

    if (!filterText || matchesFilter(fullRowText, filterText)) {
      matchingRows.push({
        rowNum: i + 1,
        date: dateStr,
        time: timeStr,
        center: centerStr,
        course: courseStr,
        subject: subjectStr,
        faculty: facultyStr,
        status: statusStr
      });
    }
  }

  if (matchingRows.length === 0) {
    await sendTelegramMessage(chatId, `📅 No classes found matching filter: \`${filterText}\``);
    return;
  }

  let message = filterText ? `📅 *Classes matching "${filterText}"* (${matchingRows.length}):\n\n` : `📅 *Master Class Schedule* (${matchingRows.length} classes):\n\n`;

  matchingRows.forEach(item => {
    const statusBadge = item.status === 'SENT' ? ' `[SENT]`' : '';
    message += `• *Row ${item.rowNum}*: ${item.date} | ${item.time} | ${item.center} | ${item.course} - ${item.subject} (${item.faculty})${statusBadge}\n`;
  });

  if (message.length > 4000) {
    message = message.substring(0, 3900) + `\n\n⚠️ _Output truncated due to length limits. Refine your query with /list <date> or /list <center>._`;
  }

  await sendTelegramMessage(chatId, message);
}

async function handleCreateCommand(chatId, argsStr) {
  if (!argsStr) {
    await sendTelegramMessage(chatId, `⚠️ *Usage:* \`/create Date | Time | Center | Course | Subject | Faculty\`\n\n*Example:*\n\`/create 06 Sept 2026 | 4:00 - 6:00PM | Laxmi Nagar | CLAT | Legal | Shivam Sir\``);
    return;
  }

  const parts = argsStr.split('|').map(s => s.trim());
  if (parts.length < 6) {
    await sendTelegramMessage(chatId, `⚠️ Invalid format. Please provide 6 parameters separated by \`|\`:\n\`Date | Time | Center | Course | Subject | Faculty\``);
    return;
  }

  const dateVal = parts[0];
  const timeVal = parts[1];
  const centerVal = parts[2];
  const courseVal = parts[3];
  const subjectVal = parts[4];
  const facultyVal = parts[5];

  const sheets = getSheetsClient();
  const sheetDetails = await resolveSheetDetails(sheets);
  const appendRes = await sheets.spreadsheets.values.append({
    spreadsheetId: SPREADSHEET_ID,
    range: `'${sheetDetails.title}'!A:G`,
    valueInputOption: 'USER_ENTERED',
    requestBody: {
      values: [[dateVal, timeVal, centerVal, courseVal, subjectVal, facultyVal, '']]
    }
  });

  const updatedRange = appendRes.data.updates.updatedRange;
  const rowMatch = updatedRange.match(/(\d+)$/);
  const newRowIndex = rowMatch ? rowMatch[1] : 'New';

  await sendTelegramMessage(chatId, `✅ *Class Created Successfully!*\n\n• *Row:* ${newRowIndex}\n• *Date:* ${dateVal}\n• *Time:* ${timeVal}\n• *Center:* ${centerVal}\n• *Course:* ${courseVal}\n• *Subject:* ${subjectVal}\n• *Faculty:* ${facultyVal}`);
}

async function handleUpdateCommand(chatId, argsStr) {
  if (!argsStr) {
    await sendTelegramMessage(chatId, `⚠️ *Usage:* \`/update RowNumber Field NewValue\` OR \`/update RowNumber Date | Time | Center | Course | Subject | Faculty\`\n\n*Examples:*\n• \`/update 15 Time 5:00 - 7:00PM\`\n• \`/update 15 Faculty Anand Sir\`\n• \`/update 15 06 Sept 2026 | 4:00 - 6:00PM | Laxmi Nagar | CLAT | Legal | Shivam Sir\``);
    return;
  }

  const spaceIndex = argsStr.indexOf(' ');
  if (spaceIndex === -1) {
    await sendTelegramMessage(chatId, `⚠️ Invalid syntax. Must specify row number followed by field and new value or row parameters.`);
    return;
  }

  const rowNumStr = argsStr.substring(0, spaceIndex).trim();
  const rowNum = parseInt(rowNumStr, 10);
  const restStr = argsStr.substring(spaceIndex).trim();

  const sheets = getSheetsClient();
  const sheetDetails = await resolveSheetDetails(sheets);

  if (isNaN(rowNum) || rowNum <= 1) {
    await sendTelegramMessage(chatId, `❌ Invalid Row Number \`${rowNumStr}\`. Must be row index 2 or higher.`);
    return;
  }

  // Check if pipe-separated full row update
  if (restStr.includes('|')) {
    const parts = restStr.split('|').map(s => s.trim());
    if (parts.length >= 6) {
      await sheets.spreadsheets.values.update({
        spreadsheetId: SPREADSHEET_ID,
        range: `'${sheetDetails.title}'!A${rowNum}:G${rowNum}`,
        valueInputOption: 'USER_ENTERED',
        requestBody: {
          values: [[parts[0], parts[1], parts[2], parts[3], parts[4], parts[5], '']]
        }
      });
      await sendTelegramMessage(chatId, `✅ *Row ${rowNum} updated completely!*`);
      return;
    }
  }

  // Single field update
  const fieldSpaceIndex = restStr.indexOf(' ');
  if (fieldSpaceIndex === -1) {
    await sendTelegramMessage(chatId, `⚠️ Please specify the field to update and its new value.`);
    return;
  }

  const fieldName = restStr.substring(0, fieldSpaceIndex).trim().toLowerCase();
  const newValue = restStr.substring(fieldSpaceIndex).trim();

  const fieldColMap = {
    'date': 'A',
    'time': 'B',
    'center': 'C',
    'course': 'D',
    'subject': 'E',
    'faculty': 'F',
    'status': 'G'
  };

  const colLetter = fieldColMap[fieldName];
  if (!colLetter) {
    await sendTelegramMessage(chatId, `❌ Unknown field \`${fieldName}\`. Valid fields are: \`Date\`, \`Time\`, \`Center\`, \`Course\`, \`Subject\`, \`Faculty\`, \`Status\`.`);
    return;
  }

  await sheets.spreadsheets.values.update({
    spreadsheetId: SPREADSHEET_ID,
    range: `'${sheetDetails.title}'!${colLetter}${rowNum}`,
    valueInputOption: 'USER_ENTERED',
    requestBody: {
      values: [[newValue]]
    }
  });

  // Clear SENT status if details were modified
  if (fieldName !== 'status') {
    await sheets.spreadsheets.values.update({
      spreadsheetId: SPREADSHEET_ID,
      range: `'${sheetDetails.title}'!G${rowNum}`,
      valueInputOption: 'USER_ENTERED',
      requestBody: {
        values: [['']]
      }
    });
  }

  await sendTelegramMessage(chatId, `✅ *Row ${rowNum} updated!*\nField *${fieldName.toUpperCase()}* set to: \`${newValue}\``);
}

async function handleDeleteCommand(chatId, argsStr) {
  if (!argsStr) {
    await sendTelegramMessage(chatId, `⚠️ *Usage:* \`/delete RowNumber\`\n\n*Example:* \`/delete 15\``);
    return;
  }

  const rowNum = parseInt(argsStr.trim(), 10);
  if (isNaN(rowNum) || rowNum <= 1) {
    await sendTelegramMessage(chatId, `❌ Invalid Row Number \`${argsStr}\`. Must be row index 2 or higher.`);
    return;
  }

  const sheets = getSheetsClient();
  const sheetDetails = await resolveSheetDetails(sheets);

  await sheets.spreadsheets.batchUpdate({
    spreadsheetId: SPREADSHEET_ID,
    requestBody: {
      requests: [{
        deleteDimension: {
          range: {
            sheetId: sheetDetails.sheetId,
            dimension: 'ROWS',
            startIndex: rowNum - 1,
            endIndex: rowNum
          }
        }
      }]
    }
  });

  await sendTelegramMessage(chatId, `🗑️ *Class Row ${rowNum} Deleted Successfully!*`);
}

// Export internal functions for unit testing
module.exports._normalizeText = normalizeText;
module.exports._matchesFilter = matchesFilter;

# TCR Classes Telegram Scheduler Bot (Vercel Node.js & Google Sheets)

This repository contains the Node.js Telegram Bot webhook handler deployed on **Vercel** for managing the TCR Class Master Schedule in Google Sheets.

With this Telegram Bot, authorized users can create, view, search, update, and delete class rows directly using Telegram slash commands on mobile or desktop. All changes automatically reflect in real-time in the master Google Sheet.

---

## 🌟 Key Features

- **Mobile-Friendly Natural Input:** Create or update classes using commas, newlines, key-value pairs, or pipes (`|`).
- **Smart Date & Text Search:** Search for dates like `/list 4 Oct 2026` or `/list 04 Oct 2026` without missing entries or false matching unrelated time slots.
- **Clean Card Layout:** Formatted Telegram responses with emojis, clear labels, and divider lines for easy reading on smartphones.
- **Google Sheets Integration:** Connects securely to Google Sheets API using Service Account credentials.
- **Authorization Guard:** Restricts bot commands exclusively to your specified Telegram Chat ID.

---

## 🤖 Slash Commands & Examples

### 1. `/list` - View & Search Schedule
- **All upcoming classes:**
  ```text
  /list
  ```
- **Filter by Date:**
  ```text
  /list 4 Oct 2026
  /list 04 Oct 2026
  ```
- **Filter by Center / Subject / Faculty / Keyword:**
  ```text
  /list Laxmi Nagar
  /list CLAT
  /list Shivam Sir
  ```

---

### 2. `/create` or `/add` - Add New Class Row
Supports 4 flexible input formats:

- **Comma Separated (Easiest on Mobile):**
  ```text
  /create 06 Sept 2026, 4:00 - 6:00PM, Laxmi Nagar, CLAT, Legal, Shivam Sir
  ```
- **Key-Value Pair Format:**
  ```text
  /create
  Date: 06 Sept 2026
  Time: 4:00 - 6:00PM
  Center: Laxmi Nagar
  Course: CLAT
  Subject: Legal
  Faculty: Shivam Sir
  ```
- **Multi-Line Format:**
  ```text
  /create
  06 Sept 2026
  4:00 - 6:00PM
  Laxmi Nagar
  CLAT
  Legal
  Shivam Sir
  ```
- **Pipe Separated:**
  ```text
  /create 06 Sept 2026 | 4:00 - 6:00PM | Laxmi Nagar | CLAT | Legal | Shivam Sir
  ```

---

### 3. `/update` - Modify Class Row
- **Single Field Update:**
  ```text
  /update 15 Time 5:00 - 7:00PM
  /update 15 Faculty Anand Sir
  ```
  *(Valid fields: `Date`, `Time`, `Center`, `Course`, `Subject`, `Faculty`, `Status`)*
- **Full Row Update:**
  ```text
  /update 15 06 Sept 2026, 4:00 - 6:00PM, Laxmi Nagar, CLAT, Legal, Shivam Sir
  ```

---

### 4. `/delete` - Delete Class Row
- **Delete Row:**
  ```text
  /delete 15
  ```

---

### 5. `/check` - System Health & Status
- Check bot online status and count of pending unsent classes:
  ```text
  /check
  ```

---

## 🚀 Setup & Vercel Deployment Instructions

1. **Repository Setup:**
   Push this repository to GitHub.

2. **Deploy to Vercel:**
   Import the repository in Vercel as a Node.js project.

3. **Configure Environment Variables in Vercel:**
   | Variable Name | Description | Example |
   |---|---|---|
   | `TELEGRAM_BOT_TOKEN` | Bot token provided by Telegram `@BotFather` | `8093638286:AAHsl...` |
   | `AUTHORIZED_CHAT_ID` | Telegram User or Chat ID authorized to run commands | `499900380` |
   | `SPREADSHEET_ID` | Google Sheet ID from URL | `1n4feZRy9p0pEh...` |
   | `GOOGLE_SERVICE_ACCOUNT_KEY` | Service Account JSON credentials string (or Base64 encoded JSON) | `{"type": "service_account", ...}` |

4. **Set Telegram Webhook:**
   Execute this URL in your browser replacing `<YOUR_TELEGRAM_BOT_TOKEN>` and `<YOUR_VERCEL_DOMAIN>`:
   ```text
   https://api.telegram.org/bot<YOUR_TELEGRAM_BOT_TOKEN>/setWebhook?url=https://<YOUR_VERCEL_DOMAIN>/
   ```

---

## 📜 Google Apps Script (GAS) Integration Code

If you use Google Apps Script inside your Google Sheet to automatically process pending rows and broadcast class schedules to Telegram groups, paste the following snippet in your Google Sheet's **Extensions > Apps Script** editor:

```javascript
/**
 * TCR Class Scheduler Google Apps Script (GAS)
 * Sends pending schedule updates from Google Sheets to Telegram channels/groups.
 */

const TELEGRAM_BOT_TOKEN = "YOUR_TELEGRAM_BOT_TOKEN";
const TARGET_CHAT_ID = "YOUR_TELEGRAM_GROUP_OR_CHANNEL_ID"; // e.g. -100123456789
const SHEET_TAB_NAME = "Schedule";

function sendPendingClassNotifications() {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_TAB_NAME);
  if (!sheet) {
    Logger.log("Sheet tab not found: " + SHEET_TAB_NAME);
    return;
  }

  const data = sheet.getDataRange().getValues();
  if (data.length <= 1) return;

  for (let i = 1; i < data.length; i++) {
    const row = data[i];
    const dateVal = row[0];
    const timeVal = row[1];
    const centerVal = row[2];
    const courseVal = row[3];
    const subjectVal = row[4];
    const facultyVal = row[5];
    const statusVal = row[6];

    // Check if row has valid date & is not yet marked SENT
    if (dateVal && String(statusVal).trim().toUpperCase() !== "SENT") {
      const message =
        "📢 *TCR Class Schedule Announcement*\n\n" +
        "🗓 *Date:* " + dateVal + "\n" +
        "⏰ *Time:* " + timeVal + "\n" +
        "🏛 *Center:* " + centerVal + "\n" +
        "📚 *Course:* " + courseVal + " - " + subjectVal + "\n" +
        "👨‍🏫 *Faculty:* " + facultyVal;

      const success = sendTelegram(TARGET_CHAT_ID, message);
      if (success) {
        // Mark row as SENT in Column G (Column 7)
        sheet.getRange(i + 1, 7).setValue("SENT");
        Logger.log("Notification sent for Row " + (i + 1));
      }
    }
  }
}

function sendTelegram(chatId, text) {
  const url = "https://api.telegram.org/bot" + TELEGRAM_BOT_TOKEN + "/sendMessage";
  const payload = {
    chat_id: chatId,
    text: text,
    parse_mode: "Markdown"
  };

  const options = {
    method: "post",
    contentType: "application/json",
    payload: JSON.stringify(payload),
    muteHttpExceptions: true
  };

  try {
    const response = UrlFetchApp.fetch(url, options);
    const result = JSON.parse(response.getContentText());
    return result.ok === true;
  } catch (err) {
    Logger.log("Error sending Telegram message: " + err.message);
    return false;
  }
}

/**
 * Time-driven trigger runner: Set this up to run automatically every hour or daily.
 */
function createTimeDrivenTrigger() {
  ScriptApp.newTrigger("sendPendingClassNotifications")
    .timeBased()
    .everyHours(1)
    .create();
}
```

---

## 🧪 Local Testing

Run automated tests locally using Node.js:
```bash
node test.js
```
or
```bash
npm test
```

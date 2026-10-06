# TCR Classes Telegram Scheduler Bot (Vercel Node.js & Google Sheets)

This repository contains the Node.js Telegram Bot webhook handler deployed on **Vercel** for managing the TCR Class Master Schedule in Google Sheets.

With this Telegram Bot, authorized users can create, view, search, update, and delete class rows directly using Telegram slash commands on mobile or desktop. All changes automatically reflect in real-time in the master Google Sheet in chronological order.

---

## 🌟 Key Features

- **Chronological Class Insertion:** Automatically parses class dates and start times to insert new class rows at their exact chronological position in the Google Sheet.
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

## 📅 Google Calendar & Apps Script Sync (Important Note)

> 💡 **Why don't Google Apps Script `onEdit(e)` triggers fire automatically when adding classes via Telegram Bot?**
> Google Sheets intentionally **disables `onEdit(e)` triggers** for edits made programmatically via the Google Sheets API (like this Telegram bot). `onEdit(e)` only fires when a human manually types in the Google Sheets web interface.

### How to Automatically Sync Telegram-Created Classes to Google Calendar / Telegram Channels

To automatically process and sync classes created by the Telegram bot to Google Calendar or Telegram announcements, use a **Time-Driven Trigger** in Google Apps Script:

1. Open your Google Sheet and click **Extensions > Apps Script**.
2. Paste the script below into the Apps Script editor.
3. Click the **Triggers (Alarm Icon ⏰)** in the left sidebar.
4. Click **Add Trigger**:
   - Choose function: `syncPendingClassesToCalendarAndTelegram`
   - Select event source: **Time-driven**
   - Select type of time based trigger: **Minutes timer**
   - Select minute interval: **Every minute** (or **Every 5 minutes**)
5. Save the trigger. Now, any class created via Telegram Bot, API, or manual edit will be synced automatically within 1 minute!

---

## 📜 Google Apps Script (GAS) Sync Code Snippet

```javascript
/**
 * TCR Class Scheduler Google Apps Script (GAS)
 * Automatically syncs unsent/new class rows to Google Calendar and Telegram announcements.
 */

const TELEGRAM_BOT_TOKEN = "YOUR_TELEGRAM_BOT_TOKEN";
const TARGET_CHAT_ID = "YOUR_TELEGRAM_GROUP_OR_CHANNEL_ID"; // e.g. -100123456789
const GOOGLE_CALENDAR_ID = "primary"; // Or your specific Google Calendar ID
const SHEET_TAB_NAME = "Schedule";

function syncPendingClassesToCalendarAndTelegram() {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_TAB_NAME);
  if (!sheet) return;

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
    const statusVal = String(row[6] || '').trim().toUpperCase();
    const calendarEventId = String(row[7] || '').trim();

    // If row has valid date and status is NOT "SENT" or "CALENDAR_SYNCED"
    if (dateVal && statusVal !== "SENT" && statusVal !== "CALENDAR_SYNCED") {

      // Telegram-created rows already have their Calendar event iCalUID in Column H.
      // Avoid creating a duplicate, but still broadcast them and mark them SENT.
      if (!calendarEventId) {
        try {
          const eventId = createGoogleCalendarEvent(dateVal, timeVal, centerVal, courseVal, subjectVal, facultyVal);
          if (eventId) {
            sheet.getRange(i + 1, 8).setValue(eventId);
          }
        } catch (err) {
          Logger.log("Calendar sync error for Row " + (i + 1) + ": " + err.message);
        }
      }

      // 2. Broadcast to Telegram Channel/Group
      if (TELEGRAM_BOT_TOKEN && TARGET_CHAT_ID) {
        const message =
          "📢 *TCR Class Schedule Announcement*\n\n" +
          "🗓 *Date:* " + dateVal + "\n" +
          "⏰ *Time:* " + timeVal + "\n" +
          "🏛 *Center:* " + centerVal + "\n" +
          "📚 *Course:* " + courseVal + " - " + subjectVal + "\n" +
          "👨‍🏫 *Faculty:* " + facultyVal;

        sendTelegram(TARGET_CHAT_ID, message);
      }

      // Mark row as SENT in Column G (Column 7)
      sheet.getRange(i + 1, 7).setValue("SENT");
      Logger.log("Successfully synced row " + (i + 1));
    }
  }
}

function createGoogleCalendarEvent(dateStr, timeStr, center, course, subject, faculty) {
  const cal = CalendarApp.getCalendarById(GOOGLE_CALENDAR_ID) || CalendarApp.getDefaultCalendar();
  if (!cal) return;

  const title = course + " - " + subject + " (" + faculty + ") @ " + center;
  const description = "Class Schedule: " + course + " " + subject + "\nFaculty: " + faculty + "\nCenter: " + center;

  // Simple parser for Date & Time
  const fullDateTimeStr = dateStr + " " + (timeStr ? timeStr.split("-")[0].trim() : "09:00AM");
  const startTime = new Date(fullDateTimeStr);

  if (isNaN(startTime.getTime())) {
    Logger.log("Could not parse date for calendar: " + fullDateTimeStr);
    return;
  }

  // Default duration 2 hours if end time not parsed
  const endTime = new Date(startTime.getTime() + 2 * 60 * 60 * 1000);

  const event = cal.createEvent(title, startTime, endTime, {
    location: center,
    description: description
  });
  return event.getId();
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
    Logger.log("Telegram API Error: " + err.message);
    return false;
  }
}
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
   | `GOOGLE_CALENDAR_ID` | (Optional) Primary or specific Google Calendar ID for direct sync | `primary` or `c_xxx@group.calendar.google.com` |

4. **Set Telegram Webhook:**
   Execute this URL in your browser replacing `<YOUR_TELEGRAM_BOT_TOKEN>` and `<YOUR_VERCEL_DOMAIN>`:
   ```text
   https://api.telegram.org/bot<YOUR_TELEGRAM_BOT_TOKEN>/setWebhook?url=https://<YOUR_VERCEL_DOMAIN>/
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

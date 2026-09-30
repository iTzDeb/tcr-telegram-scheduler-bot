# TCR Classes Telegram Scheduler Bot (Vercel Node.js)

This repository contains the Node.js Telegram Bot serverless handler deployed to **Vercel** for managing the TCR Class Master Schedule in Google Sheets.

With this Telegram Bot, authorized users can create, view, update, and delete class rows directly using Telegram slash commands. All changes automatically reflect in the master Google Sheet.

---

## 🤖 Slash Commands

| Command | Usage / Example | Description |
|---|---|---|
| `/start` or `/help` | `/help` | Shows bot commands and quick usage instructions. |
| `/list` | `/list`<br>`/list 30 Aug 2026`<br>`/list Laxmi Nagar` | Lists schedule rows matching optional date or keyword filter with their respective Row Numbers. |
| `/create` | `/create 06 Sept 2026 \| 4:00 - 6:00PM \| Laxmi Nagar \| CLAT \| Legal \| Shivam Sir` | Appends a new class row to the `Schedule` sheet. |
| `/update` | `/update 15 Time 5:00 - 7:00PM`<br>`/update 15 Faculty Anand Sir`<br>`/update 15 06 Sept 2026 \| 4:00 - 6:00PM \| Laxmi Nagar \| CLAT \| Legal \| Shivam Sir` | Updates specific column fields or entire row for a given row number and resets `SENT` status. |
| `/delete` | `/delete 15` | Deletes row 15 from the Google Sheet. |
| `/check` | `/check` | Checks bot online status and reports pending unsent class count. |

---

## 🚀 Setup & Vercel Deployment Instructions

1. Push this repository to GitHub (`iTzDeb/tcr-telegram-scheduler-bot`).
2. Import project into Vercel.
3. Set environment variables in Vercel:
   - `TELEGRAM_BOT_TOKEN`
   - `AUTHORIZED_CHAT_ID`
   - `SPREADSHEET_ID`
   - `GOOGLE_SERVICE_ACCOUNT_KEY`
4. Set Telegram Webhook to your Vercel URL.
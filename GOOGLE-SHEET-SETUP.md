# 🗂️ Google Sheet as the one central registration database

Clubs keep using the website's registration form. Every entry lands in **one private
Google Sheet**, passport photos go to **your Google Drive**, and the club gets a
**confirmation email** (and SMS, if you switch it on). The website itself stays a free
static site on GitHub Pages — no server, no hosting bill.

```
club fills form ──► Apps Script Web App ──► your Google Sheet  (Teams / Players / Officials / Documents)
        │                   │
        │                   ├──► passport photos ──► your Drive folder (private)
        │                   └──► confirmation email + SMS to the club
        └──► public website shows only APPROVED clubs, with no phone numbers or addresses
```

---

## Part 1 — Create the Sheet and the backend (10 minutes, once)

1. **Create a Google Sheet** — go to [sheets.google.com](https://sheets.google.com) → **Blank**
   → name it **"Goni Gora Championship 2026"**.

2. **Open the script editor** — in that Sheet: **Extensions → Apps Script**.
   Delete anything in the editor, then paste the **entire contents** of
   `google-apps-script/Code.gs` from this project. Save (💾).

3. **Run the setup** — choose the function **`setup`** in the toolbar and click **Run**.
   Google will ask you to review permissions:
   *Advanced → "Go to Goni Gora… (unsafe)" → Allow* (it's your own script).
   It creates the **Teams**, **Players**, **Officials**, **Documents** and **Log** tabs and a
   private Drive folder called **"Goni Gora Passports"**.

4. **Deploy as a Web App** — **Deploy → New deployment → (gear) Web app**:
   - Description: `Registration API`
   - **Execute as: Me**
   - **Who has access: Anyone** ← required, clubs are not signed in to Google
   - Click **Deploy** → copy the **Web app URL** (ends in `/exec`).

5. **Set your secret admin token** — ⚙️ **Project Settings → Script Properties → Add
   script property**:
   | Property | Value |
   |---|---|
   | `ADMIN_TOKEN` | a long random string only you know, e.g. `Gg2026-k7Xq2pLm9` |

   Optional (for SMS): `TERMII_API_KEY`, `TERMII_SENDER_ID`, `SMS_ADMIN_PHONE`.

---

## Part 2 — Point the website at the Sheet

✅ **Already done.** Your Web App URL is already written into the site:

```
https://script.google.com/macros/s/AKfycbzlDHSz...lEqm/exec
```

What is still needed is the **ADMIN_TOKEN** so the admin panel can read the register:

1. Open the Apps Script project → ⚙️ **Project Settings → Script Properties** → read
   (or add) `ADMIN_TOKEN`.
2. Open the website → **Admin** → log in → **💾 Data** → paste it into
   **Google Sheet admin token** → **Save token** (it is kept in that browser only).
3. Click **☁️ Load from Google Sheet** — every team, player and official appears.

*(If you ever rebuild the file from source, the URL lives in `CONFIG.cloudUrl` near the
top of `index.html`.)*

Open `index.html` (in `github-upload/` or `github-pages/`), find the `CONFIG` block near
the top (around line 756) and fill in two values:

```js
var CONFIG = {
  demoOnFirstRun: false,
  cloudUrl:   'https://script.google.com/macros/s/AKfycb......../exec',  // your /exec URL
  adminToken: 'Gg2026-k7Xq2pLm9',                                        // same as ADMIN_TOKEN
  submissionEndpoint: ''
};
```

Save, then upload `index.html` to your GitHub repository (alongside `fixtures.json`) and
commit — GitHub Pages updates within a minute.

> **Important:** after any change to `Code.gs`, you must publish a new version:
> **Deploy → Manage deployments → ✏️ → Version: New version → Deploy**. Otherwise the
> website keeps calling the old code.

---

## Part 3 — Day-to-day use

### When a club registers
- A row appears in **Teams** (status `pending`) and one row per player in **Players**
- Passport photos are saved to **Drive → Goni Gora Passports** (private, only you)
- The club gets a confirmation email: *"Registration received — reference DoH-2026-00XX"*
- You get a notification at `dynastyofhope2023@gmail.com`
- Every step is recorded in the **Log** tab

### To confirm a club
1. Open your Sheet → **Teams** → set that row's **Status** column to `approved`
   *(or use the website's admin panel — see below)*
2. The club immediately receives the **CONFIRMED** email (and SMS) with venue and kick-off
3. The club now appears on the public **Teams** page of the website

### From the website's admin panel
Log in (password `DynastyHope@2026` — change it in Settings), then:
- **Data → ☁️ Load from Google Sheet** — pulls every team, player, official and the
  activity log into the panel
- **Approve / Reject** on a team — writes back to the Sheet *and* sends the CONFIRMED
  email/SMS, then tells you what was sent
- **⬇️ Players (.csv)** — export the whole register to Excel

### Privacy
- The public website shows **only approved** clubs
- Published squads show shirt number, name, position and age — **never** phone numbers,
  residential addresses, NINs or passport photos
- Those live only in your private Sheet and Drive, and are visible to signed-in
  administrators

---

## Email and SMS

**Email** is sent from the Google account that owns the Sheet — free, and the only
outbound mail server a *free* PythonAnywhere-style host would block, which is why the
Sheet approach avoids that limitation entirely. Quota: about **100 messages/day** on a
free Gmail account (1,500 on Workspace) — plenty for 16 clubs.

**SMS** (optional) needs a [Termii](https://termii.com) account: copy your API key, register
a Sender ID (3–11 letters, e.g. `DoHope`), top up about **₦1,000** (≈₦6–9 per message), then
add to Script Properties:

| Property | Example |
|---|---|
| `TERMII_API_KEY` | `TL_xxxxxxxxxxxx` |
| `TERMII_SENDER_ID` | `DoHope` |
| `SMS_ADMIN_PHONE` | `0703 382 8292` (gets new-registration alerts) |

---

---

## 💬 WhatsApp confirmations

Two levels — **both are wired in already**.

### 1. Free click-to-chat (on by default, no account needed)
Every registration builds a `wa.me` link for the coach's number:

- **In the confirmation email** — a green *"💬 Chat with us on WhatsApp"* button
- **In the Log tab** of your Sheet — recorded as `channel: whatsapp, status: link ready`
- **On the team's row** — when you approve, a ready-to-tap link is written into the
  **WhatsAppLink** column of the Teams tab
- **In the admin panel** — a **📱 WhatsApp** button beside every team, pre-filled with:
  *"…your registration … is CONFIRMED. Reference DoH-2026-000X. Venue…"*
- **On the success page** — the club can message your office (0703 382 8292) in one tap

### 2. Automatic WhatsApp through Termii (optional, paid ≈ $0.056 per message)
Add these to your Apps Script **Project Settings → Script Properties**:

| Property | Value |
|---|---|
| `WHATSAPP_MODE` | `termii` |
| `TERMII_API_KEY` | your Termii API key |
| `TERMII_WHATSAPP_SENDER` | the WhatsApp sender/device name approved on your Termii account |

Then **Deploy → Manage deployments → ✏️ → New version** (mandatory after any script or
property change). Clubs will then receive WhatsApp automatically the moment they register
and again when you approve them.

Notes:
- Termii requires an approved WhatsApp Business sender, and the club's number must be on
  WhatsApp. If a send fails, the script logs it and quietly falls back to the free link,
  so the club is still reachable.
- Messages sent outside a 24-hour conversation window may need an approved WhatsApp
  template — check your Termii dashboard.

---

## Troubleshooting

| Symptom | Fix |
|---|---|
| Website says "not connected" in Admin → Data | `CONFIG.cloudUrl` is still empty |
| "Could not load the register: Wrong or missing admin token" | `CONFIG.adminToken` ≠ `ADMIN_TOKEN` in Script Properties |
| Nothing arrives in the Sheet | Deploy → **Manage deployments → New version**; check Who has access = **Anyone** |
| Email not arriving | Check the owner's Gmail **Sent** folder and the **Log** tab; quota is 100/day |
| Duplicate rows | Impossible — each submission carries a clientId and is ignored if repeated |
| "All 16 slots are taken" | Correct behaviour; delete a row or change its status in the Sheet |

## Share the Sheet with a colleague
Share the spreadsheet with them (Viewer or Editor). Passport files in Drive stay private to
you unless you share the folder too — recommended: keep them private.

# AltiusNXT Technologies – Outreach & Data Enrichment Platform v2.0

A lightweight B2B email outreach and HubSpot-style analytics platform designed for the AltiusNXT sales team. This tool allows composing, template generation, tracking, and direct delivery of product data enrichment emails via the Google Gmail API.

---

## Key Features

1. **Gmail-Style Navigation Sidebar:** Toggle between the Composer, Sent folder, Drafts list, Analytics page, and System Settings views instantly.
2. **Rich Email Composer:** Support for To, CC, and BCC recipient fields, editable Subject lines, and a large body text editor.
3. **Verdana 14px Corporate Formatting:** Wraps all email bodies (dynamic templates or manual messages) inside an inline styling container ensuring all outgoing mail renders standard across clients (`font-family: Verdana, sans-serif; font-size: 14px; line-height: 1.6; color: #222222; background-color: #FFFFFF`).
4. **Sent folder History:** Grid table logs client details, subject line, send date, and file attachment presence. Features real-time search queries and a detailed click-to-view email detail overlay drawer.
5. **Saved Drafts:** Instantly save drafts to `localStorage`. Tapping a saved draft loads all form details, template parameters, subject line, and body text back into the Active Composer.
6. **E2E Attachment Delivery (Google API):** Drag-and-drop or browse multiple files (PNG, JPG, PDF, DOCX, XLSX, ZIP). JavaScript compiles raw `multipart/mixed` MIME packages to deliver files exactly as uploaded.
7. **KPI Dashboard & Chart.js Analytics:** Count counters track emails sent Today, this Week, this Month, and in Total. Includes an interactive daily sent bar chart.

---

## Technical Architecture

- **Host Server:** Native Windows PowerShell static web server (`server.ps1`) listening on `http://localhost:8080`.
- **OAuth Identity & Sending:** Browser-side Google Identity OAuth2 implicit flow. Delivers encoded raw MIME emails directly to `POST https://gmail.googleapis.com/gmail/v1/users/me/messages/send`.
- **API Keys / Data:** Stores AI keys (Gemini, OpenAI, Anthropic), active tokens, drafts, and sent history securely inside the browser's `localStorage` (your passwords never touch any third-party servers).

---

## Step 1: Start the Local Web Server

1. Open a PowerShell terminal in the folder `d:\dev\Email Tool`.
2. Run the server using:
   ```powershell
   PowerShell.exe -ExecutionPolicy Bypass -File .\server.ps1
   ```
3. Open your web browser and navigate to: **`http://localhost:8080/`**
4. (To shut down the server, press `Ctrl+C` in the PowerShell window).

---

## Step 2: Configure Google Cloud OAuth (Web Client ID)

To send emails from **manoj@altiusnxt.com** via the tool:

1. Open the [Google Cloud Console](https://console.cloud.google.com/).
2. Create or select a project and enable the **Gmail API**.
3. Configure the **OAuth Consent Screen**:
   - Set scope to `https://www.googleapis.com/auth/gmail.send`.
   - **CRITICAL:** If your publishing status is *Testing*, you must add the sender email (e.g., `manoj@altiusnxt.com`) to the **Test Users** list, otherwise Google will block authentication.
4. Create **Credentials** → **OAuth client ID**:
   - Application Type: **Web application**.
   - Authorized JavaScript origins: `http://localhost:8080`
   - Authorized redirect URIs: `http://localhost:8080/index.html` and `http://localhost:8080/`
   - Click **Create**, then copy the generated **Client ID**.

---

## Step 3: Configure and Connect the Platform

1. Navigate to `http://localhost:8080/`. Click **Settings** in the left sidebar.
2. Google OAuth Credentials:
   - Paste your **Google Client ID** into the Web Client field.
   - Click **Connect Gmail Account** (or click **Disconnect** to sign out).
3. AI API Configurations:
   - Select your provider (Google Gemini API is highly recommended due to native CORS support).
   - Enter your **AI API Key** and click **Save & Apply**.
4. Click **Composer** to begin sending.

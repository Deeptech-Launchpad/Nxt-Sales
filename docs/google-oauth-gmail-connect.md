# Gmail Connect — allowing any Gmail user (Google OAuth)

This document explains why only *test users* can currently connect Gmail, how to
let **any** Gmail account connect, and whether Google verification is required.

> **Nothing in this file changes app behaviour.** The only code change for this
> update was trimming the requested OAuth scopes (see the end). Everything else
> here is Google Cloud Console configuration you perform on Google's side.

---

## 1. Why only Test Users can connect right now

The OAuth consent screen for the **NXT MarketingWiz** project is in **"Testing"**
publishing status.

In Testing mode Google **only allows accounts listed under *Test users*** to
complete the OAuth flow. Everyone else is blocked with
*"Access blocked: … has not completed the Google verification process"* /
*"App is being tested"*.

Two consequences of Testing mode:
- Only the (max 100) emails you add as **Test users** can connect.
- Refresh tokens issued in Testing mode **expire after 7 days**, so even test
  users get silently disconnected after a week.

## 2. The fix — publish the app to Production

Google Cloud Console → **Google Auth Platform** (APIs & Services → OAuth consent
screen) → **Audience** → **Publish app** (change publishing status from *Testing*
to *In production*).

Once **In production**, any Google account can start the flow. **But** what the
user sees next depends on verification (section 3).

## 3. Is Google verification required? — **Yes**

This app requests these Gmail scopes:

| Scope | Sensitivity | Used for |
|-------|-------------|----------|
| `gmail.send` | **Sensitive** | Sending email (`messages.send`) |
| `gmail.readonly` | **Restricted** | Email sync — reading message list & bodies |
| `calendar.events` | Sensitive | Meeting scheduling |

Because it uses a **Restricted** scope (`gmail.readonly`), Google verification is
required for unrestricted production use.

What happens if you publish to Production **without** completing verification:
- Users see an **"Google hasn't verified this app"** warning screen.
- For sensitive scopes they can expand **Advanced → Go to … (unsafe)** and
  proceed, but there is a **100-user cap** for unverified apps.
- For the **restricted** `gmail.readonly` scope, external access stays limited
  until a **security assessment** is completed — this is the real blocker for
  "any Gmail user, no warning".

## 4. Exact remaining steps to get verified

**A. Prepare the consent screen (Branding)**
1. App name: `NXT Sales` (or as desired) and an app **logo**.
2. **User support email** and **Developer contact email**.
3. **App home page:** `https://nxtsales.altiusnxt.tech`
4. **Privacy policy URL** and **Terms of service URL** (must be reachable pages
   on your domain).
5. **Authorized domains:** `altiusnxt.tech`

**B. Verify domain ownership**
- Verify `altiusnxt.tech` in **Google Search Console**, using the same Google
  account that owns the Cloud project.

**C. Confirm redirect URIs (already set during deployment)**
- Authorized redirect URIs:
  - `https://nxtsales.altiusnxt.tech/auth/google/callback`
  - `https://nxtsales.altiusnxt.tech/api/email/gmail/callback`
- Authorized JavaScript origin: `https://nxtsales.altiusnxt.tech`

**D. Publish to Production** (Audience → Publish app).

**E. Submit for verification**
- Provide a **scope justification** for `gmail.send` and `gmail.readonly`, and a
  **demonstration video** of the OAuth flow and how each scope is used.
- Because `gmail.readonly` is **restricted**, Google requires an annual
  **CASA (Cloud Application Security Assessment)** performed by a Google-authorized
  third-party assessor.
- Review typically takes **several days to a few weeks**.

## 5. Faster alternative (trade-off)

If you do **not** need email **sync/reading** for external users and only need
**sending**, you could drop `gmail.readonly`. That leaves only **sensitive**
scopes (`gmail.send`, `calendar.events`), which do **not** require the CASA
security assessment — standard verification is enough, and the unverified
warning can be bypassed up to the 100-user cap in the meantime.

Since this app relies on the email-sync feature, the current configuration keeps
`gmail.readonly`. This is a product decision, not a code limitation.

## 6. Code change made for this update

`server/src/routes/email.js` — removed the unused `gmail.modify` **restricted**
scope from the requested scopes. The app never calls any modify/label/trash
Gmail endpoint, so this is safe and it **shrinks the verification/security-review
footprint**. Existing connected accounts continue to work unchanged.

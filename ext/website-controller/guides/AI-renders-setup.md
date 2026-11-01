# "Render my kitchen": setup

In the 3D designer, the **Render my kitchen** button turns the customer's 3D view into a realistic, photo-style picture using their door style, colors, countertop, walls and floor.

Customers must **make a free LARKUL account and sign in** first (email + password, right on your site). The same account is used for reading room photos. Accounts are stored on your own Netlify site, not with any other company. There's no extra service to sign up for.

## What you need
- **One AI account**, either one:
  - **fal.ai**: the default. Its "flux" model keeps every cabinet exactly where it was placed. Its "nano-banana" option runs Google's image AI and usually looks better.
  - **Google Gemini** (aistudio.google.com): Google's image AI, billed by Google directly.
- **Hosting that can keep a secret key hidden.** The website needs a host anyway, since it's replacing Squarespace. Netlify's free plan is that host. It also runs the small piece of server code that keeps your AI key hidden from visitors and enforces your budget. That's why it isn't an extra account just for renders.

  *Why the key can't simply go in the website:* everything in the website folder can be downloaded by anyone. Someone could copy the key and spend your whole AI balance on their own pictures, and the budget couldn't stop them. Squarespace can't run server code, so it can't do this job.

## Your settings: `render-settings.mjs`
Open `render-settings.mjs` in the website folder. Everything is in this one file:

| Setting | What it does | Starts at |
|---|---|---|
| `service` | Which AI account you use: `"fal"` or `"gemini"` | "fal" |
| `monthlyBudget` | **Dollars per month for the whole site.** When this month's renders would go past it, the button says renders are done for the month. It starts again on the 1st. | 20 |
| `costPerRender` | Your average cost for one render. The site counts renders × this cost against the budget. After a few renders, check your fal or Google billing page and adjust it. | 0.04 |
| `perAccount` | Renders each customer account gets per month, so one person can't use the whole budget. `0` turns it off. | 5 |
| `paused` | `true` turns renders off for everyone. | false |
| `falModel` | With fal: `"flux"` or `"nano-banana"` | "flux" |
| `geminiModel` | With Gemini: the model name from Google's image docs | "gemini-3.1-flash-image" |

For example, a $20 budget at 4 cents a render is about 500 renders a month. Save the file and publish the site again for changes to take effect.

---

## Setup (about 15 minutes)

### 1. Get your AI key
**fal.ai:** sign up, open **Billing** and buy some credits (for example $20), then open **API Keys** and create a key. Leave auto top-up off; that's your backstop, because fal can never charge more than the credits you loaded.

**or Google Gemini:** go to **aistudio.google.com**, click **Get API key**, and create one. Image generation needs billing turned on for that Google project. In Google Cloud Billing you can also set a **budget alert** as a backstop. Then set `service: "gemini"` in `render-settings.mjs`.

### 2. Put the key in Netlify
In Netlify, open your site, then **Site configuration → Environment variables**. Add **one** of these:
- `FAL_KEY` with your fal key, or
- `GEMINI_API_KEY` with your Google key

Also make sure `ADMIN_PASSWORD` is set (step 3 of GO-LIVE.md). Customer accounts use it to sign their sign-ins, so without it nobody can make an account.

### 3. Publish the site (not drag-and-drop)
Netlify's drag-and-drop upload doesn't run server code, so use one of these instead:
- **Easiest long-term:** put the `website` folder in a GitHub repository, then use **Netlify → Add new site → Import from Git**. Every change you push goes live on its own.
- **No GitHub:** install Node.js from nodejs.org, open a terminal in the `website` folder, and run:
  ```
  npm install
  npx netlify-cli login
  npx netlify-cli deploy --prod
  ```

### 4. Try it
Open your site, go to the 3D Kitchen Designer, add a few cabinets and press **Render my kitchen**.

## Customer accounts
- **How they're kept safe:** passwords are never stored, only a scrambled (scrypt) version that can't be turned back into the password. Sign-ins expire after 30 days.
- **Limits against abuse:** 5 new accounts per internet connection per day. After 10 wrong passwords in an hour, that connection (or that account) has to wait an hour.
- **Accounts need `ADMIN_PASSWORD`**, the same Netlify setting that turns on your /admin page. If you change it, every customer gets signed out and simply signs in again.
- **Customers can delete their own account** under Render my kitchen → Account. That removes their email, password and render count.
- **Forgot password:** there's no email reset, because that would need another service. When someone emails you, open **/admin → Customer accounts → Remove a customer account**, type their email, and they can sign up again with the same email. Use the same box when someone asks you to delete their information.

## Privacy page
The site has a **Privacy** page (footer link, plus links in the sign-up box and the render box). It says plainly that LARKUL never sells or shares information. It also says that pictures are sent only to your AI service to make the image, and that Netlify hosts the site. **Things to confirm so it stays true:**
- `aiService` in `index.html` (catalog part 10) must name the AI you use: "fal.ai" or "Google Gemini".
- With **Gemini**, use a paid (billing-on) API key. Google's terms say it may use free-tier data to improve its products, but not paid-tier data.
- With **fal.ai**, room-photo reading goes through fal to Google's Gemini model. Check fal's terms on how long it keeps the images it creates.
- How long you keep form messages and finished renders. They're kept until you delete them. If you'd like an automatic clean-up (for example after 12 months), tell me.
- If you ever add analytics (like Google Analytics), the privacy page has to say so.

## Good to know
- A render that fails is handed back and doesn't count against the budget or the customer's limit.
- To hide the button entirely, open `index.html`, search for **10. AI RENDERS** and set `on: false`.
- Files: `render-settings.mjs` holds your settings. The server code is `netlify/functions/render.mjs`, `render-background.mjs` (Gemini) and `account.mjs` (customer accounts), plus `netlify/render-lib.mjs` and `netlify/account-lib.mjs`. `netlify.toml` and `package.json` tell Netlify how to run it.

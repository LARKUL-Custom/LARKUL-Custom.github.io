# Putting the LARKUL site live

About an hour, start to finish. You need a free Netlify account and access to where larkul.com is registered. Your email (sales@larkul.com) keeps working the whole time.

---

## 1. Where the website lives

The website is kept in your **LARKUL-Custom/Extension-Hub** repository on GitHub, inside the Website extension, in the folder `extensions/website-controller/site`. Claude keeps it up to date there.

Netlify never gets access to your GitHub. A small workflow in Extension-Hub (**Website deploy**) uploads only that folder to Netlify, using a Netlify key you save in GitHub.

## 2. Create the Netlify site (5 min)

1. **Make a Netlify key.** In Netlify, click your avatar → **User settings** → **Applications** → **Personal access tokens** → **New access token**. Name it `LARKUL website deploy`, pick an expiration (or "No expiration"), click **Generate token**, and copy it. Netlify shows it only once.
2. **Save it in GitHub.** Open **github.com/LARKUL-Custom/Extension-Hub** → **Settings** → **Secrets and variables** → **Actions** → **New repository secret**. Name: `NETLIFY_AUTH_TOKEN`. Paste the key, then click **Add secret**.
3. **Run the first deploy.** In Extension-Hub open the **Actions** tab → **Website deploy** (left side) → **Run workflow**, type `deploy` in the box, then **Run workflow**. It takes about two minutes and turns green when it's done.
4. Back in Netlify, the **Projects** page now shows **larkul-website**. Your address is `larkul-website.netlify.app`. Open it: that's your new site.

Nothing deploys by itself. Each deploy costs 15 of the free plan's 300 monthly Netlify credits, so changes go live only when you run **Website deploy** from the Actions tab. Bundle your changes and deploy rarely.

> Don't use Netlify's drag-and-drop upload. It skips the server code that runs the admin page, the forms and the AI renders.

## 3. Turn on the admin page (3 min)

1. In Netlify: **Project configuration → Environment variables → Add a variable**.
2. Key: `ADMIN_PASSWORD`. Value: a long password only you know (a short sentence works well). Save.
3. It takes effect at your next deploy (**Actions → Website deploy → Run workflow**, type `deploy`). To save credits, do steps 3 to 5 first and deploy once.
4. Open `your-address.netlify.app/admin` and sign in.

## 4. Turn on the forms (3 min)

The Free Quote form, the "Request my quote" form in the 3D designer and checkout orders all send through Netlify Forms.

1. In Netlify open **Forms** → **Enable form detection**.
2. Deploy once after turning this on (**Actions → Website deploy → Run workflow**, type `deploy`), so Netlify finds the forms (`quote`, `design-quote`, `order`, `experimental-interest`).
3. **Forms → Submission notifications → Add notification → Email notification**, choose "Any form", and enter `sales@larkul.com`.
4. Send a test from the Free Quote page and check that the email arrives (look in spam the first time).

Every submission is also kept in **Forms** in Netlify, with photos and files attached.

## 5. Turn on "Render my kitchen" (10 min, optional)

1. Make a **fal.ai** account, buy some credits (for example $20), and create an API key under **API Keys**. Leave auto top-up off.
2. In Netlify add the environment variable `FAL_KEY` with that key, then deploy once (**Actions → Website deploy → Run workflow**, type `deploy`).
3. Your monthly budget is in `render-settings.mjs` ($20 to start). Details and the Google Gemini option are in `render-setup/README.md`.

For now the button says **Coming soon** and nothing is sent to an AI. Once your key is in Netlify and you've deployed, open `/admin` → **3D designer prices**, untick **Show "Coming soon" instead of Render my kitchen**, and press **Publish** (no redeploy needed).

## 6. Load your photos and prices (as long as you like)

In `/admin`:
1. **Photos & files → Copy them now.** This copies all your Squarespace photos into your own site, so they keep working after you cancel Squarespace. Then press **Publish**.
2. Change prices, drop in photos, and press **Publish**. Changes show on the shop, bundles, 3D designer and the `#pricer` quick-quote page right away. No redeploy needed.

## 7. Point larkul.com at Netlify (15 min + waiting)

Do this last, once the `netlify.app` address looks right.

**In Netlify:** **Domain management → Add a domain** → type `larkul.com` → **Verify** → **Add domain**. Netlify will ask whether to use Netlify DNS. **Choose to keep your current DNS provider** (the "external DNS" option). That keeps your email records exactly where they are.

**Where larkul.com is registered** (probably Squarespace Domains; log in at account.squarespace.com → Domains → larkul.com → DNS):

1. **Write down or screenshot every record first.**
2. Delete only the website records Squarespace added: the four **A** records on `@` (198.185.159.144, 198.185.159.145, 198.49.23.144, 198.49.23.145) and the **CNAME** on `www` (ext-cust.squarespace.com). On Squarespace these sit under "Squarespace Defaults".
3. Add:

   | Type | Host | Value |
   |---|---|---|
   | A | @ | `75.2.60.5` |
   | CNAME | www | `your-address.netlify.app` |

4. **Don't touch** anything marked MX, TXT (SPF, DKIM, google-site-verification), or any CNAME other than `www`. Those run your email.

The switch usually takes 10 minutes to a few hours. Netlify then adds the free HTTPS certificate on its own (**Domain management → HTTPS** shows when it's done).

**Keep the domain when you cancel Squarespace.** The website subscription and the domain are billed separately. Cancel only the website plan, and keep the domain (or move it to another registrar later).

## 8. Before you cancel Squarespace

- [ ] Photos copied (step 6) and published. The Photos & files page no longer shows the yellow Squarespace note.
- [ ] larkul.com opens the new site with the padlock (https).
- [ ] A test quote and a test order arrived at sales@larkul.com.
- [ ] Email to and from sales@larkul.com still works.
- [ ] Download a backup in `/admin` → **History & backups**.

---

## What works and what doesn't yet

| | Status |
|---|---|
| Shop, bundles, custom sizes, materials, cart | Works |
| 3D Kitchen Designer and estimates | Works |
| Admin page: prices, photos, formulas, history | Works once steps 2–3 are done |
| Free Quote, designer quote, checkout | Send to Netlify and your email once step 4 is done |
| AI renders | Works once a fal.ai or Gemini key is added (step 5) |
| **Card payments** | **Not connected.** Checkout sends you the order with every size, wood and option, and tells the customer you'll email a secure link to pay. You send that link from Stripe, Square or QuickBooks as an invoice. |
| Range hood and past-work photos | Still missing. Drop them in on the admin page. |
| Prices marked CONFIRM | Still guesses. Check them in the admin page. |

**Simplest way to take card payments later:** keep the order form as it is and send a Stripe or Square invoice for each order (no website change, and you check custom sizes before charging). If you'd like customers to pay on the spot instead, the next step is Stripe Checkout, which needs a Stripe account and a small addition to the server code.

## If something goes wrong

- **Admin page says "the admin server code isn't running":** the site was uploaded by drag-and-drop. Run **Website deploy** in GitHub instead (step 2).
- **Website deploy is red:** open it to read the error. "Add the repository secret" means step 2.2 is missing; a 401 means the Netlify key expired, so make a new one and replace the secret.
- **Admin page says "isn't switched on yet":** `ADMIN_PASSWORD` is missing, or you didn't redeploy after adding it.
- **Forms say "that didn't go through":** form detection is off. Do step 4 and redeploy.
- **Changing a file later:** ask Claude, which updates `extensions/website-controller/site` in the Extension-Hub repository. Claude builds and tests it first. It goes live only when you run **Website deploy** and type `deploy` (each deploy uses 15 Netlify credits, so bundle changes). Day-to-day changes belong in `/admin` (or the hub's Website tab) and don't need this.

# Design emails ("Email me my design")

The kitchen designer can email customers a link back to their design, and a copy of their
design after they send a quote request. It's **off** until you do the steps below. Until then,
"Email me the link" opens the customer's own email app with the link ready to send, and
"Copy link" always works.

It uses **Resend** (resend.com), a sending service. The free plan sends up to 3,000 emails a
month (100 a day), which is plenty. The site sends at most 90 a day and 3 per address per day.

## 1. Make the Resend account
1. Go to resend.com and sign up (free).
2. Open **Domains** › **Add domain**, type `larkul.com`, and pick the region closest to you (US East is fine).

## 2. Add Resend's DNS records (Squarespace Domains)
Resend shows 3 or 4 records (an MX and TXT on `send`, and a TXT on `resend._domainkey`).
1. In Squarespace, open **Domains › larkul.com › DNS**.
2. Add each record **exactly** as Resend shows it, as new custom records.
3. **Don't change or delete** anything that's already there: your Google Workspace MX records, the
   google-site-verification TXT records, and the Netlify A and www records all stay.
   Resend's records go on `send` and `resend._domainkey`, so they don't touch your sales@ email.
4. Back in Resend, press **Verify**. It can take a few minutes up to a few hours.

## 3. Give the site the key
1. In Resend, open **API Keys** › **Create API key**, permission **Sending access**, domain `larkul.com`. Copy the key.
2. In Netlify: **larkul-website › Site configuration › Environment variables › Add a variable**:
   - `RESEND_API_KEY` = the key you copied
   - `EMAIL_FROM` = `LARKUL <designs@larkul.com>` (any name on larkul.com works; it doesn't need its own inbox)
   - optional `EMAIL_REPLY_TO` = where replies go (default `sales@larkul.com`)
3. The key takes effect with your next deploy (only when you choose to deploy).

## 4. Switch it on
In `/admin` › **3D designer prices** › **Email me my design**, tick **Send design emails**, then **Publish**.
The Privacy page then lists Resend automatically.

To turn it off again, untick it and Publish.

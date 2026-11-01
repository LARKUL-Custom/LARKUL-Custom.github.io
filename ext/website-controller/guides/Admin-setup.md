# Your admin page: setup and how it works

Open **yoursite.com/admin**, type your password, and you can change the whole site without touching code:

- **Products:** photos, sizes, custom sizing, material prices, style options, bundles and "goes well with".
- **Photos & files:** drag photos or PDFs anywhere onto the page. Big photos are shrunk for the web automatically. Drop a photo straight onto any photo box to use it there.
- **Past work:** in **Add a finished job**, type the project name, drop in all its photos, add a short description and, if you want, the cost. Each job becomes its own page on the site with a photo album, and its photos are kept together in a folder named after the project. The cost only shows if you tick **Show the cost on the site**, so you can record it and keep it private.
- **Pricing formulas:** work out prices with math, like a spreadsheet (see below).
- **3D designer prices:** door styles, box materials, drawer boxes, hardware, inside options, and every cabinet's build price.
- **Business info, home page, look & feel, FAQ.**
- **History & backups:** every publish is kept (the last 60). You can load an old version, download a backup, or reset one section.

Your changes are saved on your computer as you work. **Preview** shows them on the real site, only to you. **Publish** puts them live for everyone.

## Setup (about 10 minutes, no new accounts)

Everything runs on Netlify, which already hosts the site. Files and prices are stored in Netlify Blobs, which is part of your Netlify site. There's nothing else to sign up for.

1. In **Netlify → your site → Site configuration → Environment variables**, add `ADMIN_PASSWORD` and set it to a long password only you know (at least 12 characters; a short sentence works well).
2. Deploy the `website` folder with GitHub, as in `GO-LIVE.md` (or the Netlify CLI, see `render-setup/README.md`). **Drag-and-drop won't work**, because it doesn't run the server code the admin page needs.
3. Open **yoursite.com/admin** and sign in.

To change the password later, edit `ADMIN_PASSWORD` and click **Deploys → Trigger deploy**.

## Pricing formulas

A formula is a small math sum, like `max(80, sqft * 32) * wood + options`. Each formula box checks what you type and shows the price it gives right away. If a formula has a mistake, customers get the normal price instead, never an error, and Publish won't go through until it's fixed.

| Where | What it prices | Names it can use |
|---|---|---|
| A product's **Price formula** | That product, in every size, material and custom size | `length`, `depth` (inches), `area`, `sqft`, `feet`, `base` (the normal price for the size), `wood` (material multiplier), `woodPrice`, `options`, `minPrice`, `rate`, `custom` |
| **3D designer: cabinets** | Every cabinet in the designer and on `#pricer` | `build`, `box`, `doors`, `drawers`, `hardware`, `inside`, `ends`, `normal`, `width`, `height`, `depth`, `feet`, `doorSqft`, `frontCount`, `doorRate`, `doorMaterial`, `finish` and more |
| A cabinet's own formula | Just that cabinet type | Same as above |
| **3D designer: installation** | Installation | `cabinetFeet`, `perFoot`, `cabinets` |

**Your numbers** lets you name a number once, like `shelfRate = 0.25`, and use it in any formula. **Your formulas** lets you name a piece of a formula and reuse it.

Math you can use: `+ - * / ^ ( )`, `min(a, b)`, `max(a, b)`, `round(x)`, `roundUp(x, 5)`, `roundTo(x, 10)`, `if(test, yes, no)`, `clamp(x, low, high)`, `< > <= >= = !=`, `and`, `or`.

A formula can only do math. It can't run code, so it's safe on customers' browsers.

## Good to know
- **Admin page or index.html?** Use the admin page. What you publish there sits on top of `index.html`, one setting at a time. Anything you never changed in the admin page still comes from `index.html`, so updates to the file keep working.
- Opening `index.html` straight from your computer shows the file's own prices, without what you published.
- Uploaded files live at `yoursite.com/files/...`. Copy a link from Photos & files to use it anywhere.
- After 10 wrong passwords, that internet connection has to wait an hour.
- Netlify's free plan covers this comfortably for a small shop (1 GB of stored files and well over 100,000 page loads a month).
- Files: `admin.html` is the page. The server code is in `netlify/functions/`: `admin.mjs` (sign-in, publishing, uploads), `catalog.mjs` (gives the site what you published) and `files.mjs` (serves your uploads).

# LARKUL website — how to edit

The whole site is one file: **index.html**. You can open it by double-clicking, and it works on any web host.

**Easiest way to edit: your admin page at yoursite.com/admin.** Drag in photos, change products and prices, and set up pricing formulas without touching code. Setup steps are in `admin-setup/README.md`. Editing `index.html` by hand, as described below, still works too.

## Where to make changes
Open `index.html` in a text editor (VS Code is free and colors the code to make it easier to read). Search for **LARKUL CATALOG**. Everything you'll ever change is in that section, and it's split into numbered parts:

| Part | What it controls |
|---|---|
| 1. BUSINESS | Name, logo, phone, email, address, hours |
| 2. LOOK & FEEL | Background, text and button colors, and the heading and body fonts |
| 3. HOME PAGE | Hero photo and headline, feature photo, "What we offer" and "Why LARKUL" lists |
| 4. CATEGORIES | The pages listed in the Products menu |
| 5. MATERIALS | Wood species and their descriptions |
| 6. PRODUCTS | Every product, its sizes, prices, options and photos |
| 7. BUNDLES | Matching sets and their discounts |
| 8. GALLERY / FAQ | Past work and common questions |
| 9. DESIGNER | Cabinet, insert and appliance prices for the 3D Kitchen Designer |
| 10. AI RENDERS | Turns the "Render my kitchen" button on or off (budget and AI choice are in render-settings.mjs) |
| 11. PRICING FORMULAS | Your own named numbers and formulas for prices (easier on the admin page) |
| 12. EXPERIMENTAL | Ideas on the "Experimental Features" page. Visitor sign-ups arrive as the "experimental-interest" form in Netlify > Forms |

Don't change anything below the line **END OF CATALOG**.

## Common edits
- **Change a price:** edit the number after `price:` or `add:`. Leave out the `$`.
- **Feature a product on the home page:** add `featured: true,` to the product.
- **Feature a past project on the home page:** on the admin page open Past work and tick **Show on home page**, or add `featured: true,` to the project in part 8. Cabinet projects go first, and the first one also leads the Past Work page.
- **Put an item on sale:** add `badge: "Sale", was: 990,` (the `was` amount shows crossed out).
- **Add a product:** copy a whole product block, from its `{` to its matching `},`, paste it below, and change its `id` to a new word with no spaces.
- **Change colors or fonts:** edit part 2. Colors are hex codes like `"#1b1b1b"`. Fonts can be any name from fonts.google.com, typed exactly as shown there.
- **Swap a photo:** put the image in the `images/` folder and set `image: "images/my-photo.jpg"`.
- **Designer cabinet widths:** the width buttons in the designer come from each cabinet's `widths: [min, max]` in part 9 (standard sizes 9" to 48" that fit inside that range). The blind corner panel sizes itself from whatever comes in from the other wall.
- **Owner pricing tool:** add `#pricer` to the end of the site's address to open your quick-quote calculator. It isn't linked in the menu.

## Things to double-check
- Any line marked `// CONFIRM` is a placeholder I guessed. The "from" prices match larkul.com, but the larger sizes, custom-size rates, bracket prices and bundle discounts need your real numbers.
- Most photos load from your Squarespace image library right now. Before you cancel Squarespace, open `/admin` → **Photos & files** → **Copy them now**, then Publish.
- Typos break the page. If the site shows up blank after an edit, look for a missing comma, quote or bracket on the line you just changed.

## Hosting and payments
- **Putting the site live:** follow `GO-LIVE.md` step by step (GitHub + Netlify, both free). Don't use Netlify's drag-and-drop upload: it skips the admin page, forms and AI renders.
- **Render my kitchen (AI pictures in the designer):** the monthly dollar budget and which AI to use are in `render-settings.mjs`. It needs one AI account (fal.ai or Google Gemini) and a Netlify deploy that isn't drag-and-drop. Steps are in `render-setup/README.md`.
- **Start from a photo (designer):** customers can upload a photo of their room and the AI guesses the walls, their lengths and where the sink, range and fridge go. They check the sizes, then the designer fills in cabinets. It uses the same AI account, sign-in and monthly budget as Render my kitchen (`costPerPhoto` and `photosPerVisitor` in `render-settings.mjs`; the server code is `netlify/functions/room-photo.mjs`). When the AI isn't set up, customers just type their wall sizes. "Fill my kitchen for me" works without any AI.
- **2020 Design files:** in the designer, "Have a 2020 Design file (.kit)? Open it in 3D" lays out the walls, island and cabinets from a client's .kit file (wall cabinet heights are guessed, since 2020 doesn't save them). For a price, drop the 2020 item list printed to PDF on the quick quote page (yoursite/#pricer). The moldings price it uses (flat stock, corner molding) is `listExtras.moldingPerFoot` in the catalog.
- **Forms:** the Free Quote form, the designer's quote form and checkout send through Netlify Forms once it's switched on (GO-LIVE.md step 4). Submissions are emailed to you and kept in Netlify > Forms.
- **Payments:** card payments aren't connected. Checkout sends you the order and tells the customer you'll email a link to pay (a Stripe, Square or QuickBooks invoice).

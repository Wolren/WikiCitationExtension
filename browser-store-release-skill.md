--- 
name: browser-store-release
description: "Complete guide to releasing a browser extension on Chrome Web Store and Firefox Add-ons (AMO). Covers all policy requirements, listing requirements, code/submission requirements, and compliance checklist for both stores."
version: 1.0.0
author: Wolren
platforms: [windows, linux, macos]
triggers:
  - browser extension
  - chrome web store
  - firefox addon
  - AMO
  - extension store release
  - extension store compliance
---

# Browser Extension Store Release Guide

Complete compliance and release guide for Chrome Web Store and Firefox Add-ons (AMO). Written for v1.0.0 of WikiCitationExtension, but applies to any MV3 browser extension.

## Quick Store Comparison

| Requirement | Chrome Web Store | Firefox AMO |
|---|---|---|
| Developer account fee | $5 one-time | Free |
| Account 2FA required | Yes | No |
| Privacy policy | Required if any user data handled | Required if any data transmitted |
| Privacy policy host | Public URL (no PDF) | Public URL |
| Source code submission | Not required (minification OK) | Required for minified/bundled code |
| Human code review | Automated + spot check | Full manual review |
| Screenshots | At least 1 required | Strongly recommended |
| Icons | Required: 16, 48, 128 PNG | Required: 16, 48, 128 PNG (or SVG) |
| Promo tiles | 440x280 + optional 1400x560 | Not required |
| Content rating | Required (set in dashboard) | Not required |
| Category selection | Required | Required (up to 2 per platform) |
| Obfuscated code | Prohibited | Prohibited |
| Remote code execution | Prohibited (MV3) | Prohibited |
| Minimum functionality | Must provide actual utility | Must function as described |
| Max file size | No explicit limit | 200 MB |
| Review time | ~1-3 days automated | ~1-4 weeks manual |

## Chrome Web Store — Full Policy Requirements

### 1. Developer Account
- Pay $5 one-time registration fee
- Enable 2-Step Verification on Google account
- Keep contact info current (Google sends policy violation emails)

### 2. Fostering a Safe Ecosystem

**Mature Content:** No nudity, sexually explicit content, or links to porn. If content may be unsuitable for all ages, mark "Mature" in dashboard.

**Malicious & Prohibited:** No viruses, worms, trojans, spyware, phishing, cryptomining. No circumventing paywalls/login restrictions. No facilitating unauthorized access to copyrighted content.

**Hate Speech & Violence:** No gratuitous violence, threats, harassment, hate speech. No recruiting for extremist groups.

**Regulated Goods & Services:** No promotion of illegal activities. No gambling without clear disclaimers. No sale of pharmaceuticals, alcohol, tobacco, weapons without legitimate purpose.

### 3. Protecting User Privacy

**Privacy Policy (Required):**
- Must post accurate, up-to-date privacy policy if extension handles ANY user data
- Must comprehensively disclose: how data is collected, used, shared, and all parties it's shared with
- Link must be in designated Developer Dashboard field
- Must be a publicly accessible URL (no PDFs, no geo-restrictions)

**Limited Use (User Data Policy):**
- Data collection/use limited to extension's disclosed single purpose
- Web browsing activity collection prohibited except for user-facing features
- No transferring/selling data to third parties (ad platforms, data brokers)
- No using data for credit-worthiness or lending
- Affirmative compliance statement required on extension's website:
  > "The use of information received from Google APIs will adhere to the Chrome Web Store User Data Policy, including the Limited Use requirements."
- Humans may not read user data except with explicit consent (support), aggregated/anonymized internal ops, security investigations, or legal compliance.

**Use of Permissions:**
- Request narrowest permissions necessary
- If multiple permissions could implement a feature, use the one with least access
- Do NOT "future proof" by requesting unused permissions

**Disclosure Requirements:**
- Must prominently disclose what data is collected and how before installation
- Must obtain affirmative, informed consent
- Data practice changes after installation must be prominently disclosed

**Handling Requirements:**
- All user data must be transmitted via modern cryptography (TLS)
- No public disclosure of financial/payment/authentication info
- Security vulnerabilities must be reported and remediated

### 4. Responsible Marketing & Monetization

**Impersonation & IP:** No pretending to be someone else. No unauthorized use of trademarks. No mimicking OS/browser functionality. No infringing copyright/patent/trademark.

**Deceptive Installation:** No confusing/misleading ads or marketing. No misleading call-to-action buttons. No bundling unrelated extensions. No hiding extension metadata.

**Accepting Payment:** If collecting payment info, must follow PCI DSS. Must clearly describe products/services. Must post refund/return policy. No Google Checkout prohibited transactions.

**Misleading/Unexpected Behavior:** No false/misleading content, title, description, or screenshots. Device setting changes require user knowledge, consent, and easy reversibility.

**Ads:** Must comply with content policies. Must be removable via settings or uninstall. No simulating system notifications. No interfering with third-party website ads. AdSense cannot serve ads in extensions.

**Affiliate Ads:** Must be prominently disclosed in listing and UI. Only inserted with related user action AND tangible user benefit.

### 5. Building Quality Products

**Feature Policy:**
Certain product types are restricted from featuring (but still available): VPNs, video downloaders, anti-virus tools, cryptocurrency, bots, gambling content, religious/political content. This does NOT affect WikiCitationExtension.

**Spam & Abuse:**
- No duplicate extensions with same functionality
- No manipulating ratings, reviews, or install counts
- No notification spam
- No sending messages on user's behalf without confirmation

**Quality Guidelines:**
- Single purpose: narrow, easy to understand
- No bundling unrelated functionality into one extension
- Must provide complementary browsing functionality
- Side panel must not hijack browsing/search experience
- Primary purpose must not be serving ads

**Listing Requirements:**
- No blank description field — guaranteed rejection
- Must have icon AND screenshots
- Metadata must be accurate, up to date, and comprehensive
- No keyword spam (repetition >5x, irrelevant keywords)
- No unattributed/anonymous testimonials
- Privacy fields must match privacy policy AND extension behavior

**Minimum Functionality:**
- Must provide actual utility/value
- No extensions that solely install/launch other apps/pages
- No broken functionality (dead sites, non-functioning features)
- No click-baity templates with negligible utility
- No extensions that only link to external services without providing functionality

### 6. Technical Requirements

**Code Readability:**
- Obfuscated code is PROHIBITED
- Minification is allowed (whitespace removal, name shortening, file concatenation)
- Extension's full functionality must be discernible from submitted code

**Manifest V3 Requirements:**
- No &lt;script&gt; tags pointing to remote resources
- No eval() or similar for executing remote strings
- No building interpreters to run remote commands
- External resources must be data only, not logic
- Only Debugger API and User Scripts API exempted for remote execution
- Remote code in iframes/sandboxed pages is exempt but must be disclosed
- Communicating with remote servers for sync, config fetching, and images is allowed

**2-Step Verification:** REQUIRED for all developer accounts before publishing.

### 7. Enforcement

- Circumvention attempts = immediate account termination
- Removals are permanent unless you submit a fixed revision
- One appeal per violation decision
- Serious/repeated violations = account suspension
- Copyright repeat infringers = account termination

---

## Firefox Add-ons (AMO) — Full Policy Requirements

### 1. No Surprises
- Functionality must be easily discernible from the listing
- Unexpected features (unrelated to primary function) must be: (a) clearly stated in description, (b) opt-in (non-default action), (c) opt-in interface must name the add-on

### 2. Content
- Mozilla trademark use must comply with Mozilla Trademark Guidelines
- "Firefox" in name → use "<Add-on name> for Firefox" format
- Must comply with Mozilla Acceptable Use Policy
- Must disclose when payment is required for functionality
- Must conform to US law
- Forks must be clearly distinguishable from original
- Add-ons solely for launching/installing other things are prohibited

### 3. Submission Guidelines
- Add-ons must function only as described
- Testing info/credentials must be provided for review
- New versions should not contain unrelated changes after corrections are requested

### 3.1. Source Code Submission (CRITICAL)
- **REQUIRED** when code is minified, bundled, transpiled, or otherwise machine-generated
- You must upload source code BEFORE build/minification steps
- Provide build instructions (README): OS, env, tool versions, all commands
- Build must be reproducible by reviewer (run build, diff output)
- Build tools must be open source (no commercial tools)
- Build tools cannot be web-based
- Must include lockfile (package-lock.json) for npm/yarn
- Source code is reviewed by admins only, never redistributed
- **FAILURE TO PROVIDE = REJECTION OR BLOCKING**
- Obfuscated code is **ABSOLUTELY PROHIBITED** regardless of distribution channel

### 4. Development Practices
- Only request necessary permissions
- Must be self-contained — no loading remote code for execution
- No remote new tab page
- Must not relax CSP
- Must use encryption for remote data transport
- Should avoid redundant code/files

### 5. User Scripts
- userScripts API for user script managers only

### 6. Data Collection and Transmission
- Limit data transmission to what's necessary for functionality
- Use data only for purpose transmitted
- Search terms must not be transmitted to third-parties
- Intercepting third-party searches is prohibited

**User Consent:**
- Must provide clear way to control data transmission
- **Personally identifiable information (PII) = opt-in required**
  - Includes: names, emails, search terms, browsing activity
- **Implicit consent** allowed for self-evident, single-use extensions where:
  - Purpose-bounded and user-initiated
  - Data transmitted only as direct result of user's action
  - Action is obvious to user (e.g. clicking "Fix citations" sends citation text to API)
- **Technical/User interaction data** = opt-out (browser settings, platform info, feature usage)

**Additional Privacy:**
- No leaking local/user-specific info to websites via native messaging
- No storing private browsing data
- No cross-session/container user identification

### 7. Monetization
- Injected ads must be clearly identified as add-on content
- Cryptocurrency miners prohibited
- Affiliate tags in web content must not modify/facilitate redirects without clear disclosure

### 8. Security, Compliance, and Blocking
- Must be secure and well-maintained
- Must securely handle data and interactions
- Mozilla may reject/block non-compliant add-ons
- May contact developer with reasonable time frame for fixes
- Blocked add-ons: Mozilla notifies user, provides reason, may offer removal

---

## Compliance Checklist

### Pre-Submission

- [ ] **Name consistency:** extension name is same across manifest.json, store listing, README, code, and messages.json
- [ ] **Single purpose:** extension does one thing and describes it clearly
- [ ] **Privacy policy:** written, hosted at public URL, covers what data is collected/transmitted/shared
- [ ] **Privacy policy in dashboard:** URL linked in the designated field
- [ ] **Permissions minimal:** only `storage` and the specific host(s) needed
- [ ] **Host permissions narrow:** no wildcards, only specific domains needed for functionality
- [ ] **No obfuscated code:** verify all bundled code is readable after minification
- [ ] **No remote code:** all scripts are from extension package, no `eval()` for remote strings
- [ ] **No unused permissions:** remove any permissions not actively used
- [ ] **Icons:** 16, 48, 128 PNG (not SVG) — PNG is safer for Chrome
- [ ] **Screenshots:** at least 1, showing the extension functioning on a real page
- [ ] **Description:** clear, accurate, no keyword spam, no false claims
- [ ] **Category:** correctly categorized in dashboard
- [ ] **Content rating:** set to appropriate level (Mature 17+ if substance references)
- [ ] **Contact info:** support email/website in dashboard
- [ ] **2FA enabled:** on Google account (Chrome requirement)
- [ ] **Developer account:** registered and paid ($5 Chrome, free Firefox)

### Code Quality

- [ ] **Test suite passes:** all tests green
- [ ] **No broken features:** all listed functionality works
- [ ] **No console errors:** no unhandled exceptions in normal flow
- [ ] **Error handling:** API failures handled gracefully, user notified
- [ ] **Rate limiting:** external API calls respect rate limits
- [ ] **TLS:** all external API calls use HTTPS
- [ ] **Single purpose documented:** in manifest.json description

### Firefox-Specific

- [ ] **Source code package:** prepared (zip of src/ with build instructions README)
- [ ] **Build instructions:** README with OS, Node version, commands, lockfile
- [ ] **gecko.id:** set in manifest.json `browser_specific_settings`
- [ ] **strict_min_version:** set (115.0+ for MV3)
- [ ] **No obfuscation:** verified
- [ ] **Build reproducible:** reviewer can build + diff match
- [ ] **Testing info:** provided for reviewer (what accounts needed, how to test)
- [ ] **background.scripts:** Firefox manifest format (not service_worker)
- [ ] **Privacy policy checkbox:** checked during submission if data transmitted
- [ ] **Self-distribution or listed:** choose correct option

### Chrome-Specific

- [ ] **Limited Use compliance statement:** on extension website or privacy page
- [ ] **Single purpose field:** filled in dashboard
- [ ] **Data collection certifications:** accurate in dashboard privacy fields
- [ ] **Promo images:** 440x280 small tile (optional but recommended)
- [ ] **2-Step Verification:** enabled and confirmed in dashboard
- [ ] **Distribution agreement:** accepted during account setup

### Submitting

#### Chrome Web Store
1. Go to https://chrome.google.com/webstore/developer/dashboard
2. Add new item
3. Upload .zip package
4. Fill in store listing: description, screenshots, promo images, category, language
5. Fill in privacy fields (data collection cert)
6. Complete content rating questionnaire
7. Set visibility and pricing
8. Submit for review

#### Firefox AMO
1. Go to https://addons.mozilla.org/developers/addons
2. Click Submit Your First Add-on
3. Choose "On this site" (listed) or "On your own" (self-distribution)
4. Upload .xpi package
5. If needed, upload source code package with build instructions
6. Fill in: name, summary, description, categories, support info, license, privacy policy
7. Add notes for reviewers (testing info, how to reproduce build)
8. Submit for review

---

## Pitfalls — from experience

- **Chrome review is mostly automated** but can reject for broad permissions, misleading descriptions, or broken functionality. The first rejection is usually fixable.
- **Firefox does full human review.** Expect 1-4 weeks. They will check source code thoroughly if you upload it. Make sure your build instructions work from scratch.
- **Privacy policy URL must be stable.** If you move/delete it, your extension gets removed. GitHub raw URLs on public repos work fine.
- **Chrome's "Limited Use" policy is strict.** If your extension makes API calls that could be considered "user data transmission," include the compliance statement on your website.
- **Firefox's implicit consent rule:** If your extension transmits citation data to a third-party API (CrossRef, etc.) when the user clicks "Fix citations," this qualifies for implicit consent (user-initiated, self-evident purpose). But you should still mention it in your privacy policy.
- **Both stores detest broad host permissions.** `https://*/*` or `http://*/*` will almost certainly be questioned. Use specific domains.
- **SVG icons in Chrome manifest** may not render correctly in all Chrome versions. Use PNG.
- **Manifest name changes require a new version upload.** If you change the extension's name in the manifest, the store listing name updates automatically, but the package name in the installed extension list changes only after users update.
- **Chrome requires "single purpose" in dashboard.** This is a text field where you explain what your extension does in one sentence. Be explicit.
- **Firefox reviewer notes are critical.** Include login credentials for any accounts needed, detailed build instructions, and an explanation of what each major code file does.
- **Minification is allowed by both stores.** But Firefox requires source if you minify. Use 1:1 source maps or provide clean source code. Our esbuild build with minification + tree shaking qualifies.

## Audit against WikiCitationExtension

### PASS (compliant)
- Single purpose: fixing Wikipedia citations
- Permissions: only `storage` + `https://en.wikipedia.org/*`
- No obfuscation (esbuild minification only)
- No remote code execution (all code in extension package)
- No eval() or dynamic code execution
- No ads, no monetization, no affiliate links
- No user data collection/storage/sharing
- All API calls use HTTPS (TLS)
- Gecko ID set
- MIT license
- i18n for English (default locale)

### NEEDS ATTENTION
- [ ] **Screenshots:** none exist yet — need at least 1 showing the panel on Wikipedia
- [ ] **Chrome promo tiles:** 440x280 recommended, 1400x560 optional
- [ ] **Content rating:** must be set in Chrome dashboard (likely "Everyone" — no mature content)
- [ ] **Privacy policy URL:** needs to be hosted somewhere stable — GitHub raw URL works
- [ ] **Limited Use compliance statement:** needs to be on PRIVACY.md or a website
- [ ] **Source code package for Firefox:** needs a `scripts/source-package.sh` or zip of src/ with build README
- [ ] **Category selection:** needs to be chosen in both dashboards (Productivity? Web Development? Search Tools?)
- [ ] **Chrome single purpose field:** needs to be written
- [ ] **2FA:** must be enabled on the publishing Google account


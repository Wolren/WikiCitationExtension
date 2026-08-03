# Firefox Add-ons (AMO) Submission Guide

## Info needed for submission

### Listing Details
- **Name:** WikiCitationExtension
- **Summary:** Fix Wikipedia citations: expand metadata from DOI/PMID/ISBN, normalize dates, clean up deprecated parameters, and enrich identifiers.
- **Description:** A browser extension that scans English Wikipedia articles for citations and passes them through a configurable pipeline: expand missing fields, fix CS1 errors, normalize dates, convert citation styles, add archive links, and more. All changes are reviewed in a diff panel before applying.
- **Categories:** Productivity, Web Development
- **License:** MIT
- **Privacy Policy:** Check "This add-on has a privacy policy" and provide URL: https://github.com/Wolren/WikiCitationExtension/blob/main/PRIVACY.md

### Notes for Reviewers
```
Testing: Open any English Wikipedia article (e.g. https://en.wikipedia.org/wiki/JavaScript).
Click the "Fix citations" button in the article toolbar. The panel shows all citations with proposed changes.
No login/account needed for core functionality.

Build instructions in BUILD.md (included in source code package).
Source code available at: https://github.com/Wolren/WikiCitationExtension

Build environment: Ubuntu 24.04 LTS, Node 22+, npm ci && npm run build.
esbuild + JSZip (both MIT, open source). No obfuscation.
```

## Submission Steps

1. Go to https://addons.mozilla.org/developers/addons
2. Click "Submit Your First Add-on"
3. Choose "On this site" (listed on AMO)
4. Upload `wikifix-extension.xpi`
5. When prompted, upload source code package (run `bash scripts/package-source.sh` first)
6. Fill in listing details from above
7. Set privacy policy checkbox
8. Add notes for reviewers
9. Submit

## Review Checklist

- [ ] .xpi file packaged and tested
- [ ] Source code zip prepared with BUILD.md
- [ ] Lockfile (package-lock.json) included
- [ ] gecko.id set in manifest.json (`wikifix@wolren.dev`)
- [ ] strict_min_version set (115.0)
- [ ] All permissions necessary and minimal
- [ ] Privacy policy URL live
- [ ] Testing instructions included
- [ ] Support contact info set

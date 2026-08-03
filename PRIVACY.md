# Privacy Policy for WikiCitationExtension

**Last updated: 20 July 2026**

## No data collection

WikiCitationExtension does **not** collect, store, transmit, or share any personal or browsing data. The extension operates entirely within your browser on English Wikipedia pages.

## What the extension accesses

### Wikipedia.org

The extension reads citation wikitext from English Wikipedia article pages and writes modifications back to the page editor when you choose to apply them. All changes are made through Wikipedia's own API using your existing Wikipedia session; the extension does not access your Wikipedia login credentials.

### External API requests

The extension makes read-only requests to public scholarly metadata APIs to enrich citation fields:

- CrossRef REST API (api.crossref.org)
- NCBI E-utilities (eutils.ncbi.nlm.nih.gov)
- Semantic Scholar API (api.semanticscholar.org)
- arXiv API (export.arxiv.org)
- OpenLibrary API (openlibrary.org)
- EuropePMC API (www.ebi.ac.uk/europepmc)
- OpenAlex API (api.openalex.org)
- Wayback Machine API (archive.org/wayback)

These requests are made **from your browser** on your behalf to look up metadata for DOIs, PMIDs, ISBNs, and other identifiers found in Wikipedia citations. The identifiers being looked up come from the Wikipedia page you are viewing; no personal identifiers are sent with these requests.

CrossRef requests may include an optional email address you provide in the extension settings for polite pool access. This email is sent only to CrossRef and is used solely for rate-limit prioritization.

### Local storage

The extension uses `chrome.storage.local` to store:

- Your module toggle preferences
- Any optional API keys you configure
- Panel position settings

This data never leaves your browser. You can clear it at any time through the browser's extension settings.

## Third-party sharing

None. The extension does not share any data with third parties.

## Compliance

### Chrome Web Store Limited Use

The use of information received from external APIs accessed through this extension will adhere to the Chrome Web Store User Data Policy, including the Limited Use requirements.

### Mozilla Privacy

Data transmission occurs only as a direct result of user action (clicking "Fix citations") and is limited to the citation identifiers on the Wikipedia page being viewed. This constitutes implicit consent under Mozilla's Add-on Policies for self-evident, single-use functionality.

## Changes to this policy

If this policy changes, the updated version will be published at this URL with a new date.

## Contact

For questions about this privacy policy, open an issue at:

https://github.com/Wolren/WikiCitationExtension/issues

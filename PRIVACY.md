# Qwant Results Filter Privacy Policy

Qwant Results Filter is a privacy-focused extension designed to filter search results by domain when using [qwant.com](https://qwant.com/).

**The short version: It does not collect, store, or transmit your personal data, search queries, or browsing history**.

## No Data Collection

This extension operates entirely locally within your browser. There are no analytics, no trackers, and no telemetry. Your search queries on Qwant stay strictly between you and Qwant.

## Where Your Data Lives

Your settings (manually blocked domains, whitelists, and UI preferences) are:

- Saved locally on your device using the `browser.storage.local` Firefox API.
- If you use a Mozilla/Firefox account with Sync enabled, your settings will seamlessly sync across your devices via Mozilla's servers using the `browser.storage.sync` API.

## Network Activity (Filter Lists)

If you decide to enable or add any community-curated filter lists, the extension's background worker will update them once every 24 hours.

- It makes standard outbound HTTPS requests to fetch the `.txt` lists you subscribe to (typically hosted on platforms like GitHub or Codeberg).
- These requests only download the blocklist rules. They **do not** transmit your personal data, browsing history, or search queries to those third-party servers.

## Third-Party Filters

The curated filter lists provided as presets are independently created and maintained by individual community members using the standard `uBlacklist` format. The extension simply reads the domain names from these text files to apply the filtering locally on your machine.

[![License: MIT](https://img.shields.io/badge/License-MIT-3d383b.svg)](LICENSE) [![Latest GitHub release](https://img.shields.io/github/v/release/ELowry/Qwant-Results-Filter?logo=GitHub&color=a4785e)](https://github.com/ELowry/Qwant-Results-Filter/releases/latest) [![Mozilla Add-on Users](https://img.shields.io/amo/users/qwant-results-filter?logo=firefox&color=e19085)](https://addons.mozilla.org/en-US/firefox/addon/qwant-results-filter/)

# [![Qwant Results Filter](logo.png)](#)

Declutter your Qwant search results to find what you're actually looking for.

Qwant Results Filter puts you back in control of your search results by removing the domains you don't want to see (fake news, AI-generated spam, or malicious sites) either by blocking them yourself, or by subscribing to community-curated filter lists.

## Features

- **Community Filter Lists**:  
  Easily subscribe to curated, community-maintained blocklists directly from the settings page.  
  Plus, the extension fully supports any standard `uBlacklist` filter lists.
- **One-Click Blocking**:  
  Hover over any Qwant search result to reveal a quick-action "Block" button, instantly removing that domain from your current and future searches.
- **In-Page Quick Settings**:  
  A clean, non-intrusive modal appears on Qwant pages to let you easily check and control what's happening with your search results.
- **Reveal Mode**:  
  Not sure if a filter is being too aggressive? Toggle "Show Filtered Results" to view blocked items as dimmed, transparent elements rather than hiding them entirely.
- **Custom Whitelists**:  
  Whitelist domains to ensure your favorite sites are never accidentally caught in a filter's crossfire.

> [!NOTE]  
> **Domain-Level Filtering for Maximum Performance**  
> To ensure your search results load instantly without scroll lag or CPU spikes, this extension operates strictly at the domain level. Complex, path-specific rules from community lists are ignored.

## Installation

_Coming Soon_

## Usage

1. **Quick Blocking**:  
   Perform any search on Qwant. Hover your mouse over a result you dislike, and click the **Block** button that appears in the corner.
2. **Page Insights**:  
   Click the counter button next to Qwant's native settings icon (top right) to open the Quick Settings modal and see exactly what was filtered on the current page.
3. **Manage Lists**:  
   Click the extension's icon in your browser toolbar to open the full Options page. Here, you can add recommended community filter lists or paste a link to your own.

> [!NOTE]  
> **List Updates**  
> Subscribed community filter lists are automatically fetched and cached locally by the extension's background worker, refreshing seamlessly in the background once every 24 hours.

## Privacy

This extension respects your privacy implicitly. It operates entirely locally within your browser and does not collect, store, or transmit any personal data or search queries.

For full details on how data and network requests are handled, please read the [Privacy Policy](PRIVACY.md).

## Building from Source

For developers who wish to build the extension from source, please refer to the dedicated [AMO README](AMO-README.md) file.

## License

This project is licensed under the [MIT License](LICENSE).

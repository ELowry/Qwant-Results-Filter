/**
 * Utility controller for URL parsing and manipulation.
 */
class UrlUtilsController {
	/**
	 * Initializes a new instance of the UrlUtilsController.
	 */
	constructor() {}

	/**
	 * Extracts the hostname from a full URL or raw domain string, stripping the 'www.' prefix automatically.
	 * @param {string} urlString The raw string to parse.
	 * @returns {string|null} The parsed hostname, or null if invalid.
	 */
	extractHostname(urlString) {
		if (!urlString) {
			return null;
		}

		let hostname = null;

		try {
			hostname = new URL(urlString).hostname;
		} catch (e) {
			try {
				hostname = new URL(`https://${urlString}`).hostname;
			} catch (e2) {
				return null;
			}
		}

		if (hostname) {
			return hostname.replace(/^www\./, '');
		}

		return null;
	}
}

export const UrlUtils = new UrlUtilsController();

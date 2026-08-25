/**
 * Utility controller for URL parsing and manipulation.
 */
class UrlUtilsController {
	/**
	 * Initializes a new instance of the UrlUtilsController.
	 */
	constructor() {}

	/**
	 * Extracts the hostname from a full URL or raw domain string.
	 * @param {string} urlString The raw string to parse.
	 * @returns {string|null} The parsed hostname, or null if invalid.
	 */
	extractHostname(urlString) {
		if (!urlString) {
			return null;
		}

		try {
			return new URL(urlString).hostname;
		} catch (e) {
			try {
				return new URL(`https://${urlString}`).hostname;
			} catch (e2) {
				return null;
			}
		}
	}
}

export const UrlUtils = new UrlUtilsController();

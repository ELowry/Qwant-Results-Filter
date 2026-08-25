/**
 * Utility controller for parsing filter lists.
 */
class ListParserController {
	/**
	 * Initializes a new instance of the ListParserController.
	 */
	constructor() {}

	/**
	 * Parses a uBlacklist formatted text file into raw hostnames.
	 * @param {string} text The raw text content of the list.
	 * @returns {Array<string>} An array of parsed hostnames.
	 */
	parseUBlacklist(text) {
		const domains = new Set();
		const lines = text.split('\n');

		for (let line of lines) {
			line = line.trim();

			if (!line || line.startsWith('#') || line.startsWith('!')) {
				continue;
			}

			line = line.replace(/^(?:0\.0\.0\.0|127\.0\.0\.1)\s+/, '');
			const domain = line.replace(/^\*:\/\/(?:\*\.)?/, '').replace(/\/\*$/, '');

			if (domain) {
				domains.add(domain);
			}
		}

		return Array.from(domains);
	}
}

export const ListParser = new ListParserController();

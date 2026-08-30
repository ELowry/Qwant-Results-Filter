import { Logger } from './logger.js';

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
	 * @returns {{blocked: Array<string>, whitelisted: Array<string>}} An object containing arrays of parsed hostnames.
	 */
	parseUBlacklist(text) {
		const blockedDomains = new Set();
		const whitelistedDomains = new Set();

		const cleanText = text.replace(/^---[\s\S]*?---\s*/, '');
		const lines = cleanText.split('\n');

		for (let line of lines) {
			line = line.trim();

			if (!line || line.startsWith('#') || line.startsWith('!') || line.startsWith('/')) {
				continue;
			}

			const isWhitelist = line.startsWith('@');

			if (isWhitelist) {
				line = line.substring(1).trim();
			}

			line = line.replace(/^(?:0\.0\.0\.0|127\.0\.0\.1)\s+/, '');
			let host = line.replace(/^(\*|https?):\/\/(?:\*\.)?/, '');
			host = host.split('/')[0];
			host = host.replace(/^\*\./, '');

			host = host.replace(/^www\./, '');

			if (host && host.includes('.') && !host.includes(' ')) {
				if (isWhitelist) {
					whitelistedDomains.add(host);
				} else {
					blockedDomains.add(host);
				}
			}
		}

		Logger.debug(
			`Parsed list: ${blockedDomains.size} blocked, ${whitelistedDomains.size} whitelisted domains.`
		);

		return {
			blocked: Array.from(blockedDomains),
			whitelisted: Array.from(whitelistedDomains),
		};
	}
}

export const ListParser = new ListParserController();

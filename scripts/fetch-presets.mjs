import { stat, writeFile } from 'fs/promises';
import { load } from 'js-yaml';
import { ListParser } from '../src/js/modules/utils/parser.js';

/**
 * Build script controller for fetching and transforming uBlacklist YAML into a static JSON module.
 */
class PresetFetcher {
	#outFile;
	#yamlUrl;
	#cacheTtl;

	/**
	 * Initializes a new instance of the PresetFetcher.
	 */
	constructor() {
		this.#outFile = './src/js/modules/presets.js';
		this.#yamlUrl =
			'https://raw.githubusercontent.com/ublacklist/ublacklist.github.io/refs/heads/main/community/rulesets.yml';
		this.#cacheTtl = 24 * 60 * 60 * 1000;
	}

	/**
	 * Executes the fetch and build process.
	 * @returns {Promise<void>} Resolves when the presets file is generated or skipped.
	 */
	async run() {
		try {
			const isFresh = await this.#checkCache();

			if (isFresh) {
				console.log('[Qwant Filter] Presets are fresh (under 24h old). Skipping download.');
				process.exit(0);
			}

			console.log('[Qwant Filter] Fetching latest rulesets from uBlacklist...');

			const response = await fetch(this.#yamlUrl);

			if (!response.ok) {
				throw new Error(`HTTP error! status: ${response.status}`);
			}

			const text = await response.text();
			const data = load(text);
			const groups = await this.#transformData(data);

			const fileContent = `/**\n * Auto-generated presets list. Do not edit manually.\n * Fetched from: ${this.#yamlUrl}\n */\n\nexport const RECOMMENDED_LISTS = ${JSON.stringify(groups, null, '\t')};\n`;

			await writeFile(this.#outFile, fileContent);
			console.log('[Qwant Filter] Successfully generated src/js/modules/presets.js');
		} catch (error) {
			console.error('[Qwant Filter] Failed to update presets:', error);
			process.exit(1);
		}
	}

	/**
	 * Checks if the output file exists and is newer than the cache TTL.
	 * @private
	 * @returns {Promise<boolean>} True if the cache is fresh and the fetch should be skipped.
	 */
	async #checkCache() {
		try {
			const stats = await stat(this.#outFile);
			return Date.now() - stats.mtimeMs < this.#cacheTtl;
		} catch (e) {
			return false;
		}
	}

	/**
	 * Determines if a list entry should be manually excluded from preset generation.
	 * @param {string} fullName The formatted full name of the preset list.
	 * @param {string} subscriptionUrl The remote URL for the list.
	 * @private
	 * @returns {boolean} True if the item should be excluded.
	 */
	#isExcluded(fullName, subscriptionUrl) {
		if (fullName === 'RubenKelevra: Leftwing Media blacklist') {
			return true;
		}

		if (subscriptionUrl.includes('pgl.yoyo.org') || fullName.includes('Peter Lowe')) {
			return true;
		}

		return false;
	}

	/**
	 * Validates that a subscription URL can be fetched and contains valid filter rules.
	 * @param {string} url The subscription URL to validate.
	 * @private
	 * @returns {Promise<boolean>} True if the list is fetchable and yields valid domains.
	 */
	async #validateAndParseList(url) {
		try {
			const response = await fetch(url, { signal: AbortSignal.timeout(10000) });

			if (!response.ok) {
				return false;
			}

			const text = await response.text();
			const domains = ListParser.parseUBlacklist(text);

			return domains.length > 0;
		} catch (error) {
			return false;
		}
	}

	/**
	 * Transforms the parsed YAML object into the grouped structure required by the UI.
	 * Validates all candidates concurrently using Promise.all.
	 * @param {object} data The raw parsed YAML data.
	 * @private
	 * @returns {Promise<object>} The categorized lists.
	 */
	async #transformData(data) {
		const candidates = [];

		for (const [category, items] of Object.entries(data)) {
			const formattedCategory = category
				.replace(/-/g, ' ')
				.replace(/\b\w/g, (char) => char.toUpperCase());

			for (const item of items) {
				let authorName = '';

				if (item.author) {
					authorName = typeof item.author === 'string' ? item.author : item.author.name;
				}

				const prefix = authorName ? `${authorName}: ` : '';

				if (item.subscription) {
					const fullName = `${prefix}${item.name}`;

					if (!this.#isExcluded(fullName, item.subscription)) {
						candidates.push({
							category: formattedCategory,
							name: fullName,
							url: item.subscription,
							homepage: item.homepage || '',
							description: item.description || '',
						});
					}
				}

				if (item.subitems) {
					for (const sub of item.subitems) {
						if (sub.subscription) {
							const fullName = `${prefix}${sub.name}`;

							if (!this.#isExcluded(fullName, sub.subscription)) {
								candidates.push({
									category: formattedCategory,
									name: fullName,
									url: sub.subscription,
									homepage: item.homepage || '',
									description: sub.description || item.description || '',
								});
							}
						}
					}
				}
			}
		}

		const validationResults = await Promise.all(
			candidates.map(async (candidate) => {
				const isValid = await this.#validateAndParseList(candidate.url);

				if (!isValid) {
					console.warn(
						`[Qwant Filter] Skipping invalid or unreachable list: ${candidate.name} (${candidate.url})`
					);
				}

				return isValid ? candidate : null;
			})
		);

		const groups = {};

		for (const item of validationResults) {
			if (!item) {
				continue;
			}

			if (!groups[item.category]) {
				groups[item.category] = [];
			}

			groups[item.category].push({
				name: item.name,
				url: item.url,
				homepage: item.homepage,
				description: item.description,
			});
		}

		return groups;
	}
}

const fetcher = new PresetFetcher();
fetcher.run();

import { FilterTrie } from './modules/filterTrie.js';
import { Logger } from './modules/utils/logger.js';
import { ListParser } from './modules/utils/parser.js';
import { StorageUtils } from './modules/utils/storage.js';

/**
 * Background controller for managing the unified Filter Trie and responding to tab queries.
 */
class BackgroundController {
	#userBlockedDomains;
	#userWhitelistedDomains;
	#cachedListDomains;
	#cachedListWhitelistedDomains;
	#initPromise;

	/**
	 * Initializes a new instance of the BackgroundController.
	 */
	constructor() {
		this.#userBlockedDomains = [];
		this.#userWhitelistedDomains = [];
		this.#cachedListDomains = {};
		this.#cachedListWhitelistedDomains = new Set();

		this.#initPromise = this.#initializeState();

		this.#setupMessageListener();
		this.#setupStorageListener();
		this.#setupActionListener();
	}

	/**
	 * Loads storage data asynchronously and triggers the initial Trie compilation.
	 * @private
	 * @returns {Promise<void>} Resolves when storage is loaded and the Trie is built.
	 */
	async #initializeState() {
		this.#userBlockedDomains = await StorageUtils.loadList('blockedDomains');
		this.#userWhitelistedDomains = await StorageUtils.loadList('whitelistedDomains');
		const localData = await browser.storage.local.get({ filterListCache: {} });

		this.#cachedListDomains = localData.filterListCache || {};

		await this.#setupAlarms();

		this.#rebuildTrie();
	}

	/**
	 * Compiles user and cached domains into the unified FilterTrie.
	 * @private
	 * @returns {void} Returns nothing.
	 */
	#rebuildTrie() {
		Logger.debug('Rebuilding Filter Trie...');
		FilterTrie.clear();
		this.#cachedListWhitelistedDomains.clear();

		Logger.debug(`Adding ${this.#userBlockedDomains.length} manual blocks.`);
		for (const domain of this.#userBlockedDomains) {
			FilterTrie.add(domain, 'manual');
		}

		let needsRefresh = false;

		for (const [listUrl, listData] of Object.entries(this.#cachedListDomains)) {
			if (listData && typeof listData === 'object' && !Array.isArray(listData)) {
				const blocked = listData.blocked || [];
				const whitelisted = listData.whitelisted || [];

				Logger.debug(
					`Adding list [${listUrl}] - Blocked: ${blocked.length}, Whitelisted: ${whitelisted.length}`
				);

				for (const domain of blocked) {
					FilterTrie.add(domain, listUrl);
				}
				for (const domain of whitelisted) {
					this.#cachedListWhitelistedDomains.add(domain);
				}
			} else {
				Logger.warn(`Invalid or legacy cache detected for ${listUrl}. Dropping it.`);
				needsRefresh = true;
			}
		}

		if (needsRefresh) {
			Logger.info('Triggering list refresh due to invalid caches...');
			this.#refreshFilterLists().catch((err) =>
				Logger.error('List auto-refresh failed:', err)
			);
		}

		Logger.info('Filter Trie rebuilt successfully.');
	}

	/**
	 * Sets up the listener for incoming runtime messages.
	 * @private
	 * @returns {void} Returns nothing.
	 */
	#setupMessageListener() {
		browser.runtime.onMessage.addListener((message, _sender, _sendResponse) => {
			if (message.action === 'checkDomains') {
				Logger.debug(`Handling check for ${message.domains.length} domains...`);
				return this.#handleCheckDomains(message.domains);
			}

			if (message.action === 'openOptionsPage') {
				browser.runtime.openOptionsPage().catch((err) => Logger.error(err));
			}
		});
	}

	/**
	 * Sets up the listener for storage changes to rebuild the Trie dynamically.
	 * @private
	 * @returns {void} Returns nothing.
	 */
	#setupStorageListener() {
		browser.storage.onChanged.addListener(async (changes, areaName) => {
			let needsRebuild = false;

			if (areaName === 'sync') {
				if (changes.blockedDomains_chunks) {
					await StorageUtils.pullFromSync('blockedDomains');
				}

				if (changes.whitelistedDomains_chunks) {
					await StorageUtils.pullFromSync('whitelistedDomains');
				}
			}

			if (areaName === 'local') {
				if (changes.blockedDomains) {
					this.#userBlockedDomains = changes.blockedDomains.newValue || [];
					needsRebuild = true;
				}

				if (changes.whitelistedDomains) {
					this.#userWhitelistedDomains = changes.whitelistedDomains.newValue || [];
				}

				if (changes.filterListCache) {
					this.#cachedListDomains = changes.filterListCache.newValue || {};
					needsRebuild = true;
				}
			}

			if (needsRebuild) {
				this.#rebuildTrie();
			}
		});
	}

	/**
	 * Sets up the listener for when the user clicks the extension's toolbar icon.
	 * @private
	 * @returns {void} Returns nothing.
	 */
	#setupActionListener() {
		browser.action.onClicked.addListener(() => {
			browser.runtime.openOptionsPage().catch(console.error);
		});
	}

	/**
	 * Processes a batch of domains against the Trie, awaiting initialization if necessary.
	 * @param {Array<string>} domains The hostnames to verify.
	 * @private
	 * @returns {Promise<object>} An object mapping hostnames to their block sources (or null).
	 */
	async #handleCheckDomains(domains) {
		await this.#initPromise;

		const results = {};

		for (const domain of domains) {
			if (this.#isWhitelisted(domain)) {
				results[domain] = null;
			} else {
				results[domain] = FilterTrie.check(domain);
			}
		}

		return results;
	}

	/**
	 * Checks whether a given domain or any of its parent domains are whitelisted.
	 * @param {string} domain The hostname to check.
	 * @private
	 * @returns {boolean} True if the domain or a parent domain is whitelisted.
	 */
	#isWhitelisted(domain) {
		const parts = domain.split('.');

		for (let i = 0; i < parts.length; i++) {
			const parentDomain = parts.slice(i).join('.');

			if (
				this.#userWhitelistedDomains.includes(parentDomain)
				|| this.#cachedListWhitelistedDomains.has(parentDomain)
			) {
				Logger.debug(
					`Domain permitted by whitelist: ${domain} (matched parent: ${parentDomain})`
				);
				return true;
			}
		}

		return false;
	}

	/**
	 * Initializes the background alarm for periodic list updates.
	 * @private
	 * @returns {void} Returns nothing.
	 */
	async #setupAlarms() {
		const existingAlarm = await browser.alarms.get('update-filter-lists');
		if (!existingAlarm) {
			browser.alarms.create('update-filter-lists', { periodInMinutes: 1440 });
		}

		browser.alarms.onAlarm.addListener((alarm) => {
			if (alarm.name === 'update-filter-lists') {
				this.#refreshFilterLists();
			}
		});
	}

	/**
	 * Fetches and updates all active external filter lists.
	 * @private
	 * @returns {Promise<void>} Resolves when all lists are updated and saved.
	 */
	async #refreshFilterLists() {
		Logger.info('Starting scheduled background refresh of filter lists...');
		const syncData = await browser.storage.sync.get({ filterLists: [] });
		const localData = await browser.storage.local.get({ filterListCache: {} });
		let cacheUpdated = false;

		for (const list of syncData.filterLists) {
			try {
				Logger.debug(`Fetching update for: ${list.url}`);
				const response = await fetch(list.url);

				if (!response.ok) {
					Logger.warn(
						`Background update failed for ${list.url}: HTTP ${response.status}`
					);
					continue;
				}

				const text = await response.text();
				const domains = ListParser.parseUBlacklist(text);

				if (domains.blocked.length > 0 || domains.whitelisted.length > 0) {
					localData.filterListCache[list.url] = domains;
					cacheUpdated = true;
					Logger.debug(
						`Successfully updated cache for ${list.url} (${domains.blocked.length} blocked)`
					);
				} else {
					Logger.warn(
						`Fetched list ${list.url} but parsed 0 domains. Cache not updated.`
					);
				}
			} catch (error) {
				Logger.error(`Background update error for ${list.url}:`, error);
			}
		}

		if (cacheUpdated) {
			await browser.storage.local.set({
				filterListCache: localData.filterListCache,
			});
			Logger.info('Background refresh complete. Storage updated.');
		} else {
			Logger.info('Background refresh complete. No cache changes needed.');
		}
	}
}

export const Background = new BackgroundController();

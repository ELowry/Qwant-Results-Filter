import { FilterTrie } from './modules/filterTrie.js';
import { ListParser } from './modules/utils/parser.js';
import { StorageUtils } from './modules/utils/storage.js';

/**
 * Background controller for managing the unified Filter Trie and responding to tab queries.
 */
class BackgroundController {
	#userBlockedDomains;
	#userWhitelistedDomains;
	#cachedListDomains;
	#initPromise;

	/**
	 * Initializes a new instance of the BackgroundController.
	 */
	constructor() {
		this.#userBlockedDomains = [];
		this.#userWhitelistedDomains = [];
		this.#cachedListDomains = {};

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
		FilterTrie.clear();

		for (const domain of this.#userBlockedDomains) {
			FilterTrie.add(domain, 'manual');
		}

		for (const [listUrl, listDomains] of Object.entries(this.#cachedListDomains)) {
			if (Array.isArray(listDomains)) {
				for (const domain of listDomains) {
					FilterTrie.add(domain, listUrl);
				}
			}
		}
	}

	/**
	 * Sets up the listener for incoming runtime messages.
	 * @private
	 * @returns {void} Returns nothing.
	 */
	#setupMessageListener() {
		browser.runtime.onMessage.addListener((message, _sender, _sendResponse) => {
			if (message.action === 'checkDomains') {
				return this.#handleCheckDomains(message.domains);
			}

			if (message.action === 'openOptionsPage') {
				browser.runtime.openOptionsPage().catch(console.error);
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

			if (this.#userWhitelistedDomains.includes(parentDomain)) {
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
		const syncData = await browser.storage.sync.get({ filterLists: [] });
		const localData = await browser.storage.local.get({ filterListCache: {} });
		let cacheUpdated = false;

		for (const list of syncData.filterLists) {
			try {
				const response = await fetch(list.url);

				if (!response.ok) {
					continue;
				}

				const text = await response.text();
				const domains = ListParser.parseUBlacklist(text);

				if (domains.length > 0) {
					localData.filterListCache[list.url] = domains;
					cacheUpdated = true;
				}
			} catch (error) {
				console.warn(`[Qwant Filter] Background update failed for ${list.url}`);
			}
		}

		if (cacheUpdated) {
			await browser.storage.local.set({
				filterListCache: localData.filterListCache,
			});
		}
	}
}

export const Background = new BackgroundController();

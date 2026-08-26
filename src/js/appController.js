import { InjectedUI } from './modules/injectedUI.js';
import { RECOMMENDED_LISTS } from './modules/presets.js';
import { UrlUtils } from './modules/utils/url.js';
import { StorageUtils } from './modules/utils/storage.js';

/**
 * Controller for managing Qwant search result filtering and communicating with the background worker.
 */
class AppController {
	#domainStatusCache;
	#activeBlockedDetails;
	#isRevealMode;
	#observer;
	#debounceTimer;
	#lastHiddenCount;
	#lastTotalCount;

	/**
	 * Initializes a new instance of the AppController.
	 */
	constructor() {
		this.#domainStatusCache = new Map();
		this.#activeBlockedDetails = [];
		this.#isRevealMode = false;
		this.#observer = null;
		this.#debounceTimer = null;
		this.#lastHiddenCount = 0;
		this.#lastTotalCount = 0;

		this.#loadSessionCache();
	}

	/**
	 * @constant
	 * @returns {number} The delay in milliseconds to debounce DOM mutation processing.
	 */
	static get DEBOUNCE_MS() {
		return 50;
	}

	/**
	 * Initializes the controller, loads storage, sets up UI, and begins observing DOM changes.
	 * @returns {Promise<void>} Resolves when initialization is complete.
	 */
	async init() {
		const syncData = await browser.storage.sync.get({ revealMode: false });
		await this.#handleRevealToggle(syncData.revealMode, false);

		await InjectedUI.init({
			onConfirm: (action, domain) => {
				this.#handleConfirmAction(action, domain);
			},
			onRevealToggle: (isRevealMode) => {
				this.#handleRevealToggle(isRevealMode, true);
			},
			onOpenOptions: () => {
				browser.runtime.sendMessage({ action: 'openOptionsPage' }).catch(console.error);
			},
		});

		browser.storage.onChanged.addListener((changes, areaName) => {
			if (areaName === 'sync' && changes.revealMode) {
				this.#handleRevealToggle(changes.revealMode.newValue, false);
			}

			if (
				(areaName === 'local' && (changes.blockedDomains || changes.whitelistedDomains))
				|| (areaName === 'local' && changes.filterListCache)
			) {
				this.#domainStatusCache.clear();
				this.#processDOM(true);
			}
		});

		this.#setupCleanupHook();
		this.#setupTargetedObserver();
		this.#processDOM(false);

		window.addEventListener('pageshow', async (event) => {
			if (event.persisted) {
				await InjectedUI.init({
					onConfirm: (action, domain) => {
						this.#handleConfirmAction(action, domain);
					},
					onRevealToggle: (isRevealMode) => {
						this.#handleRevealToggle(isRevealMode, true);
					},
					onOpenOptions: () => {
						browser.runtime
							.sendMessage({ action: 'openOptionsPage' })
							.catch(console.error);
					},
				});

				document.body.classList.toggle('qf-reveal-mode', this.#isRevealMode);
				this.#setupCleanupHook();
				this.#setupTargetedObserver();
				this.#processDOM(true);
			}
		});
	}

	/**
	 * Loads previously resolved domains from sessionStorage synchronously.
	 * @private
	 * @returns {void} Returns nothing.
	 */
	#loadSessionCache() {
		try {
			const cachedData = sessionStorage.getItem('qf_domain_cache');

			if (cachedData) {
				const parsed = JSON.parse(cachedData);

				for (const [domain, sources] of Object.entries(parsed)) {
					this.#domainStatusCache.set(domain, sources);
				}
			}
		} catch (error) {
			console.warn('[Qwant Filter] Failed to parse sessionStorage cache', error);
		}
	}

	/**
	 * Saves the current domain cache to sessionStorage.
	 * @private
	 * @returns {void} Returns nothing.
	 */
	#saveSessionCache() {
		try {
			const cacheObject = Object.fromEntries(this.#domainStatusCache);
			sessionStorage.setItem('qf_domain_cache', JSON.stringify(cacheObject));
		} catch (error) {
			console.warn('[Qwant Filter] Failed to save to sessionStorage', error);
		}
	}

	/**
	 * Sets up a targeted MutationObserver strictly on the main content area to reduce overhead.
	 * @private
	 * @returns {void} Returns nothing.
	 */
	#setupTargetedObserver() {
		const applyObserver = (targetElement) => {
			this.#observer = new MutationObserver(() => {
				if (this.#debounceTimer) {
					clearTimeout(this.#debounceTimer);
				}

				this.#debounceTimer = setTimeout(() => {
					this.#processDOM(false);
				}, AppController.DEBOUNCE_MS);
			});

			this.#observer.observe(targetElement, {
				childList: true,
				subtree: true,
			});
		};

		const existingMainContent = document.getElementById('main-content');

		if (existingMainContent) {
			applyObserver(existingMainContent);
			return;
		}

		const bodyObserver = new MutationObserver((_mutations, obs) => {
			const delayedMainContent = document.getElementById('main-content');

			if (delayedMainContent) {
				obs.disconnect();
				applyObserver(delayedMainContent);
			}
		});

		bodyObserver.observe(document.body, {
			childList: true,
			subtree: true,
		});
	}

	/**
	 * Resolves a list of filter list URLs to their human-readable preset names.
	 * @param {Array<string>} sourceIds The subscription list URLs to map.
	 * @private
	 * @returns {Array<string>} The mapped display names.
	 */
	#mapSourceNames(sourceIds) {
		return sourceIds
			.filter((id) => id !== 'manual')
			.map((url) => {
				if (RECOMMENDED_LISTS) {
					for (const items of Object.values(RECOMMENDED_LISTS)) {
						for (const item of items) {
							if (item.url === url) {
								return item.name;
							}
						}
					}
				}

				return url;
			});
	}

	/**
	 * Processes the DOM, queries the background worker for unknown domains, and updates the UI.
	 * @param {boolean} forceRecheck If true, ignores dataset caches to re-evaluate all elements.
	 * @private
	 * @returns {Promise<void>} Resolves when the DOM has been updated.
	 */
	async #processDOM(forceRecheck) {
		const parsedData = this.#queryAndParseElements(forceRecheck);

		if (parsedData.isEmpty) {
			return;
		}

		const resolveSuccess = await this.#resolveHostnames(parsedData.hostnamesToCheck);

		if (!resolveSuccess) {
			return;
		}

		this.#applyUpdates(parsedData.validElements);
	}

	/**
	 * Queries the DOM for search results and parses out unverified hostnames.
	 * @param {boolean} forceRecheck If true, ignores dataset caches to re-evaluate all elements.
	 * @private
	 * @returns {object} An object containing valid elements, hostnames to check, and an emptiness flag.
	 */
	#queryAndParseElements(forceRecheck) {
		const targetSelectors = [
			'[domain]',
			'a.external',
			'a[data-testid="imageResult"]',
			'[data-testid="videosList"] > a',
			'a[data-testid="newsCardSerp"]',
		];

		const baseQuery = targetSelectors.join(', ');
		const allRawResults = document.querySelectorAll(baseQuery);

		if (allRawResults.length === 0) {
			this.#lastHiddenCount = 0;
			this.#lastTotalCount = 0;
			this.#activeBlockedDetails = [];
		}

		InjectedUI.updateCounterButton(this.#lastHiddenCount, this.#lastTotalCount, () => {
			InjectedUI.openQuickSettingsModal(this.#activeBlockedDetails, this.#isRevealMode);
		});

		const newItemsQuery = targetSelectors
			.map((selector) => `${selector}:not([data-qf-processed="true"])`)
			.join(', ');

		const query = forceRecheck ? baseQuery : newItemsQuery;
		const newResults = document.querySelectorAll(query);

		if (newResults.length === 0 && !forceRecheck) {
			return { validElements: [], hostnamesToCheck: new Set(), isEmpty: true };
		}

		const hostnamesToCheck = new Set();
		const validElements = [];

		for (const result of allRawResults) {
			if (result.dataset.qfSkip === 'true') {
				continue;
			}

			if (result.matches('a.external') && result.closest('[domain]')) {
				result.dataset.qfProcessed = 'true';
				result.dataset.qfSkip = 'true';
				continue;
			}

			validElements.push(result);

			let hostname = result.dataset.qfHostname;

			if (!hostname) {
				let rawUrl = result.getAttribute('domain');

				if (!rawUrl && result.matches('a[data-testid="newsCardSerp"]')) {
					rawUrl = result.href;
				}

				if (!rawUrl) {
					const favicon = result.querySelector('[data-testid$="-favicon"]');

					if (
						favicon
						&& favicon.parentElement
						&& favicon.parentElement.nextElementSibling
					) {
						rawUrl = favicon.parentElement.nextElementSibling.textContent.trim();
					}
				}

				if (!rawUrl) {
					rawUrl = result.href;
				}

				hostname = UrlUtils.extractHostname(rawUrl);

				if (!hostname || hostname === 'www.qwant.com' || hostname === 'qwant.com') {
					result.dataset.qfProcessed = 'true';
					result.dataset.qfSkip = 'true';
					continue;
				}

				result.dataset.qfHostname = hostname;
			}

			if (!this.#domainStatusCache.has(hostname)) {
				hostnamesToCheck.add(hostname);
			}
		}

		return { validElements, hostnamesToCheck, isEmpty: false };
	}

	/**
	 * Queries the background worker for cache status of unknown domains.
	 * @param {Set<string>} hostnamesToCheck The set of hostnames to verify.
	 * @private
	 * @returns {Promise<boolean>} True if the resolution was successful or skipped, false on error.
	 */
	async #resolveHostnames(hostnamesToCheck) {
		if (hostnamesToCheck.size === 0) {
			return true;
		}

		try {
			const batchResults = await browser.runtime.sendMessage({
				action: 'checkDomains',
				domains: Array.from(hostnamesToCheck),
			});

			for (const [domain, sources] of Object.entries(batchResults)) {
				this.#domainStatusCache.set(domain, sources);
			}

			this.#saveSessionCache();

			return true;
		} catch (error) {
			console.error('[Qwant Filter] Failed to query background script:', error);
			return false;
		}
	}

	/**
	 * Applies visual updates and DOM state changes to valid elements based on filter list data.
	 * @param {Array<Element>} validElements The verified search result elements.
	 * @private
	 * @returns {void} Returns nothing.
	 */
	#applyUpdates(validElements) {
		const activeBlockedDetailsMap = new Map();
		let hiddenCount = 0;

		for (const result of validElements) {
			const hostname = result.dataset.qfHostname;

			if (!hostname) {
				continue;
			}

			result.dataset.qfProcessed = 'true';
			const matchedSources = this.#domainStatusCache.get(hostname);

			if (matchedSources) {
				result.classList.add('qf-hidden-result');

				if (!activeBlockedDetailsMap.has(hostname)) {
					activeBlockedDetailsMap.set(hostname, {
						domain: hostname,
						isManual: matchedSources.includes('manual'),
						lists: this.#mapSourceNames(matchedSources),
						count: 1,
					});
				} else {
					activeBlockedDetailsMap.get(hostname).count++;
				}

				hiddenCount++;
			} else {
				result.classList.remove('qf-hidden-result');
			}

			InjectedUI.updateActionButton(result, hostname, !!matchedSources);
		}

		this.#activeBlockedDetails = Array.from(activeBlockedDetailsMap.values());
		this.#lastHiddenCount = hiddenCount;
		this.#lastTotalCount = validElements.length;

		InjectedUI.updateCounterButton(this.#lastHiddenCount, this.#lastTotalCount, () => {
			InjectedUI.openQuickSettingsModal(this.#activeBlockedDetails, this.#isRevealMode);
		});

		if (InjectedUI.isQuickSettingsOpen) {
			InjectedUI.updateQuickSettingsModal(this.#activeBlockedDetails, this.#isRevealMode);
		}
	}

	/**
	 * Handles confirmed domain block or unblock requests from the UI.
	 * @param {string} action The action to execute ('block' or 'unblock').
	 * @param {string} domain The target hostname.
	 * @private
	 * @returns {Promise<void>} Resolves when state and storage are updated.
	 */
	async #handleConfirmAction(action, domain) {
		let userBlockedDomains = await StorageUtils.loadList('blockedDomains');
		let userWhitelistedDomains = await StorageUtils.loadList('whitelistedDomains');

		if (action === 'block') {
			if (!userBlockedDomains.includes(domain)) {
				userBlockedDomains.push(domain);
			}
			userWhitelistedDomains = userWhitelistedDomains.filter((d) => d !== domain);
		} else if (action === 'unblock') {
			userBlockedDomains = userBlockedDomains.filter((d) => d !== domain);
			if (!userWhitelistedDomains.includes(domain)) {
				userWhitelistedDomains.push(domain);
			}
		}

		await StorageUtils.saveList('blockedDomains', userBlockedDomains);
		await StorageUtils.saveList('whitelistedDomains', userWhitelistedDomains);
	}

	/**
	 * Handles reveal mode status changes from the UI or external storage syncs.
	 * @param {boolean} isRevealMode The active reveal state.
	 * @param {boolean} [save=true] Whether to push the update to persistent storage.
	 * @private
	 * @returns {Promise<void>} Resolves when local state and optional storage are updated.
	 */
	async #handleRevealToggle(isRevealMode, save = true) {
		this.#isRevealMode = isRevealMode;
		document.body.classList.toggle('qf-reveal-mode', this.#isRevealMode);

		const toggleSwitch = document.getElementById('qf-toggle-reveal-switch');

		if (toggleSwitch) {
			toggleSwitch.checked = this.#isRevealMode;
		}

		if (save) {
			await browser.storage.sync.set({ revealMode: this.#isRevealMode });
		}
	}

	/**
	 * Cleans up all DOM injections and observers when the extension is unloaded.
	 * @private
	 * @returns {void} Returns nothing.
	 */
	#cleanup() {
		if (this.#observer) {
			this.#observer.disconnect();
		}

		if (this.#debounceTimer) {
			clearTimeout(this.#debounceTimer);
		}

		document.body.classList.remove('qf-reveal-mode');

		const injectedNodes = document.querySelectorAll(
			'#qf-counter-button, #qf-confirm-modal, #qf-quick-settings-modal, .qf-block-button'
		);

		for (const node of injectedNodes) {
			node.remove();
		}

		const processedResults = document.querySelectorAll('[data-qf-processed="true"]');

		for (const result of processedResults) {
			result.classList.remove('qf-hidden-result');
			delete result.dataset.qfProcessed;
			delete result.dataset.qfHostname;
			delete result.dataset.qfSkip;
		}
	}

	/**
	 * Establishes a long-lived connection to detect extension unloads or updates.
	 * @private
	 * @returns {void} Returns nothing.
	 */
	#setupCleanupHook() {
		const port = browser.runtime.connect({ name: 'qf-cleanup-port' });

		port.onDisconnect.addListener(() => {
			this.#cleanup();
		});
	}
}

export const App = new AppController();

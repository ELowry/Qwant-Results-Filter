import { RECOMMENDED_LISTS } from './modules/presets.js';
import { ListParser } from './modules/utils/parser.js';
import { UrlUtils } from './modules/utils/url.js';
import { I18n } from './modules/i18n.js';

/**
 * Controller for the options page interface.
 */
class OptionsController {
	#domainListElement;
	#filterListElement;
	#revealSwitch;
	#urlInput;
	#addListButton;
	#presetsContainer;
	#togglePresetsButton;
	#togglePresetsLabel;
	#toastElement;
	#toastTimer;
	#whitelistListElement;
	#whitelistContainerElement;
	#addBlockForm;
	#blockInput;
	#addWhitelistForm;
	#whitelistInput;
	#activePresetCount;
	#exportButton;
	#importButton;
	#importFile;

	/**
	 * Initializes a new instance of the OptionsController.
	 */
	constructor() {
		this.#domainListElement = document.getElementById('options-domain-list');
		this.#filterListElement = document.getElementById('options-filter-lists');
		this.#revealSwitch = document.getElementById('options-reveal-switch');
		this.#urlInput = document.getElementById('qf-list-input');
		this.#addListButton = document.getElementById('qf-add-list-button');
		this.#presetsContainer = document.getElementById('qf-presets-container');
		this.#togglePresetsButton = document.getElementById('qf-toggle-presets-button');
		this.#togglePresetsLabel = document.getElementById('qf-toggle-presets-label');
		this.#toastElement = document.getElementById('qf-toast');
		this.#toastTimer = null;
		this.#whitelistListElement = document.getElementById('options-whitelist-list');
		this.#whitelistContainerElement = document.getElementById('options-whitelist-container');
		this.#addBlockForm = document.getElementById('qf-add-block-form');
		this.#blockInput = document.getElementById('qf-block-input');
		this.#addWhitelistForm = document.getElementById('qf-add-whitelist-form');
		this.#whitelistInput = document.getElementById('qf-whitelist-input');
		this.#exportButton = document.getElementById('qf-export-button');
		this.#importButton = document.getElementById('qf-import-button');
		this.#importFile = document.getElementById('qf-import-file');
		this.#activePresetCount = 0;
	}

	/**
	 * Fetches data and initializes the view and listeners.
	 * @returns {Promise<void>} Resolves when initialization is complete.
	 */
	async init() {
		I18n.translateDom(document);

		this.#setupEventListeners();
		this.#setupStorageListeners();

		const syncData = await browser.storage.sync.get({
			blockedDomains: [],
			whitelistedDomains: [],
			revealMode: false,
			filterLists: [],
		});

		this.#revealSwitch.checked = syncData.revealMode;
		this.#renderDomainList(
			syncData.blockedDomains,
			this.#domainListElement,
			I18n.getMessage('optionsNoDomainsBlocked'),
			'blockedDomains'
		);
		this.#renderDomainList(
			syncData.whitelistedDomains,
			this.#whitelistListElement,
			I18n.getMessage('optionsNoDomainsWhitelisted'),
			'whitelistedDomains'
		);
		await this.#renderFilterLists(syncData.filterLists);
		this.#renderPresetsContainer(syncData.filterLists);
		this.#updateWhitelistVisibility(syncData.blockedDomains, syncData.filterLists);
	}

	/**
	 * Binds core DOM event listeners for the options page.
	 * @private
	 * @returns {void} Returns nothing.
	 */
	#setupEventListeners() {
		this.#setupInputFormatters();

		this.#revealSwitch.addEventListener('change', async (event) => {
			await browser.storage.sync.set({ revealMode: event.target.checked });
		});

		this.#togglePresetsButton.addEventListener('click', () => {
			const isHidden = this.#presetsContainer.hasAttribute('hidden');

			if (isHidden) {
				this.#presetsContainer.removeAttribute('hidden');
				this.#togglePresetsButton.setAttribute('aria-expanded', 'true');
			} else {
				this.#presetsContainer.setAttribute('hidden', '');
				this.#togglePresetsButton.setAttribute('aria-expanded', 'false');
			}

			this.#updatePresetsButtonLabel();
		});

		this.#addListButton.addEventListener('click', () => {
			this.#handleAddListSubmit();
		});

		this.#addBlockForm.addEventListener('submit', (event) => {
			event.preventDefault();
			this.#handleManualDomainSubmit(this.#blockInput, 'blockedDomains');
		});

		this.#addWhitelistForm.addEventListener('submit', (event) => {
			event.preventDefault();
			this.#handleManualDomainSubmit(this.#whitelistInput, 'whitelistedDomains');
		});

		this.#exportButton.addEventListener('click', () => {
			this.#handleExport();
		});

		this.#importButton.addEventListener('click', () => {
			this.#importFile.click();
		});

		this.#importFile.addEventListener('change', (event) => {
			this.#handleImport(event);
		});
	}

	/**
	 * Binds observers for syncing background storage changes to the UI.
	 * @private
	 * @returns {void} Returns nothing.
	 */
	#setupStorageListeners() {
		browser.storage.onChanged.addListener((changes, areaName) => {
			if (areaName === 'sync') {
				if (changes.revealMode) {
					this.#revealSwitch.checked = changes.revealMode.newValue;
				}

				if (changes.blockedDomains) {
					this.#renderDomainList(
						changes.blockedDomains.newValue,
						this.#domainListElement,
						I18n.getMessage('optionsNoDomainsBlocked'),
						'blockedDomains'
					);
				}

				if (changes.whitelistedDomains) {
					this.#renderDomainList(
						changes.whitelistedDomains.newValue,
						this.#whitelistListElement,
						I18n.getMessage('optionsNoDomainsWhitelisted'),
						'whitelistedDomains'
					);
				}

				if (changes.filterLists) {
					const lists = changes.filterLists.newValue || [];
					this.#renderFilterLists(lists);
					this.#updatePresetToggles(lists);
				}

				if (changes.blockedDomains || changes.filterLists) {
					browser.storage.sync
						.get({ blockedDomains: [], filterLists: [] })
						.then((data) => {
							this.#updateWhitelistVisibility(data.blockedDomains, data.filterLists);
						});
				}
			}
		});
	}

	/**
	 * Handles the submission and validation of custom or preset filter lists.
	 * @private
	 * @returns {Promise<void>} Resolves when the list is processed.
	 */
	async #handleAddListSubmit() {
		let url = this.#urlInput.value.trim();

		if (!url) {
			return;
		}

		const normalizedInputUrl = this.#normalizeUrl(url);
		let matchedPresetUrl = null;

		if (RECOMMENDED_LISTS && typeof RECOMMENDED_LISTS === 'object') {
			for (const items of Object.values(RECOMMENDED_LISTS)) {
				for (const item of items) {
					if (this.#normalizeUrl(item.url) === normalizedInputUrl) {
						matchedPresetUrl = item.url;
						break;
					}
				}

				if (matchedPresetUrl) {
					break;
				}
			}
		}

		if (matchedPresetUrl) {
			this.#urlInput.value = '';

			const syncData = await browser.storage.sync.get({ filterLists: [] });
			const isAlreadyActive = syncData.filterLists.find((l) => l.url === matchedPresetUrl);

			if (!isAlreadyActive) {
				this.#addListButton.textContent = I18n.getMessage('buttonAdding');
				this.#addListButton.disabled = true;
				await this.#addFilterList(matchedPresetUrl);
				this.#addListButton.textContent = I18n.getMessage('optionsAddListButton');
				this.#addListButton.disabled = false;
				this.#showToast(I18n.getMessage('toastListAddedFromPresets'));
			} else {
				this.#showToast(I18n.getMessage('toastListAlreadyActive'));
			}

			const isHidden = this.#presetsContainer.hasAttribute('hidden');

			if (isHidden) {
				this.#togglePresetsButton.scrollIntoView({
					behavior: 'smooth',
					block: 'center',
				});
				this.#togglePresetsButton.classList.remove('qf-pulsate');
				void this.#togglePresetsButton.offsetWidth;
				this.#togglePresetsButton.classList.add('qf-pulsate');
			} else {
				const toggleInput = this.#presetsContainer.querySelector(
					`input[data-url="${matchedPresetUrl}"]`
				);

				if (toggleInput) {
					const presetItem = toggleInput.closest('.qf-preset-item');

					if (presetItem) {
						presetItem.scrollIntoView({ behavior: 'smooth', block: 'center' });
						presetItem.classList.remove('qf-pulsate');
						void presetItem.offsetWidth;
						presetItem.classList.add('qf-pulsate');
					}
				}
			}

			return;
		}

		this.#addListButton.textContent = I18n.getMessage('buttonFetching');
		this.#addListButton.disabled = true;

		const success = await this.#addFilterList(normalizedInputUrl);

		this.#addListButton.textContent = I18n.getMessage('optionsAddListButton');
		this.#addListButton.disabled = false;

		if (success) {
			this.#urlInput.value = '';
			this.#showToast(I18n.getMessage('toastCustomListAdded'));
		}
	}

	/**
	 * Handles the form submission for manually adding domains to a specific list.
	 * @param {HTMLInputElement} inputElement The input element containing the domain.
	 * @param {string} storageKey The sync storage key to update ('blockedDomains' or 'whitelistedDomains').
	 * @private
	 * @returns {Promise<void>} Resolves when the domain is saved and the UI is updated.
	 */
	async #handleManualDomainSubmit(inputElement, storageKey) {
		const rawItems = inputElement.value.split(/[,\s]+/).filter(Boolean);

		if (rawItems.length === 0) {
			return;
		}

		const validDomains = [];

		for (const item of rawItems) {
			const hostname = UrlUtils.extractHostname(item);

			if (hostname) {
				validDomains.push(hostname);
			}
		}

		if (validDomains.length === 0) {
			return;
		}

		const syncData = await browser.storage.sync.get({ [storageKey]: [] });
		const currentList = syncData[storageKey];
		let addedCount = 0;

		for (const hostname of validDomains) {
			if (!currentList.includes(hostname)) {
				currentList.push(hostname);
				addedCount++;
			}
		}

		if (addedCount > 0) {
			await browser.storage.sync.set({ [storageKey]: currentList });

			if (validDomains.length === 1) {
				this.#showToast(I18n.getMessage('toastDomainAddedSingle', validDomains[0]));
			} else {
				this.#showToast(I18n.getMessage('toastDomainAddedMultiple', addedCount.toString()));
			}
		} else {
			this.#showToast(I18n.getMessage('toastDomainsAlreadyInList'));
		}

		inputElement.value = '';
	}

	/**
	 * Displays a temporary toast message at the bottom of the page.
	 * Manages the timer to prevent overlap bugs.
	 * @param {string} message The text message to display.
	 * @private
	 * @returns {void} Returns nothing.
	 */
	#showToast(message) {
		if (this.#toastTimer) {
			clearTimeout(this.#toastTimer);
		}

		this.#toastElement.textContent = message;
		this.#toastElement.classList.add('show');

		this.#toastTimer = setTimeout(() => {
			this.#toastElement.classList.remove('show');
			this.#toastTimer = null;
		}, 3000);
	}

	/**
	 * Renders the recommended preset lists grouped by section with visible repository info links.
	 * @param {Array<object>} activeLists Currently saved filter lists.
	 * @private
	 * @returns {void} Returns nothing.
	 */
	#renderPresetsContainer(activeLists) {
		this.#presetsContainer.replaceChildren();

		if (!RECOMMENDED_LISTS || typeof RECOMMENDED_LISTS !== 'object') {
			return;
		}

		const activeUrls = new Set(activeLists.map((l) => l.url));
		const template = document.getElementById('template-preset-item');

		for (const [categoryName, items] of Object.entries(RECOMMENDED_LISTS)) {
			const categoryTitle = document.createElement('h4');
			categoryTitle.className = 'qf-category-title';
			const categoryKey = `category${categoryName.replace(/\s+/g, '')}`;
			categoryTitle.textContent = I18n.getMessage(categoryKey) || categoryName;
			this.#presetsContainer.appendChild(categoryTitle);

			for (const item of items) {
				const clone = template.content.cloneNode(true);
				const container = clone.querySelector('.qf-preset-item');
				const infoBlock = clone.querySelector('.qf-preset-info');
				const nameEl = clone.querySelector('.qf-preset-name');
				const toggleInput = clone.querySelector('input');

				nameEl.textContent = item.name;

				if (item.description) {
					const descEl = document.createElement('span');
					descEl.className = 'qf-preset-desc';
					descEl.textContent = item.description;
					infoBlock.appendChild(descEl);
				}

				const infoUrl = item.homepage || item.url;

				if (infoUrl) {
					const linkEl = document.createElement('a');
					linkEl.className = 'qf-preset-link';
					linkEl.href = infoUrl;
					linkEl.target = '_blank';
					linkEl.rel = 'noopener noreferrer';
					linkEl.textContent = I18n.getMessage('presetLearnMore');
					infoBlock.appendChild(linkEl);
				}

				toggleInput.checked = activeUrls.has(item.url);
				toggleInput.dataset.url = item.url;

				toggleInput.addEventListener('change', async (event) => {
					if (event.target.checked) {
						const success = await this.#addFilterList(item.url);

						if (!success) {
							event.target.checked = false;
						} else {
							this.#showToast(I18n.getMessage('toastListAdded'));
						}
					} else {
						const syncData = await browser.storage.sync.get({
							filterLists: [],
						});
						await this.#removeFilterList(item.url, syncData.filterLists);
						this.#showToast(I18n.getMessage('toastListRemoved'));
					}
				});

				this.#presetsContainer.appendChild(container);
			}
		}
	}

	/**
	 * Updates the checked states of inputs in the preset container.
	 * @param {Array<object>} activeLists Currently saved filter lists.
	 * @private
	 * @returns {void} Returns nothing.
	 */
	#updatePresetToggles(activeLists) {
		const activeUrls = new Set(activeLists.map((l) => l.url));
		const inputs = this.#presetsContainer.querySelectorAll('input[data-url]');

		for (const input of inputs) {
			input.checked = activeUrls.has(input.dataset.url);
		}
	}

	/**
	 * Converts standard GitHub blob URLs into raw user content URLs and normalizes branches.
	 * @param {string} urlString The URL to normalize.
	 * @private
	 * @returns {string} The normalized URL.
	 */
	#normalizeUrl(urlString) {
		try {
			const url = new URL(urlString);

			// Convert github.com blob links to raw.githubusercontent.com
			if (url.hostname === 'github.com' && url.pathname.includes('/blob/')) {
				url.hostname = 'raw.githubusercontent.com';
				url.pathname = url.pathname.replace('/blob/', '/');
			}

			// Strip /refs/heads/ from paths so both formats match identically
			if (url.pathname.includes('/refs/heads/')) {
				url.pathname = url.pathname.replace('/refs/heads/', '/');
			}

			return url.toString();
		} catch (error) {
			return urlString;
		}
	}

	/**
	 * Compares two domains by their reversed parts (e.g., TLD first) to group subdomains together.
	 * @param {string} domainA The first domain hostname.
	 * @param {string} domainB The second domain hostname.
	 * @private
	 * @returns {number} The sort order (-1, 0, or 1).
	 */
	#compareDomains(domainA, domainB) {
		const partsA = domainA.split('.').reverse();
		const partsB = domainB.split('.').reverse();
		const minLength = Math.min(partsA.length, partsB.length);

		for (let i = 0; i < minLength; i++) {
			const comparison = partsA[i].localeCompare(partsB[i]);

			if (comparison !== 0) {
				return comparison;
			}
		}

		// If all checked parts are identical, the shorter domain (parent) comes first
		return partsA.length - partsB.length;
	}

	/**
	 * Fetches, parses, and caches an external filter list.
	 * @param {string} url The URL of the text blocklist.
	 * @private
	 * @returns {Promise<boolean>} Resolves to true if successful, false otherwise.
	 */
	async #addFilterList(url) {
		try {
			const response = await fetch(url, { signal: AbortSignal.timeout(10000) });

			if (!response.ok) {
				throw new Error('Network response was not ok');
			}

			const text = await response.text();
			const domains = ListParser.parseUBlacklist(text);
			const syncData = await browser.storage.sync.get({ filterLists: [] });

			if (!syncData.filterLists.find((l) => l.url === url)) {
				syncData.filterLists.push({ url, enabled: true });
				await browser.storage.sync.set({ filterLists: syncData.filterLists });
			}

			const localData = await browser.storage.local.get({
				filterListCache: {},
			});
			localData.filterListCache[url] = domains;
			await browser.storage.local.set({
				filterListCache: localData.filterListCache,
			});

			return true;
		} catch (error) {
			console.error('[Qwant Filter] Failed to fetch list:', error);
			this.#showToast(I18n.getMessage('toastListFetchError'));
			return false;
		}
	}

	/**
	 * Renders custom community filter lists, omitting preset items.
	 * @param {Array<object>} lists The array of list configuration objects.
	 * @private
	 * @returns {Promise<void>} Resolves when rendered.
	 */
	async #renderFilterLists(lists) {
		this.#filterListElement.replaceChildren();

		const presetUrls = new Set();

		if (RECOMMENDED_LISTS && typeof RECOMMENDED_LISTS === 'object') {
			for (const items of Object.values(RECOMMENDED_LISTS)) {
				for (const item of items) {
					presetUrls.add(item.url);
				}
			}
		}

		const customLists = lists.filter((l) => !presetUrls.has(l.url));

		this.#activePresetCount = lists.length - customLists.length;
		this.#updatePresetsButtonLabel();

		if (customLists.length === 0) {
			const emptyItem = document.createElement('li');
			emptyItem.textContent = I18n.getMessage('optionsNoCustomLists');
			this.#filterListElement.replaceChildren(emptyItem);
			return;
		}

		const template = document.getElementById('template-filter-list-item');

		const sortedLists = [...customLists].sort((a, b) => a.url.localeCompare(b.url));

		for (const list of sortedLists) {
			const clone = template.content.cloneNode(true);
			const urlText = clone.querySelector('.qf-list-url');
			const button = clone.querySelector('.qf-remove-btn');

			urlText.textContent = list.url;
			button.addEventListener('click', async () => {
				await this.#removeFilterList(list.url, lists);
				this.#showToast(I18n.getMessage('toastCustomListRemoved'));
			});

			this.#filterListElement.appendChild(clone);
		}
	}

	/**
	 * Renders a list of domains to a specific DOM element.
	 * @param {Array<string>} domains The list of domains to render.
	 * @param {HTMLElement} listElement The DOM element to render into.
	 * @param {string} emptyMessage The message to display if the list is empty.
	 * @param {string} storageKey The storage key corresponding to this list.
	 * @private
	 * @returns {void} Returns nothing.
	 */
	#renderDomainList(domains, listElement, emptyMessage, storageKey) {
		listElement.replaceChildren();

		if (domains.length === 0) {
			const emptyItem = document.createElement('li');
			emptyItem.textContent = emptyMessage;
			listElement.replaceChildren(emptyItem);
			return;
		}

		const template = document.getElementById('template-domain-item');
		const sortedDomains = [...domains].sort((a, b) => {
			return this.#compareDomains(a, b);
		});

		for (const domain of sortedDomains) {
			const clone = template.content.cloneNode(true);
			const nameSpan = clone.querySelector('.qf-domain-name');
			const button = clone.querySelector('.qf-remove-btn');

			nameSpan.textContent = domain;
			button.addEventListener('click', async () => {
				await this.#removeDomain(domain, domains, storageKey);
			});

			listElement.appendChild(clone);
		}
	}

	/**
	 * Removes a domain from storage.
	 * @param {string} domain The hostname to remove.
	 * @param {Array<string>} currentList The array of currently saved hostnames.
	 * @param {string} storageKey The storage key to update.
	 * @private
	 * @returns {Promise<void>} Resolves when the domain is removed.
	 */
	async #removeDomain(domain, currentList, storageKey) {
		const updatedList = currentList.filter((d) => d !== domain);
		await browser.storage.sync.set({ [storageKey]: updatedList });
	}

	/**
	 * Removes an external filter list from sync and its cached data from local storage.
	 * @param {string} url The URL of the list to remove.
	 * @param {Array<object>} currentLists The array of currently tracked lists.
	 * @private
	 * @returns {Promise<void>} Resolves when the list is removed.
	 */
	async #removeFilterList(url, currentLists) {
		const updatedLists = currentLists.filter((l) => l.url !== url);
		await browser.storage.sync.set({ filterLists: updatedLists });

		const localData = await browser.storage.local.get({ filterListCache: {} });
		delete localData.filterListCache[url];
		await browser.storage.local.set({
			filterListCache: localData.filterListCache,
		});
	}

	/**
	 * Updates the visibility of the whitelist container based on active filters.
	 * @param {Array<string>} blockedDomains The manual block list.
	 * @param {Array<object>} filterLists The external filter lists.
	 * @private
	 * @returns {void} Returns nothing.
	 */
	#updateWhitelistVisibility(blockedDomains, filterLists) {
		const hasFilters = blockedDomains.length > 0 || filterLists.length > 0;
		if (hasFilters) {
			this.#whitelistContainerElement.removeAttribute('hidden');
		} else {
			this.#whitelistContainerElement.setAttribute('hidden', '');
		}
	}

	/**
	 * Updates the text label of the presets toggle button to reflect visibility and active count.
	 * @private
	 * @returns {void} Returns nothing.
	 */
	#updatePresetsButtonLabel() {
		const isHidden = this.#presetsContainer.hasAttribute('hidden');
		const baseText = isHidden
			? I18n.getMessage('optionsShowRecommendedLists')
			: I18n.getMessage('optionsHideRecommendedLists');

		if (this.#activePresetCount > 0) {
			this.#togglePresetsLabel.textContent = I18n.getMessage('optionsPresetsCountEnabled', [
				baseText,
				this.#activePresetCount.toString(),
			]);
		} else {
			this.#togglePresetsLabel.textContent = baseText;
		}
	}

	/**
	 * Binds input listeners to automatically extract hostnames from pasted URLs.
	 * @private
	 * @returns {void} Returns nothing.
	 */
	#setupInputFormatters() {
		const formatValue = (value) => {
			return value
				.split(/[,\s]+/)
				.map((item) => {
					if (item.includes('://') || item.includes('/')) {
						return UrlUtils.extractHostname(item) || item;
					}

					return item;
				})
				.filter(Boolean)
				.join(' ');
		};

		const formatInput = (event) => {
			const input = event.target;
			const rawValue = input.value;

			if (rawValue.includes('://') || rawValue.includes('/')) {
				input.value = formatValue(rawValue);
			}
		};

		const formatOnBlur = (event) => {
			const input = event.target;
			const rawValue = input.value.trim();

			if (rawValue) {
				input.value = formatValue(rawValue);
			}
		};

		this.#blockInput.addEventListener('input', formatInput);
		this.#whitelistInput.addEventListener('input', formatInput);

		this.#blockInput.addEventListener('blur', formatOnBlur);
		this.#whitelistInput.addEventListener('blur', formatOnBlur);
	}

	/**
	 * Exports the current sync storage settings to a downloadable JSON file.
	 * @private
	 * @returns {Promise<void>} Resolves when the export is initiated.
	 */
	async #handleExport() {
		const syncData = await browser.storage.sync.get(null);
		const jsonString = JSON.stringify(syncData, null, '\t');
		const blob = new Blob([jsonString], { type: 'application/json' });
		const url = URL.createObjectURL(blob);

		const a = document.createElement('a');
		const dateString = new Date().toISOString().split('T')[0];

		a.href = url;
		a.download = `qwant-filter-settings-${dateString}.json`;
		a.click();

		URL.revokeObjectURL(url);
		this.#showToast(I18n.getMessage('toastSettingsExported'));
	}

	/**
	 * Parses a selected JSON file, validates it, and updates the browser sync storage.
	 * @param {Event} event The change event from the file input.
	 * @private
	 * @returns {void} Returns nothing.
	 */
	#handleImport(event) {
		const file = event.target.files[0];

		if (!file) {
			return;
		}

		const reader = new FileReader();

		reader.onload = async (e) => {
			try {
				const importedData = JSON.parse(e.target.result);
				const dataToSet = this.#validateImportData(importedData);

				if (Object.keys(dataToSet).length === 0) {
					this.#showToast(I18n.getMessage('toastNoValidSettings'));
					return;
				}

				await browser.storage.sync.set(dataToSet);
				this.#showToast(I18n.getMessage('toastSettingsImported'));
			} catch (error) {
				console.error('[Qwant Filter] Import parsing error:', error);
				this.#showToast(I18n.getMessage('toastImportParseError'));
			} finally {
				event.target.value = '';
			}
		};

		reader.readAsText(file);
	}

	/**
	 * Validates and sanitizes the imported JSON data against expected schema types.
	 * @param {object} data The raw parsed JSON object.
	 * @private
	 * @returns {object} The sanitized data ready for storage.
	 */
	#validateImportData(data) {
		const sanitized = {};

		if (typeof data.revealMode === 'boolean') {
			sanitized.revealMode = data.revealMode;
		}

		if (Array.isArray(data.blockedDomains)) {
			sanitized.blockedDomains = data.blockedDomains.filter((domain) => {
				return typeof domain === 'string' && domain.trim().length > 0;
			});
		}

		if (Array.isArray(data.whitelistedDomains)) {
			sanitized.whitelistedDomains = data.whitelistedDomains.filter((domain) => {
				return typeof domain === 'string' && domain.trim().length > 0;
			});
		}

		if (Array.isArray(data.filterLists)) {
			sanitized.filterLists = data.filterLists
				.filter((list) => {
					return list && typeof list === 'object' && typeof list.url === 'string';
				})
				.map((list) => {
					return {
						url: list.url.trim(),
						enabled: typeof list.enabled === 'boolean' ? list.enabled : true,
					};
				});
		}

		return sanitized;
	}
}

export const Options = new OptionsController();
Options.init();

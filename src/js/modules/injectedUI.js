import { I18n } from './i18n.js';

/**
 * Controller for managing injected UI components, modals, and user interactions.
 */
class InjectedUIController {
	#pendingDomain;
	#onConfirmCallback;
	#onOpenOptionsCallback;

	/**
	 * Initializes a new instance of the InjectedUIController.
	 */
	constructor() {
		this.#pendingDomain = null;
		this.#onConfirmCallback = null;
		this.#onOpenOptionsCallback = null;
	}

	/**
	 * @constant
	 * @returns {string} The CSS class name used for injected block buttons.
	 */
	static get BUTTON_CLASS() {
		return 'qf-block-button';
	}

	/**
	 * @constant
	 * @returns {number} The delay in milliseconds matching the CSS transform duration.
	 */
	static get ANIMATION_MS() {
		return 400;
	}

	/**
	 * Gets whether the quick settings modal is currently open.
	 * @returns {boolean} True if the quick settings modal is open.
	 */
	get isQuickSettingsOpen() {
		const modal = document.getElementById('qf-quick-settings-modal');
		return Boolean(modal && modal.open);
	}

	/**
	 * Initializes the injected UI templates and binds base listeners.
	 * @param {object} options Initialization options.
	 * @param {Function} options.onConfirm Callback executed when a confirm action is submitted.
	 * @param {Function} options.onRevealToggle Callback executed when the reveal mode toggle is switched.
	 * @param {Function} options.onOpenOptions Callback executed when the extension settings button is clicked.
	 * @returns {Promise<void>} Resolves when templates are injected and bound.
	 */
	async init({ onConfirm, onRevealToggle, onOpenOptions }) {
		this.#onConfirmCallback = onConfirm;
		this.#onOpenOptionsCallback = onOpenOptions;
		await this.#injectTemplates();
		this.#setupEventListeners(onRevealToggle);
	}

	/**
	 * Fetches, translates, and injects the necessary dialog templates into the document body.
	 * @private
	 * @returns {Promise<void>} Resolves when templates have been successfully appended.
	 */
	async #injectTemplates() {
		const templateUrl = browser.runtime.getURL('templates/injectedUi.html');
		const response = await fetch(templateUrl);
		const htmlText = await response.text();

		const parser = new DOMParser();
		const parsedDoc = parser.parseFromString(htmlText, 'text/html');

		I18n.translateDom(parsedDoc.body);

		document.body.append(...parsedDoc.body.children);
	}

	/**
	 * Binds event listeners to the injected modals.
	 * @param {Function} onRevealToggle Callback for reveal mode toggle changes.
	 * @private
	 * @returns {void} Returns nothing.
	 */
	#setupEventListeners(onRevealToggle) {
		const confirmModal = document.getElementById('qf-confirm-modal');
		const qsModal = document.getElementById('qf-quick-settings-modal');

		document.getElementById('qf-confirm-cancel').addEventListener('click', () => {
			this.#closeModalAnimated(confirmModal);
		});

		document.getElementById('qf-confirm-submit').addEventListener('click', () => {
			if (this.#onConfirmCallback && this.#pendingDomain) {
				this.#onConfirmCallback(this.#pendingDomain.action, this.#pendingDomain.domain);
			}
			this.#closeModalAnimated(confirmModal);
			this.#pendingDomain = null;
		});

		document.getElementById('qf-qs-close').addEventListener('click', () => {
			this.#closeModalAnimated(qsModal);
		});

		// Close modals when clicking the backdrop
		const handleBackdropClick = (modal) => (event) => {
			if (event.target === modal) {
				this.#closeModalAnimated(modal);
			}
		};

		confirmModal.addEventListener('click', handleBackdropClick(confirmModal));
		qsModal.addEventListener('click', handleBackdropClick(qsModal));

		document.getElementById('qf-toggle-reveal-switch').addEventListener('change', (event) => {
			if (onRevealToggle) {
				onRevealToggle(event.target.checked);
			}
		});

		document.getElementById('qf-open-options').addEventListener('click', () => {
			if (this.#onOpenOptionsCallback) {
				this.#onOpenOptionsCallback();
			}
		});
	}

	/**
	 * Closes a dialog element natively after a brief CSS animation completes.
	 * @param {HTMLDialogElement} modal The dialog element to close.
	 * @private
	 * @returns {void} Returns nothing.
	 */
	#closeModalAnimated(modal) {
		modal.classList.add('is-closing');
		setTimeout(() => {
			modal.close();
			modal.classList.remove('is-closing');
		}, InjectedUIController.ANIMATION_MS);
	}

	/**
	 * Opens the confirmation dialog for blocking or unblocking a domain.
	 * @param {string} action The action to perform ('block' or 'unblock').
	 * @param {string} domain The target hostname.
	 * @returns {void} Returns nothing.
	 */
	openConfirmModal(action, domain) {
		this.#pendingDomain = { action, domain };
		const modal = document.getElementById('qf-confirm-modal');
		const title = document.getElementById('qf-confirm-title');
		const message = document.getElementById('qf-confirm-message');

		if (action === 'block') {
			title.textContent = I18n.getMessage('confirmBlockDomainTitle');
			message.textContent = I18n.getMessage('confirmBlockDomainMessage', domain);
		} else {
			title.textContent = I18n.getMessage('confirmUnblockDomainTitle');
			message.textContent = I18n.getMessage('confirmUnblockDomainMessage', domain);
		}

		const qsModal = document.getElementById('qf-quick-settings-modal');

		if (qsModal && qsModal.open) {
			this.#closeModalAnimated(qsModal);
		}

		modal.showModal();
	}

	/**
	 * Updates or creates the counter button next to Qwant's settings.
	 * @param {number} count The total number of filtered results detected on the current page.
	 * @param {number} totalResults The total number of results found on the page.
	 * @param {Function} onClick Click handler for the counter button.
	 * @returns {void} Returns nothing.
	 */
	updateCounterButton(count, totalResults, onClick) {
		let counterButton = document.getElementById('qf-counter-button');
		const settingsButton = document.querySelector('a[href*="drawer=settings"]');

		if (settingsButton && !counterButton) {
			counterButton = document.createElement('button');
			counterButton.id = 'qf-counter-button';
			counterButton.className = 'qf-btn-base';
			counterButton.addEventListener('click', onClick);
			settingsButton.parentNode.insertBefore(counterButton, settingsButton);
		}

		if (counterButton) {
			if (totalResults === 0) {
				counterButton.textContent = '…';
				counterButton.title = I18n.getMessage('counterWaiting');
			} else {
				counterButton.textContent = count;

				if (count === 1) {
					counterButton.title = I18n.getMessage('counterResultSingle');
				} else {
					counterButton.title = I18n.getMessage(
						'counterResultMultiple',
						count.toString()
					);
				}
			}
		}
	}

	/**
	 * Updates the content of the quick settings modal based on current page domains.
	 * @param {Array<{domain: string, isManual: boolean, lists: string[]}>} activeBlockedDetails Details of blocked domains on the current page.
	 * @param {boolean} isRevealMode Current reveal mode status.
	 * @returns {void} Returns nothing.
	 */
	updateQuickSettingsModal(activeBlockedDetails, isRevealMode) {
		const list = document.getElementById('qf-page-blocked-list');
		const toggleSwitch = document.getElementById('qf-toggle-reveal-switch');
		const header = document.getElementById('qf-blocked-header');

		if (!list || !toggleSwitch || !header) {
			return;
		}

		list.replaceChildren();
		toggleSwitch.checked = isRevealMode;

		if (activeBlockedDetails.length === 0) {
			header.textContent = I18n.getMessage('quickSettingsNoBlockedDomains');
			return;
		}

		header.textContent = I18n.getMessage('quickSettingsBlockedHeader');

		const template = document.getElementById('template-blocked-item');

		for (const { domain, isManual, lists, count } of activeBlockedDetails) {
			const clone = template.content.cloneNode(true);
			const info = clone.querySelector('.qf-blocked-domain-info');
			const nameSpan = clone.querySelector('.qf-blocked-domain-name');

			nameSpan.textContent = domain;

			if (count > 1) {
				const badge = document.createElement('span');
				badge.className = 'qf-blocked-domain-count';
				badge.textContent = count;
				nameSpan.prepend(badge, document.createTextNode(' '));
			}

			if (!isManual && lists.length > 0) {
				const sourceSpan = document.createElement('span');
				sourceSpan.className = 'qf-blocked-domain-source';
				sourceSpan.textContent = lists.join(', ');
				info.appendChild(sourceSpan);
			}

			if (isManual) {
				info.classList.add('qf-blocked-domain-info--manual');

				const button = this.#createUnblockButton(domain);
				info.appendChild(button);
			}

			list.appendChild(clone);
		}
	}

	/**
	 * Populates and opens the quick settings modal.
	 * @param {Array<{domain: string, isManual: boolean, lists: string[]}>} activeBlockedDetails Details of blocked domains on the current page.
	 * @param {boolean} isRevealMode Current reveal mode status.
	 * @returns {void} Returns nothing.
	 */
	openQuickSettingsModal(activeBlockedDetails, isRevealMode) {
		const modal = document.getElementById('qf-quick-settings-modal');
		this.updateQuickSettingsModal(activeBlockedDetails, isRevealMode);
		modal.showModal();
	}

	/**
	 * Attaches or updates the action button (Block/Unblock) on a search result.
	 * @param {Element} resultElement The search result DOM element.
	 * @param {string} hostname The hostname associated with the result.
	 * @param {boolean} isBlocked Whether the domain is currently blocked.
	 * @returns {void} Returns nothing.
	 */
	updateActionButton(resultElement, hostname, isBlocked) {
		let button = resultElement.querySelector(`.${InjectedUIController.BUTTON_CLASS}`);
		const isCurrentlyUnblock = button && button.dataset.qfAction === 'unblock';

		if (button && isBlocked === isCurrentlyUnblock) {
			return;
		}

		if (!button) {
			button = document.createElement('button');
			resultElement.style.position = 'relative';

			const killEvent = (event) => {
				event.preventDefault();
				event.stopPropagation();
			};

			button.addEventListener('mousedown', killEvent);
			button.addEventListener('pointerdown', killEvent);
			button.addEventListener('mouseup', killEvent);
			button.addEventListener('keydown', (event) => {
				if (event.key === 'Enter' || event.key === ' ') {
					killEvent(event);
				}
			});

			button.addEventListener('click', (event) => {
				killEvent(event);
				const action = button.dataset.qfAction;
				this.openConfirmModal(action, hostname);
			});

			resultElement.appendChild(button);
		}

		if (isBlocked) {
			button.className = `${InjectedUIController.BUTTON_CLASS} qf-btn-base qf-btn-purple`;
			button.textContent = I18n.getMessage('actionUnblock');
			button.dataset.qfAction = 'unblock';
		} else {
			button.className = `${InjectedUIController.BUTTON_CLASS} qf-btn-base qf-btn-danger`;
			button.textContent = I18n.getMessage('actionBlock');
			button.dataset.qfAction = 'block';
		}
	}

	/**
	 * Creates an unblock button element from the template and binds its click listener.
	 * @param {string} domain The domain to unblock.
	 * @private
	 * @returns {HTMLButtonElement} The constructed button element.
	 */
	#createUnblockButton(domain) {
		const template = document.getElementById('template-unblock-button');
		const clone = template.content.cloneNode(true);
		const button = clone.querySelector('button');

		button.addEventListener('click', () => {
			this.openConfirmModal('unblock', domain);
		});

		return button;
	}
}

export const InjectedUI = new InjectedUIController();

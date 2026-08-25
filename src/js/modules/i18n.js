/**
 * Controller for managing internationalization and localized DOM injections.
 */
class I18nController {
	/**
	 * Initializes a new instance of the I18nController.
	 */
	constructor() {}

	/**
	 * @constant
	 * @returns {string} The data attribute used to identify translatable DOM text elements.
	 */
	static get I18N_ATTRIBUTE() {
		return 'data-i18n';
	}

	/**
	 * Gets the localized string for the specified message key.
	 * @param {string} messageName The key of the message in messages.json.
	 * @param {string|string[]} [substitutions] A single string or an array of string substitutions.
	 * @returns {string} The localized message string or empty string if not found.
	 */
	getMessage(messageName, substitutions) {
		return browser.i18n.getMessage(messageName, substitutions) || '';
	}

	/**
	 * Scans the provided root element for localization attributes and injects translated strings.
	 * @param {Document|Element} rootNode The root DOM node to traverse.
	 * @returns {void} Returns nothing.
	 */
	translateDom(rootNode) {
		const textElements = rootNode.querySelectorAll(`[${I18nController.I18N_ATTRIBUTE}]`);

		for (const element of textElements) {
			const messageKey = element.getAttribute(I18nController.I18N_ATTRIBUTE);
			const translatedText = this.getMessage(messageKey);

			if (translatedText) {
				element.textContent = translatedText;
			}
		}

		const htmlElements = rootNode.querySelectorAll('[data-i18n-html]');

		for (const element of htmlElements) {
			const messageKey = element.getAttribute('data-i18n-html');
			const translatedHtml = this.getMessage(messageKey);

			if (translatedHtml) {
				const parser = new DOMParser();
				const doc = parser.parseFromString(translatedHtml, 'text/html');
				element.replaceChildren(...doc.body.childNodes);
			}
		}

		const placeholderElements = rootNode.querySelectorAll('[data-i18n-placeholder]');

		for (const element of placeholderElements) {
			const messageKey = element.getAttribute('data-i18n-placeholder');
			const translatedPlaceholder = this.getMessage(messageKey);

			if (translatedPlaceholder) {
				element.placeholder = translatedPlaceholder;
			}
		}

		const titleElements = rootNode.querySelectorAll('[data-i18n-title]');

		for (const element of titleElements) {
			const messageKey = element.getAttribute('data-i18n-title');
			const translatedTitle = this.getMessage(messageKey);

			if (translatedTitle) {
				element.title = translatedTitle;
			}
		}

		const ariaLabelElements = rootNode.querySelectorAll('[data-i18n-aria-label]');

		for (const element of ariaLabelElements) {
			const messageKey = element.getAttribute('data-i18n-aria-label');
			const translatedAria = this.getMessage(messageKey);

			if (translatedAria) {
				element.setAttribute('aria-label', translatedAria);
			}
		}
	}
}

export const I18n = new I18nController();

/**
 * Bootstraps the extension by dynamically importing the main controller module.
 */
console.log('[Qwant Filter] Bootstrap script started.');

(async () => {
	try {
		const { App } = await import(browser.runtime.getURL('js/appController.js'));
		App.init();
	} catch (error) {
		console.error('[Qwant Filter] Failed to load appController:', error);
	}
})();

/**
 * Bootstraps the extension by dynamically importing the main controller module.
 */
(async () => {
	let Logger;
	try {
		const loggerModule = await import(browser.runtime.getURL('js/modules/utils/logger.js'));
		Logger = loggerModule.Logger;
		Logger.info('Bootstrap script started.');

		const { App } = await import(browser.runtime.getURL('js/appController.js'));
		App.init();
	} catch (error) {
		if (Logger) {
			Logger.error('Failed to load appController:', error);
		} else {
			console.error('[Qwant Filter] Failed to load extension modules:', error);
		}
	}
})();

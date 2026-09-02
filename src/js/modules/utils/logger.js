/**
 * Utility controller for standardized logging based on extension environment.
 */
class LoggerController {
	/**
	 * Initializes a new instance of the LoggerController.
	 */
	constructor() {}

	/**
	 * @constant
	 * @returns {boolean} True if the extension is running in development mode.
	 */
	static get IS_DEV() {
		if (typeof browser === 'undefined' || !browser.runtime) {
			return false;
		}

		const manifest = browser.runtime.getManifest();
		return !('update_url' in manifest);
	}

	/**
	 * Logs a debug message if running in development mode.
	 * @param {...any} args The arguments to log.
	 * @returns {void} Returns nothing.
	 */
	debug(...args) {
		if (LoggerController.IS_DEV) {
			console.debug('[Qwant Filter]', ...args);
		}
	}

	/**
	 * Logs an info message if running in development mode.
	 * @param {...any} args The arguments to log.
	 * @returns {void} Returns nothing.
	 */
	info(...args) {
		if (LoggerController.IS_DEV) {
			console.info('[Qwant Filter]', ...args);
		}
	}

	/**
	 * Logs a warning message globally.
	 * @param {...any} args The arguments to log.
	 * @returns {void} Returns nothing.
	 */
	warn(...args) {
		console.warn('[Qwant Filter]', ...args);
	}

	/**
	 * Logs an error message globally.
	 * @param {...any} args The arguments to log.
	 * @returns {void} Returns nothing.
	 */
	error(...args) {
		console.error('[Qwant Filter]', ...args);
	}
}

export const Logger = new LoggerController();

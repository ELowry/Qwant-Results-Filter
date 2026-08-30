import { Logger } from './logger.js';

/**
 * Utility controller for managing chunked browser storage to bypass sync limits.
 */
class StorageUtilsController {
	/**
	 * Initializes a new instance of the StorageUtilsController.
	 */
	constructor() {}

	/**
	 * @constant
	 * @returns {number} Maximum array items per chunk.
	 */
	static get CHUNK_SIZE() {
		return 120;
	}

	/**
	 * Saves a list to local storage and mirrors it to sync storage in chunks.
	 * @param {string} key The base storage key.
	 * @param {Array<string>} dataArray The array of domains to save.
	 * @returns {Promise<void>} Resolves when saved.
	 */
	async saveList(key, dataArray) {
		Logger.debug(`Saving list ${key} with ${dataArray.length} items.`);
		await browser.storage.local.set({ [key]: dataArray });

		const chunks = [];

		for (let i = 0; i < dataArray.length; i += StorageUtilsController.CHUNK_SIZE) {
			chunks.push(dataArray.slice(i, i + StorageUtilsController.CHUNK_SIZE));
		}

		const syncObject = { [`${key}_chunks`]: chunks.length };

		for (let i = 0; i < chunks.length; i++) {
			syncObject[`${key}_${i}`] = chunks[i];
		}

		try {
			await browser.storage.sync.set(syncObject);
			Logger.debug(`List ${key} successfully synced across ${chunks.length} chunks.`);
		} catch (error) {
			Logger.warn(`Sync quota exceeded for ${key}. Falling back to local only.`);
		}
	}

	/**
	 * Loads a list, preferring the fast local storage, falling back to sync chunks if missing.
	 * @param {string} key The base storage key.
	 * @returns {Promise<Array<string>>} The reconstructed array.
	 */
	async loadList(key) {
		const localData = await browser.storage.local.get(key);

		if (localData[key]) {
			return localData[key];
		}

		return await this.pullFromSync(key);
	}

	/**
	 * Explicitly pulls chunked data from sync storage and mirrors it to local storage.
	 * @param {string} key The base storage key.
	 * @returns {Promise<Array<string>>} The reconstructed array.
	 */
	async pullFromSync(key) {
		Logger.debug(`Pulling ${key} from sync storage...`);
		const meta = await browser.storage.sync.get(`${key}_chunks`);
		const totalChunks = meta[`${key}_chunks`] || 0;

		if (totalChunks === 0) {
			Logger.debug(`No chunks found for ${key}, initializing empty array.`);
			await browser.storage.local.set({ [key]: [] });
			return [];
		}

		const chunkKeys = Array.from({ length: totalChunks }, (_, i) => `${key}_${i}`);
		const chunkData = await browser.storage.sync.get(chunkKeys);
		let combined = [];

		for (let i = 0; i < totalChunks; i++) {
			if (chunkData[`${key}_${i}`]) {
				combined = combined.concat(chunkData[`${key}_${i}`]);
			}
		}

		await browser.storage.local.set({ [key]: combined });
		Logger.debug(`Pulled ${combined.length} items for ${key} from sync.`);

		return combined;
	}
}

export const StorageUtils = new StorageUtilsController();

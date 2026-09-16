import { Logger } from './logger.js';

/**
 * Utility controller for managing chunked browser storage to bypass sync limits.
 */
class StorageUtilsController {
	constructor() {}

	/**
	 * @constant
	 * @returns {number} Maximum string length per chunk to stay under the 8KB sync item limit.
	 */
	static get CHUNK_SIZE() {
		return 7500;
	}

	/**
	 * Compresses a JSON string into a Base64 encoded string using the native Web API.
	 * @param {string} input The raw JSON string.
	 * @private
	 * @returns {Promise<string>} The Base64 encoded compressed string.
	 */
	async #compress(input) {
		const stream = new Blob([input]).stream().pipeThrough(new CompressionStream('deflate-raw'));
		const buffer = await new Response(stream).arrayBuffer();
		const bytes = new Uint8Array(buffer);

		let binaryString = '';
		for (let i = 0; i < bytes.length; i++) {
			binaryString += String.fromCharCode(bytes[i]);
		}

		return btoa(binaryString);
	}

	/**
	 * Decompresses a Base64 encoded string back into the original JSON string.
	 * @param {string} base64Input The compressed Base64 string.
	 * @private
	 * @returns {Promise<string>} The decompressed JSON string.
	 */
	async #decompress(base64Input) {
		const binaryString = atob(base64Input);
		const bytes = new Uint8Array(binaryString.length);

		for (let i = 0; i < binaryString.length; i++) {
			bytes[i] = binaryString.charCodeAt(i);
		}

		const stream = new Blob([bytes])
			.stream()
			.pipeThrough(new DecompressionStream('deflate-raw'));
		return await new Response(stream).text();
	}

	/**
	 * Saves a list to local storage and mirrors it to sync storage in compressed chunks.
	 * @param {string} key The base storage key.
	 * @param {Array<string>} dataArray The array of domains to save.
	 * @returns {Promise<void>} Resolves when saved.
	 */
	async saveList(key, dataArray) {
		Logger.debug(`Saving list ${key} with ${dataArray.length} items.`);
		await browser.storage.local.set({ [key]: dataArray });

		try {
			const jsonString = JSON.stringify(dataArray);
			const compressedBase64 = await this.#compress(jsonString);

			const meta = await browser.storage.sync.get(`${key}_chunks`);
			const oldChunkCount = meta[`${key}_chunks`] || 0;

			const chunks = [];
			for (let i = 0; i < compressedBase64.length; i += StorageUtilsController.CHUNK_SIZE) {
				chunks.push(compressedBase64.slice(i, i + StorageUtilsController.CHUNK_SIZE));
			}

			const syncObject = { [`${key}_chunks`]: chunks.length };

			for (let i = 0; i < chunks.length; i++) {
				syncObject[`${key}_${i}`] = chunks[i];
			}

			await browser.storage.sync.set(syncObject);

			const keysToRemove = [];
			for (let i = chunks.length; i < oldChunkCount; i++) {
				keysToRemove.push(`${key}_${i}`);
			}

			if (keysToRemove.length > 0) {
				await browser.storage.sync.remove(keysToRemove);
			}

			Logger.debug(
				`List ${key} successfully compressed and synced across ${chunks.length} chunks.`
			);
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
	 * Explicitly pulls chunked data from sync storage, migrating legacy uncompressed arrays
	 * or decompiling compressed Base64 strings, and mirrors it to local storage.
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

		const firstChunk = chunkData[`${key}_0`];
		const isLegacyData = Array.isArray(firstChunk);

		let parsedData = [];

		if (isLegacyData) {
			Logger.debug(`Detected legacy uncompressed data for ${key}. Migrating...`);
			let combinedArray = [];

			for (let i = 0; i < totalChunks; i++) {
				if (chunkData[`${key}_${i}`]) {
					combinedArray = combinedArray.concat(chunkData[`${key}_${i}`]);
				}
			}
			parsedData = combinedArray;

			this.saveList(key, parsedData).catch((e) => Logger.error(e));
		} else {
			let combinedBase64 = '';

			for (let i = 0; i < totalChunks; i++) {
				if (chunkData[`${key}_${i}`]) {
					combinedBase64 += chunkData[`${key}_${i}`];
				}
			}

			try {
				const jsonString = await this.#decompress(combinedBase64);
				parsedData = JSON.parse(jsonString);
				Logger.debug(
					`Pulled and decompressed ${parsedData.length} items for ${key} from sync.`
				);
			} catch (error) {
				Logger.error(`Failed to decompress sync chunks for ${key}:`, error);
			}
		}

		await browser.storage.local.set({ [key]: parsedData });
		return parsedData;
	}
}

export const StorageUtils = new StorageUtilsController();

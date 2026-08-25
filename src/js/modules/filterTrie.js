/**
 * Represents a single node within the Filter Trie.
 */
class TrieNode {
	#children;
	#sources;

	/**
	 * Initializes a new instance of the TrieNode.
	 */
	constructor() {
		this.#children = new Map();
		this.#sources = new Set();
	}

	/**
	 * Gets the child nodes.
	 * @returns {Map<string, TrieNode>} The map of child nodes.
	 */
	get children() {
		return this.#children;
	}

	/**
	 * Gets the sources that have blocked this node's path.
	 * @returns {Set<string>} The set of source identifiers.
	 */
	get sources() {
		return this.#sources;
	}
}

/**
 * Controller for efficiently indexing and matching domains using a reversed suffix trie.
 */
class FilterTrieController {
	#root;

	/**
	 * Initializes a new instance of the FilterTrieController.
	 */
	constructor() {
		this.#root = new TrieNode();
	}

	/**
	 * @constant
	 * @returns {string} The default ID used for manually blocked domains.
	 */
	static get MANUAL_SOURCE_ID() {
		return 'manual';
	}

	/**
	 * Clears all data from the trie.
	 * @returns {void} Returns nothing.
	 */
	clear() {
		this.#root = new TrieNode();
	}

	/**
	 * Inserts a domain into the trie, associating it with a specific filter list source.
	 * @param {string} domain The hostname to block (e.g., 'ads.google.com').
	 * @param {string} sourceId The identifier of the filter list providing this block.
	 * @returns {void} Returns nothing.
	 */
	add(domain, sourceId) {
		const parts = domain.split('.').reverse();
		let current = this.#root;

		for (const part of parts) {
			if (!current.children.has(part)) {
				current.children.set(part, new TrieNode());
			}

			current = current.children.get(part);
		}

		current.sources.add(sourceId);
	}

	/**
	 * Evaluates a hostname against the trie to determine if it is blocked.
	 * Traverses backwards (e.g., 'com' -> 'google' -> 'ads').
	 * @param {string} domain The hostname to check.
	 * @returns {Array<string>|null} An array of source IDs if blocked, or null if permitted.
	 */
	check(domain) {
		const parts = domain.split('.').reverse();
		let current = this.#root;
		const matchedSources = new Set();

		for (const part of parts) {
			if (!current.children.has(part)) {
				break;
			}

			current = current.children.get(part);

			if (current.sources.size > 0) {
				for (const source of current.sources) {
					matchedSources.add(source);
				}
			}
		}

		if (matchedSources.size > 0) {
			return Array.from(matchedSources);
		}

		return null;
	}
}

export const FilterTrie = new FilterTrieController();

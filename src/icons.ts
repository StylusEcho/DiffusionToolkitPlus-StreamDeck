import { readFileSync } from "node:fs";
import streamDeck from "@elgato/streamdeck";

/** Read once each, since the same handful of images serves the life of the plugin. */
const cache = new Map<string, string | undefined>();

/**
 * A key image as a data URI, given its name without the extension.
 *
 * Inlined rather than passed to Stream Deck as a path: the manifest names images without an
 * extension and lets Stream Deck pick the @2x variant, but setImage takes a file rather than that
 * naming convention, so handing over the bytes removes the question of which applies. The @2x file
 * is used so the key stays sharp on the larger panels.
 *
 * Returns undefined when the file is missing, which makes Stream Deck fall back to the image in the
 * manifest - a wrong icon beats a blank key.
 */
export function iconDataUri(name: string): string | undefined {
	if (cache.has(name)) return cache.get(name);

	let uri: string | undefined;

	try {
		// The plugin's working directory is the .sdPlugin folder
		const png = readFileSync(`${name}@2x.png`);

		uri = `data:image/png;base64,${png.toString("base64")}`;
	} catch (err) {
		streamDeck.logger.warn(`Missing icon ${name}@2x.png: ${err}`);

		uri = undefined;
	}

	cache.set(name, uri);

	return uri;
}

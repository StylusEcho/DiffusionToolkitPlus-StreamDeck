import streamDeck, {
	action,
	SingletonAction,
	type DialAction,
	type DidReceiveSettingsEvent,
	type KeyAction,
	type KeyDownEvent,
	type WillAppearEvent,
} from "@elgato/streamdeck";
import { client } from "../client";
import { iconDataUri } from "../icons";

type RateSettings = {
	/**
	 * 1 to 10, or 0 to clear the rating.
	 *
	 * A string as well as a number, because a dropdown in the property inspector stores its
	 * option values as text.
	 */
	rating?: number | string;
};

/**
 * Rates whatever is selected. One key per rating, which is how a deck is actually used - you reach
 * for "3", not for a rating widget.
 *
 * A row of these behaves like a star bar: with the selected image rated 4, keys 1 to 4 are filled
 * and the rest are outlines, so the current rating is the last lit key. Showing only the exact
 * match would be unambiguous too, but it reads nothing like the ratings bar in the toolkit.
 */
@action({ UUID: "com.stylusecho.dtplus.rate" })
export class Rate extends SingletonAction<RateSettings> {
	public constructor() {
		super();

		// Subscribed for the life of the plugin; see the note in Toggle
		client.onState(() => this.#paintAll());
	}

	override onWillAppear(ev: WillAppearEvent<RateSettings>): Promise<void> | void {
		return this.#paint(ev.action, ev.payload.settings);
	}

	override onDidReceiveSettings(ev: DidReceiveSettingsEvent<RateSettings>): Promise<void> | void {
		return this.#paint(ev.action, ev.payload.settings);
	}

	override async onKeyDown(ev: KeyDownEvent<RateSettings>): Promise<void> {
		const rating = normalise(ev.payload.settings.rating);

		const reply = rating === 0 ? await client.send("unrate") : await client.send("rate", rating);

		if (reply.ok) {
			// The toolkit pushes the new rating, which repaints every rating key, so a tick on top
			// of that is noise
			return;
		}

		streamDeck.logger.warn(`rate ${rating} failed: ${reply.error}`);

		await ev.action.showAlert();
	}

	#paintAll(): void {
		for (const target of this.actions) {
			void target
				.getSettings<RateSettings>()
				.then((settings) => this.#paint(target, settings))
				.catch((err) => streamDeck.logger.warn(`Could not repaint a rating key: ${err}`));
		}
	}

	/**
	 * Paints both states, then selects the one the current rating calls for.
	 *
	 * Painted per state rather than as one image so Stream Deck offers an image well for each, the
	 * same as a Toggle. An image the user sets themselves wins over the one sent here.
	 */
	async #paint(
		target: DialAction<RateSettings> | KeyAction<RateSettings>,
		settings: RateSettings,
	): Promise<void> {
		if (!target.isKey()) return;

		const rating = normalise(settings.rating);

		await target.setTitle(rating === 0 ? "Clear" : String(rating));

		const family = rating === 0 ? "clear" : "star";

		await target.setImage(iconDataUri(`imgs/rating/${family}-off`), { state: 0 });
		await target.setImage(iconDataUri(`imgs/rating/${family}-on`), { state: 1 });

		await target.setState(reached(rating) ? 1 : 0);
	}
}

/**
 * Whether this key's star is filled.
 *
 * A row behaves like a star bar - rated 4 fills keys 1 to 4 - and the clear key is filled when the
 * image is unrated, on the same principle that a key shows the state it would put you in.
 *
 * With nothing usable selected the whole row is unfilled, rather than showing a rating left over
 * from whatever was selected before.
 */
function reached(rating: number): boolean {
	const state = client.state;

	if (!state.hasSelection) return false;

	const current = state.rating ?? 0;

	return rating === 0 ? current === 0 : current >= rating;
}

function normalise(rating: number | string | undefined): number {
	const value = typeof rating === "string" ? Number.parseInt(rating, 10) : rating;

	if (value === undefined || !Number.isFinite(value)) return 3;

	const rounded = Math.round(value);

	if (rounded <= 0) return 0;

	return Math.min(rounded, 10);
}

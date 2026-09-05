import streamDeck, {
	action,
	SingletonAction,
	type DidReceiveSettingsEvent,
	type KeyDownEvent,
	type WillAppearEvent,
} from "@elgato/streamdeck";
import { client } from "../client";

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
 */
@action({ UUID: "com.stylusecho.dtplus.rate" })
export class Rate extends SingletonAction<RateSettings> {
	override onWillAppear(ev: WillAppearEvent<RateSettings>): Promise<void> | void {
		return this.#paint(ev);
	}

	override onDidReceiveSettings(ev: DidReceiveSettingsEvent<RateSettings>): Promise<void> | void {
		return this.#paint(ev);
	}

	override async onKeyDown(ev: KeyDownEvent<RateSettings>): Promise<void> {
		const rating = normalise(ev.payload.settings.rating);

		const reply = rating === 0 ? await client.send("unrate") : await client.send("rate", rating);

		if (reply.ok) {
			await ev.action.showOk();
			return;
		}

		streamDeck.logger.warn(`rate ${rating} failed: ${reply.error}`);

		await ev.action.showAlert();
	}

	/**
	 * The key shows its rating, so a row of them reads at a glance. A title the user has set
	 * themselves wins - Stream Deck ignores setTitle in that case anyway.
	 */
	#paint(ev: WillAppearEvent<RateSettings> | DidReceiveSettingsEvent<RateSettings>): Promise<void> | void {
		if (!ev.action.isKey()) return;

		const rating = normalise(ev.payload.settings.rating);

		return ev.action.setTitle(rating === 0 ? "Clear" : `★ ${rating}`);
	}
}

function normalise(rating: number | string | undefined): number {
	const value = typeof rating === "string" ? Number.parseInt(rating, 10) : rating;

	if (value === undefined || !Number.isFinite(value)) return 3;

	const rounded = Math.round(value);

	if (rounded <= 0) return 0;

	return Math.min(rounded, 10);
}

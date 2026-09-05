import streamDeck, {
	action,
	SingletonAction,
	type DialAction,
	type DidReceiveSettingsEvent,
	type KeyAction,
	type KeyDownEvent,
	type WillAppearEvent,
} from "@elgato/streamdeck";
import { client, type ToolkitState } from "../client";

type StatusSettings = {
	/** What the key displays. */
	show?: "page" | "results" | "both";
};

/**
 * Shows where you are in the results. Mostly a display, though pressing it refreshes - a
 * reasonable thing for a status key to do, and better than a key that ignores presses.
 */
@action({ UUID: "com.stylusecho.dtplus.status" })
export class Status extends SingletonAction<StatusSettings> {
	public constructor() {
		super();

		// See the note in Toggle: subscribed for the life of the plugin on purpose
		client.onState(() => this.#paintAll());
	}

	override onWillAppear(ev: WillAppearEvent<StatusSettings>): Promise<void> | void {
		return this.#paint(ev.action, ev.payload.settings);
	}

	override onDidReceiveSettings(ev: DidReceiveSettingsEvent<StatusSettings>): Promise<void> | void {
		return this.#paint(ev.action, ev.payload.settings);
	}

	override async onKeyDown(ev: KeyDownEvent<StatusSettings>): Promise<void> {
		const reply = await client.send("refresh");

		if (reply.ok) {
			await ev.action.showOk();
		} else {
			await ev.action.showAlert();
		}
	}

	#paintAll(): void {
		for (const target of this.actions) {
			void target
				.getSettings<StatusSettings>()
				.then((settings) => this.#paint(target, settings))
				.catch((err) => streamDeck.logger.warn(`Could not repaint a status key: ${err}`));
		}
	}

	#paint(
		target: DialAction<StatusSettings> | KeyAction<StatusSettings>,
		settings: StatusSettings,
	): Promise<void> | void {
		if (!target.isKey()) return;

		return target.setTitle(format(client.connected, client.state, settings.show ?? "both"));
	}
}

function format(connected: boolean, state: ToolkitState, show: NonNullable<StatusSettings["show"]>): string {
	// Better than showing a page number from before the toolkit was closed
	if (!connected) return "Not\nconnected";

	const page = state.page ?? 0;
	const pages = state.pages ?? 0;
	const results = state.results ?? 0;

	const pageLine = pages > 0 ? `${page} / ${pages}` : "-";
	const resultsLine = results.toLocaleString();

	switch (show) {
		case "page":
			return `Page\n${pageLine}`;

		case "results":
			return `Results\n${resultsLine}`;

		default:
			return `${pageLine}\n${resultsLine}`;
	}
}

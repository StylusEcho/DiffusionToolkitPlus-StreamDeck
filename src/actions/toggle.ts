import streamDeck, {
	action,
	SingletonAction,
	type DialAction,
	type DidReceiveSettingsEvent,
	type KeyAction,
	type KeyDownEvent,
	type WillAppearEvent,
} from "@elgato/streamdeck";
import { findToggle } from "../catalogue";
import { client } from "../client";

type ToggleSettings = {
	/** Id from the catalogue. */
	toggle?: string;
};

/**
 * A command whose key reflects whether it is currently on, using the state the toolkit pushes.
 *
 * Every visible key of this type is repainted whenever state arrives, so turning review mode on
 * from the keyboard lights the deck key too.
 */
@action({ UUID: "com.stylusecho.dtplus.toggle" })
export class Toggle extends SingletonAction<ToggleSettings> {
	public constructor() {
		super();

		// Subscribed for the life of the plugin rather than tracked against visible keys: working
		// out whether the last key has gone during onWillDisappear is fiddly to get right, and
		// getting it wrong leaves a key showing a stale state. One listener costs nothing.
		client.onState(() => this.#paintAll());
	}

	override onWillAppear(ev: WillAppearEvent<ToggleSettings>): Promise<void> | void {
		return this.#paint(ev.action, ev.payload.settings);
	}

	override onDidReceiveSettings(ev: DidReceiveSettingsEvent<ToggleSettings>): Promise<void> | void {
		return this.#paint(ev.action, ev.payload.settings);
	}

	override async onKeyDown(ev: KeyDownEvent<ToggleSettings>): Promise<void> {
		const entry = findToggle(ev.payload.settings.toggle);

		if (!entry) {
			await ev.action.showAlert();
			return;
		}

		const reply = await client.send(entry.action, entry.value);

		if (!reply.ok) {
			streamDeck.logger.warn(`${entry.action} failed: ${reply.error}`);

			await ev.action.showAlert();
		}

		// The key is deliberately not painted here. The toolkit pushes the new state, which
		// repaints it - so the key shows what the toolkit actually did, not what was asked for.
	}

	#paintAll(): void {
		for (const target of this.actions) {
			void target
				.getSettings<ToggleSettings>()
				.then((settings) => this.#paint(target, settings))
				.catch((err) => streamDeck.logger.warn(`Could not repaint a toggle key: ${err}`));
		}
	}

	async #paint(target: DialAction<ToggleSettings> | KeyAction<ToggleSettings>, settings: ToggleSettings): Promise<void> {
		if (!target.isKey()) return;

		const entry = findToggle(settings.toggle);

		if (!entry) {
			await target.setTitle("Pick a\ntoggle");
			return;
		}

		// "Filter: images" reads better over two lines on a key
		await target.setTitle(entry.label.replace(/:? /, "\n"));

		await target.setState(entry.isOn(client.state) ? 1 : 0);
	}
}

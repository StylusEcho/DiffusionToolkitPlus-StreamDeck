import streamDeck, {
	action,
	SingletonAction,
	type DidReceiveSettingsEvent,
	type KeyDownEvent,
	type WillAppearEvent,
} from "@elgato/streamdeck";
import { findCommand } from "../catalogue";
import { client } from "../client";

type CommandSettings = {
	/** Id from the catalogue. */
	command?: string;
};

/**
 * Fires one of the toolkit's commands. Everything the toolkit reports no state for lives here -
 * see the Toggle action for the ones whose key can light up.
 */
@action({ UUID: "com.stylusecho.dtplus.command" })
export class Command extends SingletonAction<CommandSettings> {
	override onWillAppear(ev: WillAppearEvent<CommandSettings>): Promise<void> | void {
		return this.#paint(ev);
	}

	override onDidReceiveSettings(ev: DidReceiveSettingsEvent<CommandSettings>): Promise<void> | void {
		return this.#paint(ev);
	}

	override async onKeyDown(ev: KeyDownEvent<CommandSettings>): Promise<void> {
		const entry = findCommand(ev.payload.settings.command);

		if (!entry) {
			// Nothing picked in the property inspector yet
			await ev.action.showAlert();
			return;
		}

		const reply = await client.send(entry.action, entry.value);

		if (reply.ok) {
			await ev.action.showOk();
			return;
		}

		streamDeck.logger.warn(`${entry.action} failed: ${reply.error}`);

		await ev.action.showAlert();
	}

	#paint(ev: WillAppearEvent<CommandSettings> | DidReceiveSettingsEvent<CommandSettings>): Promise<void> | void {
		if (!ev.action.isKey()) return;

		const entry = findCommand(ev.payload.settings.command);

		return ev.action.setTitle(entry ? wrap(entry.label) : "Pick a\ncommand");
	}
}

/**
 * A key is about eight characters wide, so long labels are broken onto a second line rather than
 * being clipped.
 */
function wrap(label: string): string {
	const words = label.split(" ");

	const lines: string[] = [];

	let current = "";

	for (const word of words) {
		if (current.length === 0) {
			current = word;
		} else if (current.length + word.length + 1 <= 9) {
			current += ` ${word}`;
		} else {
			lines.push(current);
			current = word;
		}
	}

	if (current.length > 0) {
		lines.push(current);
	}

	return lines.join("\n");
}

import streamDeck, {
	action,
	SingletonAction,
	type DialAction,
	type DidReceiveSettingsEvent,
	type KeyAction,
	type KeyDownEvent,
	type WillAppearEvent,
} from "@elgato/streamdeck";
import { commandIcon, findCommand } from "../catalogue";
import { client } from "../client";
import { iconDataUri } from "../icons";

type CommandSettings = {
	/** Id from the catalogue. */
	command?: string;
};

/**
 * Runs one of the toolkit's commands, and shows which one it is.
 *
 * Where the toolkit reports state for a command, the key also shows it: a favourite key is lit when
 * the selected image is already a favourite, a "go to Images" key is lit when you are already
 * there. The rest have one look and never light up.
 */
@action({ UUID: "com.stylusecho.dtplus.command" })
export class Command extends SingletonAction<CommandSettings> {
	public constructor() {
		super();

		// Subscribed for the life of the plugin; see the note in Toggle
		client.onState(() => this.#paintAll());
	}

	override onWillAppear(ev: WillAppearEvent<CommandSettings>): Promise<void> | void {
		return this.#paint(ev.action, ev.payload.settings);
	}

	override onDidReceiveSettings(ev: DidReceiveSettingsEvent<CommandSettings>): Promise<void> | void {
		return this.#paint(ev.action, ev.payload.settings);
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
			// Only for the commands whose result is invisible. Anything the toolkit reports state
			// for repaints itself, and a tick over the top of that is just noise.
			if (!entry.isOn) await ev.action.showOk();

			return;
		}

		streamDeck.logger.warn(`${entry.action} failed: ${reply.error}`);

		await ev.action.showAlert();
	}

	#paintAll(): void {
		for (const target of this.actions) {
			void target
				.getSettings<CommandSettings>()
				.then((settings) => this.#paint(target, settings))
				.catch((err) => streamDeck.logger.warn(`Could not repaint a command key: ${err}`));
		}
	}

	async #paint(
		target: DialAction<CommandSettings> | KeyAction<CommandSettings>,
		settings: CommandSettings,
	): Promise<void> {
		if (!target.isKey()) return;

		const entry = findCommand(settings.command);

		if (!entry) {
			await target.setTitle("Pick a\ncommand");
			return;
		}

		await target.setTitle(wrap(entry.label));

		// undefined falls back to the image in the manifest, which is better than a blank key
		await target.setImage(iconDataUri(commandIcon(entry, client.state)));
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

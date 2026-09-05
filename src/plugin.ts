import streamDeck from "@elgato/streamdeck";
import { Command } from "./actions/command";
import { Rate } from "./actions/rate";
import { Status } from "./actions/status";
import { Toggle } from "./actions/toggle";
import { client, setLogger } from "./client";

/**
 * Plugin-wide settings, shared by every key and edited from any property inspector.
 */
type GlobalSettings = {
	/**
	 * Must match Settings -> General -> Port in Diffusion Toolkit.
	 *
	 * A string as well as a number, because the property inspector's text field stores what was
	 * typed rather than a parsed value.
	 */
	port?: number | string;
};

streamDeck.logger.setLevel("info");

// The client takes its logger rather than importing one, so it can be tested against a plain socket
setLogger(streamDeck.logger);

streamDeck.actions.registerAction(new Rate());
streamDeck.actions.registerAction(new Command());
streamDeck.actions.registerAction(new Toggle());
streamDeck.actions.registerAction(new Status());

// Repoint the connection when the port is changed in a property inspector
streamDeck.settings.onDidReceiveGlobalSettings<GlobalSettings>((ev) => {
	client.configure(ev.settings.port);
});

await streamDeck.connect();

// Reads the stored port, which arrives via the handler above and starts the connection
const settings = await streamDeck.settings.getGlobalSettings<GlobalSettings>();

client.configure(settings.port);

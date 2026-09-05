/**
 * Binds plain HTML form controls to Stream Deck settings.
 *
 * Deliberately has no dependencies. An earlier version pulled the sdpi-components library from a
 * CDN, which meant the settings panel rendered as nothing whenever that script did not load - and a
 * plugin whose entire job is talking to another application on the same machine has no business
 * needing the internet to draw its own settings.
 *
 * Mark a control with data-setting="name" to bind it to this action's settings, or add data-global
 * to bind it to the plugin-wide settings instead.
 *
 * The message shapes come from the Stream Deck API: send {event, context, payload} to write and
 * {event, context} to read; receive didReceiveSettings / didReceiveGlobalSettings with the values
 * under payload.settings.
 */

let socket;
let uuid;

/** Written back on every change, so a partial edit never drops the other keys. */
let settings = {};
let globalSettings = {};

// Called by Stream Deck when it loads this page
// eslint-disable-next-line no-unused-vars
function connectElgatoStreamDeckSocket(inPort, inUUID, inRegisterEvent, inInfo, inActionInfo) {
	uuid = inUUID;

	// Populate straight away from what Stream Deck already handed us, so the controls are correct
	// before the round trip below finishes
	try {
		const actionInfo = typeof inActionInfo === "string" ? JSON.parse(inActionInfo) : inActionInfo;
		settings = actionInfo?.payload?.settings ?? {};
	} catch {
		settings = {};
	}

	socket = new WebSocket(`ws://127.0.0.1:${inPort}`);

	socket.addEventListener("open", () => {
		send({ event: inRegisterEvent, uuid });

		send({ event: "getSettings", context: uuid });
		send({ event: "getGlobalSettings", context: uuid });
	});

	socket.addEventListener("message", (event) => {
		let message;

		try {
			message = JSON.parse(event.data);
		} catch {
			return;
		}

		if (message.event === "didReceiveSettings") {
			settings = message.payload?.settings ?? {};
			apply();
		} else if (message.event === "didReceiveGlobalSettings") {
			globalSettings = message.payload?.settings ?? {};
			apply();
		}
	});

	apply();
	wire();
}

function send(message) {
	if (socket && socket.readyState === WebSocket.OPEN) {
		socket.send(JSON.stringify(message));
	}
}

function controls() {
	return document.querySelectorAll("[data-setting]");
}

/** Pushes stored values into the controls. */
function apply() {
	for (const control of controls()) {
		const name = control.dataset.setting;
		const store = control.hasAttribute("data-global") ? globalSettings : settings;

		const value = store[name];

		if (value === undefined || value === null) {
			// Leave whatever the markup declared as the default, and record it so the plugin sees
			// the same value the panel is showing
			if (control.value !== "") {
				write(control, false);
			}
			continue;
		}

		if (control.value !== String(value)) {
			control.value = String(value);
		}
	}
}

function wire() {
	for (const control of controls()) {
		const event = control.tagName === "SELECT" ? "change" : "input";

		control.addEventListener(event, () => write(control, true));
	}
}

function write(control, fromUser) {
	const name = control.dataset.setting;
	const isGlobal = control.hasAttribute("data-global");

	const store = isGlobal ? globalSettings : settings;

	if (store[name] === control.value && fromUser) return;

	store[name] = control.value;

	send({
		event: isGlobal ? "setGlobalSettings" : "setSettings",
		context: uuid,
		payload: store,
	});
}

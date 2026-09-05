/**
 * Exercises the property inspector bridge against a stand-in for Stream Deck.
 *
 * ui/pi.js is what the settings panel is built on, and a panel that silently renders nothing is
 * exactly the failure this replaced, so the binding is checked rather than assumed.
 *
 *     npm run test
 */

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";

let failures = 0;

function check(name, fn) {
	try {
		fn();
		console.log(`  ok  ${name}`);
	} catch (err) {
		failures++;
		console.error(`FAIL  ${name}\n      ${err.message}`);
	}
}

/** The handful of DOM surface pi.js actually touches. */
function element(tagName, setting, { global = false, value = "" } = {}) {
	const listeners = {};

	return {
		tagName,
		value,
		dataset: { setting },
		hasAttribute: (name) => name === "data-global" && global,
		addEventListener: (event, fn) => ((listeners[event] ??= []).push(fn)),
		fire(event) {
			for (const fn of listeners[event] ?? []) fn();
		},
	};
}

function load(elements) {
	const sent = [];
	const listeners = {};

	let created;

	class FakeSocket {
		static OPEN = 1;

		readyState = 0;

		constructor() {
			// `let socket` inside pi.js is a lexical binding, so it never appears on the context
			// object - the instance has to be captured here instead
			created = this;
		}

		addEventListener(event, fn) {
			(listeners[event] ??= []).push(fn);
		}

		send(data) {
			sent.push(JSON.parse(data));
		}
	}

	const context = vm.createContext({
		document: { querySelectorAll: () => elements },
		WebSocket: FakeSocket,
		JSON,
		console,
	});

	vm.runInContext(readFileSync("com.stylusecho.dtplus.sdPlugin/ui/pi.js", "utf8"), context);

	return {
		sent,
		connect(actionInfo = { payload: { settings: {} } }) {
			context.connectElgatoStreamDeckSocket(28196, "pi-uuid", "registerPropertyInspector", "{}", JSON.stringify(actionInfo));
		},
		open() {
			created.readyState = FakeSocket.OPEN;

			for (const fn of listeners.open ?? []) fn();
		},
		receive(message) {
			this.receiveRaw(JSON.stringify(message));
		},
		receiveRaw(data) {
			for (const fn of listeners.message ?? []) fn({ data });
		},
	};
}

console.log("property inspector");

check("registers, then asks for both sets of settings", () => {
	const select = element("SELECT", "command", { value: "nav.next" });
	const sd = load([select]);

	sd.connect();
	sd.open();

	assert.deepEqual(sd.sent[0], { event: "registerPropertyInspector", uuid: "pi-uuid" });
	assert.deepEqual(sd.sent[1], { event: "getSettings", context: "pi-uuid" });
	assert.deepEqual(sd.sent[2], { event: "getGlobalSettings", context: "pi-uuid" });
});

check("shows the value Stream Deck already had, without waiting for a round trip", () => {
	const select = element("SELECT", "command", { value: "nav.next" });
	const sd = load([select]);

	sd.connect({ payload: { settings: { command: "refresh" } } });

	assert.equal(select.value, "refresh");
});

check("applies settings that arrive later", () => {
	const select = element("SELECT", "command", { value: "nav.next" });
	const sd = load([select]);

	sd.connect();
	sd.open();

	sd.receive({ event: "didReceiveSettings", payload: { settings: { command: "view.deleted" } } });

	assert.equal(select.value, "view.deleted");
});

check("writes a change back as setSettings", () => {
	const select = element("SELECT", "command", { value: "nav.next" });
	const sd = load([select]);

	sd.connect();
	sd.open();

	select.value = "page.next";
	select.fire("change");

	const last = sd.sent.at(-1);

	assert.equal(last.event, "setSettings");
	assert.equal(last.context, "pi-uuid");
	assert.equal(last.payload.command, "page.next");
});

check("routes a global control to setGlobalSettings", () => {
	const port = element("INPUT", "port", { global: true, value: "9760" });
	const sd = load([port]);

	sd.connect();
	sd.open();

	port.value = "9999";
	port.fire("input");

	const last = sd.sent.at(-1);

	assert.equal(last.event, "setGlobalSettings");
	assert.equal(last.payload.port, "9999");
});

check("keeps the other keys when one control changes", () => {
	const rating = element("SELECT", "rating", { value: "3" });
	const sd = load([rating]);

	sd.connect({ payload: { settings: { rating: "3", somethingElse: "keep me" } } });
	sd.open();

	rating.value = "7";
	rating.fire("change");

	const last = sd.sent.at(-1);

	assert.equal(last.payload.rating, "7");
	assert.equal(last.payload.somethingElse, "keep me", "dropped an unrelated setting");
});

check("records the markup default when nothing is stored yet", () => {
	const select = element("SELECT", "toggle", { value: "review" });
	const sd = load([select]);

	sd.connect();
	sd.open();

	sd.receive({ event: "didReceiveSettings", payload: { settings: {} } });

	const written = sd.sent.filter((m) => m.event === "setSettings").at(-1);

	assert.notEqual(written, undefined, "never told the plugin what the panel is showing");
	assert.equal(written.payload.toggle, "review");
});

check("action and global controls do not write into each other", () => {
	const select = element("SELECT", "toggle", { value: "review" });
	const port = element("INPUT", "port", { global: true, value: "9760" });
	const sd = load([select, port]);

	sd.connect();
	sd.open();

	select.value = "autoadvance";
	select.fire("change");

	const actionWrite = sd.sent.filter((m) => m.event === "setSettings").at(-1);

	assert.equal(actionWrite.payload.port, undefined, "action settings picked up the global port");
});

check("survives a message that is not json and keeps working", () => {
	const select = element("SELECT", "command", { value: "nav.next" });
	const sd = load([select]);

	sd.connect();
	sd.open();

	assert.doesNotThrow(() => sd.receiveRaw("<html>not json at all"));

	// Still bound afterwards
	select.value = "refresh";
	select.fire("change");

	assert.equal(sd.sent.at(-1).payload.command, "refresh");
});

console.log(failures === 0 ? "\nall inspector checks passed" : `\n${failures} check(s) failed`);

process.exit(failures === 0 ? 0 : 1);

/**
 * Exercises the client against a stand-in for Diffusion Toolkit.
 *
 * The framing, request matching and reconnect logic are the parts most likely to be wrong and the
 * only parts that can be checked without a Stream Deck, so they are checked here.
 *
 *     npm run test
 */

import assert from "node:assert/strict";
import net from "node:net";
import { client, setLogger } from "../dist-test/client.js";

const quiet = { info: () => undefined, warn: () => undefined };

setLogger(quiet);

let failures = 0;

function check(name, fn) {
	return Promise.resolve()
		.then(fn)
		.then(() => console.log(`  ok  ${name}`))
		.catch((err) => {
			failures++;
			console.error(`FAIL  ${name}\n      ${err.message}`);
		});
}

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function until(predicate, timeoutMs = 4000) {
	const deadline = Date.now() + timeoutMs;

	while (Date.now() < deadline) {
		if (predicate()) return;
		await wait(25);
	}

	throw new Error("timed out waiting for a condition");
}

/**
 * Stands in for the toolkit's listener: newline-delimited JSON, replies echoing the request id.
 */
function startFakeToolkit(port, options = {}) {
	const received = [];
	const sockets = new Set();

	const server = net.createServer((socket) => {
		sockets.add(socket);
		socket.on("close", () => sockets.delete(socket));
		socket.setEncoding("utf8");

		if (options.greeting !== false) {
			socket.write(JSON.stringify({ event: "state", page: 1, pages: 9, results: 42 }) + "\n");
		}

		let buffer = "";

		socket.on("data", (chunk) => {
			buffer += chunk;

			let newline;
			while ((newline = buffer.indexOf("\n")) >= 0) {
				const line = buffer.slice(0, newline);
				buffer = buffer.slice(newline + 1);

				if (!line.trim()) continue;

				const request = JSON.parse(line);
				received.push(request);

				if (options.silent) continue;

				socket.write(JSON.stringify({ id: request.id, ok: request.action !== "boom", error: request.action === "boom" ? "nope" : null }) + "\n");
			}
		});

		socket.on("error", () => undefined);
	});

	return new Promise((resolve) => {
		server.listen(port, "127.0.0.1", () =>
			resolve({
				received,
				push: (payload) => {
					for (const socket of sockets) socket.write(JSON.stringify(payload) + "\n");
				},
				pushRaw: (text) => {
					for (const socket of sockets) socket.write(text);
				},
				dropClients: () => {
					for (const socket of sockets) socket.destroy();
				},
				close: () =>
					new Promise((done) => {
						for (const socket of sockets) socket.destroy();
						server.close(() => done());
					}),
			}),
		);
	});
}

const PORT = 49_761;

console.log("client");

const toolkit = await startFakeToolkit(PORT);

client.configure(PORT);

await check("connects and reports connected", async () => {
	await until(() => client.connected);
});

await check("applies the state pushed on connect", async () => {
	await until(() => client.state.pages === 9);
	assert.equal(client.state.page, 1);
	assert.equal(client.state.results, 42);
});

await check("sends a command and resolves its reply", async () => {
	const reply = await client.send("rate", 3);
	assert.deepEqual(reply, { ok: true, error: null });

	const last = toolkit.received.at(-1);
	assert.equal(last.action, "rate");
	assert.equal(last.value, 3);
	assert.equal(typeof last.id, "number");
});

await check("omits value when there is none", async () => {
	await client.send("nav.next");
	assert.equal("value" in toolkit.received.at(-1), false);
});

await check("surfaces a refusal rather than throwing", async () => {
	const reply = await client.send("boom");
	assert.equal(reply.ok, false);
	assert.equal(reply.error, "nope");
});

await check("matches replies to their own request when several are in flight", async () => {
	const [a, b, c] = await Promise.all([client.send("one"), client.send("boom"), client.send("three")]);
	assert.equal(a.ok, true);
	assert.equal(b.ok, false);
	assert.equal(c.ok, true);
});

await check("notifies state listeners", async () => {
	let seen;
	const off = client.onState((state) => (seen = state));

	toolkit.push({ event: "state", page: 4, pages: 9, reviewing: true });

	await until(() => seen?.page === 4);
	assert.equal(client.state.reviewing, true);

	off();
});

await check("reassembles a message split across packets", async () => {
	const line = JSON.stringify({ event: "state", page: 7, pages: 9 }) + "\n";

	const half = Math.floor(line.length / 2);

	// TCP may split a write anywhere; the client must not act on half a message
	toolkit.pushRaw(line.slice(0, half));

	await wait(50);
	assert.notEqual(client.state.page, 7, "acted on a partial line");

	toolkit.pushRaw(line.slice(half));

	await until(() => client.state.page === 7);
});

await check("handles several messages arriving in one packet", async () => {
	const lines =
		JSON.stringify({ event: "state", page: 11, pages: 12 }) + "\n" +
		JSON.stringify({ event: "state", page: 12, pages: 12 }) + "\n";

	toolkit.pushRaw(lines);

	await until(() => client.state.page === 12);
});

await check("ignores a line that is not json and keeps serving", async () => {
	toolkit.pushRaw("this is not json\n");

	await wait(50);

	const reply = await client.send("still.alive");
	assert.equal(reply.ok, true, "connection did not survive an unparseable line");
});

await check("reports not connected once the toolkit goes away", async () => {
	toolkit.dropClients();

	await until(() => !client.connected);

	const reply = await client.send("rate", 3);
	assert.equal(reply.ok, false);
	assert.equal(reply.error, "not connected");
});

await check("clears stale state on disconnect", async () => {
	assert.deepEqual(client.state, {});
});

await check("reconnects by itself once it comes back", async () => {
	await until(() => client.connected, 8000);
	assert.equal(client.state.pages, 9);
});

await toolkit.close();

console.log(failures === 0 ? "\nall client checks passed" : `\n${failures} check(s) failed`);

process.exit(failures === 0 ? 0 : 1);

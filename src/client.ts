import net from "node:net";

/**
 * Just enough of the Stream Deck logger to report what happens here.
 *
 * Injected rather than imported so this module can be exercised against a plain socket, without
 * the Stream Deck runtime being present.
 */
export type ClientLogger = {
	info(message: string): unknown;
	warn(message: string): unknown;
};

let log: ClientLogger = {
	info: () => undefined,
	warn: () => undefined,
};

export function setLogger(logger: ClientLogger): void {
	log = logger;
}

/**
 * State Diffusion Toolkit pushes whenever it changes, and once on connect.
 *
 * Everything is optional because a future build of the toolkit may send more than this one knows
 * about, and an older one may send less.
 */
export type ToolkitState = {
	page?: number;
	pages?: number;
	results?: number;
	reviewing?: boolean;
	hasReviewSession?: boolean;
	autoAdvance?: boolean;
	fitToPreview?: boolean;
	actualSize?: boolean;
	hasFilter?: boolean;
	busy?: boolean;
};

export type Reply = {
	ok: boolean;
	error?: string | null;
};

type Pending = {
	resolve: (reply: Reply) => void;
	timer: NodeJS.Timeout;
};

const DEFAULT_PORT = 9760;

/**
 * Must be the loopback address, not "localhost". The toolkit binds IPv4 loopback only, and Windows
 * resolves the name to ::1 first - which fails in a way that looks exactly like nothing listening.
 */
const HOST = "127.0.0.1";

/** How long to wait for a reply before giving up on it. */
const REPLY_TIMEOUT_MS = 5_000;

const RECONNECT_MIN_MS = 1_000;
const RECONNECT_MAX_MS = 15_000;

/**
 * Holds the one connection to Diffusion Toolkit that every key on the deck shares.
 *
 * The toolkit is not always running, and is not expected to be, so this reconnects quietly in the
 * background forever rather than treating a closed socket as an error worth reporting.
 */
class ToolkitClient {
	#socket?: net.Socket;
	#buffer = "";
	#nextId = 1;
	#pending = new Map<number, Pending>();
	#reconnectDelay = RECONNECT_MIN_MS;
	#reconnectTimer?: NodeJS.Timeout;
	#port = DEFAULT_PORT;
	#stopped = false;

	/** Last state received, so a key appearing later can paint itself immediately. */
	state: ToolkitState = {};

	connected = false;

	readonly #stateListeners = new Set<(state: ToolkitState) => void>();
	readonly #connectionListeners = new Set<(connected: boolean) => void>();

	/**
	 * Points the client at a port, reconnecting if it differs from the current one.
	 *
	 * Accepts a string as well as a number: a text field in the property inspector stores what
	 * was typed, not a parsed value.
	 */
	configure(port: number | string | undefined): void {
		const parsed = typeof port === "string" ? Number.parseInt(port.trim(), 10) : port;

		const next = Number.isInteger(parsed) && parsed! > 0 && parsed! < 65536 ? parsed! : DEFAULT_PORT;

		this.#stopped = false;

		if (next === this.#port && this.#socket) return;

		this.#port = next;

		this.#disconnect();
		this.#connect();
	}

	onState(listener: (state: ToolkitState) => void): () => void {
		this.#stateListeners.add(listener);

		return () => this.#stateListeners.delete(listener);
	}

	onConnectionChange(listener: (connected: boolean) => void): () => void {
		this.#connectionListeners.add(listener);

		return () => this.#connectionListeners.delete(listener);
	}

	/**
	 * Sends one command and waits for its reply.
	 *
	 * Never rejects - a key press should show a failure on the key, not raise an unhandled
	 * rejection out of an event handler.
	 */
	send(action: string, value?: number | string): Promise<Reply> {
		if (!this.#socket || !this.connected) {
			return Promise.resolve({ ok: false, error: "not connected" });
		}

		const id = this.#nextId++;

		const request: Record<string, unknown> = { id, action };

		if (value !== undefined) {
			request.value = value;
		}

		return new Promise<Reply>((resolve) => {
			const timer = setTimeout(() => {
				this.#pending.delete(id);
				resolve({ ok: false, error: "no reply" });
			}, REPLY_TIMEOUT_MS);

			this.#pending.set(id, { resolve, timer });

			try {
				this.#socket!.write(JSON.stringify(request) + "\n");
			} catch (err) {
				clearTimeout(timer);
				this.#pending.delete(id);
				resolve({ ok: false, error: String(err) });
			}
		});
	}

	#connect(): void {
		if (this.#stopped) return;

		const socket = net.createConnection({ host: HOST, port: this.#port });

		this.#socket = socket;

		socket.setEncoding("utf8");

		// Commands are tiny and latency matters more than packing them together
		socket.setNoDelay(true);

		socket.on("connect", () => {
			this.#reconnectDelay = RECONNECT_MIN_MS;

			this.#setConnected(true);

			log.info(`Connected to Diffusion Toolkit on ${HOST}:${this.#port}`);
		});

		socket.on("data", (chunk: string) => this.#receive(chunk));

		// Expected whenever the toolkit is not running, so this is not logged as an error
		socket.on("error", () => undefined);

		socket.on("close", () => {
			if (socket !== this.#socket) return;

			this.#setConnected(false);
			this.#failPending("disconnected");
			this.#scheduleReconnect();
		});
	}

	#receive(chunk: string): void {
		this.#buffer += chunk;

		let newline = this.#buffer.indexOf("\n");

		while (newline >= 0) {
			const line = this.#buffer.slice(0, newline).trim();

			this.#buffer = this.#buffer.slice(newline + 1);

			if (line.length > 0) {
				this.#handleLine(line);
			}

			newline = this.#buffer.indexOf("\n");
		}

		// A peer that never sends a newline must not be allowed to grow this without limit
		if (this.#buffer.length > 1_000_000) {
			this.#buffer = "";
		}
	}

	#handleLine(line: string): void {
		let message: Record<string, unknown>;

		try {
			message = JSON.parse(line);
		} catch {
			log.warn(`Ignoring unparseable line from Diffusion Toolkit: ${line.slice(0, 200)}`);
			return;
		}

		if (message.event === "state") {
			this.state = message as ToolkitState;

			for (const listener of this.#stateListeners) {
				listener(this.state);
			}

			return;
		}

		if (typeof message.id === "number") {
			const pending = this.#pending.get(message.id);

			if (pending) {
				clearTimeout(pending.timer);
				this.#pending.delete(message.id);

				pending.resolve({
					ok: message.ok === true,
					error: typeof message.error === "string" ? message.error : null,
				});
			}
		}
	}

	#failPending(error: string): void {
		for (const pending of this.#pending.values()) {
			clearTimeout(pending.timer);
			pending.resolve({ ok: false, error });
		}

		this.#pending.clear();
	}

	#setConnected(connected: boolean): void {
		if (this.connected === connected) return;

		this.connected = connected;

		if (!connected) {
			// Stale numbers on a key are worse than none
			this.state = {};
		}

		for (const listener of this.#connectionListeners) {
			listener(connected);
		}

		for (const listener of this.#stateListeners) {
			listener(this.state);
		}
	}

	#scheduleReconnect(): void {
		if (this.#stopped || this.#reconnectTimer) return;

		this.#reconnectTimer = setTimeout(() => {
			this.#reconnectTimer = undefined;
			this.#connect();
		}, this.#reconnectDelay);

		// Back off, so a toolkit that stays closed all day costs almost nothing
		this.#reconnectDelay = Math.min(this.#reconnectDelay * 2, RECONNECT_MAX_MS);
	}

	#disconnect(): void {
		if (this.#reconnectTimer) {
			clearTimeout(this.#reconnectTimer);
			this.#reconnectTimer = undefined;
		}

		const socket = this.#socket;

		this.#socket = undefined;
		this.#buffer = "";

		this.#setConnected(false);
		this.#failPending("disconnected");

		socket?.destroy();
	}
}

export const client = new ToolkitClient();

// Checks manifest.json against the schema shipped with the SDK, and that every image it names
// actually exists as both name.png and name@2x.png.
import Ajv from "ajv";
import addFormats from "ajv-formats";
import { execFileSync } from "node:child_process";
import { readFileSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";

const pluginDir = "com.stylusecho.dtplus.sdPlugin";

const schema = JSON.parse(readFileSync("node_modules/@elgato/schemas/streamdeck/plugins/manifest.json", "utf8"));
const manifest = JSON.parse(readFileSync(join(pluginDir, "manifest.json"), "utf8"));

const ajv = new Ajv({ strict: false, allErrors: true });
addFormats(ajv);

const validate = ajv.compile(schema);

let failed = false;

if (!validate(manifest)) {
	failed = true;
	for (const err of validate.errors ?? []) {
		console.error(`schema: ${err.instancePath || "/"} ${err.message}`);
	}
} else {
	console.log("schema: manifest is valid");
}

const images = [manifest.Icon, manifest.CategoryIcon];

for (const action of manifest.Actions ?? []) {
	images.push(action.Icon);
	for (const state of action.States ?? []) images.push(state.Image);

	if (action.PropertyInspectorPath && !existsSync(join(pluginDir, action.PropertyInspectorPath))) {
		failed = true;
		console.error(`missing property inspector: ${action.PropertyInspectorPath}`);
	}
}

for (const image of images.filter(Boolean)) {
	for (const suffix of [".png", "@2x.png"]) {
		const path = join(pluginDir, image + suffix);
		if (!existsSync(path)) {
			failed = true;
			console.error(`missing image: ${path}`);
		}
	}
}

if (!existsSync(join(pluginDir, manifest.CodePath))) {
	failed = true;
	console.error(`missing code path: ${manifest.CodePath}`);
}

// Existing on this machine is not enough. The .sdPlugin folder is what people install, so
// anything the manifest points at has to survive a clone - a bundle excluded by .gitignore
// produces a folder that looks complete and that Stream Deck cannot launch, with no plugin log
// to explain why because the process never starts.
for (const required of [manifest.CodePath, ...images.map((i) => i + ".png")]) {
	const path = join(pluginDir, required);

	try {
		execFileSync("git", ["check-ignore", "-q", path], { stdio: "ignore" });

		failed = true;
		console.error(`ignored by git but needed at runtime: ${path}`);
	} catch (err) {
		// A non-zero exit means "not ignored", which is what we want. Anything else (no git,
		// not a repository) should not fail the build.
		if (err.status !== 1) {
			console.warn(`could not check whether ${path} is ignored: ${err.message}`);
		}
	}
}

if (failed) process.exit(1);

console.log("assets: every image, property inspector and code path referenced by the manifest exists");

// The property inspectors hardcode their dropdown options, so check they still match the
// catalogue the plugin dispatches from. A silent mismatch means a key that does nothing.
function idsFromCatalogue(arrayName) {
	const source = readFileSync("src/catalogue.ts", "utf8");
	const start = source.indexOf(`export const ${arrayName}`);
	if (start < 0) throw new Error(`${arrayName} not found in catalogue`);

	const end = source.indexOf("\n];", start);
	const body = source.slice(start, end);

	return [...body.matchAll(/\bid:\s*"([^"]+)"/g)].map((m) => m[1]).sort();
}

function optionsFromInspector(file, setting) {
	const html = readFileSync(join(pluginDir, "ui", file), "utf8");
	const start = html.indexOf(`data-setting="${setting}"`);
	if (start < 0) throw new Error(`${setting} select not found in ${file}`);

	const end = html.indexOf("</select>", start);
	if (end < 0) throw new Error(`unterminated select for ${setting} in ${file}`);

	const body = html.slice(start, end);

	return [...body.matchAll(/<option value="([^"]*)"/g)].map((m) => m[1]).sort();
}

// The property inspectors must not reach the network. They were briefly loading a component
// library from a CDN, and when that did not load the panel rendered as nothing but the built-in
// title field - with no error anywhere to say why.
function checkNoExternalResources() {
	for (const file of ["rate.html", "command.html", "toggle.html", "status.html"]) {
		const html = readFileSync(join(pluginDir, "ui", file), "utf8");

		const refs = [
			...[...html.matchAll(/<script[^>]+src="([^"]+)"/g)].map((m) => m[1]),
			...[...html.matchAll(/<link[^>]+href="([^"]+)"/g)].map((m) => m[1]),
		];

		for (const ref of refs) {
			if (/^[a-z]+:/i.test(ref) || ref.startsWith("//")) {
				failed = true;
				console.error(`${file}: loads an external resource: ${ref}`);
				continue;
			}

			if (!existsSync(join(pluginDir, "ui", ref))) {
				failed = true;
				console.error(`${file}: references a missing file: ${ref}`);
			}
		}
	}

	if (!failed) console.log("inspectors: no external resources, every reference resolves locally");
}

checkNoExternalResources();

// The per-command key images are chosen at runtime by name, so the manifest never mentions them and
// the asset check above cannot see them. A missing one shows up as a blank key.
{
	const source = readFileSync("src/catalogue.ts", "utf8");

	const start = source.indexOf("export const COMMANDS");
	const body = source.slice(start, source.indexOf("\n];", start));

	let missing = 0;
	let checked = 0;

	for (const line of body.split("\n")) {
		const id = line.match(/\bid:\s*"([^"]+)"/)?.[1];

		if (!id) continue;

		const slug = id.replace(/\./g, "-");

		// Commands that report state have a lit and an unlit image; the rest have one
		const names = /\bisOn:/.test(line) ? [`${slug}-on`, `${slug}-off`] : [slug];

		for (const name of names) {
			for (const suffix of [".png", "@2x.png"]) {
				checked++;

				const path = join(pluginDir, "imgs", "commands", name + suffix);

				if (!existsSync(path)) {
					failed = true;
					missing++;
					console.error(`missing command icon: imgs/commands/${name}${suffix}`);
				}
			}
		}
	}

	// The rating keys pick their star the same way, by name at runtime
	for (const name of ["star-on", "star-off", "clear-on", "clear-off"]) {
		for (const suffix of [".png", "@2x.png"]) {
			checked++;

			const path = join(pluginDir, "imgs", "rating", name + suffix);

			if (!existsSync(path)) {
				failed = true;
				missing++;
				console.error(`missing rating icon: imgs/rating/${name}${suffix}`);
			}
		}
	}

	if (missing === 0) console.log(`runtime icons: ${checked} command and rating icons present`);
}

// Stream Deck keys some of its caching off the plugin version, so an update that does not bump it
// can leave the old property inspector on screen. Keeping the two files in step means there is one
// number to bump, not two to forget.
{
	const pkg = JSON.parse(readFileSync("package.json", "utf8"));

	const manifestVersion = String(manifest.Version ?? "");
	const parts = manifestVersion.split(".");

	if (parts.length !== 4) {
		failed = true;
		console.error(`version: manifest Version must have four parts, got "${manifestVersion}"`);
	} else if (parts.slice(0, 3).join(".") !== pkg.version) {
		failed = true;
		console.error(`version: manifest ${manifestVersion} and package.json ${pkg.version} disagree`);
	} else {
		console.log(`version: ${manifestVersion}`);
	}
}

for (const [file, setting, arrayName] of [
	["command.html", "command", "COMMANDS"],
	["toggle.html", "toggle", "TOGGLES"],
]) {
	const expected = idsFromCatalogue(arrayName);
	const actual = optionsFromInspector(file, setting);

	const missing = expected.filter((id) => !actual.includes(id));
	const extra = actual.filter((id) => !expected.includes(id));

	if (missing.length || extra.length) {
		failed = true;
		if (missing.length) console.error(`${file}: missing options for ${missing.join(", ")}`);
		if (extra.length) console.error(`${file}: options with no catalogue entry: ${extra.join(", ")}`);
	} else {
		console.log(`${file}: ${actual.length} options match ${arrayName}`);
	}
}

if (failed) process.exit(1);

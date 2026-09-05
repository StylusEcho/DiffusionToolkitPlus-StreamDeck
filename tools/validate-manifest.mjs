// Checks manifest.json against the schema shipped with the SDK, and that every image it names
// actually exists as both name.png and name@2x.png.
import Ajv from "ajv";
import addFormats from "ajv-formats";
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
	const start = html.indexOf(`setting="${setting}"`);
	if (start < 0) throw new Error(`${setting} select not found in ${file}`);

	const end = html.indexOf("</sdpi-select>", start);
	const body = html.slice(start, end);

	return [...body.matchAll(/<option value="([^"]*)"/g)].map((m) => m[1]).sort();
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

import commonjs from "@rollup/plugin-commonjs";
import nodeResolve from "@rollup/plugin-node-resolve";
import typescript from "@rollup/plugin-typescript";

const sdPlugin = "com.stylusecho.dtplus.sdPlugin";

/**
 * Stream Deck runs a single bundled file, so everything is rolled into bin/plugin.js. The
 * .sdPlugin folder is what gets installed; src/ and node_modules/ are not shipped.
 */
export default {
	input: "src/plugin.ts",
	output: {
		file: `${sdPlugin}/bin/plugin.js`,
		format: "es",
		sourcemap: true,
		sourcemapPathTransform: (relative) => relative.replace(/^\.\.\//, ""),
	},
	plugins: [
		typescript({
			tsconfig: "./tsconfig.json",
			// The shared tsconfig is set up for checking rather than emitting
			compilerOptions: { noEmit: false, outDir: undefined, declaration: false, sourceMap: true },
		}),
		nodeResolve({ browser: false, exportConditions: ["node"], preferBuiltins: true }),
		commonjs(),
	],
	external: [/^node:/],
};

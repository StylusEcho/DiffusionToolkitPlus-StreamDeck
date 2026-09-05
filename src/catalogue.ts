import type { ToolkitState } from "./client";

/**
 * One thing a key can do. Some carry a predicate saying how the toolkit reports their state, so
 * the key can be drawn lit; the rest simply fire.
 */
export type CommandEntry = {
	id: string;
	label: string;
	action: string;
	value?: string;

	/**
	 * How the toolkit reports this command's state, for the commands where that is meaningful.
	 * Absent means the key has one look and never lights up.
	 */
	isOn?: (state: ToolkitState) => boolean;
};

/**
 * A command whose state the toolkit pushes back, so the key can show whether it is on.
 */
export type ToggleEntry = CommandEntry & {
	isOn: (state: ToolkitState) => boolean;
};

/**
 * Everything the "Command" action offers, in the order it appears in the dropdown.
 *
 * Grouped roughly the way someone lays out a deck: move around first, then mark, then the rest.
 */
export const COMMANDS: readonly CommandEntry[] = [
	{ id: "nav.next", label: "Next image", action: "nav.next" },
	{ id: "nav.prev", label: "Previous image", action: "nav.prev" },
	{ id: "page.next", label: "Next page", action: "page.next" },
	{ id: "page.prev", label: "Previous page", action: "page.prev" },

	{ id: "favorite", label: "Favourite", action: "favorite", isOn: (s) => s.favorite === true },
	{ id: "nsfw", label: "NSFW", action: "nsfw", isOn: (s) => s.nsfw === true },
	{ id: "delete", label: "Mark for deletion", action: "delete", isOn: (s) => s.forDeletion === true },
	{ id: "quickalbum.toggle", label: "Quick album: add / remove", action: "quickalbum.toggle", isOn: (s) => s.inQuickAlbum === true },

	{ id: "view.images", label: "Go to Images", action: "view.images", isOn: (s) => s.view === "images" },
	{ id: "view.folders", label: "Go to Folders", action: "view.folders", isOn: (s) => s.view === "folders" },
	{ id: "view.favorites", label: "Go to Favourites", action: "view.favorites", isOn: (s) => s.view === "favorites" },
	{ id: "view.deleted", label: "Go to Bin", action: "view.deleted", isOn: (s) => s.view === "deleted" },
	{ id: "quickalbum.open", label: "Go to Quick album", action: "quickalbum.open" },

	{ id: "filter.clear", label: "Clear filter", action: "filter.clear", isOn: (s) => s.hasFilter === true },
	{ id: "refresh", label: "Refresh", action: "refresh" },
	{ id: "explorer.show", label: "Show in Explorer", action: "explorer.show" },
	{ id: "info.toggle", label: "Show / hide info overlay", action: "info.toggle", isOn: (s) => s.infoVisible === true },
];

/**
 * Everything the "Toggle" action offers: the settings that belong to the window rather than to an
 * image, where a switch is the honest way to draw it.
 *
 * The per-image marks - favourite, NSFW, quick album, the info overlay - live under Command
 * instead. They also show their state, but as a lit icon rather than a switch, because they are
 * things you do to an image rather than settings you leave on.
 */
export const TOGGLES: readonly ToggleEntry[] = [
	{
		id: "review",
		label: "Review mode",
		action: "review.toggle",
		isOn: (state) => state.reviewing === true,
	},
	{
		id: "autoadvance",
		label: "Auto-advance",
		action: "autoadvance.toggle",
		isOn: (state) => state.autoAdvance === true,
	},
	{
		id: "zoom.fit",
		label: "Fit to preview",
		action: "zoom.fit",
		isOn: (state) => state.fitToPreview === true,
	},
	{
		id: "zoom.actual",
		label: "Actual size",
		action: "zoom.actual",
		isOn: (state) => state.actualSize === true,
	},
	{
		id: "filter.image",
		label: "Filter: images",
		action: "filter.type",
		value: "Image",
		// The toolkit reports only that some filter is set, not which types are in it
		isOn: (state) => state.hasFilter === true,
	},
	{
		id: "filter.video",
		label: "Filter: videos",
		action: "filter.type",
		value: "Video",
		isOn: (state) => state.hasFilter === true,
	},
];

/**
 * The icon file for a command in one of its two states, without the .png.
 *
 * Commands with nothing to report use the same image for both, so their key looks the same however
 * Stream Deck has it set.
 */
export function commandIcon(entry: CommandEntry, on: boolean): string {
	const slug = entry.id.replace(/\./g, "-");

	if (!entry.isOn) return `imgs/commands/${slug}`;

	return `imgs/commands/${slug}-${on ? "on" : "off"}`;
}

export function findCommand(id: string | undefined): CommandEntry | undefined {
	return COMMANDS.find((entry) => entry.id === id);
}

export function findToggle(id: string | undefined): ToggleEntry | undefined {
	return TOGGLES.find((entry) => entry.id === id);
}

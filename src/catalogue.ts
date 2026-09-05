import type { ToolkitState } from "./client";

/**
 * A command that just fires - the toolkit reports no state for it, so its key never lights up.
 */
export type CommandEntry = {
	id: string;
	label: string;
	action: string;
	value?: string;
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

	{ id: "favorite", label: "Favourite", action: "favorite" },
	{ id: "nsfw", label: "NSFW", action: "nsfw" },
	{ id: "delete", label: "Mark for deletion", action: "delete" },
	{ id: "quickalbum.toggle", label: "Quick album: add / remove", action: "quickalbum.toggle" },

	{ id: "view.images", label: "Go to Images", action: "view.images" },
	{ id: "view.folders", label: "Go to Folders", action: "view.folders" },
	{ id: "view.favorites", label: "Go to Favourites", action: "view.favorites" },
	{ id: "view.deleted", label: "Go to Bin", action: "view.deleted" },
	{ id: "quickalbum.open", label: "Go to Quick album", action: "quickalbum.open" },

	{ id: "filter.clear", label: "Clear filter", action: "filter.clear" },
	{ id: "refresh", label: "Refresh", action: "refresh" },
	{ id: "explorer.show", label: "Show in Explorer", action: "explorer.show" },
	{ id: "info.toggle", label: "Show / hide info overlay", action: "info.toggle" },
];

/**
 * Everything the "Toggle" action offers.
 *
 * Only commands the toolkit reports state for belong here. Quick album membership and the info
 * overlay are deliberately absent - both are per-image rather than global, so a lit key would be
 * lying half the time.
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

export function findCommand(id: string | undefined): CommandEntry | undefined {
	return COMMANDS.find((entry) => entry.id === id);
}

export function findToggle(id: string | undefined): ToggleEntry | undefined {
	return TOGGLES.find((entry) => entry.id === id);
}

# Diffusion Toolkit Plus — Stream Deck plugin

Rate, tag and page through a [Diffusion Toolkit Plus](https://github.com/StylusEcho/DiffusionToolkitPlus)
library from a Stream Deck, **without the toolkit having focus**. That last part is the point: Stream
Deck's built-in Hotkey action only reaches the focused window, and the toolkit binds bare letter keys
like `B`, so a hotkey pressed over your browser types into the browser instead.

Windows only, because Diffusion Toolkit is.

## Install

`com.stylusecho.dtplus.sdPlugin/` is the plugin — the built bundle is committed, so a clone is
ready to install with no build step.

Copy or link that folder into `%APPDATA%\Elgato\StreamDeck\Plugins\` and restart Stream Deck.
With [`@elgato/cli`](https://www.npmjs.com/package/@elgato/cli): `streamdeck link com.stylusecho.dtplus.sdPlugin`.

If every key shows an exclamation mark the moment you press it and the plugin folder has no `logs/`
directory, Stream Deck could not launch the plugin at all — check `bin/plugin.js` is actually there.

## Setup

1. In Diffusion Toolkit Plus: **Settings → General → Allow control from another application on this
   computer**. Note the port (9760 by default).
2. Drop an action onto a key and set the same port in its property inspector. The port is shared by
   every key, so you only set it once.

The plugin connects to `127.0.0.1` and retries in the background, so it does not matter whether the
toolkit or the Stream Deck starts first, and closing the toolkit is not an error.

## Actions

| | |
|---|---|
| **Rate** | Rates the selection. One key per rating — you reach for "3", not for a widget. 1–10, or clear. |
| **Command** | Any one command: move, mark, switch view, refresh, show in Explorer. |
| **Toggle** | Review mode, auto-advance, zoom, media filters. The key lights up while the setting is on, and follows the toolkit — turning review mode on from the keyboard lights the key too. |
| **Status** | Which page of how many, and how many results. Press to refresh. |

Marking commands (favourite, NSFW, mark for deletion, quick album) live under **Command** rather than
**Toggle**, because the toolkit reports no global state for them — they belong to whichever image is
selected, so a lit key would be wrong half the time. The same goes for the info overlay.

The two filter toggles light up whenever *any* filter is set, not specifically theirs: the toolkit
reports that a filter exists, not what is in it.

### Review mode

Anything that would change which images are on screen — the **Go to** commands, **Clear filter** — is
refused while a review is running, exactly as those controls are disabled in the toolkit's own window.
The key shows an alert rather than doing nothing quietly.

## Building

Needs Node 20.5.1+ and Python 3 (for the icons).

```
npm install
npm run check      # typecheck, run the client tests, bundle, validate the manifest
```

- `npm run test` runs the client against a stand-in for the toolkit over a real socket, covering
  the framing, request matching and reconnect logic - the parts most likely to be wrong and the only
  parts testable without a Stream Deck.
- `npm run build` bundles `src/` into `com.stylusecho.dtplus.sdPlugin/bin/plugin.js` and validates.
- `npm run icons` redraws every PNG from `tools/generate-icons.py`. The icons are generated rather
  than hand-drawn binaries so they can be changed; the script needs no image library.
- `npm run validate` checks `manifest.json` against the schema shipped with the SDK, that every
  image and property inspector it names exists, that nothing the manifest points at is excluded by
  `.gitignore`, and that the dropdowns in the property inspectors still match the command catalogue
  in `src/catalogue.ts`.

  The last two checks exist because of failures that are invisible until someone installs the thing:
  a bundle excluded from the repo ships a folder Stream Deck cannot launch — with no plugin log to
  explain it, because the process never starts — and a dropdown option with no catalogue entry shows
  up as a key that silently does nothing.

**Rebuild after changing anything under `src/`, and commit `bin/plugin.js` with it.** The committed
bundle is what people install; stale source and bundle is the one way to make this repo lie.

## Protocol

The toolkit side is documented in
[`docs/remote-control.md`](https://github.com/StylusEcho/DiffusionToolkitPlus/blob/master/docs/remote-control.md)
in the main repository: newline-delimited JSON over TCP, commands one way and state pushes the other.
You can drive it with `nc 127.0.0.1 9760` without any Stream Deck hardware, which is the quickest way
to tell a plugin problem from a toolkit problem.

**Connect to `127.0.0.1`, never `localhost`.** The toolkit binds IPv4 loopback only, and Windows
resolves `localhost` to `::1` first — which fails in a way that looks exactly like nothing listening.

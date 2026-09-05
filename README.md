# Diffusion Toolkit Plus — Stream Deck plugin

Rate, tag and page through a [Diffusion Toolkit Plus](https://github.com/StylusEcho/DiffusionToolkitPlus)
library from a Stream Deck, **without the toolkit having focus**. That last part is the point: Stream
Deck's built-in Hotkey action only reaches the focused window, and the toolkit binds bare letter keys
like `B`, so a hotkey pressed over your browser types into the browser instead.

Windows only, because Diffusion Toolkit is.

## Install

`com.stylusecho.dtplus.sdPlugin/` is the plugin — the built bundle is committed, so a clone is ready
to install with no build step.

```powershell
powershell -ExecutionPolicy Bypass -File tools\install.ps1 -Restart
```

That closes Stream Deck, replaces the installed folder outright, prints the version it installed and
lists the files that matter, then starts Stream Deck again. **Use it for updates too.** Pulling in
the clone does nothing to a copy installed earlier, and a stale install fails silently — a settings
panel that will not draw, or keys that error with no log to explain why.

To install by hand instead, copy the folder into `%APPDATA%\Elgato\StreamDeck\Plugins\` and
restart Stream Deck. `streamdeck link` from [`@elgato/cli`](https://www.npmjs.com/package/@elgato/cli)
also works and has the advantage of pointing at the clone rather than copying it.

### If something looks wrong

Check what is actually installed, not what is in the clone — they are different folders:

```
%APPDATA%\Elgato\StreamDeck\Plugins\com.stylusecho.dtplus.sdPlugin\
```

| Symptom | Look at |
|---|---|
| Every key shows an exclamation mark, and there is no `logs\` folder | Stream Deck could not launch the plugin. Is `bin\plugin.js` there? |
| The settings panel shows nothing but the Title field | Stream Deck is not loading the property inspector. Are `ui\pi.js` and `ui\pi.css` there, and does `manifest.json` say the version you expect? |
| Keys work but every press alerts | The plugin is running and cannot reach the toolkit. `logs\` will name the reason. |

The version in `manifest.json` is bumped on every change, so comparing it against the installed copy
is the quickest way to tell whether an update actually landed.

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
| **Rate** | Rates the selection. One key per rating — you reach for "3", not for a widget. 1–10, or clear. A row of them behaves like a star bar: with the selected image rated 4, keys 1–4 are filled and the rest are outlines, so the current rating is the last lit key. |
| **Command** | Any one command: move, mark, switch view, refresh, show in Explorer. Each has its own icon, and the ones the toolkit reports state for are lit when they are on — a favourite key shows that the selected image is *already* a favourite, a "go to Images" key that you are already there. |
| **Toggle** | Review mode, auto-advance, zoom, media filters. Drawn as a switch, lit while on, and follows the toolkit — turning review mode on from the keyboard lights the key too. |
| **Status** | Which page of how many, and how many results. Press to refresh. |

Marking commands — favourite, NSFW, mark for deletion, quick album, the info overlay — live under
**Command** rather than **Toggle**. They show their state too, but as a lit icon rather than a
switch, because they are things you do to an image rather than settings you leave on. They need a
toolkit new enough to report per-image state; against an older one the keys still work, they just
never light.

The two filter toggles light up whenever *any* filter is set, not specifically theirs: the toolkit
reports that a filter exists, not what is in it.

### Custom icons

Every action that has two looks — Rate, Command and Toggle — declares both to Stream Deck, so its
settings panel offers an image well for each state and you can drop in your own icon per state. An
icon you set wins over the one the plugin draws.

A command with no state to report uses the same image for both, so its two wells behave as one.

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

- `npm run test` covers the two pieces that can be checked without hardware: the client, against a
  stand-in toolkit over a real socket (framing, request matching, reconnect), and the property
  inspector bridge in `ui/pi.js`, against a stand-in Stream Deck.
- `npm run build` bundles `src/` into `com.stylusecho.dtplus.sdPlugin/bin/plugin.js` and validates.
- `npm run icons` redraws every PNG from `tools/generate-icons.py`. The icons are generated rather
  than hand-drawn binaries so they can be changed; the script needs no image library.
- `npm run validate` checks `manifest.json` against the schema shipped with the SDK, that every
  image and property inspector it names exists, that nothing the manifest points at is excluded by
  `.gitignore`, and that the dropdowns in the property inspectors still match the command catalogue
  in `src/catalogue.ts`.

  It also checks the command and rating key images, which are chosen at runtime by name and so are
  never mentioned in the manifest, and that any action calling `setState` declares two states —
  calling it on a single-state action does nothing at all, silently.

  These checks exist because of failures that are invisible until someone installs the thing: a
  bundle excluded from the repo ships a folder Stream Deck cannot launch, with no plugin log to
  explain it because the process never starts; a settings panel that loads a script over the network
  renders as nothing but the built-in title field when that script does not arrive; and a missing
  runtime icon or an unmatched dropdown option shows up as a blank or silently dead key.

**Rebuild after changing anything under `src/`, and commit `bin/plugin.js` with it.** The committed
bundle is what people install; stale source and bundle is the one way to make this repo lie.

**Bump the version on every change**, in `package.json` and `manifest.json` together — `validate`
fails if they disagree. Stream Deck keys some caching off the plugin version, and it is the only way
to tell from the installed folder whether an update landed.

## Protocol

The toolkit side is documented in
[`docs/remote-control.md`](https://github.com/StylusEcho/DiffusionToolkitPlus/blob/master/docs/remote-control.md)
in the main repository: newline-delimited JSON over TCP, commands one way and state pushes the other.
You can drive it with `nc 127.0.0.1 9760` without any Stream Deck hardware, which is the quickest way
to tell a plugin problem from a toolkit problem.

**Connect to `127.0.0.1`, never `localhost`.** The toolkit binds IPv4 loopback only, and Windows
resolves `localhost` to `::1` first — which fails in a way that looks exactly like nothing listening.

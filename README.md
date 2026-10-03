# OdoPlayer v15

Choose **Select a File** (or drag/drop) for local video/audio, or paste a YouTube video link to load its official embedded player. **Switch Dance** unloads the current source and returns to these choices.

- **Space** toggles play/stop; **Left/Right** seek five seconds; **Down/Up** decrease/increase speed; **L** toggles looping; **R** restarts without looping.
- Local speed changes in 10-percentage-point steps. YouTube uses the next playback rate supported by that video, and reports the actual applied rate.
- Local video supports mirror and crop. YouTube mirrors the whole embed; cropping is disabled. Audio shows its filename and hides mirror/crop.
- Beginning countdowns are available when looping is off and playback starts from zero. Seeking to zero while paused waits for Play; while playing it starts the countdown.
- YouTube's own controls remain available. Keyboard events inside its cross-origin iframe cannot reach OdoPlayer; use OdoPlayer's controls to restore shortcut focus. The bottom HUD stays visible for audio and YouTube so those controls remain reachable.
- YouTube looping uses network seeks and is not frame-perfect. Ads, browser autoplay restrictions, and videos that disallow embedding are controlled by YouTube. If automatic playback is blocked, use Play again or YouTube's play button.

## Web and offline releases

Upload index.html, styles.css, model.js, media.js, renderer.js, pipasentopng.png, odoplayerlogo_small.png, and OdoPlayer_v15_Offline.html to the same hosted directory. GitHub Pages works without a build step or an API key.

The single HTML release embeds all local code and images; local files work without internet. The offline release displays “YouTube is unavailable in the Offline version” instead of a link field. Use the hosted page or **Start Player.cmd** for YouTube playback with an internet connection. The desktop app serves only its allowlisted assets on a random loopback port, not on the local network.

## Run and build

Run **Start Player.cmd** for the current source, or use npm start. npm test runs the model checks. npm run build:win creates a Windows portable executable (not rebuilt for this source release).

## Backup

OdoPlayer_v13_Source_Backup contains the unmodified pre-YouTube root files and tests. File hashes were verified before implementing v15.

## Previous documentation

# OdoPlayer

An offline video practice player for Windows, built with Electron. The interface also supports macOS; a Mac build has not yet been tested.

## Run and build

Requires Node.js and npm. From this directory:

```powershell
npm.cmd ci
npm.cmd start
npm.cmd test
npm.cmd run build:win
```

The portable Windows executable is generated in `dist/`. It is unsigned.

## Use

- Open video or drag a local file into the window. H.264/AAC MP4 is the recommended format.
- Resize the window to resize the video.
- Click the video or use the single Play/Stop button to start playback or pause at the current position. Press R to restart and play the entire video from zero; this disables looping but keeps the selected region.
- The upper slider seeks. Seeking outside an active loop turns looping off.
- Drag in either direction across the lower strip to select and enable a loop. Drag its handles to resize it. The Loop button or L toggles looping. Disabled selections remain grey and do not affect playback.
- Focus a loop handle and use arrow keys to move it by 0.1 seconds (Shift: 1 second).
- Speed changes in 10-percentage-point steps from 20% to 200%. Click the percentage to reset to 100%. Audio pitch correction remains enabled.
- Mirror flips the video horizontally for dance practice.
- With focus outside a control: Space toggles play/stop; R restarts the entire video; arrows seek 5 seconds; L toggles looping; minus/plus change speed.

This first version keeps settings and loops only during the current session. Loops use video seeking and may have a small pause at the boundary; they are not guaranteed frame-perfect or gapless. No video uploads or network services are used.

## Compact controls

The video extends to the top and sides of the window. All controls sit in a compact bottom HUD. While playing, after five seconds without mouse or keyboard activity, the HUD slides away and the video fills the app window, preserving its aspect ratio. Move the mouse or press a key to restore it. Controls remain visible while paused, opening a file, or dragging a control. Open Video is at the bottom left; the centered controls are Mirror, speed, Play/Stop, and Loop.

## macOS later

Use the same source on a Mac, install dependencies, and package with Electron Builder. Test video playback and loop behavior on the target platform before distribution. Public distribution typically also needs signing/notarization.

## Drag-to-crop (0.4.0)

Press and drag over the video to draw a thick red rectangle. Release to zoom to that region without stretching. A simple click still toggles play/pause. The crop works with mirroring and follows window size changes. Drag again to crop further into the current view. Tiny or thin drags are ignored; Escape cancels an in-progress drag.

A red border marks an active crop. Use the red Clear Crop button beside Loop to restore the full video. Opening another video also resets the crop. This only changes the view and does not modify the source file.

The complete 0.3.0 project was backed up to PipaPlayer030backup before implementation. Version 0.4.0 was implemented without running tests, as requested.

# Music credits

Built-in workout playlists are instrumental loops intended for in-app background use.

## Local files (`*.mp3` in this folder)

Downloaded via `scripts/fetch-music.py`. When present, the runner prefers `/music/{style}-n.mp3`.

Sources may include:

- **FreePD** — public domain music (https://freepd.com)
- **SoundHelix** example tracks by Thomas Weber — free demo instrumentals (https://www.soundhelix.com)

## CDN fallbacks

If a local file is missing, the catalog’s `fallback` URL is used so music still works without bloating the deploy artifact.

## “My music” mode

No third-party audio is streamed by WorkOut. The user plays Spotify, Apple Music, YouTube Music, etc. on their own device.

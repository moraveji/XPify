# XP Health Release Player

A Spotify-inspired, XP-branded release notes experience. Drop a new folder of assets for each release and the player will render the tracks automatically.

## Getting Started

1. Serve the folder with any static web server (e.g. `npx serve`, Vercel, Netlify).
2. Open `index.html` in your browser. The player will load the release specified in the URL query `?d=YYYYMMDD` or fall back to `latest.txt`.
3. Click tracks to play audio, view screenshots, and read release notes.

## Authoring a New Release

1. Duplicate one of the sample folders (e.g. `release-player/20251003`) and rename it with the target release date (YYYYMMDD).
2. Add your media assets (the repository intentionally omits binaries):
   - `album-cover.png`: Album art displayed on the left column / header.
   - `N.png`: Screenshot thumbnail/cover for each track.
   - Optional media dropped alongside the text files will be detected automatically.
3. Optional assets:
   - `album-notes.txt`: Markdown text displayed next to the album cover.
   - `N.txt`: First line is the track title, second is the subtitle, remaining lines become the release notes body. Markdown is supported.
   - `N.mp3`: Audio track for playback.
   - `N-kenburns.gif`: Animated hero visual used while the track is playing on mobile.
4. Include inline links within `N.txt` using the syntax `Label: https://example.com`. The player converts these to buttons below the notes.
5. Update `latest.txt` with the new folder name to make it the default release when no `?d=` parameter is provided.
6. When testing locally without images yet, the player will render placeholder artwork so you can validate copy and links before the design team supplies final assets.

## Development Notes

- The player is implemented in vanilla HTML, CSS, and JavaScript.
- Responsive layout switches to a mobile-first experience below 780px viewport width.
- Track metadata is discovered by probing for sequentially numbered files until a gap is encountered.
- Audio playback uses the built-in HTML5 `<audio>` element.

## Deployment

Deploy the `release-player` directory to your static host of choice (Vercel recommended). Configure password protection via your hosting provider or middleware.

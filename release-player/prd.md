📄 PRD — XP Health “Release Player”

1. Overview

Each month, XP Health will publish a Release Album.
•Album = monthly digest
•Tracks = individual feature drops
•Optional audio = music track per feature
•Release Notes = like lyrics (scrollable text, with links)

Users access the player via a Slack message (“▶ Open Player”) or a direct link.
•Web (desktop): Full-screen “Spotify Web Player” style.
•Mobile: “Spotify App” style with big cover art, play controls, and scrollable release notes.
•Branding: Spotify-inspired, but XP-branded (dark theme, XP green/blue accents, XP Health logo).
•Hosting: Vercel or internal XP server. Password-protected (XP staff only).
•Content management: Hand-edited JSON/YAML file (album.json) per month.

⸻

2. Goals & Non-Goals

Goals
•Make release notes enjoyable and familiar.
•Provide multimedia context (music + screenshots + GIFs).
•Accessible across desktop and mobile.
•Shareable links to albums and tracks.

Non-Goals
•Real streaming or synced “lyrics” (static notes only).
•Spotify branding (no logos/fonts/trade-dress).

⸻

3. User Experience

3.1 Album Page (Web/Desktop)
•Layout mimics Spotify Web Player:
•Left column: Album cover, album metadata (title, date, notes).
•Right/main: Track list. Each row shows:
•Track number
•Title + subtitle
•Small thumbnail (screenshot)
•Duration (from audio file)
•Clicking a track row updates the Now Playing panel (sticky bottom player).
•Now Playing panel (bottom):
•Track title + subtitle
•Play/pause, prev, next buttons
•Progress bar + current time/duration
•Links (“Roadmap,” “Bug Dashboard,” “Demo”)

3.2 Album Page (Mobile)
•Full-screen card for the selected track:
•Large cover/screenshot (Ken Burns GIF plays while audio plays)
•Track title + subtitle
•Scrollable release notes instead of lyrics
•Links below notes
•Player controls pinned bottom (prev, play/pause, next, progress bar)
•Swipe left/right (or next/prev) to switch tracks.
•Floating album header with album cover + back button.

3.3 Interaction
•Play: plays full MP3 file associated with track.
•Next/Prev: switches track, auto-plays audio.
•Share: Each track has a deep link ...?t=N.
•Notes: Scrollable text area supports markdown (bold, italics, links).


4. Data Model (Updated: File-Based)

Instead of editing JSON, the player auto-discovers tracks from a folder structure.

Folder naming
•Each release is in a folder named YYYYMMDD, e.g. 20251003.
•Query param ?d=20251003 loads that release.
•Optional &t=N deep-links to a specific track.

Files in each folder
/20251003
  album-cover.png      # Required — album art
  album-notes.txt      # Optional — album notes
  1.png                # Required for track 1
  1.txt                # Optional — notes for track 1
  1.mp3                # Optional — audio for track 1
  1-kenburns.gif       # Optional — Ken Burns animation for track 1
  2.png
  2.txt
  2.mp3
  2-kenburns.gif
  ...
Auto-parsing rules
•A track exists if N.png is present.
•Optional extras per track:
•N.txt → release notes (first line = title, second line = subtitle, rest = notes).
•N.mp3 → audio file (plays full length).
•N-kenburns.gif → animated version of screenshot when playing.
•Notes support plain text or simple markdown.
•Inline links in N.txt like Roadmap: https://..., Bugs: https://..., Demo: https://... are auto-detected and rendered as buttons.
•album-notes.txt (if present) appears on the album’s cover page.




5. Branding & Visual Design
•Colors: Dark background, XP accent colors.
•Logo: XP Health logo at top left:
https://dp97y1xlp9ur8.cloudfront.net/patients/logo-2-black.svg
•Fonts: Use system sans-serif (Inter, Roboto, etc.) — avoid Spotify fonts.
•Icons: Standard Unicode icons (⏮ ▶ ⏭) or open-source set.

⸻

6. Technical

Frontend
•Vanilla HTML/JS/CSS (responsive design).
•Optional: React if maintainability is a priority (but static HTML is fine).
•Detect viewport → switch to mobile layout < 780px width.

Hosting
•Deploy via Vercel (fast + password-protection via env variables or middleware).
•Alternatively, host at releases.xphealth.co.

Authentication
•Simple password gate (e.g. HTTP Basic Auth or app-level login).

⸻

7. Future Enhancements (Optional, Not v1)
•“Shuffle album” play.
•Team comments/reactions per track.
•Integration with Notion/Productboard to auto-populate JSON.

⸻

8. Success Metrics
•Open/play rate (Slack clicks → site opens).
•Average time spent on album page.
•of track plays per album.
•Qual feedback: “Is this more enjoyable than a newsletter?”



9. Make this folder structure:
release-player/
  ├─ prd.md             # This spec
  ├─ README.md          # Setup + usage
  ├─ index.html         # Main app
  ├─ style.css
  ├─ app.js
  ├─ latest.txt         # (Optional) points to current release folder, e.g. "20251003"
  ├─ /20251003/         # Oct 3, 2025 release
  │    ├─ album-cover.png
  │    ├─ album-notes.txt
  │    ├─ 1.png
  │    ├─ 1.txt
  │    ├─ 1.mp3
  │    ├─ 1-kenburns.gif
  │    ├─ 2.png
  │    └─ ...
  └─ /20251107/         # Nov 7, 2025 release
       └─ ...



10. Authoring a New Month (Simplified)
1.Create a new folder named YYYYMMDD.
2.Drop in your screenshots/audio/text with the simple naming scheme.
3.Commit/push → Vercel deploys.
4.Share link ...?d=YYYYMMDD.
•Optional: update latest.txt with the new folder name so the root URL always loads the newest release.

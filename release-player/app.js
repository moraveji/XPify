const PLACEHOLDER_IMAGE =
  'data:image/svg+xml;utf8,' +
  encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" preserveAspectRatio="xMidYMid slice">` +
      `<defs>` +
      `<linearGradient id="g" x1="0" x2="1" y1="0" y2="1">` +
      `<stop stop-color="#1d1f29" offset="0%"/>` +
      `<stop stop-color="#233b4d" offset="50%"/>` +
      `<stop stop-color="#1b7f79" offset="100%"/>` +
      `</linearGradient>` +
      `</defs>` +
      `<rect fill="url(#g)" width="512" height="512"/>` +
      `<text x="50%" y="50%" text-anchor="middle" fill="rgba(255,255,255,0.65)" font-size="32" font-family="Inter,Roboto,Helvetica,Arial,sans-serif">XP Release</text>` +
      `</svg>`,
  );

const state = {
  releaseId: null,
  tracks: [],
  currentIndex: 0,
  trackRows: [],
  trackDurations: [],
  mobileRows: [],
  mobileDurations: [],
  autoplay: false,
};

const qs = new URLSearchParams(window.location.search);
const elements = {
  albumCover: document.getElementById('albumCover'),
  albumTitle: document.getElementById('albumTitle'),
  albumDate: document.getElementById('albumDate'),
  albumNotes: document.getElementById('albumNotes'),
  trackList: document.getElementById('trackList'),
  releaseSelector: document.getElementById('releaseSelector'),
  nowPlaying: document.getElementById('nowPlaying'),
  nowPlayingThumb: document.getElementById('nowPlayingThumb'),
  nowPlayingTitle: document.getElementById('nowPlayingTitle'),
  nowPlayingSubtitle: document.getElementById('nowPlayingSubtitle'),
  trackLinks: document.getElementById('trackLinks'),
  playPauseBtn: document.getElementById('playPauseBtn'),
  prevBtn: document.getElementById('prevBtn'),
  nextBtn: document.getElementById('nextBtn'),
  currentTime: document.getElementById('currentTime'),
  duration: document.getElementById('duration'),
  progressBar: document.getElementById('progressBar'),
  mobileTrack: document.getElementById('mobileTrack'),
  backToList: document.getElementById('backToList'),
  mobileTrackImage: document.getElementById('mobileTrackImage'),
  mobileTrackTitle: document.getElementById('mobileTrackTitle'),
  mobileTrackSubtitle: document.getElementById('mobileTrackSubtitle'),
  mobileTrackNotes: document.getElementById('mobileTrackNotes'),
  mobileTrackLinks: document.getElementById('mobileTrackLinks'),
  mobileAlbumCover: document.getElementById('mobileAlbumCover'),
  mobileAlbumTitle: document.getElementById('mobileAlbumTitle'),
  mobileAlbumDate: document.getElementById('mobileAlbumDate'),
  mobileTrackList: document.getElementById('mobileTrackList'),
  audio: document.getElementById('audio'),
};

let isSeeking = false;

init();

async function init() {
  let releaseId = qs.get('d');
  if (!releaseId) {
    releaseId = await fetchLatestRelease();
  }

  if (!releaseId) {
    renderError('No release configured. Add a folder and update latest.txt.');
    return;
  }

  await loadRelease(releaseId.trim());

  elements.playPauseBtn.addEventListener('click', togglePlayback);
  elements.prevBtn.addEventListener('click', () => stepTrack(-1));
  elements.nextBtn.addEventListener('click', () => stepTrack(1));
  elements.progressBar.addEventListener('input', handleSeekStart);
  elements.progressBar.addEventListener('change', handleSeekCommit);
  elements.backToList.addEventListener('click', () => {
    elements.mobileTrackList.classList.toggle('active');
  });
  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') {
      elements.mobileTrackList.classList.remove('active');
    }
  });

  elements.audio.addEventListener('timeupdate', handleTimeUpdate);
  elements.audio.addEventListener('loadedmetadata', () => {
    const current = state.tracks[state.currentIndex];
    if (current) {
      current.duration = elements.audio.duration;
      updateDurationDisplay(state.currentIndex, elements.audio.duration);
    }
    updateDuration(elements.audio.duration);
  });
  elements.audio.addEventListener('ended', () => stepTrack(1));
}

async function fetchLatestRelease() {
  try {
    const res = await fetch('latest.txt', { cache: 'no-store' });
    if (!res.ok) return null;
    return (await res.text()).trim();
  } catch (err) {
    console.warn('Failed to read latest release', err);
    return null;
  }
}

async function loadRelease(releaseId) {
  state.releaseId = releaseId;
  updateReleaseSelector(releaseId);

  const dateLabel = formatReleaseDate(releaseId);
  const albumTitle = `XP Health Release — ${dateLabel}`;
  const albumCoverUrl = `${releaseId}/album-cover.png`;
  const albumCoverExists = await fileExists(albumCoverUrl);
  const albumCoverSrc = albumCoverExists ? albumCoverUrl : PLACEHOLDER_IMAGE;
  elements.albumCover.src = albumCoverSrc;
  elements.mobileAlbumCover.src = albumCoverSrc;
  elements.albumCover.alt = `${dateLabel} album cover`;
  elements.mobileAlbumCover.alt = `${dateLabel} album cover`;
  elements.albumTitle.textContent = albumTitle;
  elements.albumDate.textContent = dateLabel;
  elements.mobileAlbumTitle.textContent = albumTitle;
  elements.mobileAlbumDate.textContent = dateLabel;

  const albumNotes = await fetchOptionalText(`${releaseId}/album-notes.txt`);
  elements.albumNotes.innerHTML = albumNotes ? renderMarkdown(albumNotes) : '<p class="placeholder">Add `album-notes.txt` to share album context.</p>';

  const tracks = await discoverTracks(releaseId);
  state.tracks = tracks;

  if (!tracks.length) {
    elements.trackList.innerHTML = '<li class="empty">No tracks found for this release.</li>';
    elements.nowPlaying.classList.add('hidden');
    return;
  }

  elements.nowPlaying.classList.remove('hidden');
  renderTrackList(tracks);
  await hydrateDurations(tracks);

  const requestedTrack = parseInt(qs.get('t') ?? '1', 10);
  const initialIndex = Number.isFinite(requestedTrack) && requestedTrack > 0 && requestedTrack <= tracks.length ? requestedTrack - 1 : 0;
  state.currentIndex = initialIndex;

  selectTrack(initialIndex, { autoplay: qs.has('t') && qs.get('autoplay') === '1' });
}

async function discoverTracks(releaseId) {
  const tracks = [];
  for (let i = 1; i <= 50; i += 1) {
    const imagePath = `${releaseId}/${i}.png`;
    const kenburnsPath = `${releaseId}/${i}-kenburns.gif`;
    const audioPath = `${releaseId}/${i}.mp3`;
    const textPath = `${releaseId}/${i}.txt`;

    // eslint-disable-next-line no-await-in-loop
    const [hasImage, hasKenburns, hasAudio, textContent] = await Promise.all([
      fileExists(imagePath),
      fileExists(kenburnsPath),
      fileExists(audioPath),
      fetchOptionalText(textPath),
    ]);

    if (!hasImage && !hasKenburns && !hasAudio && textContent === null) break;

    const track = {
      index: i,
      image: hasImage ? imagePath : PLACEHOLDER_IMAGE,
      kenburns: hasKenburns ? kenburnsPath : null,
      audio: hasAudio ? audioPath : null,
      title: `Track ${i}`,
      subtitle: '',
      bodyHtml: '',
      links: [],
      duration: null,
    };

    if (textContent) {
      const parsed = parseTrackText(textContent, i);
      Object.assign(track, parsed);
    }

    tracks.push(track);
  }
  return tracks;
}

async function fileExists(path) {
  try {
    const head = await fetch(path, { method: 'HEAD' });
    if (head.ok) return true;
    if (head.status === 405) {
      const res = await fetch(path, { method: 'GET' });
      return res.ok;
    }
    return false;
  } catch (err) {
    return false;
  }
}

async function fetchOptionalText(path) {
  try {
    const res = await fetch(path, { cache: 'no-store' });
    if (!res.ok) return null;
    return await res.text();
  } catch (err) {
    return null;
  }
}

function parseTrackText(text, index) {
  const lines = text.replace(/\r/g, '').split('\n');
  const title = (lines.shift() || `Track ${index}`).trim();
  const subtitle = (lines.shift() || '').trim();
  const rest = lines.join('\n');
  const { body, links } = extractLinks(rest);
  return {
    title,
    subtitle,
    bodyHtml: body ? renderMarkdown(body) : '',
    links,
  };
}

function extractLinks(text) {
  const lines = text.split(/\n/);
  const bodyLines = [];
  const links = [];
  const linkPattern = /^\s*([^:]+):\s*(https?:\/\/\S+)\s*$/i;

  lines.forEach((line) => {
    const match = line.match(linkPattern);
    if (match) {
      links.push({ label: match[1].trim(), url: match[2].trim() });
    } else {
      bodyLines.push(line);
    }
  });

  return { body: bodyLines.join('\n').trim(), links };
}

function renderMarkdown(text) {
  const escaped = escapeHtml(text);
  const withFormatting = escaped
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*(.+?)\*/g, '<em>$1</em>')
    .replace(/`(.+?)`/g, '<code>$1</code>')
    .replace(/\[(.+?)\]\((https?:\/\/[^\s)]+)\)/g, '<a href="$2" target="_blank" rel="noopener">$1</a>');

  return withFormatting
    .split(/\n\s*\n/)
    .map((paragraph) => paragraph.trim())
    .filter((paragraph) => paragraph.length > 0)
    .map((paragraph) => `<p>${paragraph.replace(/\n/g, '<br />')}</p>`)
    .join('');
}

function escapeHtml(str) {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function renderTrackList(tracks) {
  elements.trackList.innerHTML = '';
  elements.mobileTrackList.innerHTML = '';
  elements.mobileTrackList.classList.remove('active');
  state.trackRows = [];
  state.trackDurations = [];
  state.mobileRows = [];
  state.mobileDurations = [];

  const mobileHeading = document.createElement('h2');
  mobileHeading.className = 'section-heading';
  mobileHeading.textContent = 'Tracks';
  const mobileOl = document.createElement('ol');

  tracks.forEach((track, idx) => {
    const row = document.createElement('li');
    row.className = 'track-row';
    row.dataset.index = String(idx);

    const indexEl = document.createElement('span');
    indexEl.className = 'track-row__index';
    indexEl.textContent = String(idx + 1);

    const thumb = document.createElement('img');
    thumb.src = track.image;
    thumb.alt = `${track.title} artwork`;
    thumb.className = 'track-row__thumb';

    const meta = document.createElement('div');
    meta.className = 'track-row__meta';
    const titleEl = document.createElement('span');
    titleEl.className = 'track-row__title';
    titleEl.textContent = track.title;
    const subtitleEl = document.createElement('span');
    subtitleEl.className = 'track-row__subtitle';
    subtitleEl.textContent = track.subtitle;
    meta.append(titleEl, subtitleEl);

    const durationEl = document.createElement('span');
    durationEl.className = 'track-row__duration';
    durationEl.textContent = '—';

    row.append(indexEl, thumb, meta, durationEl);
    row.addEventListener('click', () => selectTrack(idx, { autoplay: true }));
    elements.trackList.appendChild(row);

    state.trackRows.push(row);
    state.trackDurations.push(durationEl);

    const mobileRow = document.createElement('li');
    const button = document.createElement('button');
    button.type = 'button';
    button.innerHTML = `
      <span class="track-row__title">${track.title}</span>
      <span class="track-row__subtitle">${track.subtitle}</span>
    `;
    button.addEventListener('click', () => {
      selectTrack(idx, { autoplay: true });
      elements.mobileTrackList.classList.remove('active');
    });

    const mobileThumb = document.createElement('img');
    mobileThumb.src = track.image;
    mobileThumb.alt = `${track.title} artwork`;

    const mobileDuration = document.createElement('span');
    mobileDuration.className = 'mobile-duration';
    mobileDuration.textContent = '—';

    mobileRow.appendChild(mobileThumb);
    mobileRow.appendChild(button);
    mobileRow.appendChild(mobileDuration);
    mobileOl.appendChild(mobileRow);

    state.mobileRows.push(mobileRow);
    state.mobileDurations.push(mobileDuration);
  });

  elements.mobileTrackList.append(mobileHeading, mobileOl);
}

async function hydrateDurations(tracks) {
  await Promise.all(
    tracks.map(async (track, idx) => {
      if (!track.audio) return null;
      const duration = await getAudioDuration(track.audio);
      if (!duration) return null;
      track.duration = duration;
      updateDurationDisplay(idx, duration);
      return null;
    }),
  );
}

function getAudioDuration(src) {
  return new Promise((resolve) => {
    const audio = document.createElement('audio');
    audio.preload = 'metadata';
    audio.src = src;
    audio.addEventListener('loadedmetadata', () => resolve(audio.duration), { once: true });
    audio.addEventListener('error', () => resolve(null), { once: true });
  });
}

function updateDurationDisplay(index, duration) {
  const formatted = formatDuration(duration);
  if (state.trackDurations[index]) {
    state.trackDurations[index].textContent = formatted;
  }
  if (state.mobileDurations[index]) {
    state.mobileDurations[index].textContent = formatted;
  }
}

function selectTrack(index, options = {}) {
  const { autoplay = false } = options;
  state.currentIndex = index;
  state.autoplay = autoplay;

  const track = state.tracks[index];
  updateTrackHighlight();
  updateTrackContent(track);

  if (track.audio) {
    elements.audio.src = track.audio;
    elements.audio.load();
    if (autoplay) {
      elements.audio
        .play()
        .then(() => {
          state.autoplay = true;
          elements.playPauseBtn.textContent = '⏸';
          updateUrl();
        })
        .catch(() => {
          state.autoplay = false;
          elements.playPauseBtn.textContent = '▶';
          updateUrl();
        });
    } else {
      elements.playPauseBtn.textContent = '▶';
      state.autoplay = false;
    }
    elements.playPauseBtn.disabled = false;
    elements.progressBar.disabled = false;
  } else {
    elements.audio.removeAttribute('src');
    elements.playPauseBtn.textContent = '▶';
    elements.playPauseBtn.disabled = true;
    elements.progressBar.disabled = true;
    updateDuration(0);
    state.autoplay = false;
  }

  updateUrl();
}

function updateTrackContent(track) {
  elements.nowPlayingThumb.src = track.image;
  elements.nowPlayingThumb.alt = `${track.title} artwork`;
  elements.nowPlayingTitle.textContent = track.title;
  elements.nowPlayingSubtitle.textContent = track.subtitle;
  elements.currentTime.textContent = '0:00';
  const durationDisplay = track.duration ? formatDuration(track.duration) : track.audio ? '—:—' : '—';
  elements.duration.textContent = durationDisplay;
  elements.progressBar.value = 0;

  renderLinks(track.links, elements.trackLinks);

  const heroImage = track.kenburns || track.image || PLACEHOLDER_IMAGE;
  elements.mobileTrackImage.src = heroImage;
  elements.mobileTrackImage.alt = `${track.title} visual`;
  elements.mobileTrackTitle.textContent = track.title;
  elements.mobileTrackSubtitle.textContent = track.subtitle;
  elements.mobileTrackNotes.innerHTML = track.bodyHtml || '<p class="placeholder">Add notes via `N.txt`.</p>';
  renderLinks(track.links, elements.mobileTrackLinks);
}

function updateTrackHighlight() {
  state.trackRows.forEach((row, idx) => {
    row.classList.toggle('active', idx === state.currentIndex);
  });
  state.mobileRows.forEach((row, idx) => {
    row.classList.toggle('active', idx === state.currentIndex);
  });
}

function renderLinks(links, container) {
  container.innerHTML = '';
  links.forEach((link) => {
    const anchor = document.createElement('a');
    anchor.href = link.url;
    anchor.target = '_blank';
    anchor.rel = 'noopener';
    anchor.className = 'link-button';
    anchor.textContent = link.label;
    container.appendChild(anchor);
  });
}

function togglePlayback() {
  if (elements.playPauseBtn.disabled) return;
  if (elements.audio.paused) {
    elements.audio
      .play()
      .then(() => {
        elements.playPauseBtn.textContent = '⏸';
        state.autoplay = true;
        updateUrl();
      })
      .catch(() => {
        elements.playPauseBtn.textContent = '▶';
        state.autoplay = false;
        updateUrl();
      });
  } else {
    elements.audio.pause();
    elements.playPauseBtn.textContent = '▶';
    state.autoplay = false;
    updateUrl();
  }
}

function stepTrack(direction) {
  if (!state.tracks.length) return;
  const nextIndex = (state.currentIndex + direction + state.tracks.length) % state.tracks.length;
  selectTrack(nextIndex, { autoplay: true });
}

function handleTimeUpdate() {
  if (isSeeking) return;
  const current = elements.audio.currentTime;
  const total = elements.audio.duration || 0;
  elements.currentTime.textContent = formatDuration(current);
  if (Number.isFinite(total) && total > 0) {
    elements.progressBar.value = ((current / total) * 100).toFixed(2);
    elements.duration.textContent = formatDuration(total);
  }
}

function handleSeekStart() {
  if (elements.audio.duration) {
    isSeeking = true;
    const value = Number(elements.progressBar.value) / 100;
    elements.currentTime.textContent = formatDuration(elements.audio.duration * value);
  }
}

function handleSeekCommit() {
  if (!elements.audio.duration) return;
  const value = Number(elements.progressBar.value) / 100;
  elements.audio.currentTime = elements.audio.duration * value;
  isSeeking = false;
}

function updateDuration(value) {
  elements.duration.textContent = formatDuration(value);
}

function formatDuration(seconds = 0) {
  if (!Number.isFinite(seconds) || seconds <= 0) {
    return '0:00';
  }
  const mins = Math.floor(seconds / 60);
  const secs = Math.round(seconds % 60);
  return `${mins}:${secs.toString().padStart(2, '0')}`;
}

function updateReleaseSelector(releaseId) {
  const baseUrl = new URL(window.location.href);
  baseUrl.searchParams.set('d', releaseId);
  baseUrl.searchParams.delete('t');
  baseUrl.searchParams.delete('autoplay');

  elements.releaseSelector.innerHTML = '';
  const label = document.createElement('span');
  label.textContent = `Release ${formatReleaseDate(releaseId)}`;
  const shareLink = document.createElement('a');
  shareLink.className = 'link-button';
  shareLink.href = baseUrl.toString();
  shareLink.textContent = 'Open album link';

  elements.releaseSelector.append(label, shareLink);
}

function updateUrl() {
  const url = new URL(window.location.href);
  url.searchParams.set('d', state.releaseId);
  url.searchParams.set('t', state.currentIndex + 1);
  if (state.autoplay) {
    url.searchParams.set('autoplay', '1');
  } else {
    url.searchParams.delete('autoplay');
  }
  window.history.replaceState({}, '', url);
}

function formatReleaseDate(releaseId) {
  if (!/^\d{8}$/.test(releaseId)) return releaseId;
  const year = Number(releaseId.slice(0, 4));
  const month = Number(releaseId.slice(4, 6)) - 1;
  const day = Number(releaseId.slice(6));
  const date = new Date(Date.UTC(year, month, day));
  if (Number.isNaN(date.getTime())) return releaseId;
  return date.toLocaleDateString(undefined, {
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  });
}

function renderError(message) {
  elements.albumTitle.textContent = 'Release Player';
  elements.albumNotes.innerHTML = `<p class="placeholder">${message}</p>`;
  elements.trackList.innerHTML = '';
  elements.nowPlaying.classList.add('hidden');
}

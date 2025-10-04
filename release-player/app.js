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

const SPLIT_STORAGE_KEY = 'xp.split.left';

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
  releaseView: document.getElementById('releaseView'),
  columnSplitter: document.getElementById('columnSplitter'),
  albumsView: document.getElementById('albumsView'),
  albumsList: document.getElementById('albumsList'),
  albumsEmpty: document.getElementById('albumsEmpty'),
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
  setupSplitter();
  setupEventListeners();

  const releaseIdParam = qs.get('d');
  if (!releaseIdParam) {
    await renderAlbumIndex();
    return;
  }

  const trimmedReleaseId = releaseIdParam.trim();
  if (!trimmedReleaseId) {
    await renderAlbumIndex();
    return;
  }

  await loadRelease(trimmedReleaseId);
}

function setupEventListeners() {
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
  elements.audio.addEventListener('loadedmetadata', handleLoadedMetadata);
  elements.audio.addEventListener('play', updateHeroForPlayback);
  elements.audio.addEventListener('pause', updateHeroForPlayback);
  elements.audio.addEventListener('ended', handleAudioEnded);
}

function setupSplitter() {
  const splitter = elements.columnSplitter;
  const shell = elements.releaseView;
  if (!splitter || !shell) return;

  let stored = null;
  try {
    stored = localStorage.getItem(SPLIT_STORAGE_KEY);
  } catch (err) {
    stored = null;
  }
  if (stored) {
    document.documentElement.style.setProperty('--left', stored);
  }

  let isDragging = false;
  let lastValue = stored || null;

  const applyWidth = (px) => {
    const clamped = Math.round(px);
    lastValue = `${clamped}px`;
    document.documentElement.style.setProperty('--left', lastValue);
  };

  const bounds = () => {
    const rect = shell.getBoundingClientRect();
    const min = Math.max(240, Math.min(360, rect.width * 0.25));
    const max = rect.width - 260;
    return { rect, min, max: Math.max(min + 120, max) };
  };

  const handlePointerMove = (event) => {
    if (!isDragging) return;
    event.preventDefault();
    const { rect, min, max } = bounds();
    let proposed = event.clientX - rect.left;
    proposed = Math.min(Math.max(proposed, min), max);
    applyWidth(proposed);
  };

  const stopDragging = () => {
    if (!isDragging) return;
    isDragging = false;
    splitter.classList.remove('active');
    document.removeEventListener('pointermove', handlePointerMove);
    document.removeEventListener('pointerup', stopDragging);
    if (lastValue) {
      try {
        localStorage.setItem(SPLIT_STORAGE_KEY, lastValue);
      } catch (err) {
        // ignore storage errors
      }
    }
  };

  splitter.addEventListener('pointerdown', (event) => {
    if (window.matchMedia('(max-width: 780px)').matches || shell.classList.contains('hidden')) {
      return;
    }
    event.preventDefault();
    isDragging = true;
    splitter.classList.add('active');
    document.addEventListener('pointermove', handlePointerMove);
    document.addEventListener('pointerup', stopDragging);
  });

  document.addEventListener('pointercancel', stopDragging);

  splitter.addEventListener('keydown', (event) => {
    if (!['ArrowLeft', 'ArrowRight'].includes(event.key)) return;
    event.preventDefault();
    const { rect, min, max } = bounds();
    const currentValue = parseFloat(
      getComputedStyle(document.documentElement).getPropertyValue('--left'),
    )
      || Math.min(Math.max(rect.width * 0.7, min), max);
    const delta = event.key === 'ArrowLeft' ? -24 : 24;
    const proposed = Math.min(Math.max(currentValue + delta, min), max);
    applyWidth(proposed);
    if (lastValue) {
      try {
        localStorage.setItem(SPLIT_STORAGE_KEY, lastValue);
      } catch (err) {
        // ignore storage errors
      }
    }
  });

  window.addEventListener('resize', () => {
    if (!lastValue) return;
    const value = parseFloat(lastValue);
    const { min, max } = bounds();
    const clamped = Math.min(Math.max(value, min), max);
    applyWidth(clamped);
  });
}

async function renderAlbumIndex() {
  state.releaseId = null;
  state.tracks = [];
  elements.releaseView.classList.add('hidden');
  elements.albumsView.classList.remove('hidden');
  elements.nowPlaying.classList.add('hidden');
  elements.mobileTrackList.classList.remove('active');

  elements.releaseSelector.innerHTML = '';
  const prompt = document.createElement('span');
  prompt.textContent = 'Browse albums';
  elements.releaseSelector.appendChild(prompt);

  const listing = await fetchOptionalText('albums.txt');
  elements.albumsList.innerHTML = '';

  if (!listing) {
    elements.albumsEmpty.classList.remove('hidden');
    return;
  }

  const entries = listing
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith('#'))
    .map((line) => {
      const [idPart, ...titleParts] = line.split('|');
      const releaseId = idPart ? idPart.trim() : '';
      if (!/^\d{8}$/.test(releaseId)) return null;
      const title = titleParts.join('|').trim();
      return {
        releaseId,
        title: title || `XP Health Release — ${formatReleaseDate(releaseId)}`,
      };
    })
    .filter(Boolean);

  if (!entries.length) {
    elements.albumsEmpty.classList.remove('hidden');
    return;
  }

  elements.albumsEmpty.classList.add('hidden');

  entries.forEach((entry) => {
    const item = document.createElement('li');
    item.className = 'albums-list__item';

    const link = document.createElement('a');
    link.className = 'albums-list__link';
    link.href = `${window.location.pathname}?d=${entry.releaseId}`;
    link.textContent = entry.title;

    const meta = document.createElement('span');
    meta.className = 'albums-list__meta';
    meta.textContent = formatReleaseDate(entry.releaseId);

    item.append(link, meta);
    elements.albumsList.appendChild(item);
  });
}

async function loadRelease(releaseId) {
  const normalizedId = (releaseId ?? '').trim();
  if (!normalizedId) {
    await renderAlbumIndex();
    return;
  }

  const folder = normalizedId.replace(/\/+$/, '');
  state.releaseId = normalizedId;
  elements.albumsView.classList.add('hidden');
  elements.releaseView.classList.remove('hidden');
  elements.nowPlaying.classList.add('hidden');
  updateReleaseSelector(normalizedId);

  const dateLabel = formatReleaseDate(normalizedId);
  const albumTitle = `XP Health Release — ${dateLabel}`;
  let albumNotesHtml = '<p class="placeholder">Add `album-notes.txt` to share album context.</p>';
  let albumCoverSrc = null;

  const albumNotesRaw = await fetchOptionalText(`${folder}/album-notes.txt`);
  if (albumNotesRaw) {
    const parsedNotes = parseAlbumNotes(albumNotesRaw);
    if (parsedNotes.cover) {
      albumCoverSrc = parsedNotes.cover;
    }
    if (parsedNotes.body.trim()) {
      albumNotesHtml = renderMarkdown(parsedNotes.body.trim());
    }
  }

  if (!albumCoverSrc) {
    const albumCoverUrlOverride = await fetchOptionalText(`${folder}/album-cover.url`);
    if (albumCoverUrlOverride) {
      albumCoverSrc = albumCoverUrlOverride.trim();
    }
  }

  if (!albumCoverSrc) {
    const albumCoverUrl = `${folder}/album-cover.png`;
    const albumCoverExists = await fileExists(albumCoverUrl);
    if (albumCoverExists) {
      albumCoverSrc = albumCoverUrl;
    }
  }

  if (!albumCoverSrc) {
    albumCoverSrc = PLACEHOLDER_IMAGE;
  }

  elements.albumCover.src = albumCoverSrc;
  elements.mobileAlbumCover.src = albumCoverSrc;
  elements.albumCover.alt = `${dateLabel} album cover`;
  elements.mobileAlbumCover.alt = `${dateLabel} album cover`;
  elements.albumTitle.textContent = albumTitle;
  elements.albumDate.textContent = dateLabel;
  elements.mobileAlbumTitle.textContent = albumTitle;
  elements.mobileAlbumDate.textContent = dateLabel;

  elements.albumNotes.innerHTML = albumNotesHtml;

  const tracks = await discoverTracks(folder);
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

async function discoverTracks(folder) {
  const normalizedFolder = folder.replace(/\/+$/, '');
  const tracks = [];
  for (let i = 1; i <= 50; i += 1) {
    const imagePath = `${normalizedFolder}/${i}.png`;
    const kenburnsPath = `${normalizedFolder}/${i}-kenburns.gif`;
    const audioPath = `${normalizedFolder}/${i}.mp3`;
    const textPath = `${normalizedFolder}/${i}.txt`;

    // eslint-disable-next-line no-await-in-loop
    const [hasImage, hasKenburns, hasAudio, textContent] = await Promise.all([
      fileExists(imagePath),
      fileExists(kenburnsPath),
      fileExists(audioPath),
      fetchOptionalText(textPath),
    ]);

    if (!hasImage && !hasKenburns && !hasAudio && textContent === null) break;

    let parsed = null;
    if (textContent) {
      parsed = parseTrackText(textContent, i);
    }

    const imageOverride = parsed?.image ?? null;
    const audioOverride = parsed?.audio ?? null;
    const kenburnsOverride = parsed?.kenburns ?? null;

    const track = {
      index: i,
      image: imageOverride || (hasImage ? imagePath : PLACEHOLDER_IMAGE),
      kenburns: kenburnsOverride || (hasKenburns ? kenburnsPath : null),
      audio: audioOverride || (hasAudio ? audioPath : null),
      title: parsed?.title ?? `Track ${i}`,
      subtitle: parsed?.subtitle ?? '',
      bodyHtml: parsed?.bodyHtml ?? '',
      links: parsed?.links ?? [],
      duration: null,
    };

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

function parseAlbumNotes(text) {
  const lines = text.replace(/\r/g, '').split('\n');
  let cover = null;
  const body = [];

  lines.forEach((line) => {
    const match = line.trim().match(/^cover\s*:\s*(https?:\/\/\S+)/i);
    if (match && !cover) {
      cover = match[1];
    } else {
      body.push(line);
    }
  });

  return { cover, body: body.join('\n') };
}

function parseTrackText(text, index) {
  const rawLines = text.replace(/\r/g, '').split('\n');
  const metadata = { image: null, audio: null, kenburns: null };
  const contentLines = [];
  let metadataPhase = true;
  let nonEmptyCount = 0;

  rawLines.forEach((rawLine) => {
    const trimmed = rawLine.trim();
    if (metadataPhase) {
      if (!trimmed) {
        return;
      }

      const metaMatch = trimmed.match(/^(image|audio|kenburns)\s*:\s*(https?:\/\/\S+)/i);
      if (metaMatch) {
        const key = metaMatch[1].toLowerCase();
        metadata[key] = metaMatch[2];
        nonEmptyCount += 1;
        return;
      }

      if (/^https?:\/\/\S+$/i.test(trimmed)) {
        if (!metadata.image && nonEmptyCount === 0) {
          metadata.image = trimmed;
          nonEmptyCount += 1;
          return;
        }
        if (!metadata.audio && nonEmptyCount === 1) {
          metadata.audio = trimmed;
          nonEmptyCount += 1;
          return;
        }
      }

      metadataPhase = false;
    }

    contentLines.push(rawLine);
  });

  while (contentLines.length && !contentLines[0].trim()) {
    contentLines.shift();
  }

  const titleLine = contentLines.shift() ?? '';
  const subtitleLine = contentLines.shift() ?? '';
  const rest = contentLines.join('\n');
  const { body, links } = extractLinks(rest);

  return {
    title: titleLine.trim() || `Track ${index}`,
    subtitle: subtitleLine.trim(),
    bodyHtml: body ? renderMarkdown(body) : '',
    links,
    image: metadata.image,
    audio: metadata.audio,
    kenburns: metadata.kenburns,
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

function handleLoadedMetadata() {
  const current = state.tracks[state.currentIndex];
  if (current) {
    current.duration = elements.audio.duration;
    updateDurationDisplay(state.currentIndex, elements.audio.duration);
  }
  updateDuration(elements.audio.duration);
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
          updateHeroForPlayback();
        })
        .catch(() => {
          state.autoplay = false;
          elements.playPauseBtn.textContent = '▶';
          updateUrl();
          updateHeroForPlayback();
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
  updateHeroForPlayback();
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

  const stillImage = track.image || PLACEHOLDER_IMAGE;
  const animatedImage = track.kenburns || stillImage;
  elements.mobileTrackImage.dataset.still = stillImage;
  elements.mobileTrackImage.dataset.playing = animatedImage;
  elements.mobileTrackImage.src = stillImage;
  elements.mobileTrackImage.dataset.current = stillImage;
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
        updateHeroForPlayback();
      })
      .catch(() => {
        elements.playPauseBtn.textContent = '▶';
        state.autoplay = false;
        updateUrl();
        updateHeroForPlayback();
      });
  } else {
    elements.audio.pause();
    elements.playPauseBtn.textContent = '▶';
    state.autoplay = false;
    updateUrl();
    updateHeroForPlayback();
  }
}

function stepTrack(direction) {
  if (!state.tracks.length) return;
  const nextIndex = (state.currentIndex + direction + state.tracks.length) % state.tracks.length;
  selectTrack(nextIndex, { autoplay: true });
}

function handleAudioEnded() {
  updateHeroForPlayback();
  stepTrack(1);
}

function updateHeroForPlayback() {
  const track = state.tracks[state.currentIndex];
  if (!track) return;
  const stillImage = track.image || PLACEHOLDER_IMAGE;
  const animatedImage = track.kenburns || stillImage;
  const shouldAnimate = Boolean(track.kenburns) && !elements.audio.paused;
  const targetSrc = shouldAnimate ? animatedImage : stillImage;
  if (elements.mobileTrackImage.dataset.current !== targetSrc) {
    elements.mobileTrackImage.src = targetSrc;
    elements.mobileTrackImage.dataset.current = targetSrc;
  }
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
  const albumsLink = document.createElement('a');
  albumsLink.className = 'release-selector__link';
  albumsLink.href = window.location.pathname;
  albumsLink.textContent = 'Albums';
  const label = document.createElement('span');
  label.textContent = `Release ${formatReleaseDate(releaseId)}`;
  const shareLink = document.createElement('a');
  shareLink.className = 'link-button';
  shareLink.href = baseUrl.toString();
  shareLink.textContent = 'Open album link';

  elements.releaseSelector.append(albumsLink, label, shareLink);
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

(() => {
  const urlInput   = document.getElementById('urlInput');
  const btnPaste   = document.getElementById('btnPaste');
  const btnClear   = document.getElementById('btnClear');
  const btnSearch  = document.getElementById('btnSearch');
  const errorBox   = document.getElementById('errorBox');
  const errorMsg   = document.getElementById('errorMsg');
  const loadingBox = document.getElementById('loadingBox');
  const resultSection = document.getElementById('resultSection');
  const dlOverlay  = document.getElementById('downloadOverlay');
  const dlStatusText = document.getElementById('dlStatusText');
  const themeToggle = document.getElementById('themeToggle');

  let currentTitle = '';
  const fmtSelection = {};

  // ── 테마 초기화 (기본값: 다크) ──
  const savedTheme = localStorage.getItem('theme') || 'dark';
  document.documentElement.setAttribute('data-theme', savedTheme);

  themeToggle.addEventListener('click', () => {
    const current = document.documentElement.getAttribute('data-theme');
    const next = current === 'dark' ? 'light' : 'dark';
    document.documentElement.setAttribute('data-theme', next);
    localStorage.setItem('theme', next);
  });

  // ── 입력 변화 ──
  urlInput.addEventListener('input', () => {
    btnClear.style.display = urlInput.value ? 'flex' : 'none';
    hideError();
  });

  urlInput.addEventListener('keydown', e => { if (e.key === 'Enter') fetchInfo(); });

  btnPaste.addEventListener('click', async () => {
    try {
      const text = await navigator.clipboard.readText();
      urlInput.value = text;
      btnClear.style.display = text ? 'flex' : 'none';
      urlInput.focus();
      hideError();
    } catch {
      showError('클립보드 접근 권한이 필요합니다. 직접 붙여넣기(Ctrl+V)를 사용해주세요.');
    }
  });

  btnClear.addEventListener('click', () => {
    urlInput.value = '';
    btnClear.style.display = 'none';
    urlInput.focus();
    hideError();
    resultSection.style.display = 'none';
  });

  btnSearch.addEventListener('click', fetchInfo);

  // ── URL 검증 ──
  function isValidYouTubeUrl(url) {
    try {
      const h = new URL(url).hostname;
      return ['www.youtube.com','youtube.com','youtu.be','m.youtube.com'].includes(h);
    } catch { return false; }
  }

  // ── 영상 정보 조회 ──
  async function fetchInfo() {
    const url = urlInput.value.trim();
    if (!url) { showError('YouTube URL을 입력해주세요.'); return; }
    if (!isValidYouTubeUrl(url)) { showError('올바른 YouTube URL을 입력해주세요.'); return; }

    hideError();
    resultSection.style.display = 'none';
    loadingBox.style.display = 'flex';
    btnSearch.disabled = true;

    try {
      const res  = await fetch('/api/info', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ url }) });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || '영상 정보를 가져오지 못했습니다.');
      renderResult(data, url);
    } catch (e) {
      showError(e.message);
    } finally {
      loadingBox.style.display = 'none';
      btnSearch.disabled = false;
    }
  }

  // ── 결과 렌더링 ──
  function renderResult(data, url) {
    currentTitle = data.title || '영상';
    document.getElementById('thumbnail').src = data.thumbnail || '';
    document.getElementById('videoTitle').textContent = data.title || '제목 없음';
    document.getElementById('videoDuration').textContent = data.duration || '';

    // 비디오 옵션 — 같은 화질끼리 그룹화
    const videoList = document.getElementById('videoOptions');
    videoList.innerHTML = '';
    const videoFormats = ['mp4', 'mkv', 'webm'];

    if (data.videoOptions?.length) {
      // quality 기준으로 그룹화
      const groups = {};
      data.videoOptions.forEach(opt => {
        if (!groups[opt.quality]) groups[opt.quality] = [];
        groups[opt.quality].push(opt);
      });

      let rowIdx = 0;
      Object.entries(groups).forEach(([quality, opts]) => {
        const primary = opts.find(o => !o.reencodeH264) || opts[0];
        const h264opt = opts.find(o => o.reencodeH264);

        const rowKey = `v-${rowIdx++}`;
        const h264Key = h264opt ? `v-${rowIdx++}` : null;
        fmtSelection[rowKey] = 'mp4';
        if (h264Key) fmtSelection[h264Key] = 'mp4';

        const codecHtml = primary.macCompat
          ? `<span class="codec-chip codec-mac">${escapeHtml(primary.codec)} ✓</span>`
          : `<span class="codec-chip codec-other">${escapeHtml(primary.codec)}</span>`;

        const chipsHtml = videoFormats.map(f =>
          `<button class="fmt-chip ${f === 'mp4' ? 'active' : ''}" data-row="${rowKey}" data-fmt="${f}">${f.toUpperCase()}</button>`
        ).join('');

        const dlIcon = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>`;

        const item = document.createElement('div');
        item.className = 'option-item';
        item.innerHTML = `
          <div class="option-left">
            <span class="quality-chip">${escapeHtml(quality)}</span>
            ${codecHtml}
            <span class="filesize-text">${escapeHtml(primary.filesize)}</span>
          </div>
          <div class="fmt-chips">${chipsHtml}</div>
          <div class="dl-btns">
            <button class="btn-dl"
              data-row="${rowKey}"
              data-url="${escapeAttr(url)}"
              data-format="${escapeAttr(primary.formatId)}"
              data-type="video"
              data-reencode="${primary.reencodeH264 ? '1' : '0'}">
              ${dlIcon} 다운로드
            </button>
          </div>
        `;
        videoList.appendChild(item);
      });
    } else {
      videoList.innerHTML = '<div class="empty-row">사용 가능한 비디오 옵션이 없습니다.</div>';
    }

    // 오디오 옵션
    const audioList = document.getElementById('audioOptions');
    audioList.innerHTML = '';
    const audioFormats = ['mp3', 'm4a', 'wav'];

    if (data.audioOptions?.length) {
      data.audioOptions.forEach((opt, i) => {
        const rowKey = `a-${i}`;
        fmtSelection[rowKey] = 'mp3';

        const chipsHtml = audioFormats.map(f =>
          `<button class="fmt-chip ${f === 'mp3' ? 'active' : ''}" data-row="${rowKey}" data-fmt="${f}">${f.toUpperCase()}</button>`
        ).join('');

        const item = document.createElement('div');
        item.className = 'option-item';
        item.innerHTML = `
          <div class="option-left">
            <span class="quality-chip">${escapeHtml(opt.quality)}</span>
            <span class="filesize-text">${escapeHtml(opt.format)}</span>
          </div>
          <div class="fmt-chips">${chipsHtml}</div>
          <button class="btn-dl btn-dl-audio"
            data-row="${rowKey}"
            data-url="${escapeAttr(url)}"
            data-format="${escapeAttr(opt.formatId)}"
            data-type="audio"
            data-quality="${escapeAttr(opt.audioQuality || '0')}">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
              <polyline points="7 10 12 15 17 10"/>
              <line x1="12" y1="15" x2="12" y2="3"/>
            </svg>
            다운로드
          </button>
        `;
        audioList.appendChild(item);
      });
    }

    resultSection.style.display = 'block';
    resultSection.scrollIntoView({ behavior: 'smooth', block: 'nearest' });

    // 포맷 칩 클릭 이벤트
    document.querySelectorAll('.fmt-chip').forEach(chip => {
      chip.addEventListener('click', () => {
        const row = chip.dataset.row;
        const fmt = chip.dataset.fmt;
        fmtSelection[row] = fmt;
        document.querySelectorAll(`.fmt-chip[data-row="${row}"]`).forEach(c => c.classList.remove('active'));
        chip.classList.add('active');
      });
    });

    // 다운로드 버튼 이벤트
    document.querySelectorAll('.btn-dl').forEach(btn => {
      btn.addEventListener('click', () => startDownload(btn));
    });
  }

  // ── 다운로드 ──
  async function startDownload(btn) {
    const url         = btn.dataset.url;
    const formatId    = btn.dataset.format;
    const type        = btn.dataset.type;
    const audioQuality= btn.dataset.quality || '0';
    const reencodeH264= btn.dataset.reencode === '1';
    const rowKey      = btn.dataset.row;
    const outputFormat= fmtSelection[rowKey] || (type === 'audio' ? 'mp3' : 'mp4');

    dlStatusText.textContent = reencodeH264 ? 'H.264로 변환 중...' : '다운로드 준비 중';
    dlOverlay.style.display = 'flex';

    try {
      const res = await fetch('/api/download', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url, formatId, type, audioQuality, title: currentTitle, reencodeH264, outputFormat })
      });

      if (!res.ok) {
        let msg = '다운로드에 실패했습니다.';
        try { msg = (await res.json()).error || msg; } catch {}
        throw new Error(msg);
      }

      const disposition = res.headers.get('Content-Disposition') || '';
      let filename = currentTitle + '.' + outputFormat;
      const m = disposition.match(/filename\*=UTF-8''(.+)/i);
      if (m) { try { filename = decodeURIComponent(m[1]); } catch {} }

      const blob    = await res.blob();
      const blobUrl = URL.createObjectURL(blob);
      const a       = document.createElement('a');
      a.href = blobUrl;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(blobUrl);

    } catch (e) {
      showError('다운로드 오류: ' + e.message);
    } finally {
      dlOverlay.style.display = 'none';
    }
  }

  function showError(msg) { errorMsg.textContent = msg; errorBox.style.display = 'flex'; }
  function hideError()    { errorBox.style.display = 'none'; }

  function escapeHtml(s) {
    return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
  }
  function escapeAttr(s) { return String(s).replace(/"/g,'&quot;'); }
})();

async function loadBuildInfo() {
  const loading = document.getElementById('buildLoading');
  const error = document.getElementById('buildError');
  const details = document.getElementById('buildDetails');

  loading.classList.remove('hidden');
  error.classList.add('hidden');
  details.classList.add('hidden');

  try {
    // Cache-bust so deploys always show fresh build metadata
    const res = await fetch('/api/build?t=' + Date.now(), { cache: 'no-store' });
    if (!res.ok) throw new Error('HTTP ' + res.status);
    const data = await res.json();

    document.getElementById('buildShort').textContent = data.shortCommit || data.commit || '—';
    document.getElementById('buildCommit').textContent = data.commit || '—';
    document.getElementById('buildBranch').textContent = data.branch || '—';
    document.getElementById('buildMessage').textContent = data.commitMessage || '—';
    document.getElementById('buildCommitTime').textContent = formatMaybeDate(data.commitTime);
    document.getElementById('buildTime').textContent = formatMaybeDate(data.buildTimeUtc);
    document.getElementById('buildEnv').textContent = data.environment || '—';
    document.getElementById('buildServerTime').textContent = formatMaybeDate(data.serverTimeUtc);
    const hasAbout = document.getElementById('buildHasAbout');
    if (hasAbout) hasAbout.textContent = data.hasAboutHtml === true ? 'yes' : 'no';
    const www = document.getElementById('buildWwwFiles');
    if (www) www.textContent = Array.isArray(data.wwwRootFiles) ? data.wwwRootFiles.join(', ') : '—';

    // Highlight short commit for easy compare
    document.title = `About · ${data.shortCommit || 'build'} · WorkOut`;

    loading.classList.add('hidden');
    details.classList.remove('hidden');
  } catch (err) {
    loading.classList.add('hidden');
    error.textContent = 'Could not load build info: ' + err.message;
    error.classList.remove('hidden');
  }
}

function formatMaybeDate(value) {
  if (!value) return '—';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value;
  return d.toLocaleString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    timeZoneName: 'short'
  }) + ` (${value})`;
}

document.addEventListener('DOMContentLoaded', () => {
  loadBuildInfo();
  document.getElementById('refreshBuildBtn').addEventListener('click', loadBuildInfo);
});

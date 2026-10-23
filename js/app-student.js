/* STZU-SDI 就业信息平台 - 同学版（只读）*/
/* 数据源：优先同目录 data/jobs-data.json（GitHub Pages / 本地服务器均可用），失败再回退到 GitHub Raw */
const DATA_URL = 'data/jobs-data.json';
const DATA_URL_FALLBACK = 'https://raw.githubusercontent.com/X-youth/stzu-sdi-jobs/main/data/jobs-data.json';

let jobs = [];
let filtered = [];
let searchQuery = '';
let activeChannel = '';
let sortBy = 'relevance';
let filters = { category: '', location: '', source: '' };

// 通道定义
const CHANNELS = {
  industrial: { name: '工业设计', keywords: ['工业设计', '产品设计', 'CMF', '汽车设计', '交通工具', '智能硬件', '家电', '消费电子', '结构', '材料', '工艺'] },
  artstech: { name: '艺术与科技', keywords: ['交互', 'UX', 'UI', '用户体验', '游戏', '数字媒体', 'AIGC', '虚拟现实', 'VR', 'AR', '元宇宙', '人工智能', '算法', '数据可视化'] },
  newmedia: { name: '新媒体艺术', keywords: ['视觉设计', '平面', '插画', '动画', '影视', '品牌', '新媒体', '短视频', '摄影', '广告', '创意', '策划', '文案', '编辑'] },
  fashion: { name: '服装设计', keywords: ['服装', '服饰', '纺织', '首饰', '时尚', '面料', '版型', '穿搭'] },
  env: { name: '环境设计', keywords: ['室内', '景观', '展陈', '空间设计', '软装', '建筑', '规划', '园林', '装饰'] }
};

// 自动归类
function autoClassify(job) {
  const text = [job.company, job.position, job.category, job.location, job.details, job.source].filter(Boolean).join(' ').toLowerCase();
  const channels = [];
  for (const [key, ch] of Object.entries(CHANNELS)) {
    if (ch.keywords.some(k => text.includes(k.toLowerCase()))) channels.push(key);
  }
  return channels;
}

// 加载数据
async function loadData() {
  const urls = [DATA_URL + '?t=' + Date.now(), DATA_URL_FALLBACK + '?t=' + Date.now()];
  for (const url of urls) {
    try {
      const res = await fetch(url);
      if (!res.ok) throw new Error('HTTP ' + res.status);
      const data = await res.json();
      jobs = Array.isArray(data) ? data : (data.jobs || []);
      if (!jobs.length) throw new Error('数据为空');
      jobs.forEach(j => { j.channels = autoClassify(j); });
      applyFilters();
      updateStats();
      toast('✅ 数据加载完成，共 ' + jobs.length + ' 条');
      return;
    } catch (e) {
      console.warn('数据源失败:', url, e.message);
    }
  }
  toast('❌ 数据加载失败，请刷新重试');
}

// 搜索
function matchesSearch(job, q) {
  if (!q) return true;
  const text = [job.company, job.position, job.category, job.location, job.details, job.source].filter(Boolean).join(' ').toLowerCase();
  return text.includes(q.toLowerCase());
}

function matchesChannel(job) {
  if (!activeChannel) return true;
  return job.channels && job.channels.includes(activeChannel);
}

function matchesFilters(job) {
  if (filters.category && job.category !== filters.category) return false;
  if (filters.location && !(job.location || '').includes(filters.location)) return false;
  if (filters.source && job.source !== filters.source) return false;
  return true;
}

function applyFilters() {
  filtered = jobs.filter(j => matchesSearch(j, searchQuery) && matchesChannel(j) && matchesFilters(j));
  sortJobs();
  renderList();
  renderFilters();
  updateCounts();
}

function sortJobs() {
  if (sortBy === 'company') {
    filtered.sort((a, b) => (a.company || '').localeCompare(b.company || ''));
  } else if (sortBy === 'date') {
    filtered.sort((a, b) => (b.date || '').localeCompare(a.date || ''));
  } else {
    if (searchQuery) {
      filtered.sort((a, b) => {
        const aScore = relevanceScore(a, searchQuery);
        const bScore = relevanceScore(b, searchQuery);
        return bScore - aScore;
      });
    }
  }
}

function relevanceScore(job, q) {
  let score = 0;
  const text = [job.company, job.position, job.category, job.location].filter(Boolean).join(' ').toLowerCase();
  if (text.includes(q.toLowerCase())) score += 10;
  if ((job.position || '').toLowerCase().includes(q.toLowerCase())) score += 20;
  if ((job.company || '').toLowerCase().includes(q.toLowerCase())) score += 15;
  return score;
}

// 渲染
function renderList() {
  const wrap = document.getElementById('listWrap');
  const empty = document.getElementById('emptyState');
  if (filtered.length === 0) {
    wrap.innerHTML = '';
    empty.hidden = false;
    return;
  }
  empty.hidden = true;
  wrap.innerHTML = filtered.map((job, i) => {
    const chTags = (job.channels || []).map(c => `<span class="tag tag-channel">${CHANNELS[c]?.name || c}</span>`).join('');
    return `
    <div class="job-card" data-id="${i}">
      <div class="job-main">
        <div class="job-company">${escapeHtml(job.company || '—')}</div>
        <div class="job-position">${escapeHtml(job.position || '—')}</div>
        <div class="job-meta">
          ${job.location ? `<span class="tag">📍 ${escapeHtml(job.location)}</span>` : ''}
          ${job.salary ? `<span class="tag tag-salary">💰 ${escapeHtml(job.salary)}</span>` : ''}
          ${job.category ? `<span class="tag tag-cat">${escapeHtml(job.category)}</span>` : ''}
          ${chTags}
        </div>
      </div>
      <div class="job-side">
        <span class="job-source">${escapeHtml(job.source || '—')}</span>
        <button class="btn-detail" onclick="showDetail(${i})">详情</button>
      </div>
    </div>`;
  }).join('');
}

function renderFilters() {
  const cats = [...new Set(jobs.map(j => j.category).filter(Boolean))].sort();
  const locs = [...new Set(jobs.map(j => j.location).filter(Boolean))].sort();
  const srcs = [...new Set(jobs.map(j => j.source).filter(Boolean))].sort();
  const catSel = document.getElementById('filterCategory');
  const locSel = document.getElementById('filterLocation');
  const srcSel = document.getElementById('filterSource');
  catSel.innerHTML = '<option value="">全部</option>' + cats.map(c => `<option ${c === filters.category ? 'selected' : ''}>${escapeHtml(c)}</option>`).join('');
  locSel.innerHTML = '<option value="">全部</option>' + locs.map(l => `<option ${l === filters.location ? 'selected' : ''}>${escapeHtml(l)}</option>`).join('');
  srcSel.innerHTML = '<option value="">全部</option>' + srcs.map(s => `<option ${s === filters.source ? 'selected' : ''}>${escapeHtml(s)}</option>`).join('');
}

function updateCounts() {
  document.getElementById('resultCount').textContent = filtered.length;
  document.getElementById('totalCount').textContent = jobs.length;
  document.getElementById('chipTotal').textContent = jobs.length;
}

function updateStats() {
  document.getElementById('statTotal').textContent = jobs.length;
  document.getElementById('statCompanies').textContent = new Set(jobs.map(j => j.company).filter(Boolean)).size;
  document.getElementById('statLocations').textContent = new Set(jobs.map(j => j.location).filter(Boolean)).size;
  document.getElementById('statSources').textContent = new Set(jobs.map(j => j.source).filter(Boolean)).size;

  // 城市 Top 12
  const cityCount = {};
  jobs.forEach(j => { if (j.location) cityCount[j.location] = (cityCount[j.location] || 0) + 1; });
  const topCities = Object.entries(cityCount).sort((a, b) => b[1] - a[1]).slice(0, 12);
  const maxCity = topCities[0]?.[1] || 1;
  document.getElementById('chartLocations').innerHTML = topCities.map(([city, n]) =>
    `<div class="bar-row"><span class="bar-label">${escapeHtml(city)}</span><div class="bar-track"><div class="bar-fill" style="width:${(n / maxCity * 100)}%"></div></div><span class="bar-num">${n}</span></div>`
  ).join('');

  // 岗位分布
  const catCount = {};
  jobs.forEach(j => { if (j.category) catCount[j.category] = (catCount[j.category] || 0) + 1; });
  const topCats = Object.entries(catCount).sort((a, b) => b[1] - a[1]).slice(0, 8);
  const totalCats = topCats.reduce((s, [, n]) => s + n, 0);
  document.getElementById('chartCategories').innerHTML = topCats.map(([cat, n]) =>
    `<div class="pie-row"><span class="pie-label">${escapeHtml(cat)}</span><div class="pie-bar"><div class="pie-fill" style="width:${(n / totalCats * 100)}%"></div></div><span class="pie-num">${n}</span></div>`
  ).join('');

  // 来源占比
  const srcCount = {};
  jobs.forEach(j => { if (j.source) srcCount[j.source] = (srcCount[j.source] || 0) + 1; });
  const totalSrc = Object.values(srcCount).reduce((s, n) => s + n, 0);
  document.getElementById('chartSources').innerHTML = Object.entries(srcCount).sort((a, b) => b[1] - a[1]).map(([src, n]) =>
    `<div class="src-row"><span class="src-label">${escapeHtml(src)}</span><div class="src-bar"><div class="src-fill" style="width:${(n / totalSrc * 100)}%"></div></div><span class="src-num">${n} (${Math.round(n / totalSrc * 100)}%)</span></div>`
  ).join('');
}

// 详情
function showDetail(idx) {
  const job = filtered[idx];
  const drawer = document.getElementById('detailDrawer');
  const content = document.getElementById('detailContent');
  const chNames = (job.channels || []).map(c => CHANNELS[c]?.name || c).join('、');
  const item = (label, val, span) => val
    ? `<div class="detail-item${span ? ' span-2' : ''}"><span class="detail-label">${label}</span><span>${escapeHtml(val)}</span></div>`
    : '';
  const longItem = (label, val) => val
    ? `<div class="detail-item span-2"><span class="detail-label">${label}</span><div class="detail-text">${escapeHtml(val).replace(/\n/g, '<br>')}</div></div>`
    : '';
  const linkHtml = job.link
    ? (/^https?:\/\//i.test(job.link)
        ? `<a href="${escapeHtml(job.link)}" target="_blank" class="detail-link">${escapeHtml(job.link)}</a>`
        : `<span>${escapeHtml(job.link)}</span>`)
    : '';
  content.innerHTML = `
    <div class="detail-header">
      <div class="detail-company">${escapeHtml(job.company || '—')}</div>
      <div class="detail-position">${escapeHtml(job.position || '—')}</div>
      <div class="detail-tags">
        ${job.location ? `<span class="tag">📍 ${escapeHtml(job.location)}</span>` : ''}
        ${job.salary ? `<span class="tag tag-salary">💰 ${escapeHtml(job.salary)}</span>` : ''}
        ${job.category ? `<span class="tag tag-cat">${escapeHtml(job.category)}</span>` : ''}
        ${chNames ? `<span class="tag tag-channel">🎯 ${chNames}</span>` : ''}
      </div>
    </div>
    <div class="detail-grid">
      ${item('信息来源', job.source)}
      ${item('发布日期', job.date)}
      ${item('招聘对象', job.target)}
      ${item('招聘人数', job.count)}
      ${item('对口专业', job.major)}
      ${item('作品集', job.portfolio)}
      ${item('投递截止', job.deadline)}
      ${item('时效状态', job.status)}
      ${item('企业性质', job.companyType)}
      ${item('总分线', job.scoreTotal)}
      ${item('单科线', job.scoreSingle)}
      ${linkHtml ? `<div class="detail-item span-2"><span class="detail-label">投递方式 / 链接</span>${linkHtml}</div>` : ''}
      ${longItem('招聘要求 / 核心业务', job.details)}
      ${longItem('备注', job.note)}
    </div>`;
  drawer.classList.add('open');
}

function closeDetail() {
  document.getElementById('detailDrawer').classList.remove('open');
}

// 分享
function buildShareLink() {
  const params = new URLSearchParams();
  if (searchQuery) params.set('q', searchQuery);
  if (activeChannel) params.set('ch', activeChannel);
  if (filters.category) params.set('cat', filters.category);
  if (filters.location) params.set('loc', filters.location);
  return location.origin + location.pathname + '?' + params.toString();
}

function exportCSV() {
  const rows = [['公司', '岗位', '地点', '薪资', '分类', '来源', '日期', '链接']];
  filtered.forEach(j => rows.push([j.company, j.position, j.location, j.salary, j.category, j.source, j.date, j.link].map(v => `"${(v || '').replace(/"/g, '""')}"`)));
  const csv = rows.map(r => r.join(',')).join('\n');
  downloadFile(csv, 'text/csv', 'stzu-jobs.csv');
}

function exportJSON() {
  downloadFile(JSON.stringify(filtered, null, 2), 'application/json', 'stzu-jobs.json');
}

function downloadFile(content, type, name) {
  const blob = new Blob([content], { type });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = name;
  a.click();
}

// 工具
function escapeHtml(s) {
  if (!s) return '';
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function toast(msg, ms = 3000) {
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.classList.add('show');
  setTimeout(() => t.classList.remove('show'), ms);
}

// 事件绑定
document.addEventListener('DOMContentLoaded', () => {
  loadData();

  // 搜索
  const searchInput = document.getElementById('search');
  searchInput.addEventListener('input', e => { searchQuery = e.target.value; applyFilters(); });
  document.getElementById('searchClear').addEventListener('click', () => { searchInput.value = ''; searchQuery = ''; applyFilters(); });

  // 通道
  document.querySelectorAll('.chip').forEach(c => c.addEventListener('click', () => {
    document.querySelectorAll('.chip').forEach(x => x.classList.remove('active'));
    c.classList.add('active');
    activeChannel = c.dataset.channel;
    applyFilters();
  }));

  // 筛选
  ['filterCategory', 'filterLocation', 'filterSource'].forEach(id => {
    document.getElementById(id).addEventListener('change', e => {
      const key = id.replace('filter', '').toLowerCase();
      filters[key] = e.target.value;
      applyFilters();
    });
  });

  // 排序
  document.querySelectorAll('.sort-btn').forEach(b => b.addEventListener('click', () => {
    document.querySelectorAll('.sort-btn').forEach(x => x.classList.remove('active'));
    b.classList.add('active');
    sortBy = b.dataset.sort;
    applyFilters();
  }));

  // 清除筛选
  document.getElementById('clearAllFilters').addEventListener('click', e => {
    e.preventDefault();
    searchQuery = ''; activeChannel = ''; filters = { category: '', location: '', source: '' };
    searchInput.value = '';
    document.querySelectorAll('.chip').forEach(x => x.classList.remove('active'));
    document.querySelector('.chip').classList.add('active');
    applyFilters();
  });

  // 详情关闭
  document.querySelectorAll('[data-close]').forEach(el => el.addEventListener('click', closeDetail));
  document.addEventListener('keydown', e => { if (e.key === 'Escape') closeDetail(); });

  // 分享
  document.getElementById('shareBtn').addEventListener('click', () => {
    document.getElementById('shareLink').value = buildShareLink();
    document.getElementById('shareModal').classList.add('open');
  });
  document.getElementById('copyLink').addEventListener('click', () => {
    navigator.clipboard.writeText(document.getElementById('shareLink').value);
    toast('✅ 链接已复制');
  });
  document.getElementById('exportCsv').addEventListener('click', exportCSV);
  document.getElementById('exportJson').addEventListener('click', exportJSON);
  document.getElementById('exportFiltered').addEventListener('click', () => exportJSON());

  // 从 URL 恢复筛选
  const params = new URLSearchParams(location.search);
  if (params.get('q')) { searchQuery = params.get('q'); searchInput.value = searchQuery; }
  if (params.get('ch')) { activeChannel = params.get('ch'); document.querySelector(`[data-channel="${activeChannel}"]`)?.classList.add('active'); document.querySelector('.chip')?.classList.remove('active'); }
  if (params.get('cat')) filters.category = params.get('cat');
  if (params.get('loc')) filters.location = params.get('loc');

  // 标签切换
  document.querySelectorAll('.tab').forEach(t => t.addEventListener('click', () => {
    document.querySelectorAll('.tab').forEach(x => x.classList.remove('active'));
    t.classList.add('active');
    document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
    document.getElementById('tab-' + t.dataset.tab).classList.add('active');
  }));
});

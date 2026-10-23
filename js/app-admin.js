/* STZU-SDI 就业信息平台 - 管理版（完整功能 + GitHub 同步）*/
const DATA_URL = 'data/jobs-data.json';
const DATA_URL_FALLBACK = 'https://raw.githubusercontent.com/X-youth/stzu-sdi-jobs/main/data/jobs-data.json';
const GITHUB_TOKEN_KEY = 'stzu_github_token';
const GITHUB_REPO = 'X-youth/stzu-sdi-jobs';
const GITHUB_FILE_PATH = 'data/jobs-data.json';

let jobs = [];
let filtered = [];
let searchQuery = '';
let activeChannel = '';
let sortBy = 'relevance';
let filters = { category: '', location: '', source: '' };
let classifyResults = [];

// 通道定义
const CHANNELS = {
  industrial: { name: '工业设计', keywords: ['工业设计', '产品设计', 'CMF', '汽车设计', '交通工具', '智能硬件', '家电', '消费电子', '结构', '材料', '工艺'] },
  artstech: { name: '艺术与科技', keywords: ['交互', 'UX', 'UI', '用户体验', '游戏', '数字媒体', 'AIGC', '虚拟现实', 'VR', 'AR', '元宇宙', '人工智能', '算法', '数据可视化'] },
  newmedia: { name: '新媒体艺术', keywords: ['视觉设计', '平面', '插画', '动画', '影视', '品牌', '新媒体', '短视频', '摄影', '广告', '创意', '策划', '文案', '编辑'] },
  fashion: { name: '服装设计', keywords: ['服装', '服饰', '纺织', '首饰', '时尚', '面料', '版型', '穿搭'] },
  env: { name: '环境设计', keywords: ['室内', '景观', '展陈', '空间设计', '软装', '建筑', '规划', '园林', '装饰'] }
};

function autoClassify(job) {
  const text = [job.company, job.position, job.category, job.location, job.details, job.source].filter(Boolean).join(' ').toLowerCase();
  const channels = [];
  for (const [key, ch] of Object.entries(CHANNELS)) {
    if (ch.keywords.some(k => text.includes(k.toLowerCase()))) channels.push(key);
  }
  return channels;
}

// ===== GitHub 同步 =====
function getGitHubToken() {
  return localStorage.getItem(GITHUB_TOKEN_KEY) || '';
}

async function syncToGitHub() {
  const token = getGitHubToken();
  if (!token) {
    toast('⚠️ 未设置 GitHub Token，数据仅保存在本地');
    return false;
  }

  try {
    // 获取当前文件 SHA
    const shaRes = await fetch(`https://api.github.com/repos/${GITHUB_REPO}/contents/${GITHUB_FILE_PATH}`, {
      headers: { 'Authorization': `token ${token}`, 'User-Agent': 'STZU-SDI' }
    });
    let sha = null;
    if (shaRes.ok) {
      const data = await shaRes.json();
      sha = data.sha;
    }

    // 上传新数据
    const content = btoa(unescape(encodeURIComponent(JSON.stringify(jobs, null, 2))));
    const res = await fetch(`https://api.github.com/repos/${GITHUB_REPO}/contents/${GITHUB_FILE_PATH}`, {
      method: 'PUT',
      headers: {
        'Authorization': `token ${token}`,
        'User-Agent': 'STZU-SDI',
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        message: 'Update jobs data - ' + new Date().toLocaleString('zh-CN'),
        content: content,
        sha: sha,
        branch: 'main'
      })
    });

    if (res.ok) {
      toast('✅ 数据已同步到云端');
      return true;
    } else {
      const err = await res.json();
      console.error('同步失败:', err);
      toast('❌ 同步失败: ' + (err.message || '未知错误'));
      return false;
    }
  } catch (e) {
    console.error('同步异常:', e);
    toast('❌ 同步失败，请检查网络');
    return false;
  }
}

// ===== 数据加载 =====
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
  toast('❌ 数据加载失败');
}

// ===== 搜索筛选 =====
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
      filtered.sort((a, b) => relevanceScore(b, searchQuery) - relevanceScore(a, searchQuery));
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

// ===== 渲染 =====
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

  const cityCount = {};
  jobs.forEach(j => { if (j.location) cityCount[j.location] = (cityCount[j.location] || 0) + 1; });
  const topCities = Object.entries(cityCount).sort((a, b) => b[1] - a[1]).slice(0, 12);
  const maxCity = topCities[0]?.[1] || 1;
  document.getElementById('chartLocations').innerHTML = topCities.map(([city, n]) =>
    `<div class="bar-row"><span class="bar-label">${escapeHtml(city)}</span><div class="bar-track"><div class="bar-fill" style="width:${(n / maxCity * 100)}%"></div></div><span class="bar-num">${n}</span></div>`
  ).join('');

  const catCount = {};
  jobs.forEach(j => { if (j.category) catCount[j.category] = (catCount[j.category] || 0) + 1; });
  const topCats = Object.entries(catCount).sort((a, b) => b[1] - a[1]).slice(0, 8);
  const totalCats = topCats.reduce((s, [, n]) => s + n, 0);
  document.getElementById('chartCategories').innerHTML = topCats.map(([cat, n]) =>
    `<div class="pie-row"><span class="pie-label">${escapeHtml(cat)}</span><div class="pie-bar"><div class="pie-fill" style="width:${(n / totalCats * 100)}%"></div></div><span class="pie-num">${n}</span></div>`
  ).join('');

  const srcCount = {};
  jobs.forEach(j => { if (j.source) srcCount[j.source] = (srcCount[j.source] || 0) + 1; });
  const totalSrc = Object.values(srcCount).reduce((s, n) => s + n, 0);
  document.getElementById('chartSources').innerHTML = Object.entries(srcCount).sort((a, b) => b[1] - a[1]).map(([src, n]) =>
    `<div class="src-row"><span class="src-label">${escapeHtml(src)}</span><div class="src-bar"><div class="src-fill" style="width:${(n / totalSrc * 100)}%"></div></div><span class="src-num">${n} (${Math.round(n / totalSrc * 100)}%)</span></div>`
  ).join('');
}

// ===== 详情 =====
function showDetail(idx) {
  const job = filtered[idx];
  const drawer = document.getElementById('detailDrawer');
  const content = document.getElementById('detailContent');
  const chNames = (job.channels || []).map(c => CHANNELS[c]?.name || c).join('、');
  const item = (label, val) => val
    ? `<div class="detail-item"><span class="detail-label">${label}</span><span>${escapeHtml(val)}</span></div>`
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

// ===== 一键整理 =====
function parseTextLocal(text) {
  const results = [];
  const blocks = text.split(/\n\s*\n/).filter(b => b.trim());
  for (const block of blocks) {
    const job = { company: '', position: '', category: '', location: '', salary: '', link: '', date: '', details: block.trim() };
    // 提取公司
    const companyMatch = block.match(/([^\n:：]{2,30}(?:公司|集团|科技|有限|工作室|事务所|设计院|品牌|机构))/);
    if (companyMatch) job.company = companyMatch[1].trim();
    // 提取岗位
    const posMatch = block.match(/(?:招聘|诚聘|岗位|职位)[：: ]*([^\n,，]{2,30})/);
    if (posMatch) job.position = posMatch[1].trim();
    else {
      const posMatch2 = block.match(/(设计师|工程师|专员|经理|主管|总监|助理|实习生|运营|策划|开发|产品|市场)/);
      if (posMatch2) job.position = posMatch2[1];
    }
    // 提取地点
    const locMatch = block.match(/(?:地点|城市|工作地|base|Base)[：: ]*([^\n,，]{2,20})/);
    if (locMatch) job.location = locMatch[1].trim();
    else {
      const cities = ['北京', '上海', '广州', '深圳', '杭州', '成都', '南京', '武汉', '西安', '苏州', '长沙', '重庆', '天津', '青岛', '厦门', '合肥', '佛山', '东莞', '珠海', '远程'];
      for (const city of cities) if (block.includes(city)) { job.location = city; break; }
    }
    // 提取薪资
    const salMatch = block.match(/(\d+[-~]\d+[Kk]|\d+[Kk][-+]\d+[Kk]|\d+[-~]\d+万|薪资[：: ]*[^\n,，]{2,20})/);
    if (salMatch) job.salary = salMatch[1].trim();
    // 提取链接
    const linkMatch = block.match(/(https?:\/\/[^\s<>"{}|\\^`[\]]+)/);
    if (linkMatch) job.link = linkMatch[1];
    // 提取邮箱
    const emailMatch = block.match(/([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/);
    if (emailMatch && !job.link) job.link = emailMatch[1];
    // 自动分类
    job.channels = autoClassify(job);
    if (job.channels.length > 0) job.category = CHANNELS[job.channels[0]].name;
    if (job.company || job.position) results.push(job);
  }
  return results;
}

async function classifyText() {
  const text = document.getElementById('pasteArea').value.trim();
  if (!text) { toast('请先粘贴内容'); return; }

  const btn = document.getElementById('classifyBtn');
  btn.disabled = true;
  btn.textContent = '🤖 识别中...';

  // 尝试 AI 识别
  const aiKey = localStorage.getItem('stzu_ai_key');
  let results = [];
  if (aiKey) {
    try {
      const res = await fetch('https://api.deepseek.com/chat/completions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + aiKey },
        body: JSON.stringify({
          model: 'deepseek-chat',
          messages: [
            { role: 'system', content: '你是一个招聘信息提取助手。从用户提供的文本中提取所有招聘岗位信息，返回 JSON 数组。每个岗位包含: company(公司), position(岗位), category(分类), location(地点), salary(薪资), link(投递链接), date(日期), details(详情)。如果文本中有多个岗位，提取全部。只返回 JSON，不要其他文字。' },
            { role: 'user', content: text }
          ],
          temperature: 0.1
        })
      });
      if (res.ok) {
        const data = await res.json();
        const content = data.choices[0].message.content;
        const jsonMatch = content.match(/\[[\s\S]*\]/);
        if (jsonMatch) {
          results = JSON.parse(jsonMatch[0]);
          results.forEach(j => { j.channels = autoClassify(j); });
          toast('✅ AI 识别出 ' + results.length + ' 条岗位');
        }
      }
    } catch (e) {
      console.error('AI 识别失败:', e);
    }
  }

  // AI 失败或无 Key，用本地规则
  if (results.length === 0) {
    results = parseTextLocal(text);
    toast('📋 本地规则识别出 ' + results.length + ' 条岗位' + (aiKey ? '' : '（设置 AI Key 可更精准）'));
  }

  classifyResults = results;
  renderClassifyResults();
  btn.disabled = false;
  btn.textContent = '🤖 AI 智能识别并整理';
}

function renderClassifyResults() {
  const panel = document.getElementById('resultPanel');
  if (classifyResults.length === 0) {
    panel.innerHTML = '<div class="result-empty"><div class="result-empty-ico">🕳️</div><p>还没有整理结果</p></div>';
    return;
  }
  panel.innerHTML = classifyResults.map((job, i) => `
    <div class="result-item" data-idx="${i}">
      <div class="result-item-head" onclick="toggleResultEdit(${i})">
        <div class="result-item-info">
          <div class="result-item-company">${escapeHtml(job.company || '—')}</div>
          <div class="result-item-position">${escapeHtml(job.position || '—')}</div>
        </div>
        <div class="result-item-tags">
          ${job.location ? `<span class="tag">📍 ${escapeHtml(job.location)}</span>` : ''}
          ${job.salary ? `<span class="tag tag-salary">💰 ${escapeHtml(job.salary)}</span>` : ''}
          ${job.category ? `<span class="tag tag-cat">${escapeHtml(job.category)}</span>` : ''}
        </div>
        <div class="result-item-actions">
          <button class="btn-small btn-ghost" onclick="event.stopPropagation(); toggleResultEdit(${i})">✏️ 展开编辑</button>
          <button class="btn-small btn-primary" onclick="event.stopPropagation(); addResultToJobs(${i})">✅ 添加入库</button>
        </div>
      </div>
      <div class="result-item-edit" id="edit-${i}" hidden>
        <div class="form-grid">
          <label><span>公司</span><input value="${escapeHtml(job.company || '')}" onchange="classifyResults[${i}].company=this.value; refreshResultPreview(${i})" /></label>
          <label><span>岗位</span><input value="${escapeHtml(job.position || '')}" onchange="classifyResults[${i}].position=this.value; refreshResultPreview(${i})" /></label>
          <label><span>分类</span><input value="${escapeHtml(job.category || '')}" onchange="classifyResults[${i}].category=this.value; refreshResultPreview(${i})" /></label>
          <label><span>地点</span><input value="${escapeHtml(job.location || '')}" onchange="classifyResults[${i}].location=this.value; refreshResultPreview(${i})" /></label>
          <label><span>薪资</span><input value="${escapeHtml(job.salary || '')}" onchange="classifyResults[${i}].salary=this.value; refreshResultPreview(${i})" /></label>
          <label><span>日期</span><input type="date" value="${escapeHtml(job.date || '')}" onchange="classifyResults[${i}].date=this.value" /></label>
          <label class="span-2"><span>投递链接</span><input value="${escapeHtml(job.link || '')}" onchange="classifyResults[${i}].link=this.value" /></label>
          <label class="span-2"><span>备注</span><textarea rows="2" onchange="classifyResults[${i}].details=this.value">${escapeHtml(job.details || '')}</textarea></label>
        </div>
      </div>
    </div>`).join('');
}

function toggleResultEdit(i) {
  const el = document.getElementById('edit-' + i);
  el.hidden = !el.hidden;
}

function refreshResultPreview(i) {
  // 简单刷新整个面板
  renderClassifyResults();
  document.getElementById('edit-' + i).hidden = false;
}

async function addResultToJobs(i) {
  const job = classifyResults[i];
  job.channels = autoClassify(job);
  jobs.push(job);
  applyFilters();
  updateStats();
  toast('✅ 已入库，正在同步...');
  const ok = await syncToGitHub();
  if (ok) {
    const btn = document.querySelector(`.result-item[data-idx="${i}"] .btn-primary`);
    if (btn) { btn.textContent = '✓ 已入库'; btn.classList.add('btn-success'); }
  }
}

// ===== 手动添加 =====
function openAddModal() {
  document.getElementById('addModal').classList.add('open');
}

function closeAddModal() {
  document.getElementById('addModal').classList.remove('open');
}

async function handleAddSubmit(e) {
  e.preventDefault();
  const form = e.target;
  const job = {
    company: form.company.value.trim(),
    position: form.position.value.trim(),
    location: form.location.value.trim(),
    salary: form.salary.value.trim(),
    category: form.category.value.trim(),
    date: form.date.value,
    link: form.link.value.trim(),
    details: form.details.value.trim()
  };
  job.channels = autoClassify(job);
  jobs.push(job);
  applyFilters();
  updateStats();
  closeAddModal();
  form.reset();
  toast('✅ 已添加，正在同步...');
  await syncToGitHub();
}

// ===== 分享导出 =====
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

// ===== 工具 =====
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

// ===== 事件绑定 =====
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
  document.addEventListener('keydown', e => { if (e.key === 'Escape') { closeDetail(); closeAddModal(); } });

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
  document.getElementById('exportFiltered').addEventListener('click', exportJSON);

  // 手动添加
  document.getElementById('manualAddBtn').addEventListener('click', openAddModal);
  document.getElementById('addCancel').addEventListener('click', closeAddModal);
  document.getElementById('addForm').addEventListener('submit', handleAddSubmit);

  // 一键整理
  document.getElementById('classifyBtn').addEventListener('click', classifyText);
  document.getElementById('pasteClear').addEventListener('click', () => { document.getElementById('pasteArea').value = ''; });
  document.getElementById('dzPickBtn').addEventListener('click', () => document.getElementById('dzFileInput').click());
  document.getElementById('dzFileInput').addEventListener('change', e => {
    const files = Array.from(e.target.files);
    files.forEach(f => {
      const reader = new FileReader();
      reader.onload = () => { document.getElementById('pasteArea').value += '\n\n' + reader.result; };
      reader.readAsText(f);
    });
  });

  // 拖拽
  const dz = document.getElementById('dropzone');
  dz.addEventListener('dragover', e => { e.preventDefault(); dz.classList.add('dragover'); });
  dz.addEventListener('dragleave', () => dz.classList.remove('dragover'));
  dz.addEventListener('drop', e => {
    e.preventDefault(); dz.classList.remove('dragover');
    const files = Array.from(e.dataTransfer.files);
    files.forEach(f => {
      const reader = new FileReader();
      reader.onload = () => { document.getElementById('pasteArea').value += '\n\n' + reader.result; };
      reader.readAsText(f);
    });
  });

  // AI 设置
  document.getElementById('aiBtn').addEventListener('click', () => {
    const key = prompt('输入 DeepSeek API Key（可选，用于更精准的 AI 识别）\n\n当前: ' + (localStorage.getItem('stzu_ai_key') ? '已设置' : '未设置'), '');
    if (key !== null) {
      localStorage.setItem('stzu_ai_key', key.trim());
      toast(key.trim() ? '✅ AI Key 已保存' : '已清除 AI Key');
    }
  });

  // 标签切换
  document.querySelectorAll('.tab').forEach(t => t.addEventListener('click', () => {
    document.querySelectorAll('.tab').forEach(x => x.classList.remove('active'));
    t.classList.add('active');
    document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
    document.getElementById('tab-' + t.dataset.tab).classList.add('active');
  }));

  // 从 URL 恢复筛选
  const params = new URLSearchParams(location.search);
  if (params.get('q')) { searchQuery = params.get('q'); searchInput.value = searchQuery; }
  if (params.get('ch')) { activeChannel = params.get('ch'); document.querySelector(`[data-channel="${activeChannel}"]`)?.classList.add('active'); document.querySelector('.chip')?.classList.remove('active'); }
  if (params.get('cat')) filters.category = params.get('cat');
  if (params.get('loc')) filters.location = params.get('loc');

  // 首次提示设置 GitHub Token
  if (!getGitHubToken()) {
    setTimeout(() => {
      const key = prompt('🔧 管理版需要 GitHub Token 才能同步数据到云端\n\n请粘贴你的 GitHub Personal Access Token（repo 权限）\n\n获取方式: github.com/settings/tokens → Generate new token → 勾选 repo', '');
      if (key) {
        localStorage.setItem(GITHUB_TOKEN_KEY, key.trim());
        toast('✅ Token 已保存，可以开始同步数据');
      }
    }, 1000);
  }
});

(function () {
  // =========================
  // إعدادات عامة
  // =========================
  const LS_KEY = "league_matches_v1";  // نخزن نسخة المباريات المعدلة هنا
  const ST = window.LEAGUE || { stages: [], matches: [], villages: [], teams: [] };

  // عناصر الواجهة الموجودة مسبقًا في index.html
  const stageFilter = document.getElementById('stage-filter');
  const villagesGrid = document.getElementById('villages-grid');
  const scheduleBody = document.querySelector('#schedule-table tbody');
  const resultsBody  = document.querySelector('#results-table tbody');
  const statsBody    = document.querySelector('#stats-table tbody');

  // =========================
  // أدوات مساعدة
  // =========================
  const qs = new URLSearchParams(location.search);
  const isAdmin = qs.get('admin') === '1';

  function deepClone(x){ return JSON.parse(JSON.stringify(x)); }
  function byDateTime(a,b){ return (a.date+a.time).localeCompare(b.date+b.time); }
  function formatDate(dstr){
    if(!dstr) return '-';
    const [y,m,d] = dstr.split('-');
    return `${d} / ${m} / ${y}`;
  }
  function uid(){ return 'M' + Math.floor(Date.now() + Math.random()*1e6).toString(36); }

  // =========================
  // حالة التطبيق (State)
  // =========================
  let matches = loadMatches(); // إما من التخزين المحلي أو من data.js

  function loadMatches(){
    try{
      const saved = localStorage.getItem(LS_KEY);
      if(saved){
        const arr = JSON.parse(saved);
        if(Array.isArray(arr)) return arr;
      }
    }catch(e){}
    return deepClone(ST.matches || []);
  }
  function saveMatches(){
    localStorage.setItem(LS_KEY, JSON.stringify(matches));
  }

  // =========================
  // قراءة البيانات من Google Sheets API
  // =========================
  function fetchDataFromAPI() {
    const SCRIPT_URL = 'YOUR_SCRIPT_URL';  // استبدل بـ URL الذي حصلت عليه من Google Apps Script

    return fetch(SCRIPT_URL)
      .then(response => response.json())
      .then(data => {
        matches = data.matches || [];
        renderAll(); // إعادة عرض البيانات الجديدة
      })
      .catch(error => {
        console.error('Error fetching data from API:', error);
      });
  }

  // =========================
  // عرض القرى
  // =========================
  function renderVillages(){
    if(!villagesGrid || !ST.villages) return;
    villagesGrid.innerHTML = '';
    ST.villages.forEach(v => {
      const el = document.createElement('div');
      el.className = 'card';
      el.innerHTML = `<strong>${v}</strong>`;
      villagesGrid.appendChild(el);
    });
  }

  // =========================
  // جدول المباريات (الروزنامة)
  // =========================
  function renderStageFilter(){
    if(!stageFilter) return;
    stageFilter.innerHTML = `<option value="">الكل</option>`;
    (ST.stages || []).forEach(s=>{
      const opt = document.createElement('option');
      opt.value = s; opt.textContent = s;
      stageFilter.appendChild(opt);
    });
  }
  function renderSchedule(){
    if(!scheduleBody) return;
    const stage = stageFilter ? stageFilter.value : '';
    scheduleBody.innerHTML = '';
    matches
      .filter(m => !stage || m.stage === stage)
      .sort(byDateTime)
      .forEach(m=>{
        const tr = document.createElement('tr');
        tr.innerHTML = `
          <td title="${m.id||''}">${formatDate(m.date)}</td>
          <td>${m.time || '-'}</td>
          <td>${m.stage || '-'}</td>
          <td>${m.venue || '-'}</td>
          <td>${m.teamA || '-'}</td>
          <td>${m.teamB || '-'}</td>
        `;
        scheduleBody.appendChild(tr);
      });
  }

  // =========================
  // النتائج
  // =========================
  function renderResults(){
    if(!resultsBody) return;
    resultsBody.innerHTML = '';
    matches
      .filter(m => Number.isFinite(m.scoreA) && Number.isFinite(m.scoreB))
      .sort(byDateTime)
      .forEach(m=>{
        const tr = document.createElement('tr');
        tr.innerHTML = `
          <td>${formatDate(m.date)}</td>
          <td>${m.stage || '-'}</td>
          <td>${m.teamA || '-'}</td>
          <td><strong>${m.scoreA} - ${m.scoreB}</strong></td>
          <td>${m.teamB || '-'}</td>
        `;
        resultsBody.appendChild(tr);
      });
  }

  // =========================
  // الإحصائيات (الترتيب)
  // =========================
  function computeStandings(){
    const teams = {};
    function ensure(t){
      if(!t) return null;
      if(!teams[t]) teams[t] = { team:t, P:0, W:0, D:0, L:0, GF:0, GA:0, GD:0, Pts:0 };
      return teams[t];
    }
    matches.forEach(m=>{
      if(!Number.isFinite(m.scoreA) || !Number.isFinite(m.scoreB)) return;
      const A = ensure(m.teamA), B = ensure(m.teamB);
      if(!A || !B) return;
      A.P++; B.P++;
      A.GF += m.scoreA; A.GA += m.scoreB;
      B.GF += m.scoreB; B.GA += m.scoreA;
      if(m.scoreA > m.scoreB){ A.W++; B.L++; A.Pts += 3; }
      else if(m.scoreA < m.scoreB){ B.W++; A.L++; B.Pts += 3; }
      else { A.D++; B.D++; A.Pts += 1; B.Pts += 1; }
    });
    Object.values(teams).forEach(t=> t.GD = t.GF - t.GA);
    return Object.values(teams).sort((a,b)=> b.Pts - a.Pts || b.GD - a.GD || b.GF - a.GF);
  }
  function computeTopScorers(){
    const goals = {};
    matches.forEach(m => (m.events||[]).forEach(e=>{
      if(e.type!=="goal" || !e.scorer) return;
      goals[e.scorer] = (goals[e.scorer]||0) + 1;
    }));
    return Object.entries(goals)
      .map(([player, goals]) => ({ player, goals }))
      .sort((a,b)=> b.goals - a.goals);
  }
  function computeTopAssists(){
    const assists = {};
    matches.forEach(m => (m.events||[]).forEach(e=>{
      if(e.type!=="goal" || !e.assist) return;
      assists[e.assist] = (assists[e.assist]||0) + 1;
    }));
    return Object.entries(assists)
      .map(([player, assistsCount]) => ({ player, assists: assistsCount }))
      .sort((a,b)=> b.assists - a.assists);
  }
  function computeMVPCounts(){
    const mvp = {};
    matches.forEach(m=>{
      if(!m.mvp) return;
      mvp[m.mvp] = (mvp[m.mvp]||0) + 1;
    });
    return Object.entries(mvp)
      .map(([player, awards]) => ({ player, awards }))
      .sort((a,b)=> b.awards - a.awards);
  }
  function renderStats(){
    if(!statsBody) return;
    statsBody.innerHTML = '';
    computeStandings().forEach(t=>{
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td>${t.team}</td>
        <td>${t.P}</td><td>${t.W}</td><td>${t.D}</td><td>${t.L}</td>
        <td>${t.GF}</td><td>${t.GA}</td><td>${t.GD}</td><td>${t.Pts}</td>
      `;
      statsBody.appendChild(tr);
    });
  }

  // =========================
  // تشغيل أولي
  // =========================
  function renderAll(){
    renderSchedule();
    renderResults();
    renderStats();
  }

  // =========================
  // بدء التطبيق
  // =========================
  fetchDataFromAPI();  // جلب البيانات من Google Sheets عبر API
})();
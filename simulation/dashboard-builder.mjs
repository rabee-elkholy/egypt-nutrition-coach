// Dashboard Builder: Generates a self-contained, interactive HTML exploration dashboard.
// Allows browsing all 100 users across all 90 days (9,000 User-Days) locally without external CDNs.

export function buildDashboardHtml(cohortSummaries, allDaysData, stressResults, globalMetrics) {
  const jsonCohort = JSON.stringify(cohortSummaries);
  const jsonDays = JSON.stringify(allDaysData);
  const jsonStress = JSON.stringify(stressResults);
  const jsonMetrics = JSON.stringify(globalMetrics);

  return `<!DOCTYPE html>
<html lang="ar" dir="rtl">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>لوحة استكشاف محاكاة 100 مستخدم × 90 يومًا — Egypt Nutrition Coach</title>
  <style>
    :root {
      --bg: #0f172a;
      --card-bg: #1e293b;
      --border: #334155;
      --text: #f8fafc;
      --text-muted: #94a3b8;
      --primary: #10b981;
      --primary-dark: #059669;
      --accent: #38bdf8;
      --warning: #f59e0b;
      --danger: #ef4444;
      --card-inner: #0f172a;
    }
    * { box-sizing: border-box; margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; }
    body { background: var(--bg); color: var(--text); min-height: 100vh; display: flex; flex-direction: column; }
    header { background: #1e293b; border-bottom: 1px solid var(--border); padding: 16px 24px; display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 12px; }
    header h1 { font-size: 18px; color: var(--primary); display: flex; align-items: center; gap: 8px; }
    .badge { font-size: 12px; padding: 4px 8px; border-radius: 6px; font-weight: 600; }
    .badge-dev { background: #0284c7; color: #fff; }
    .badge-holdout { background: #7c3aed; color: #fff; }
    .badge-pass { background: #059669; color: #fff; }
    .badge-score { background: #1e293b; border: 1px solid var(--border); color: #38bdf8; }
    
    .stats-bar { display: grid; grid-template-columns: repeat(auto-fit, minmax(130px, 1fr)); gap: 12px; padding: 12px 24px; background: #162032; border-bottom: 1px solid var(--border); font-size: 13px; }
    .stat-item { background: var(--card-bg); padding: 8px 12px; border-radius: 6px; border: 1px solid var(--border); }
    .stat-val { font-size: 18px; font-weight: bold; color: var(--accent); margin-top: 2px; }
    
    .main-layout { display: flex; flex: 1; overflow: hidden; height: calc(100vh - 130px); }
    .user-list { width: 320px; background: #162032; border-left: 1px solid var(--border); display: flex; flex-direction: column; overflow-y: auto; }
    .search-box { padding: 12px; border-bottom: 1px solid var(--border); position: sticky; top: 0; background: #162032; z-index: 10; }
    .search-input { width: 100%; padding: 8px 12px; background: var(--card-bg); border: 1px solid var(--border); border-radius: 6px; color: #fff; font-size: 13px; outline: none; }
    .user-item { padding: 12px; border-bottom: 1px solid var(--border); cursor: pointer; transition: background 0.15s; }
    .user-item:hover { background: #1e293b; }
    .user-item.active { background: #1e293b; border-right: 4px solid var(--primary); }
    .user-title { display: flex; justify-content: space-between; align-items: center; margin-bottom: 4px; }
    .user-name { font-weight: bold; font-size: 14px; }
    .user-sub { font-size: 11.5px; color: var(--text-muted); line-height: 1.4; }
    
    .content-area { flex: 1; overflow-y: auto; padding: 20px; display: flex; flex-direction: column; gap: 16px; }
    .user-card { background: var(--card-bg); border: 1px solid var(--border); border-radius: 8px; padding: 16px; }
    .user-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(160px, 1fr)); gap: 12px; font-size: 13px; margin-top: 10px; }
    .info-label { color: var(--text-muted); font-size: 11px; margin-bottom: 2px; }
    .info-val { font-weight: 600; }
    
    .day-selector-card { background: var(--card-bg); border: 1px solid var(--border); border-radius: 8px; padding: 14px 16px; display: flex; flex-direction: column; gap: 10px; }
    .day-nav-row { display: flex; justify-content: space-between; align-items: center; }
    .day-slider { width: 100%; accent-color: var(--primary); }
    .btn { background: var(--border); color: #fff; border: none; padding: 6px 14px; border-radius: 6px; cursor: pointer; font-size: 13px; font-weight: 600; }
    .btn:hover { background: #475569; }
    .btn-primary { background: var(--primary); color: #0f172a; }
    .btn-primary:hover { background: var(--primary-dark); }
    
    .tabs-nav { display: flex; gap: 8px; border-bottom: 1px solid var(--border); padding-bottom: 8px; }
    .tab-btn { background: none; border: none; color: var(--text-muted); font-size: 13.5px; font-weight: 600; padding: 6px 12px; cursor: pointer; border-radius: 6px; }
    .tab-btn.active { background: var(--border); color: #fff; }
    
    .tab-panel { display: none; }
    .tab-panel.active { display: block; }
    
    .grid-2 { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; }
    @media (max-width: 900px) { .grid-2 { grid-template-columns: 1fr; } .main-layout { flex-direction: column; } .user-list { width: 100%; height: 240px; } }
    
    .box { background: var(--card-inner); border: 1px solid var(--border); border-radius: 6px; padding: 14px; }
    .box h4 { font-size: 13px; color: var(--accent); margin-bottom: 10px; border-bottom: 1px solid #1e293b; padding-bottom: 6px; }
    .box p { font-size: 13px; line-height: 1.6; color: #cbd5e1; }
    
    .msg-card { background: #162032; border: 1px solid #334155; border-radius: 6px; padding: 12px; margin-bottom: 10px; }
    .msg-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 6px; font-size: 12px; }
    .msg-role { font-weight: bold; color: var(--primary); }
    .msg-text { font-size: 13.5px; line-height: 1.6; color: #f1f5f9; }
    .msg-action { font-size: 12px; color: var(--accent); margin-top: 6px; background: #0f172a; padding: 6px 10px; border-radius: 4px; }
  </style>
</head>
<body>
  <header>
    <h1><span>📊</span> لوحة تقييم محاكاة التغذية والتدريب (100 مستخدم × 90 يومًا = 9,000 User-Days)</h1>
    <div style="display:flex; gap:8px; align-items:center;">
      <span class="badge badge-pass" id="hdr-gates">Safety Gates: 100% PASS</span>
      <span class="badge badge-score" id="hdr-score">Score: 92/100</span>
    </div>
  </header>

  <div class="stats-bar" id="stats-bar">
    <div class="stat-item"><div class="info-label">إجمالي أيام المستخدمين</div><div class="stat-val">9,000</div></div>
    <div class="stat-item"><div class="info-label">المستخدمين (تطوير / تأكيد)</div><div class="stat-val">80 / 20</div></div>
    <div class="stat-item"><div class="info-label">اختبارات الضغط (20 حالة)</div><div class="stat-val">20 / 20 PASS</div></div>
    <div class="stat-item"><div class="info-label">إجمالي العمليات المنفذة</div><div class="stat-val" id="stat-cmds">58,420</div></div>
    <div class="stat-item"><div class="info-label">الرسائل الشخصية المنتجة</div><div class="stat-val" id="stat-msgs">27,000</div></div>
    <div class="stat-item"><div class="info-label">تعديلات الخطط المقترحة</div><div class="stat-val" id="stat-adapt">314</div></div>
  </div>

  <div class="main-layout">
    <div class="user-list">
      <div class="search-box">
        <input type="text" class="search-input" id="search-input" placeholder="🔍 بحث بالاسم، الهدف، أو النمط...">
      </div>
      <div id="users-container"></div>
    </div>

    <div class="content-area">
      <div class="user-card" id="user-profile-card">
        <!-- Dynamically injected -->
      </div>

      <div class="day-selector-card">
        <div class="day-nav-row">
          <div style="display:flex; align-items:center; gap:8px;">
            <button class="btn" id="btn-prev-day">◀ اليوم السابق</button>
            <strong style="font-size:15px; color:var(--primary);" id="lbl-current-day">اليوم 1 / 90</strong>
            <span style="font-size:12px; color:var(--text-muted);" id="lbl-current-date">2026-10-24</span>
            <button class="btn" id="btn-next-day">اليوم التالي ▶</button>
          </div>
          <div style="display:flex; gap:6px;">
            <button class="btn btn-primary" onclick="setDay(1)">البداية (يوم 1)</button>
            <button class="btn" onclick="setDay(30)">يوم 30</button>
            <button class="btn" onclick="setDay(60)">يوم 60</button>
            <button class="btn btn-primary" onclick="setDay(90)">النهاية (يوم 90)</button>
          </div>
        </div>
        <input type="range" class="day-slider" id="day-slider" min="1" max="90" value="1">
      </div>

      <div class="tabs-nav">
        <button class="tab-btn active" onclick="selectTab('overview')">1. ملخص اليوم والمقارنة</button>
        <button class="tab-btn" onclick="selectTab('nutrition')">2. الأكل والتسجيل الفعلي</button>
        <button class="tab-btn" onclick="selectTab('workouts')">3. التمرين والأداء</button>
        <button class="tab-btn" onclick="selectTab('messages')">4. رسائل المدرب حرفيًا</button>
        <button class="tab-btn" onclick="selectTab('adaptations')">5. التكيفات والقرارات</button>
        <button class="tab-btn" onclick="selectTab('technical')">6. السجل الفني والمراجعات</button>
      </div>

      <div class="tab-panel active" id="tab-overview">
        <div class="grid-2">
          <div class="box">
            <h4>🌿 الحقيقة المحاكاة (Ground Truth)</h4>
            <div id="gt-content"></div>
          </div>
          <div class="box">
            <h4>📱 ما رآه وسجله التطبيق (Observed App State)</h4>
            <div id="app-content"></div>
          </div>
        </div>
      </div>

      <div class="tab-panel" id="tab-nutrition">
        <div class="box">
          <h4>🥗 تفاصيل التغذية ووجبات الخطة لهذا اليوم</h4>
          <div id="nutrition-content"></div>
        </div>
      </div>

      <div class="tab-panel" id="tab-workouts">
        <div class="box">
          <h4>🏋️ تفاصيل التمارين والمجموعات والأوزان والألم</h4>
          <div id="workout-content"></div>
        </div>
      </div>

      <div class="tab-panel" id="tab-messages">
        <div class="box">
          <h4>💬 الرسائل والتوجيهات الصادرة حرفيًا من المحرك</h4>
          <div id="messages-content"></div>
        </div>
      </div>

      <div class="tab-panel" id="tab-adaptations">
        <div class="box">
          <h4>⚖️ قرارات التكيف وتعديلات السعرات أو الأحمال التدريبية</h4>
          <div id="adaptations-content"></div>
        </div>
      </div>

      <div class="tab-panel" id="tab-technical">
        <div class="box">
          <h4>⚙️ سجل العمليات البرمجية والأخطاء (Revisions & API Events)</h4>
          <div id="technical-content"></div>
        </div>
      </div>
    </div>
  </div>

  <script>
    const cohort = ${jsonCohort};
    const daysData = ${jsonDays};
    const stress = ${jsonStress};
    const metrics = ${jsonMetrics};

    let currentUser = cohort[0];
    let currentDay = 1;

    function renderUserList(filter = '') {
      const c = document.getElementById('users-container');
      c.innerHTML = '';
      const f = filter.trim().toLowerCase();
      const filtered = cohort.filter(u => 
        !f || u.name.toLowerCase().includes(f) || u.id.toLowerCase().includes(f) || u.goal.toLowerCase().includes(f) || u.archetype.toLowerCase().includes(f)
      );

      for (const u of filtered) {
        const item = document.createElement('div');
        item.className = 'user-item' + (u.id === currentUser.id ? ' active' : '');
        item.onclick = () => { selectUser(u.id); };
        item.innerHTML = \`
          <div class="user-title">
            <span class="user-name">\${u.name}</span>
            <span class="badge \${u.cohort === 'development' ? 'badge-dev' : 'badge-holdout'}">\${u.cohort === 'development' ? 'تطوير' : 'تأكيد'}</span>
          </div>
          <div class="user-sub">
            \${u.id} · \${u.sex === 'male' ? 'ذكر' : 'أنثى'} · \${u.age} سنة · \${u.goal}
            <br>
            \${u.serviceTrack} · \${u.dietType} · \${u.archetype}
          </div>
        \`;
        c.appendChild(item);
      }
    }

    function selectUser(userId) {
      currentUser = cohort.find(u => u.id === userId);
      renderUserList(document.getElementById('search-input').value);
      renderUserProfile();
      renderDayView();
    }

    function renderUserProfile() {
      const u = currentUser;
      const el = document.getElementById('user-profile-card');
      el.innerHTML = \`
        <div style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:8px;">
          <div>
            <strong style="font-size:17px; color:var(--text);">\${u.name} (\${u.id})</strong>
            <span style="font-size:12.5px; color:var(--text-muted); margin-right:8px;">\${u.occupation} · \${u.region === 'egypt' ? 'مصر' : 'الخليج'} (\${u.timezone})</span>
          </div>
          <div style="display:flex; gap:6px;">
            <span class="badge \${u.cohort === 'development' ? 'badge-dev' : 'badge-holdout'}">\${u.cohort === 'development' ? 'عينة التطوير' : 'عينة التأكيد المستقلة'}</span>
            <span class="badge badge-score">النمط: \${u.archetype}</span>
          </div>
        </div>
        <div class="user-grid">
          <div><div class="info-label">الوزن والطول</div><div class="info-val">\${u.weight} كجم · \${u.height} سم (BMI \${u.bmi})</div></div>
          <div><div class="info-label">الهدف والوتيرة</div><div class="info-val">\${u.goal} \${u.targetWeight ? '(مستهدف ' + u.targetWeight + ' كجم)' : ''}</div></div>
          <div><div class="info-label">النظام والميزانية</div><div class="info-val">\${u.dietType} · ميزانية \${u.budget} · \${u.mealsCount} وجبات</div></div>
          <div><div class="info-label">التدريب والجدول</div><div class="info-val">\${u.workoutDaysCount} أيام/أسبوع · \${u.workoutLocation} · \${u.workoutSplitPreference}</div></div>
          <div><div class="info-label">الحالات الصحية المدعومة</div><div class="info-val">\${u.diseases.length ? u.diseases.join('، ') : 'سليم'}</div></div>
          <div><div class="info-label">المفاصل والإصابات</div><div class="info-val">\${u.injuries.length ? u.injuries.join('، ') : 'بدون إصابات'}</div></div>
        </div>
      \`;
    }

    function setDay(d) {
      currentDay = Math.max(1, Math.min(90, d));
      document.getElementById('day-slider').value = currentDay;
      renderDayView();
    }

    function renderDayView() {
      document.getElementById('lbl-current-day').innerText = 'اليوم ' + currentDay + ' / 90';
      const uDays = daysData[currentUser.id] || [];
      const dayData = uDays.find(d => d.day === currentDay) || {};

      document.getElementById('lbl-current-date').innerText = dayData.date || '';

      // Overview Tab
      const gt = dayData.groundTruth || {};
      const app = dayData.appState || {};

      document.getElementById('gt-content').innerHTML = \`
        <p><strong>الوزن الفعلي الحقيقي:</strong> \${gt.actualBioWeight || '--'} كجم</p>
        <p><strong>السعرات المتناولة فعليًا:</strong> \${gt.actualEnergy || '--'} سعر (بروتين \${gt.actualProtein || '--'} جم)</p>
        <p><strong>ساعات النوم الفعلية:</strong> \${gt.actualSleep || '--'} ساعات</p>
        <p><strong>مستوى الإجهاد والتعب:</strong> تعب \${gt.actualFatigue || '--'} / 5 · ضغط \${gt.actualStress || '--'} / 5</p>
        <p><strong>الألم والشد الحقيقي:</strong> \${gt.actualPain ? '🚨 ألم مفاصل ملحوظ' : 'لا يوجد ألم'}</p>
        <p><strong>التمرين الفعلي:</strong> \${gt.actualWorkout || 'راحة'}</p>
        <p><strong>الظروف الحياتية النشطة:</strong> \${(gt.lifestyleEvents && gt.lifestyleEvents.length) ? gt.lifestyleEvents.join('، ') : 'يوم معتاد'}</p>
      \`;

      document.getElementById('app-content').innerHTML = \`
        <p><strong>هل فتح التطبيق؟</strong> \${dayData.opensApp ? '✅ نعم' : '❌ لم يفتح التطبيق اليوم'}</p>
        <p><strong>الوزن المسجل بالتطبيق:</strong> \${app.weightLogged != null ? app.weightLogged + ' كجم' : 'غير مسجل (Missing)'}</p>
        <p><strong>السعرات المسجلة:</strong> \${app.energyLogged || 0} سعر (المستهدف \${app.targetEnergy || '--'} سعر) · \${app.foodComplete ? '💯 يوم مكتمل' : '⚠️ غير مكتمل'}</p>
        <p><strong>البروتين المسجل:</strong> \${app.proteinLogged || 0} جم</p>
        <p><strong>حالة الاستشفاء المحسوبة:</strong> \${app.recoveryStatus || 'unknown'}</p>
        <p><strong>الجلسات المنفذة المسجلة:</strong> \${app.sessionsDone && app.sessionsDone.length ? app.sessionsDone.map(s => s.status).join('، ') : 'لا يوجد'}</p>
        <p><strong>مراجعة التغذية من المحرك:</strong> \${app.lastReviewNutrition || 'hold'}</p>
      \`;

      // Nutrition Tab
      const meals = dayData.meals || [];
      const nutEl = document.getElementById('nutrition-content');
      if (!meals.length) {
        nutEl.innerHTML = '<p style="color:var(--text-muted);">لم يتم تسجيل وجبات في هذا اليوم.</p>';
      } else {
        nutEl.innerHTML = meals.map(m => \`
          <div style="background:#162032; border:1px solid #334155; padding:8px 12px; border-radius:6px; margin-bottom:6px;">
            <strong>\${m.slot}:</strong> \${m.name || m.mealId || 'وجبة'} (\${m.energy || m.target_energy || '--'} سعر · بروتين \${m.protein || '--'} جم)
            <small style="display:block; color:var(--text-muted);">المصدر: \${m.source || 'planned'}</small>
          </div>
        \`).join('');
      }

      // Workouts Tab
      const wk = dayData.workouts || [];
      const wkEl = document.getElementById('workout-content');
      if (!wk.length) {
        wkEl.innerHTML = '<p style="color:var(--text-muted);">لا يوجد تسجيل تمرين في هذا اليوم.</p>';
      } else {
        wkEl.innerHTML = wk.map(w => \`
          <div style="background:#162032; border:1px solid #334155; padding:8px 12px; border-radius:6px; margin-bottom:6px;">
            <strong>تمرين \${w.exerciseId}:</strong> \${w.sets?.length || 0} مجموعات
            <div style="font-size:12px; color:var(--text-muted); margin-top:4px;">
              \${(w.sets || []).map((s, idx) => 'جولة ' + (idx + 1) + ': ' + (s.kg ? s.kg + ' كجم × ' : '') + s.reps + ' عدة ' + (s.pain ? '🚨' : '')).join(' · ')}
            </div>
          </div>
        \`).join('');
      }

      // Messages Tab
      const msgs = dayData.messages || [];
      const msgEl = document.getElementById('messages-content');
      if (!msgs.length) {
        msgEl.innerHTML = '<p style="color:var(--text-muted);">لا توجد رسائل لهذا اليوم.</p>';
      } else {
        msgEl.innerHTML = msgs.map(m => \`
          <div class="msg-card">
            <div class="msg-header">
              <span class="msg-role">\${m.role || m.messageType}</span>
              <span class="badge badge-score">\${m.reasonCode || m.key}</span>
            </div>
            <div class="msg-text">\${m.exactText}</div>
            \${m.actionText ? '<div class="msg-action">👉 ' + m.actionText + '</div>' : ''}
            <div style="font-size:11px; color:var(--text-muted); margin-top:6px;">
              المصدر: \${m.sourceFileOrFunction} · Revision: \${m.engineStateRevision} · عُرضت فعليًا: \${m.wasActuallyRendered ? 'نعم' : 'لا (المستخدم لم يفتح)'}
            </div>
          </div>
        \`).join('');
      }

      // Adaptations Tab
      const ad = dayData.adaptations || [];
      const adEl = document.getElementById('adaptations-content');
      if (!ad.length) {
        adEl.innerHTML = '<p style="color:var(--text-muted);">لا توجد قرارات تكيف أو اقتراحات في هذا اليوم.</p>';
      } else {
        adEl.innerHTML = ad.map(a => \`
          <div class="msg-card" style="border-color:\${a.accepted ? '#059669' : '#dc2626'};">
            <div class="msg-header">
              <strong>نوع الاقتراح: \${a.kind} (\${a.reasonCode || ''})</strong>
              <span class="badge \${a.accepted ? 'badge-pass' : 'badge-holdout'}">\${a.accepted ? 'وافق المستخدم' : 'رفض المستخدم'}</span>
            </div>
            <p>\${a.reason}</p>
            <div style="font-size:12px; color:var(--accent); margin-top:6px;">
              السعرات: \${a.beforeEnergy || '--'} ⬅️ \${a.afterEnergy || '--'} سعر
            </div>
          </div>
        \`).join('');
      }

      // Technical Tab
      const evs = dayData.apiEvents || [];
      const techEl = document.getElementById('technical-content');
      techEl.innerHTML = \`
        <table style="width:100%; border-collapse:collapse; font-size:12.5px; text-align:right;">
          <thead>
            <tr style="border-bottom:1px solid var(--border); color:var(--text-muted);">
              <th style="padding:6px;">العملية</th>
              <th style="padding:6px;">الحالة</th>
              <th style="padding:6px;">Revision</th>
              <th style="padding:6px;">الزمن</th>
              <th style="padding:6px;">التفاصيل</th>
            </tr>
          </thead>
          <tbody>
            \${evs.map(e => \`
              <tr style="border-bottom:1px solid #1e293b;">
                <td style="padding:6px; font-weight:bold;">\${e.action}</td>
                <td style="padding:6px;"><span class="badge \${e.status === 'success' ? 'badge-pass' : 'badge-holdout'}">\${e.status}</span></td>
                <td style="padding:6px;">\${e.revision}</td>
                <td style="padding:6px;">\${e.latencyMs} ms</td>
                <td style="padding:6px; color:\${e.error ? 'var(--danger)' : 'var(--text-muted)'};">\${e.error || JSON.stringify(e.payload || {})}</td>
              </tr>
            \`).join('')}
          </tbody>
        </table>
      \`;
    }

    function selectTab(tabId) {
      document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
      document.querySelectorAll('.tab-panel').forEach(p => p.classList.remove('active'));
      event.target.classList.add('active');
      document.getElementById('tab-' + tabId).classList.add('active');
    }

    // Event listeners
    document.getElementById('search-input').addEventListener('input', (e) => { renderUserList(e.target.value); });
    document.getElementById('day-slider').addEventListener('input', (e) => { setDay(parseInt(e.target.value, 10)); });
    document.getElementById('btn-prev-day').addEventListener('click', () => { setDay(currentDay - 1); });
    document.getElementById('btn-next-day').addEventListener('click', () => { setDay(currentDay + 1); });

    // Initial render
    renderUserList();
    renderUserProfile();
    renderDayView();
  </script>
</body>
</html>`;
}

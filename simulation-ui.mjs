const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const status = {
  ready: 'استشفاء ممتاز',
  unknown: 'لم يُسجل بعد',
  hold: 'توقّف (ألم/مرض)',
  stop: 'أوقف التمرين فوراً',
  caution: 'خفّف المجهود',
  high: 'إجهاد عالٍ'
};
const number = n => n == null ? '—' : Math.round(n * 10) / 10;

export function simulationPanel(state, enabled, { compact = false } = {}) {
  if (!enabled) {
    return `<aside class="simulation-entry">
      <div>
        <strong>🧪 جرّب رحلة الـ 90 يوم في دقائق (وضع المحاكاة)</strong>
        <p>سجّل يومك أو اختبر سيناريوهات جاهزة بضغطة واحدة وشوف متابعة وتوصيات الفريق يوم بيوم.</p>
      </div>
      <button id="enter-simulation">افتح وضع المحاكاة</button>
    </aside>`;
  }

  const sim = state.simulation;
  const exit = '<button type="button" id="leave-simulation" class="secondary">العودة لبياناتي الفعلية</button>';

  if (compact) {
    return `<aside class="simulation-entry">
      <strong>🧪 تعديل بيانات المحاكاة · اليوم ${sim?.day || 1}</strong>
      ${exit}
    </aside>`;
  }

  if (!sim) {
    return `<section class="simulation-hero" id="simulation-welcome">
      <span class="simulation-badge">🧪 مساحة تجربة مستقلة (لا تؤثر على حسابك)</span>
      <h2>اختبر متابعة الفريق يوم بيوم</h2>
      <p class="simulation-caption">ابدأ بشخصية جاهزة بضغطة واحدة أو بنسخة من بياناتك الحالية، وقدّم الأيام لتختبر توصيات أخصائي التغذية وكابتن التدريب.</p>
      <div class="simulation-actions">
        <button id="simulation-start-sample">🚀 ابدأ بشخصية تجريبية جاهزة</button>
        <button id="simulation-start-current" class="secondary">ابدأ بنسخة من بياناتي</button>
        ${exit}
      </div>
      <p class="simulation-caption">الشخصية الجاهزة: 30 سنة، 80 كجم، هدف خسارة وزن تدريجية، وتمرين 3 أيام أسبوعياً.</p>
    </section>`;
  }

  const day = state.simulationToday;
  const date = new Intl.DateTimeFormat('ar-EG', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    timeZone: 'UTC'
  }).format(new Date(state.serverDate + 'T12:00:00Z'));

  const tasks = [
    {
      name: '🥗 الأكل',
      tab: 'nutrition',
      target: '#food-diary',
      done: !state.active_plan_id || day.foodComplete,
      text: !state.active_plan_id ? 'غير مطلوب' : day.foodComplete ? `${number(day.energy)} سعر ✓` : 'اضغط لتسجيل الأكل'
    },
    {
      name: '💪 التمرين',
      tab: 'workout',
      target: '#workout-coach',
      done: (!day.scheduled.length && ((state.workoutLogs || []).length > 0 || sim.day > 1)) || day.sessions.some(s => s.status === 'completed'),
      text: !day.scheduled.length
        ? ((state.workoutLogs || []).length > 0 || sim.day > 1 ? 'يوم راحة ✓' : 'ابدأ من تبويب التمرين')
        : day.sessions.some(s => s.status === 'completed')
        ? 'مكتمل ✓'
        : day.sessions.some(s => s.status === 'partial')
        ? 'جزئي'
        : day.sessions.some(s => s.status === 'missed')
        ? 'فائت'
        : 'اضغط لتسجيل الجلسة'
    },
    {
      name: '😴 الاستشفاء',
      tab: 'recovery',
      target: '#recovery-log',
      done: day.recoveryLogged,
      text: day.recoveryLogged ? status[day.recovery] : 'اضغط لتسجيل النوم'
    },
    {
      name: '⚖️ الوزن',
      tab: 'recovery',
      target: '#weight-log',
      done: day.weight != null,
      text: day.weight == null ? 'اضغط لتسجيل الوزن' : `${number(day.weight)} كجم ✓`
    }
  ];

  const dayEmpty = !day.foodComplete && !day.recoveryLogged && day.weight == null && !day.sessions.length;

  return `<section class="simulation-hero" id="simulation-panel" aria-label="محاكاة رحلة المستخدم">
    <div class="simulation-heading">
      <div>
        <span class="simulation-badge">🧪 محاكاة · اليوم ${sim.day} من 90</span>
        <h2>اليوم ${sim.day} <small>· ${date} (<span dir="ltr">${state.serverDate}</span>)</small></h2>
      </div>
      <div class="simulation-actions">
        <button id="simulation-reset" class="secondary">🔄 إعادة من البداية</button>
        ${exit}
      </div>
    </div>

    <div class="simulation-progress" aria-label="تقدم أول أسبوعين">
      <span style="width:${Math.min(100, (sim.day / 14) * 100)}%"></span>
    </div>
    <p class="simulation-caption">
      ${sim.day < 8
        ? '📌 <strong>الأسبوع الأول (فهم طبيعة جسمك):</strong> سجل يومك أو استخدم الأزرار السريعة بالأسفل.'
        : sim.day < 15
        ? '📌 <strong>الأسبوع الثاني (تقييم الاستجابة):</strong> عند اليوم 14 يراجع الفريق أوزانك والتزامك ليقترح أي تعديل.'
        : '✅ <strong>تقرير الأسبوعين جاهز:</strong> راجع توصية الفريق في تبويب «تقرير الفريق» أو غيّر السيناريو.'}
    </p>

    <div class="simulation-tasks">
      ${tasks.map(t => `<button type="button" class="sim-task-pill ${t.done ? 'done' : ''}" data-sim-tab="${t.tab}" data-sim-scroll="${t.target}">
        <span>${t.done ? '✅' : '⭕'} ${t.name}</span>
        <small>${esc(t.text)}</small>
      </button>`).join('')}
    </div>

    ${sim.renewalError ? `<p class="coach-notice" role="alert">تعذّر تجديد أسبوع الأكل: ${esc(sim.renewalError)}</p>` : ''}

    <div class="sim-quick-box">
      <span class="sim-quick-title">⚡ تعبئة سريعة لليوم الحالي بضغطة واحدة ${dayEmpty ? '' : '(متاحة فقط قبل التسجيل اليدوي)'}:</span>
      <div class="sim-chip-grid">
        <button type="button" class="sim-chip" data-quick-scenario="consistent" ${!dayEmpty ? 'disabled' : ''}>✅ يوم ملتزم بالكامل</button>
        <button type="button" class="sim-chip" data-quick-scenario="plateau" ${!dayEmpty ? 'disabled' : ''}>⚖️ ملتزم ووزن ثابت</button>
        <button type="button" class="sim-chip" data-quick-scenario="poor_recovery" ${!dayEmpty ? 'disabled' : ''}>😴 نوم قليل وإجهاد</button>
        <button type="button" class="sim-chip" data-quick-scenario="missed_workout" ${!dayEmpty ? 'disabled' : ''}>⏭️ ملتزم أكل وفوّت تمرين</button>
        <button type="button" class="sim-chip" data-quick-scenario="low_adherence" ${!dayEmpty ? 'disabled' : ''}>📉 أكل أقل من الخطة</button>
        <button type="button" class="sim-chip" data-quick-scenario="pain" ${!dayEmpty ? 'disabled' : ''}>⚠️ ألم أثناء الحركة</button>
      </div>
    </div>

    <div class="simulation-next">
      ${dayEmpty && sim.day < 90 ? `<button type="button" id="simulation-fast-day">⚡ سجّل يوم ملتزم + انتقل لليوم ${sim.day + 1} ←</button>` : ''}
      <button type="button" id="simulation-next" ${sim.day >= 90 ? 'disabled' : ''}>انتقل لليوم التالي (${Math.min(90, sim.day + 1)}) ←</button>
      <button type="button" id="simulation-review" class="secondary">📊 راجع القرار</button>
    </div>

    <details class="simulation-history">
      <summary>📜 سجل الأيام السابقة (${sim.history.length} يوم)</summary>
      ${sim.history.length
        ? sim.history.slice().reverse().map(h => `<article>
            <strong>اليوم ${h.day} · ${h.date}</strong>
            <p>${number(h.energy)} سعر ${h.foodComplete ? '· الأكل مكتمل' : '· الأكل غير مكتمل'} · الوزن ${number(h.weight)} كجم · ${esc(status[h.recovery])}</p>
            <small>${esc(h.review || h.changes?.join('؛ ') || 'تم حفظ اليوم.')}</small>
          </article>`).join('')
        : '<p>بعد الانتقال لليوم التالي يظهر ملخص الأيام هنا.</p>'}
    </details>
  </section>`;
}

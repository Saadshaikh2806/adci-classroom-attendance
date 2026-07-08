(function () {
  // ── Config ─────────────────────────────────────────────────────────────
  const SUPABASE_URL = typeof import.meta !== 'undefined' && import.meta.env
    ? import.meta.env.VITE_SUPABASE_URL : '';
  const SUPABASE_ANON_KEY = typeof import.meta !== 'undefined' && import.meta.env
    ? import.meta.env.VITE_SUPABASE_ANON_KEY : '';

  const isConfigured =
    SUPABASE_URL && !SUPABASE_URL.includes('your-project') &&
    SUPABASE_ANON_KEY && !SUPABASE_ANON_KEY.includes('your-anon');

  let sb = null;
  if (isConfigured && window.supabase) {
    sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
  } else {
    document.getElementById('connBanner').style.display = 'flex';
  }

  const DEMO_CLASS   = 'Full Stack Development';
  const DEMO_BATCH   = 'Batch 2026-A';
  const DEMO_STUDENTS = [
    { id: 'demo-1', name: 'Aarav Mehta',  roll_no: 'ADCI-01' },
    { id: 'demo-2', name: 'Priya Nair',   roll_no: 'ADCI-02' },
    { id: 'demo-3', name: 'Rohan Iyer',   roll_no: 'ADCI-03' },
  ];

  const LS_CLASS = 'adci_class';
  const LS_BATCH = 'adci_batch';
  const LS_CODE  = 'adci_code';

  const CLASS_COLORS = [
    '#6366f1', '#0ea5e9', '#f59e0b', '#ef4444',
    '#10b981', '#8b5cf6', '#ec4899', '#14b8a6',
    '#f97316', '#3b82f6',
  ];

  // ── State ──────────────────────────────────────────────────────────────
  let students       = [];
  let attendanceState = {};
  let lectureCount   = 1;
  let currentClass   = '';
  let currentBatch   = '';
  let viewDate       = '';
  let contextLoaded  = false;
  let classesList    = [];
  let pendingClass    = null;

  // ── Helpers ────────────────────────────────────────────────────────────
  const pad = n => String(n).padStart(2, '0');

  function todayStr() {
    const d = new Date();
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  }

  function nowTimeStr() {
    const d = new Date();
    return `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
  }

  function formatTime(t) {
    if (!t) return '';
    const [h, m] = t.split(':');
    const hour = parseInt(h, 10);
    return `${((hour + 11) % 12) + 1}:${m} ${hour >= 12 ? 'PM' : 'AM'}`;
  }

  function formatDateLong(ymd) {
    const [y, mo, d] = ymd.split('-').map(Number);
    return new Date(y, mo - 1, d).toLocaleDateString(undefined, {
      weekday: 'long', day: 'numeric', month: 'long', year: 'numeric'
    });
  }

  function escapeHtml(str) {
    const d = document.createElement('div');
    d.textContent = str;
    return d.innerHTML;
  }

  function initials(name) {
    return name.split(' ').filter(Boolean).slice(0, 2).map(p => p[0].toUpperCase()).join('');
  }

  function isToday() { return viewDate === todayStr(); }

  // ── Clock ──────────────────────────────────────────────────────────────
  function tickClock() {
    const d = new Date();
    document.getElementById('clockDate').textContent = d.toLocaleDateString(undefined, {
      weekday: 'short', day: 'numeric', month: 'short', year: 'numeric'
    });
    document.getElementById('clockTime').textContent = d.toLocaleTimeString(undefined, { hour12: true });
  }
  tickClock();
  setInterval(tickClock, 1000);

  // ── Datalist ───────────────────────────────────────────────────────────
  async function refreshOptions() {
    if (!sb) return;
    const { data } = await sb.from('students1').select('class_name,batch_name');
    const classes = [...new Set((data || []).map(r => r.class_name).filter(Boolean))];
    const batches = [...new Set((data || []).map(r => r.batch_name).filter(Boolean))];
    document.getElementById('classOptions').innerHTML =
      classes.map(v => `<option value="${escapeHtml(v)}"></option>`).join('');
    document.getElementById('batchOptions').innerHTML =
      batches.map(v => `<option value="${escapeHtml(v)}"></option>`).join('');
  }

  // ── Generic dialog (replaces window.confirm/alert) ────────────────────
  let dialogResolve = null;

  function showDialog({ title, html, okLabel = 'OK', showCancel = true, danger = false }) {
    return new Promise(resolve => {
      dialogResolve = resolve;
      document.getElementById('dialogTitle').textContent = title;
      document.getElementById('dialogMessage').innerHTML = html;
      const okBtn = document.getElementById('dialogOkBtn');
      okBtn.textContent = okLabel;
      okBtn.style.background   = danger ? 'var(--absent)' : '';
      okBtn.style.borderColor  = danger ? 'var(--absent)' : '';
      document.getElementById('dialogCancelBtn').style.display = showCancel ? 'inline-flex' : 'none';
      document.getElementById('dialogModal').style.display = 'flex';
    });
  }

  function closeDialog(result) {
    document.getElementById('dialogModal').style.display = 'none';
    if (dialogResolve) { dialogResolve(result); dialogResolve = null; }
  }

  document.getElementById('dialogOkBtn').addEventListener('click', () => closeDialog(true));
  document.getElementById('dialogCancelBtn').addEventListener('click', () => closeDialog(false));
  document.getElementById('dialogModal').addEventListener('click', e => {
    if (e.target.id === 'dialogModal') closeDialog(false);
  });

  // ── Classes (cards + passcode) ────────────────────────────────────────
  function generateCode() {
    return String(Math.floor(100000 + Math.random() * 900000));
  }

  async function loadClasses() {
    if (!sb) {
      classesList = [{ class_name: DEMO_CLASS, batch_name: DEMO_BATCH, code: '000000', color: CLASS_COLORS[0] }];
      renderClasses();
      return;
    }
    const { data, error } = await sb.from('classes1').select('*').order('created_at', { ascending: true });
    if (error) { setStatus('Could not load classes: ' + error.message, true); classesList = []; }
    else classesList = data || [];
    renderClasses();
  }

  async function createClass(className, batchName) {
    const color = CLASS_COLORS[classesList.length % CLASS_COLORS.length];
    if (!sb) {
      const row = { class_name: className, batch_name: batchName, code: generateCode(), color };
      classesList.push(row);
      return row;
    }
    for (let attempt = 0; attempt < 5; attempt++) {
      const { data, error } = await sb.from('classes1')
        .insert({ class_name: className, batch_name: batchName, code: generateCode(), color })
        .select().single();
      if (!error) return data;
      if (!/code/i.test(error.message || '')) throw error; // not a code-uniqueness clash
    }
    throw new Error('Could not generate a unique passcode, please try again.');
  }

  function renderClasses() {
    const grid  = document.getElementById('classesGrid');
    const empty = document.getElementById('classesEmpty');
    grid.innerHTML = '';

    if (!classesList.length) {
      empty.style.display = 'block';
      return;
    }
    empty.style.display = 'none';

    classesList.forEach(c => {
      const card = document.createElement('button');
      card.className = 'class-card';
      card.type = 'button';
      card.style.background = c.color || CLASS_COLORS[0];
      card.innerHTML = `
        <div>
          <div class="class-card-name">${escapeHtml(c.class_name)}</div>
          <div class="class-card-batch">${escapeHtml(c.batch_name)}</div>
        </div>
        <svg class="class-card-lock" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>`;
      card.addEventListener('click', () => openPasscodeModal(c));
      grid.appendChild(card);
    });
  }

  function openPasscodeModal(classRow) {
    pendingClass = classRow;
    document.getElementById('passcodeClassLabel').textContent = `${classRow.class_name} · ${classRow.batch_name}`;
    document.getElementById('passcodeInput').value = '';
    document.getElementById('passcodeError').textContent = '';
    const dateEl = document.getElementById('passcodeDateInput');
    dateEl.value = todayStr();
    dateEl.max   = todayStr();
    document.getElementById('passcodeModal').style.display = 'flex';
    document.getElementById('passcodeInput').focus();
  }

  function closePasscodeModal() {
    pendingClass = null;
    document.getElementById('passcodeModal').style.display = 'none';
  }

  async function onPasscodeSubmit() {
    if (!pendingClass) return;
    const entered = document.getElementById('passcodeInput').value.trim();
    if (entered !== String(pendingClass.code)) {
      document.getElementById('passcodeError').textContent = 'Incorrect passcode — try again.';
      return;
    }
    const d = document.getElementById('passcodeDateInput').value || todayStr();
    const { class_name, batch_name, code } = pendingClass;
    closePasscodeModal();
    await enterRegister(class_name, batch_name, d, code);
  }

  async function enterRegister(className, batchName, date, code) {
    currentClass = className; currentBatch = batchName; viewDate = date; contextLoaded = true;

    try {
      localStorage.setItem(LS_CLASS, className);
      localStorage.setItem(LS_BATCH, batchName);
      localStorage.setItem(LS_CODE, code);
    } catch (_) {}

    setStatus('Loading…', false);
    await loadStudents();
    await loadAttendance();

    document.getElementById('classesCard').style.display = 'none';
    document.getElementById('contextCard').style.display = 'none';
    document.getElementById('registerBar').style.display = 'flex';
    document.getElementById('toolbar').style.display = 'flex';
    document.getElementById('tableCard').style.display = 'block';
    document.getElementById('landingHint').style.display = 'none';
    renderAll();
    refreshOptions();
    setStatus('', false);
  }

  // ── Helpers ────────────────────────────────────────────────────────────
  function sortStudents(arr) {
    return arr.sort((a, b) => {
      if (!a.roll_no && !b.roll_no) return a.name.localeCompare(b.name);
      if (!a.roll_no) return 1;
      if (!b.roll_no) return -1;
      return a.roll_no.localeCompare(b.roll_no, undefined, { numeric: true, sensitivity: 'base' });
    });
  }

  // ── Data loading ───────────────────────────────────────────────────────
  async function loadStudents() {
    if (!sb) { students = DEMO_STUDENTS; return; }
    const { data, error } = await sb.from('students1')
      .select('*')
      .eq('class_name', currentClass)
      .eq('batch_name', currentBatch);
    if (error) { setStatus('Could not load students: ' + error.message, true); students = []; return; }
    students = sortStudents(data || []);
  }

  async function loadAttendance() {
    attendanceState = {};
    lectureCount = 1;
    if (!students.length || !sb) return;
    const ids = students.map(s => s.id);
    const { data, error } = await sb.from('attendance1')
      .select('*')
      .eq('attendance_date', viewDate)
      .in('student_id', ids);
    if (error) { setStatus('Could not load attendance: ' + error.message, true); return; }
    let max = 1;
    (data || []).forEach(row => {
      attendanceState[`${row.student_id}__${row.lecture_number}`] = {
        status: row.status, time: row.attendance_time, rowId: row.id
      };
      if (row.lecture_number > max) max = row.lecture_number;
    });
    lectureCount = max;
  }

  // ── Render ─────────────────────────────────────────────────────────────
  function renderLectureSummary() {
    const bar = document.getElementById('lectureSummaryBar');
    bar.innerHTML = '';

    for (let i = 1; i <= lectureCount; i++) {
      const present = students.filter(s => attendanceState[`${s.id}__${i}`]?.status === 'Present').length;
      const chip = document.createElement('div');
      chip.className = 'lec-summary-chip';
      chip.innerHTML =
        `<span class="lec-summary-label">L${i}</span>` +
        `<span class="lec-summary-stat">${present}/${students.length}</span>`;
      bar.appendChild(chip);
    }

    if (isToday()) {
      const btn = document.createElement('button');
      btn.className = 'add-lec-chip-btn';
      btn.innerHTML =
        `<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg> Add lecture`;
      btn.addEventListener('click', onAddLecture);
      bar.appendChild(btn);
    }
  }

  function renderStudentCards() {
    const list  = document.getElementById('studentList');
    const empty = document.getElementById('emptyState');
    list.innerHTML = '';

    if (!students.length) {
      empty.style.display = 'flex';
      document.getElementById('emptyText').textContent =
        `No students yet in ${currentClass} · ${currentBatch} — add the first one above.`;
      return;
    }
    empty.style.display = 'none';

    const readOnly = !isToday();
    students.forEach((s, idx) => {
      const card = document.createElement('div');
      card.className = 'student-card';

      card.innerHTML = `
        <div class="student-card-meta">
          <div class="row-num">${idx + 1}</div>
          <div class="avatar">${initials(s.name)}</div>
          <div class="student-card-name">
            <div class="student-name">${escapeHtml(s.name)}</div>
            ${s.roll_no ? `<div class="student-roll">${escapeHtml(s.roll_no)}</div>` : ''}
          </div>
        </div>
        <div class="lec-chips" data-student-id="${s.id}"></div>
        <button class="student-delete-btn" type="button" title="Delete student" aria-label="Delete ${escapeHtml(s.name)}">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/><line x1="10" y1="11" x2="10" y2="17"/><line x1="14" y1="11" x2="14" y2="17"/></svg>
        </button>`;

      const chips = card.querySelector('.lec-chips');
      for (let lec = 1; lec <= lectureCount; lec++) {
        const btn = document.createElement('button');
        btn.className = 'lec-chip';
        btn.dataset.studentId = s.id;
        btn.dataset.lecture   = lec;
        btn.disabled = readOnly;
        applyChipState(btn, lec, attendanceState[`${s.id}__${lec}`]);
        btn.addEventListener('click', onMarkClick);
        chips.appendChild(btn);
      }

      card.querySelector('.student-delete-btn').addEventListener('click', () => onDeleteStudent(s));

      list.appendChild(card);
    });
  }

  async function onDeleteStudent(s) {
    const ok = await showDialog({
      title: 'Delete student?',
      html: `Delete <strong>${escapeHtml(s.name)}</strong> from this class? This also removes their attendance records.`,
      okLabel: 'Delete', danger: true,
    });
    if (!ok) return;
    try {
      if (sb) {
        const { error } = await sb.from('students1').delete().eq('id', s.id);
        if (error) throw error;
      }
      students = students.filter(x => x.id !== s.id);
      Object.keys(attendanceState).forEach(key => {
        if (key.startsWith(`${s.id}__`)) delete attendanceState[key];
      });
      setStatus(`${s.name} removed.`, false);
      renderAll();
      refreshOptions();
    } catch (err) {
      setStatus('Could not delete student: ' + err.message, true);
    }
  }

  function applyChipState(btn, lec, state) {
    btn.classList.remove('chip-present', 'chip-absent');
    if (!state) {
      btn.innerHTML = `<span class="chip-lec">L${lec}</span><span class="chip-mark">—</span>`;
    } else if (state.status === 'Present') {
      btn.classList.add('chip-present');
      btn.innerHTML = `<span class="chip-lec">L${lec}</span><span class="chip-mark">✓</span>`;
      btn.title = formatTime(state.time);
    } else {
      btn.classList.add('chip-absent');
      btn.innerHTML = `<span class="chip-lec">L${lec}</span><span class="chip-mark">✕</span>`;
      btn.title = formatTime(state.time);
    }
  }

  function updateSummary() {
    const el = document.getElementById('contextSummary');
    const dateLabel = isToday() ? 'Today' : formatDateLong(viewDate);
    el.innerHTML =
      `<strong>${escapeHtml(currentClass)}</strong> · <strong>${escapeHtml(currentBatch)}</strong>` +
      ` · ${dateLabel}` +
      (isToday() ? '' : ' <span class="badge-readonly">Read-only</span>');
    document.getElementById('downloadPdfBtn').disabled = false;
  }

  function renderAll() {
    renderLectureSummary();
    renderStudentCards();
    updateSummary();
  }

  // Re-render just the summary bar + chip for a student after a mark change
  function refreshAfterMark(studentId) {
    renderLectureSummary();
    // update only the chips for this student
    const chips = document.querySelector(`.lec-chips[data-student-id="${studentId}"]`);
    if (!chips) return;
    chips.querySelectorAll('.lec-chip').forEach(btn => {
      const lec = parseInt(btn.dataset.lecture, 10);
      applyChipState(btn, lec, attendanceState[`${studentId}__${lec}`]);
    });
  }

  // ── Attendance toggle ──────────────────────────────────────────────────
  async function onMarkClick(e) {
    const btn       = e.currentTarget;
    const studentId = btn.dataset.studentId;
    const lecture   = parseInt(btn.dataset.lecture, 10);
    const key       = `${studentId}__${lecture}`;
    const current   = attendanceState[key];
    const nextStatus = !current ? 'Present' : current.status === 'Present' ? 'Absent' : null;

    btn.disabled = true;
    try {
      if (nextStatus === null) {
        await removeAttendance(studentId, lecture);
        delete attendanceState[key];
      } else {
        const time  = nowTimeStr();
        const rowId = await upsertAttendance(studentId, lecture, nextStatus, time, current?.rowId);
        attendanceState[key] = { status: nextStatus, time, rowId };
      }
      applyChipState(btn, lecture, attendanceState[key]);
      refreshAfterMark(studentId);
    } catch (err) {
      setStatus('Could not save: ' + err.message, true);
    } finally {
      btn.disabled = !isToday();
    }
  }

  async function upsertAttendance(studentId, lecture, status, time, existingRowId) {
    if (!sb) return existingRowId || `demo-${Math.random()}`;
    const { data, error } = await sb.from('attendance1')
      .upsert({
        student_id:      studentId,
        lecture_number:  lecture,
        attendance_date: viewDate,
        attendance_time: time,
        status,
      }, { onConflict: 'student_id,lecture_number,attendance_date' })
      .select().single();
    if (error) throw error;
    return data.id;
  }

  async function removeAttendance(studentId, lecture) {
    if (!sb) return;
    const { error } = await sb.from('attendance1')
      .delete()
      .eq('student_id',      studentId)
      .eq('lecture_number',  lecture)
      .eq('attendance_date', viewDate);
    if (error) throw error;
  }

  // ── Add student ────────────────────────────────────────────────────────
  async function onAddStudent() {
    if (!contextLoaded) { setStatus('Load a class and batch first.', true); return; }
    const nameEl = document.getElementById('newStudentName');
    const rollEl = document.getElementById('newStudentRoll');
    const name   = nameEl.value.trim();
    const roll   = rollEl.value.trim();
    if (!name) { setStatus('Enter a student name first.', true); return; }

    const btn = document.getElementById('addStudentBtn');
    btn.disabled = true;
    try {
      if (sb) {
        const { data, error } = await sb.from('students1').insert({
          name, roll_no: roll || null, class_name: currentClass, batch_name: currentBatch
        }).select().single();
        if (error) throw error;
        students.push(data);
      } else {
        students.push({ id: `demo-${Date.now()}`, name, roll_no: roll || null });
      }
      sortStudents(students);
      nameEl.value = '';
      rollEl.value = '';
      setStatus(`${name} added.`, false);
      renderAll();
      refreshOptions();
    } catch (err) {
      setStatus('Could not add student: ' + err.message, true);
    } finally {
      btn.disabled = false;
    }
  }

  async function onAddLecture() {
    if (!contextLoaded || !isToday()) return;
    // Auto-mark all unmarked students in the current lecture as Absent
    await autoAbsentLecture(lectureCount);
    lectureCount += 1;
    renderAll();
    setStatus(`Lecture ${lectureCount} added.`, false);
  }

  async function autoAbsentLecture(lec) {
    const time = nowTimeStr();
    const unmarked = students.filter(s => !attendanceState[`${s.id}__${lec}`]);
    await Promise.all(unmarked.map(async s => {
      const key = `${s.id}__${lec}`;
      const rowId = await upsertAttendance(s.id, lec, 'Absent', time, undefined);
      attendanceState[key] = { status: 'Absent', time, rowId };
    }));
  }

  // ── Create new class / switch register ─────────────────────────────────
  async function onLoadContext() {
    const c = document.getElementById('classInput').value.trim();
    const b = document.getElementById('batchInput').value.trim();
    const d = document.getElementById('dateInput').value || todayStr();
    if (!c || !b) { setStatus('Enter both a class and a batch.', true); return; }

    const dupe = classesList.find(cl =>
      cl.class_name.toLowerCase() === c.toLowerCase() &&
      cl.batch_name.toLowerCase() === b.toLowerCase());
    if (dupe) {
      setStatus('That class already exists — click its card above and enter the passcode.', true);
      return;
    }

    const loadBtn = document.getElementById('loadContextBtn');
    loadBtn.disabled = true;
    setStatus('Creating class…', false);

    try {
      const row = await createClass(c, b);
      classesList.push(row);
      renderClasses();
      document.getElementById('classInput').value = '';
      document.getElementById('batchInput').value = '';
      await showDialog({
        title: 'Class created',
        html: `<span style="display:block;margin-bottom:10px">Save this passcode — it's required to open and mark attendance for <strong>${escapeHtml(c)} · ${escapeHtml(b)}</strong>.</span>` +
              `<span style="display:block;font-family:'JetBrains Mono',monospace;font-size:22px;font-weight:700;letter-spacing:3px;text-align:center;color:var(--primary)">${escapeHtml(row.code)}</span>`,
        okLabel: 'Got it', showCancel: false,
      });
      await enterRegister(c, b, d, row.code);
    } catch (err) {
      setStatus('Could not create class: ' + err.message, true);
    } finally {
      loadBtn.disabled = false;
    }
  }

  function onSwitchRegister() {
    document.getElementById('registerBar').style.display = 'none';
    document.getElementById('toolbar').style.display = 'none';
    document.getElementById('tableCard').style.display = 'none';
    document.getElementById('contextCard').style.display = 'none';
    document.getElementById('classesCard').style.display = 'block';
    document.getElementById('landingHint').style.display = 'flex';
    loadClasses();
  }

  function setStatus(msg, isError) {
    const el = document.getElementById('statusMsg');
    el.textContent = msg;
    el.className = 'status-msg' + (isError ? ' error' : '');
    if (msg) setTimeout(() => { if (el.textContent === msg) el.textContent = ''; }, 4000);
  }

  // ── PDF export ─────────────────────────────────────────────────────────
  function downloadPdf() {
    if (!contextLoaded) { setStatus('Load a class and batch first.', true); return; }
    if (!window.jspdf)  { setStatus('PDF library not loaded — check internet connection.', true); return; }
    if (!students.length) { setStatus('No students to export.', true); return; }

    const { jsPDF } = window.jspdf;
    const doc = new jsPDF({ orientation: 'landscape' });

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(15);
    doc.text('ADCI Classroom Attendance', 14, 17);

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(10);
    doc.text(`Class: ${currentClass}   |   Batch: ${currentBatch}   |   Date: ${formatDateLong(viewDate)}`, 14, 24);

    const lectureHeaders = Array.from({ length: lectureCount }, (_, i) => `Lecture ${i + 1}`);
    const head = [['#', 'Name', 'Roll No', ...lectureHeaders]];
    const body = students.map((s, idx) => {
      const row = [idx + 1, s.name, s.roll_no || '-'];
      for (let lec = 1; lec <= lectureCount; lec++) {
        const st = attendanceState[`${s.id}__${lec}`];
        row.push(st ? `${st.status} (${formatTime(st.time)})` : 'Not marked');
      }
      return row;
    });

    doc.autoTable({
      head, body, startY: 30,
      styles: { fontSize: 8.5, cellPadding: 4 },
      headStyles: { fillColor: [99, 102, 241], textColor: 255 },
      alternateRowStyles: { fillColor: [241, 245, 249] },
    });

    const safe = s => s.replace(/[^a-z0-9]+/gi, '-').toLowerCase();
    doc.save(`attendance-${safe(currentClass)}-${safe(currentBatch)}-${viewDate}.pdf`);
  }

  // ── Init ───────────────────────────────────────────────────────────────
  document.getElementById('addStudentBtn').addEventListener('click', onAddStudent);
  document.getElementById('loadContextBtn').addEventListener('click', onLoadContext);
  document.getElementById('switchRegisterBtn').addEventListener('click', onSwitchRegister);
  document.getElementById('downloadPdfBtn').addEventListener('click', downloadPdf);
  document.getElementById('newStudentName').addEventListener('keydown', e => e.key === 'Enter' && onAddStudent());
  document.getElementById('newStudentRoll').addEventListener('keydown', e => e.key === 'Enter' && onAddStudent());
  document.getElementById('classInput').addEventListener('keydown', e => e.key === 'Enter' && onLoadContext());
  document.getElementById('batchInput').addEventListener('keydown', e => e.key === 'Enter' && onLoadContext());

  document.getElementById('newClassBtn').addEventListener('click', () => {
    document.getElementById('contextCard').style.display = 'block';
    document.getElementById('classInput').focus();
  });
  document.getElementById('cancelNewClassBtn').addEventListener('click', () => {
    document.getElementById('contextCard').style.display = 'none';
    document.getElementById('classInput').value = '';
    document.getElementById('batchInput').value = '';
  });

  document.getElementById('passcodeSubmitBtn').addEventListener('click', onPasscodeSubmit);
  document.getElementById('passcodeCancelBtn').addEventListener('click', closePasscodeModal);
  document.getElementById('passcodeInput').addEventListener('keydown', e => e.key === 'Enter' && onPasscodeSubmit());
  document.getElementById('passcodeModal').addEventListener('click', e => {
    if (e.target.id === 'passcodeModal') closePasscodeModal();
  });

  // ── Bulk import ──────────────────────────────────────────────────────────
  let importRows = []; // parsed & deduplicated rows ready to insert

  document.getElementById('importToggleBtn').addEventListener('click', () => {
    const panel = document.getElementById('importPanel');
    const open  = panel.style.display === 'none';
    panel.style.display = open ? 'block' : 'none';
    if (open) document.getElementById('importTextarea').focus();
  });

  document.getElementById('importCloseBtn').addEventListener('click', () => {
    document.getElementById('importPanel').style.display = 'none';
    resetImportUI();
  });

  document.getElementById('importFileInput').addEventListener('change', e => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = ev => {
      document.getElementById('importTextarea').value = ev.target.result;
      e.target.value = '';
    };
    reader.readAsText(file);
  });

  document.getElementById('importParseBtn').addEventListener('click', onImportParse);
  document.getElementById('importConfirmBtn').addEventListener('click', onImportConfirm);

  function parseImportText(raw) {
    return raw.split('\n')
      .map(line => line.trim())
      .filter(Boolean)
      .map(line => {
        let parts = line.split(',').map(p => p.trim());
        // If a leading serial-number column is present (e.g. "1, Aarav Mehta, ADCI-01"),
        // strip it without reordering the remaining columns.
        if (parts.length >= 2 && /^\d+$/.test(parts[0]) && parts[1] && !/^\d+$/.test(parts[1])) {
          parts = parts.slice(1);
        }
        const name = parts[0] || '';
        const roll = parts[1] || '';
        return { name, roll };
      })
      .filter(r => r.name &&
        !/^name$/i.test(r.name) &&
        !/^(s\.?\s?no\.?|sr\.?\s?no\.?|serial(\s?no)?)$/i.test(r.name)); // skip header rows
  }

  function onImportParse() {
    const raw = document.getElementById('importTextarea').value;
    const parsed = parseImportText(raw);

    if (!parsed.length) {
      setStatus('Nothing to import — paste at least one name.', true);
      return;
    }

    const existingNames = new Set(students.map(s => s.name.toLowerCase()));
    importRows = [];

    const preview = document.getElementById('importPreview');
    preview.innerHTML = '';
    preview.style.display = 'flex';

    parsed.forEach(r => {
      const isDupe = existingNames.has(r.name.toLowerCase());
      if (!isDupe) importRows.push(r);

      const row = document.createElement('div');
      row.className = 'import-preview-row' + (isDupe ? ' row-dupe' : '');
      row.innerHTML = `
        <div class="avatar">${initials(r.name)}</div>
        <div>
          <div class="student-name">${escapeHtml(r.name)}</div>
          ${r.roll ? `<div class="student-roll">${escapeHtml(r.roll)}</div>` : ''}
        </div>
        ${isDupe ? '<span class="import-dupe-tag">already exists</span>' : ''}`;
      preview.appendChild(row);
    });

    const confirmBtn = document.getElementById('importConfirmBtn');
    document.getElementById('importCount').textContent = importRows.length;
    confirmBtn.style.display = importRows.length ? 'inline-flex' : 'none';
    if (!importRows.length) setStatus('All parsed students already exist.', true);
  }

  async function onImportConfirm() {
    if (!importRows.length) return;
    const btn = document.getElementById('importConfirmBtn');
    btn.disabled = true;
    try {
      if (sb) {
        const records = importRows.map(r => ({
          name: r.name, roll_no: r.roll || null,
          class_name: currentClass, batch_name: currentBatch,
        }));
        const { data, error } = await sb.from('students1').insert(records).select();
        if (error) throw error;
        students.push(...(data || []));
      } else {
        importRows.forEach(r => {
          students.push({ id: `demo-${Date.now()}-${Math.random()}`, name: r.name, roll_no: r.roll || null });
        });
      }
      sortStudents(students);
      setStatus(`${importRows.length} student${importRows.length > 1 ? 's' : ''} imported.`, false);
      importRows = [];
      document.getElementById('importPanel').style.display = 'none';
      resetImportUI();
      renderAll();
      refreshOptions();
    } catch (err) {
      setStatus('Import failed: ' + err.message, true);
    } finally {
      btn.disabled = false;
    }
  }

  function resetImportUI() {
    document.getElementById('importTextarea').value = '';
    document.getElementById('importPreview').style.display = 'none';
    document.getElementById('importPreview').innerHTML = '';
    document.getElementById('importConfirmBtn').style.display = 'none';
    importRows = [];
  }

  (async function init() {
    const dateEl = document.getElementById('dateInput');
    dateEl.value = todayStr();
    dateEl.max   = todayStr();

    await refreshOptions();
    await loadClasses();

    // Try to auto-resume last session, but only if the saved passcode still
    // matches a real class — otherwise the user must unlock via the card again.
    let savedClass = '', savedBatch = '', savedCode = '';
    try {
      savedClass = localStorage.getItem(LS_CLASS) || '';
      savedBatch = localStorage.getItem(LS_BATCH) || '';
      savedCode  = localStorage.getItem(LS_CODE) || '';
    } catch (_) {}

    if (!sb) {
      await enterRegister(DEMO_CLASS, DEMO_BATCH, todayStr(), '000000');
      return;
    }

    if (savedClass && savedBatch && savedCode) {
      const match = classesList.find(c =>
        c.class_name === savedClass && c.batch_name === savedBatch && String(c.code) === savedCode);
      if (match) {
        await enterRegister(savedClass, savedBatch, todayStr(), savedCode);
        return;
      }
      try {
        localStorage.removeItem(LS_CLASS);
        localStorage.removeItem(LS_BATCH);
        localStorage.removeItem(LS_CODE);
      } catch (_) {}
    }
  })();
})();

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

  // ── State ──────────────────────────────────────────────────────────────
  let students       = [];
  let attendanceState = {};
  let lectureCount   = 1;
  let currentClass   = '';
  let currentBatch   = '';
  let viewDate       = '';
  let contextLoaded  = false;

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

  // ── Data loading ───────────────────────────────────────────────────────
  async function loadStudents() {
    if (!sb) { students = DEMO_STUDENTS; return; }
    const { data, error } = await sb.from('students1')
      .select('*')
      .eq('class_name', currentClass)
      .eq('batch_name', currentBatch)
      .order('name', { ascending: true });
    if (error) { setStatus('Could not load students: ' + error.message, true); students = []; return; }
    students = data || [];
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
  function renderHeader() {
    const row = document.getElementById('headerRow');
    row.querySelectorAll('.lec-th').forEach(el => el.remove());

    for (let i = 1; i <= lectureCount; i++) {
      const present = students.filter(s => attendanceState[`${s.id}__${i}`]?.status === 'Present').length;
      const th = document.createElement('th');
      th.className = 'lec-th';
      th.innerHTML = `Lecture ${i}<span class="lec-count">${present}/${students.length} present</span>`;
      row.appendChild(th);
    }

    // "+" add-lecture cell — only on today
    if (isToday()) {
      const thAdd = document.createElement('th');
      thAdd.className = 'lec-th add-lec-th';
      thAdd.title = 'Add lecture';
      thAdd.innerHTML = `<button class="add-lec-btn" aria-label="Add lecture">＋</button>`;
      thAdd.querySelector('.add-lec-btn').addEventListener('click', onAddLecture);
      row.appendChild(thAdd);
    }
  }

  function renderRows() {
    const tbody  = document.getElementById('tableBody');
    const empty  = document.getElementById('emptyState');
    tbody.innerHTML = '';

    if (!students.length) {
      empty.style.display = 'flex';
      document.getElementById('emptyText').textContent =
        `No students yet in ${currentClass} · ${currentBatch} — add the first one above.`;
      return;
    }
    empty.style.display = 'none';

    const readOnly = !isToday();
    students.forEach((s, idx) => {
      const tr = document.createElement('tr');

      const tdNum = document.createElement('td');
      tdNum.innerHTML = `<div class="row-num">${idx + 1}</div>`;
      tr.appendChild(tdNum);

      const tdName = document.createElement('td');
      tdName.innerHTML = `
        <div class="student-cell">
          <div class="avatar">${initials(s.name)}</div>
          <div>
            <div class="student-name">${escapeHtml(s.name)}</div>
            ${s.roll_no ? `<div class="student-roll">${escapeHtml(s.roll_no)}</div>` : ''}
          </div>
        </div>`;
      tr.appendChild(tdName);

      for (let lec = 1; lec <= lectureCount; lec++) {
        const td  = document.createElement('td');
        const btn = document.createElement('button');
        btn.className = 'mark-btn';
        btn.dataset.studentId = s.id;
        btn.dataset.lecture   = lec;
        btn.disabled = readOnly;
        applyBtnState(btn, attendanceState[`${s.id}__${lec}`]);
        btn.addEventListener('click', onMarkClick);
        td.appendChild(btn);
        tr.appendChild(td);
      }

      // empty cell under the "+" header
      if (isToday()) tr.appendChild(document.createElement('td'));

      tbody.appendChild(tr);
    });
  }

  function applyBtnState(btn, state) {
    btn.classList.remove('state-present', 'state-absent');
    if (!state) {
      btn.innerHTML = 'Mark Present';
    } else if (state.status === 'Present') {
      btn.classList.add('state-present');
      btn.innerHTML = `✓ Present<span class="time">${formatTime(state.time)}</span>`;
    } else {
      btn.classList.add('state-absent');
      btn.innerHTML = `✕ Absent<span class="time">${formatTime(state.time)}</span>`;
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
    renderHeader();
    renderRows();
    updateSummary();
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
      applyBtnState(btn, attendanceState[key]);
      renderHeader();
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
      students.sort((a, b) => a.name.localeCompare(b.name));
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

  function onAddLecture() {
    if (!contextLoaded || !isToday()) return;
    lectureCount += 1;
    renderAll();
    setStatus(`Lecture ${lectureCount} added.`, false);
  }

  // ── Load / switch register ─────────────────────────────────────────────
  async function onLoadContext() {
    const c = document.getElementById('classInput').value.trim();
    const b = document.getElementById('batchInput').value.trim();
    const d = document.getElementById('dateInput').value || todayStr();
    if (!c || !b) { setStatus('Enter both a class and a batch.', true); return; }

    currentClass = c; currentBatch = b; viewDate = d; contextLoaded = true;

    // persist for next session
    try { localStorage.setItem(LS_CLASS, c); localStorage.setItem(LS_BATCH, b); } catch (_) {}

    const loadBtn = document.getElementById('loadContextBtn');
    loadBtn.disabled = true;
    setStatus('Loading…', false);

    try {
      await loadStudents();
      await loadAttendance();

      // hide context card, show register bar + content
      document.getElementById('contextCard').style.display = 'none';
      document.getElementById('registerBar').style.display = 'flex';
      document.getElementById('toolbar').style.display = 'flex';
      document.getElementById('tableCard').style.display = 'block';
      document.getElementById('landingHint').style.display = 'none';
      renderAll();
      refreshOptions();
      setStatus('', false);
    } finally {
      loadBtn.disabled = false;
    }
  }

  function onSwitchRegister() {
    document.getElementById('registerBar').style.display = 'none';
    document.getElementById('toolbar').style.display = 'none';
    document.getElementById('tableCard').style.display = 'none';
    document.getElementById('contextCard').style.display = 'block';
    document.getElementById('landingHint').style.display = 'flex';
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
        const parts = line.split(',').map(p => p.trim());
        const name  = parts[0] || '';
        const roll  = parts[1] || '';
        return { name, roll };
      })
      .filter(r => r.name && !/^name$/i.test(r.name)); // skip header rows
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
      students.sort((a, b) => a.name.localeCompare(b.name));
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

    // Try to auto-load from last session
    let savedClass = '', savedBatch = '';
    try {
      savedClass = localStorage.getItem(LS_CLASS) || '';
      savedBatch = localStorage.getItem(LS_BATCH) || '';
    } catch (_) {}

    // Fall back to demo values when Supabase isn't configured
    if (!sb) { savedClass = DEMO_CLASS; savedBatch = DEMO_BATCH; }

    if (savedClass && savedBatch) {
      document.getElementById('classInput').value = savedClass;
      document.getElementById('batchInput').value = savedBatch;
      await onLoadContext();
      // If the saved class/batch no longer has any students, it was likely deleted —
      // clear localStorage and return to the form so the user starts fresh.
      if (sb && students.length === 0) {
        try { localStorage.removeItem(LS_CLASS); localStorage.removeItem(LS_BATCH); } catch (_) {}
        onSwitchRegister();
        setStatus('Saved register not found — please load a new one.', true);
      }
    }
  })();
})();

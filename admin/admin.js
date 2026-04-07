(function () {
  'use strict';

  /* ═══════════════════════════════════════
     CONSTANTS & SEED DATA
  ═══════════════════════════════════════ */
  var STORE_KEY  = 'fieldnotes_experiments';
  var DB_NAME    = 'fieldnotes-admin';
  var DB_VERSION = 1;
  var DB_STORE   = 'fs-handles';

  var DEFAULTS = [
    {
      id: 'exp-001', number: '001',
      title: 'Prompt Engineering for Strategy Briefs',
      date: '2026-03-10', status: 'complete', signal: 'high',
      category: 'Prompt Design', categoryColor: 'blue',
      tools: 'Claude 3.5 Sonnet',
      desc: 'Can an LLM turn bullet-point notes into a client-ready strategy brief? Tested with zero context, role prompting, and few-shot examples.',
      file: 'experiment-001.html'
    },
    {
      id: 'exp-002', number: '002',
      title: 'Model Comparison: Handling Ambiguous Client Briefs',
      date: '2026-03-22', status: 'complete', signal: 'nuanced',
      category: 'Model Comparison', categoryColor: '',
      tools: 'GPT-4o, Claude 3.5 Sonnet',
      desc: 'Gave the same five ambiguous strategic questions to GPT-4o and Claude 3.5 Sonnet. Compared quality, nuance, and usefulness of their responses.',
      file: 'experiment-002.html'
    },
    {
      id: 'exp-003', number: '003',
      title: 'Using AI to Synthesize Workshop Outputs',
      date: '2026-04-01', status: 'complete', signal: 'high',
      category: 'Synthesis', categoryColor: 'blue',
      tools: 'Claude 3 Opus',
      desc: 'Tested whether Claude could turn raw sticky-note exports into a structured synthesis doc — with minimal prompting versus a detailed template.',
      file: 'experiment-003.html'
    },
    {
      id: 'exp-004', number: '004',
      title: 'Building a site with Protogen',
      date: '2026-04-07', status: 'ongoing', signal: 'high',
      category: 'Vibe Coding', categoryColor: 'blue',
      tools: 'VS Code, Github, Vercel',
      desc: 'This site was built using the Protogen 101 series of training, but using some different prompts to generate a site that could be useful for me and for the CX team as a whole.  The first round required copying and editing html pages to make changes. I requested an admin page to do this. After some debugging, I was able to create a new page using this admin form.  The admin form allows the export, editing, and deleting of existing experiments.  I\'ll test that next.',
      file: 'experiment-004.html'
    }
  ];

  /* ═══════════════════════════════════════
     LOCAL STORAGE
  ═══════════════════════════════════════ */
  function loadExperiments() {
    try { var r = localStorage.getItem(STORE_KEY); return r ? JSON.parse(r) : null; }
    catch (e) { return null; }
  }
  function saveExperiments(list) {
    try { localStorage.setItem(STORE_KEY, JSON.stringify(list)); } catch (e) {}
  }
  function getExperiments() {
    return loadExperiments() || JSON.parse(JSON.stringify(DEFAULTS));
  }

  /* ═══════════════════════════════════════
     FILE SYSTEM — IndexedDB handle persistence
  ═══════════════════════════════════════ */
  function openDB() {
    return new Promise(function (resolve, reject) {
      var req = indexedDB.open(DB_NAME, DB_VERSION);
      req.onupgradeneeded = function (e) { e.target.result.createObjectStore(DB_STORE); };
      req.onsuccess = function (e) { resolve(e.target.result); };
      req.onerror   = function (e) { reject(e.target.error); };
    });
  }
  function persistHandle(handle) {
    return openDB().then(function (db) {
      return new Promise(function (resolve, reject) {
        var tx = db.transaction(DB_STORE, 'readwrite');
        tx.objectStore(DB_STORE).put(handle, 'root');
        tx.oncomplete = resolve;
        tx.onerror    = function (e) { reject(e.target.error); };
      });
    });
  }
  function loadHandle() {
    return openDB().then(function (db) {
      return new Promise(function (resolve, reject) {
        var req = db.transaction(DB_STORE, 'readonly').objectStore(DB_STORE).get('root');
        req.onsuccess = function (e) { resolve(e.target.result || null); };
        req.onerror   = function (e) { reject(e.target.error); };
      });
    });
  }

  /* ═══════════════════════════════════════
     FILE SYSTEM — read / write / delete
  ═══════════════════════════════════════ */
  var dirHandle = null;

  function getNestedHandle(relPath, create) {
    var parts = relPath.split('/');
    var dir   = dirHandle;
    var promise = Promise.resolve();
    for (var i = 0; i < parts.length - 1; i++) {
      (function (part) {
        promise = promise.then(function () {
          return dir.getDirectoryHandle(part).then(function (d) { dir = d; });
        });
      })(parts[i]);
    }
    var filename = parts[parts.length - 1];
    return promise.then(function () {
      return dir.getFileHandle(filename, { create: !!create });
    });
  }

  function readSiteFile(relPath) {
    return getNestedHandle(relPath, false)
      .then(function (fh) { return fh.getFile(); })
      .then(function (f)  { return f.text(); });
  }

  function writeSiteFile(relPath, content) {
    return getNestedHandle(relPath, true).then(function (fh) {
      return fh.createWritable().then(function (w) {
        return w.write(content).then(function () { return w.close(); });
      });
    });
  }

  function deleteSiteFile(relPath) {
    var parts = relPath.split('/');
    var dir   = dirHandle;
    var promise = Promise.resolve();
    for (var i = 0; i < parts.length - 1; i++) {
      (function (part) {
        promise = promise.then(function () {
          return dir.getDirectoryHandle(part).then(function (d) { dir = d; });
        });
      })(parts[i]);
    }
    return promise.then(function () {
      return dir.removeEntry(parts[parts.length - 1]);
    });
  }

  /* ═══════════════════════════════════════
     FILE SYSTEM — connection UI
  ═══════════════════════════════════════ */
  var connBanner  = document.getElementById('conn-banner');
  var connStatus  = document.getElementById('conn-status');
  var connectBtn  = document.getElementById('connect-btn');
  var syncMsgEl   = document.getElementById('sync-msg');

  function setConnected(handle) {
    dirHandle = handle;
    connBanner.className = 'conn-banner conn-banner--on';
    connStatus.innerHTML = '<strong>Connected:</strong> ' + esc(handle.name);
    connectBtn.textContent = 'Change folder';
  }

  function setDisconnected() {
    dirHandle = null;
    connBanner.className = 'conn-banner conn-banner--off';
    connStatus.innerHTML = 'No site folder connected — edits update preview only. ' +
      '<strong>Connect a folder</strong> to write files directly.';
    connectBtn.textContent = 'Connect site folder';
  }

  function showSyncMsg(msg, isError) {
    syncMsgEl.textContent = msg;
    syncMsgEl.className   = 'sync-msg ' + (isError ? 'sync-msg--err' : 'sync-msg--ok');
    syncMsgEl.style.display = 'block';
    clearTimeout(syncMsgEl._timer);
    syncMsgEl._timer = setTimeout(function () { syncMsgEl.style.display = 'none'; }, 4000);
  }

  connectBtn.addEventListener('click', function () {
    if (!window.showDirectoryPicker) {
      alert('Your browser does not support the File System Access API.\n\nUse Chrome or Edge to enable direct file writing.\n\nYou can still use the \u2197 Export button on each row to copy-paste HTML manually.');
      return;
    }
    window.showDirectoryPicker({ mode: 'readwrite' })
      .then(function (handle) {
        return persistHandle(handle).then(function () { return handle; });
      })
      .then(function (handle) {
        setConnected(handle);
        showSyncMsg('Connected — changes will now write directly to your site files.');
      })
      .catch(function (e) {
        if (e.name !== 'AbortError') { alert('Could not access folder: ' + e.message); }
      });
  });

  /* ═══════════════════════════════════════
     HTML MARKER HELPERS
  ═══════════════════════════════════════ */
  function replaceMarked(html, startMarker, endMarker, newContent) {
    var s = html.indexOf(startMarker);
    var e = html.indexOf(endMarker);
    if (s === -1 || e === -1) { return null; } // markers missing
    return html.slice(0, s + startMarker.length) + '\n' + newContent + '\n' + html.slice(e);
  }

  /* ═══════════════════════════════════════
     SYNC TO SITE FILES
  ═══════════════════════════════════════ */
  function syncAllFiles(list, deletedFile) {
    if (!dirHandle) { return Promise.resolve(); }
    var sorted = list.slice().sort(function (a, b) {
      return (b.date || '').localeCompare(a.date || '');
    });

    var p = Promise.resolve();

    // 1. Update index.html (homepage cards + stat count)
    p = p.then(function () {
      return readSiteFile('index.html').then(function (html) {
        var recent    = sorted.slice(0, 3);
        var cardsHtml = recent.map(function (exp) { return buildCardHtml(exp); }).join('\n\n');
        var updated   = replaceMarked(html, '<!-- ADMIN:CARDS:START -->', '<!-- ADMIN:CARDS:END -->', cardsHtml);
        if (!updated) { throw new Error('ADMIN:CARDS markers not found in index.html'); }
        // Update experiment count
        updated = updated.replace(
          /(<div class="stat-number">)(\d+)(<\/div>\s*<div class="stat-label">Experiments logged)/,
          '$1' + list.length + '$3'
        );
        return writeSiteFile('index.html', updated);
      });
    });

    // 2. Update experiments/index.html (all rows + filter count)
    p = p.then(function () {
      return readSiteFile('experiments/index.html').then(function (html) {
        var rowsHtml = sorted.map(function (exp) { return buildRowHtml(exp); }).join('\n\n');
        var updated  = replaceMarked(html, '<!-- ADMIN:ROWS:START -->', '<!-- ADMIN:ROWS:END -->', rowsHtml);
        if (!updated) { throw new Error('ADMIN:ROWS markers not found in experiments/index.html'); }
        updated = updated.replace(
          /(<span class="tag tag--blue" style="cursor:default;">All \()\d+(\)<\/span>)/,
          '$1' + list.length + '$2'
        );
        return writeSiteFile('experiments/index.html', updated);
      });
    });

    // 3. Delete the detail page if one was supplied
    if (deletedFile) {
      p = p.then(function () {
        return deleteSiteFile('experiments/' + deletedFile).catch(function () {
          // File may not exist if it was never written; ignore
        });
      });
    }

    return p;
  }

  function writeDetailPage(exp) {
    if (!dirHandle) { return Promise.resolve(); }
    var filename = exp.file || ('experiment-' + exp.number + '.html');
    var path     = 'experiments/' + filename;
    // For an edit, try to preserve the existing body content
    return readSiteFile(path).then(function (existing) {
      // Replace only the <header class="experiment-header"> block
      var newHeader = buildDetailHeader(exp);
      var updated   = existing.replace(
        /<header class="experiment-header">[\s\S]*?<\/header>/,
        newHeader
      );
      return writeSiteFile(path, updated);
    }).catch(function () {
      // File doesn't exist yet — write the full template
      return writeSiteFile(path, buildDetailHtml(exp));
    });
  }

  /* ═══════════════════════════════════════
     DOM REFS
  ═══════════════════════════════════════ */
  var addBtn        = document.getElementById('add-btn');
  var formPanel     = document.getElementById('form-panel');
  var formTitleEl   = document.getElementById('form-title');
  var formClose     = document.getElementById('form-close');
  var formCancelBtn = document.getElementById('form-cancel-btn');
  var expForm       = document.getElementById('experiment-form');
  var editIdInput   = document.getElementById('edit-id');
  var fTitle        = document.getElementById('f-title');
  var fNumber       = document.getElementById('f-number');
  var fDate         = document.getElementById('f-date');
  var fStatus       = document.getElementById('f-status');
  var fSignal       = document.getElementById('f-signal');
  var fCategory     = document.getElementById('f-category');
  var fCategoryColor= document.getElementById('f-category-color');
  var fTools        = document.getElementById('f-tools');
  var fDesc         = document.getElementById('f-desc');
  var listEl        = document.getElementById('experiment-list');
  var countEl       = document.getElementById('exp-count');
  var resetBtn      = document.getElementById('reset-btn');
  var exportModal   = document.getElementById('export-modal');
  var confirmOverlay= document.getElementById('confirm-overlay');
  var confirmMsg    = document.getElementById('confirm-msg');
  var confirmYes    = document.getElementById('confirm-yes');
  var confirmNo     = document.getElementById('confirm-no');

  var pendingDeleteId  = null;
  var currentEditingRow = null;

  /* ═══════════════════════════════════════
     HELPERS
  ═══════════════════════════════════════ */
  function esc(str) {
    return String(str)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;')
      .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }
  function formatDate(iso) {
    if (!iso) return '';
    return new Date(iso + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  }
  function statusLabel(s) { return s === 'complete' ? 'Complete' : s === 'ongoing' ? 'Ongoing' : 'Draft'; }
  function statusClass(s) { return s === 'complete' ? 'status--complete' : s === 'ongoing' ? 'status--ongoing' : 'status--draft'; }
  function signalLabel(s) { return s === 'high' ? 'High signal' : s === 'nuanced' ? 'Nuanced' : s === 'low' ? 'Low signal' : ''; }
  function signalTagClass(s) { return s === 'high' ? 'tag--green' : s === 'nuanced' ? 'tag--yellow' : ''; }
  function nextNumber(list) {
    if (!list.length) return '001';
    var max = 0;
    list.forEach(function (e) { var n = parseInt(e.number, 10) || 0; if (n > max) max = n; });
    return String(max + 1).padStart(3, '0');
  }

  /* ═══════════════════════════════════════
     RENDER ADMIN LIST
  ═══════════════════════════════════════ */
  function renderList() {
    var list = getExperiments();
    countEl.textContent = '(' + list.length + ')';
    if (!list.length) {
      listEl.innerHTML = '<div class="empty-state"><strong>No experiments yet.</strong><p>Click <em>+ Add New Experiment</em> to get started.</p></div>';
      return;
    }
    var sorted = list.slice().sort(function (a, b) { return (b.date || '').localeCompare(a.date || ''); });
    listEl.innerHTML = sorted.map(function (exp) {
      var catTag    = exp.category ? '<span class="tag' + (exp.categoryColor ? ' tag--' + exp.categoryColor : '') + '">' + esc(exp.category) + '</span>' : '';
      var toolTags  = (exp.tools || '').split(',').filter(function(t){return t.trim();}).map(function(t){ return '<span class="tag">' + esc(t.trim()) + '</span>'; }).join('');
      var signalTag = exp.signal ? '<span class="tag ' + signalTagClass(exp.signal) + '">' + signalLabel(exp.signal) + '</span>' : '';
      return '<div class="admin-row" id="row-' + esc(exp.id) + '">' +
        '<div class="admin-row-num">' + esc(exp.number) + '</div>' +
        '<div class="admin-row-info">' +
          '<div class="admin-row-title">' + esc(exp.title) + '</div>' +
          '<div class="admin-row-meta">' +
            '<span class="status-badge ' + statusClass(exp.status) + '">' + statusLabel(exp.status) + '</span>' +
            '<span class="admin-row-date">' + formatDate(exp.date) + '</span>' +
            catTag + toolTags + signalTag +
          '</div>' +
        '</div>' +
        '<a class="btn-icon" href="detail.html?id=' + esc(exp.id) + '" title="Edit detail page content">&#x1F4C4; Edit Page</a>' +
        '<button class="btn-icon" data-export="' + esc(exp.id) + '" title="Export HTML">&#x2197; Export</button>' +
        '<div class="admin-row-actions">' +
          '<button class="btn-icon" data-edit="' + esc(exp.id) + '" title="Edit summary">&#x270F; Edit</button>' +
          '<button class="btn-icon btn-icon--delete" data-delete="' + esc(exp.id) + '" title="Delete">&#x1F5D1; Delete</button>' +
        '</div>' +
      '</div>';
    }).join('');

    listEl.querySelectorAll('[data-edit]').forEach(function (btn) {
      btn.addEventListener('click', function () { openEditForm(btn.dataset.edit); });
    });
    listEl.querySelectorAll('[data-delete]').forEach(function (btn) {
      btn.addEventListener('click', function () { openDeleteConfirm(btn.dataset.delete); });
    });
    listEl.querySelectorAll('[data-export]').forEach(function (btn) {
      btn.addEventListener('click', function () { openExportModal(btn.dataset.export); });
    });
  }

  /* ═══════════════════════════════════════
     FORM
  ═══════════════════════════════════════ */
  function openAddForm() {
    var list = getExperiments();
    editIdInput.value = '';
    expForm.reset();
    fNumber.value = nextNumber(list);
    fDate.value   = new Date().toISOString().slice(0, 10);
    fStatus.value = 'draft';
    formTitleEl.textContent = 'Add New Experiment';
    if (currentEditingRow) {
      var r = document.getElementById('row-' + currentEditingRow);
      if (r) r.classList.remove('is-editing');
      currentEditingRow = null;
    }
    formPanel.classList.add('is-open');
    formPanel.scrollIntoView({ behavior: 'smooth', block: 'start' });
    fTitle.focus();
  }

  function openEditForm(id) {
    var list = getExperiments();
    var exp  = list.find(function (e) { return e.id === id; });
    if (!exp) return;
    editIdInput.value    = exp.id;
    fTitle.value         = exp.title   || '';
    fNumber.value        = exp.number  || '';
    fDate.value          = exp.date    || '';
    fStatus.value        = exp.status  || 'draft';
    fSignal.value        = exp.signal  || '';
    fCategory.value      = exp.category || '';
    fCategoryColor.value = exp.categoryColor || '';
    fTools.value         = exp.tools   || '';
    fDesc.value          = exp.desc    || '';
    formTitleEl.textContent = 'Edit Experiment ' + exp.number;
    if (currentEditingRow && currentEditingRow !== id) {
      var prev = document.getElementById('row-' + currentEditingRow);
      if (prev) prev.classList.remove('is-editing');
    }
    currentEditingRow = id;
    var row = document.getElementById('row-' + id);
    if (row) row.classList.add('is-editing');
    formPanel.classList.add('is-open');
    formPanel.scrollIntoView({ behavior: 'smooth', block: 'start' });
    fTitle.focus();
  }

  function closeForm() {
    formPanel.classList.remove('is-open');
    if (currentEditingRow) {
      var row = document.getElementById('row-' + currentEditingRow);
      if (row) row.classList.remove('is-editing');
      currentEditingRow = null;
    }
  }

  expForm.addEventListener('submit', function (e) {
    e.preventDefault();
    var title = fTitle.value.trim();
    var desc  = fDesc.value.trim();
    var date  = fDate.value;
    if (!title || !desc || !date) { alert('Please fill in Title, Date, and Description.'); return; }

    var list = getExperiments();
    var id   = editIdInput.value;
    var isNew = !id;

    if (id) {
      var idx = list.findIndex(function (e) { return e.id === id; });
      if (idx !== -1) {
        list[idx] = {
          id: id, number: fNumber.value.trim() || list[idx].number,
          title: title, date: date, status: fStatus.value, signal: fSignal.value,
          category: fCategory.value.trim(), categoryColor: fCategoryColor.value,
          tools: fTools.value.trim(), desc: desc,
          file: 'experiment-' + (fNumber.value.trim() || list[idx].number) + '.html'
        };
      }
    } else {
      var num   = fNumber.value.trim() || nextNumber(list);
      list.push({
        id: 'exp-' + num, number: num,
        title: title, date: date, status: fStatus.value, signal: fSignal.value,
        category: fCategory.value.trim(), categoryColor: fCategoryColor.value,
        tools: fTools.value.trim(), desc: desc,
        file: 'experiment-' + num + '.html'
      });
    }

    saveExperiments(list);
    closeForm();
    renderList();

    if (dirHandle) {
      var savedExp = list.find(function (e) { return e.title === title && e.date === date; });
      var syncPromise = syncAllFiles(list, null);
      if (savedExp) {
        if (isNew) {
          syncPromise = syncPromise.then(function () { return writeSiteFile('experiments/' + savedExp.file, buildDetailHtml(savedExp)); });
        } else {
          syncPromise = syncPromise.then(function () { return writeDetailPage(savedExp); });
        }
      }
      syncPromise
        .then(function () { showSyncMsg(isNew ? 'Experiment created and all site files updated.' : 'Experiment updated across all site files.'); })
        .catch(function (err) { showSyncMsg('File write error: ' + err.message, true); });
    }
  });

  /* ═══════════════════════════════════════
     DELETE
  ═══════════════════════════════════════ */
  function openDeleteConfirm(id) {
    var list = getExperiments();
    var exp  = list.find(function (e) { return e.id === id; });
    confirmMsg.innerHTML = exp
      ? 'Remove <strong>' + esc(exp.title) + '</strong> from the experiment list?' +
        (dirHandle ? ' The detail page <strong>' + esc(exp.file || '') + '</strong> will also be deleted.' : ' Connect a site folder to also delete the HTML file.')
      : 'Remove this experiment?';
    pendingDeleteId = id;
    confirmOverlay.classList.add('is-open');
  }

  confirmYes.addEventListener('click', function () {
    if (!pendingDeleteId) return;
    var all     = getExperiments();
    var deleted = all.find(function (e) { return e.id === pendingDeleteId; });
    var list    = all.filter(function (e) { return e.id !== pendingDeleteId; });
    saveExperiments(list);
    pendingDeleteId = null;
    confirmOverlay.classList.remove('is-open');
    if (currentEditingRow) closeForm();
    renderList();

    if (dirHandle && deleted) {
      syncAllFiles(list, deleted.file)
        .then(function () { showSyncMsg('Experiment deleted and site files updated.'); })
        .catch(function (err) { showSyncMsg('File error: ' + err.message, true); });
    }
  });

  confirmNo.addEventListener('click', function () {
    pendingDeleteId = null;
    confirmOverlay.classList.remove('is-open');
  });

  /* ═══════════════════════════════════════
     EXPORT MODAL
  ═══════════════════════════════════════ */
  function openExportModal(id) {
    var list = getExperiments();
    var exp  = list.find(function (e) { return e.id === id; });
    if (!exp) return;
    document.getElementById('export-modal-title').textContent = 'Export HTML — ' + exp.title;
    document.getElementById('card-code').textContent   = buildCardHtml(exp);
    document.getElementById('row-code').textContent    = buildRowHtml(exp);
    document.getElementById('detail-code').textContent = buildDetailHtml(exp);
    exportModal.classList.add('is-open');
  }

  document.getElementById('export-modal-close').addEventListener('click', function () { exportModal.classList.remove('is-open'); });
  document.getElementById('export-modal-close-btn').addEventListener('click', function () { exportModal.classList.remove('is-open'); });
  exportModal.addEventListener('click', function (e) { if (e.target === exportModal) exportModal.classList.remove('is-open'); });

  document.querySelectorAll('.copy-btn').forEach(function (btn) {
    btn.addEventListener('click', function () {
      var text = document.getElementById(btn.dataset.target).textContent;
      navigator.clipboard.writeText(text).then(function () {
        btn.textContent = 'Copied!'; btn.classList.add('copied');
        setTimeout(function () { btn.textContent = 'Copy'; btn.classList.remove('copied'); }, 2000);
      });
    });
  });

  /* ═══════════════════════════════════════
     HTML GENERATORS
  ═══════════════════════════════════════ */
  function _categoryTag(exp) {
    if (!exp.category) return '';
    return '<span class="tag' + (exp.categoryColor ? ' tag--' + exp.categoryColor : '') + '">' + esc(exp.category) + '</span>';
  }
  function _signalBadge(exp) {
    if (!exp.signal) return '';
    return '<span class="tag ' + signalTagClass(exp.signal) + '">' + signalLabel(exp.signal) + '</span>';
  }
  function _toolTags(exp, indent) {
    return (exp.tools || '').split(',').map(function (t) { return t.trim(); }).filter(Boolean)
      .map(function (t) { return indent + '<span class="tag">' + esc(t) + '</span>'; }).join('\n');
  }

  function buildCardHtml(exp) {
    var date = formatDate(exp.date);
    var file = exp.file || ('experiment-' + exp.number + '.html');
    var tags = [_categoryTag(exp)].concat(
      (exp.tools || '').split(',').map(function (t) { return t.trim(); }).filter(Boolean)
        .map(function (t) { return '<span class="tag">' + esc(t) + '</span>'; })
    ).filter(Boolean).join('\n              ');
    return (
      '          <!-- Card ' + exp.number + ' -->\n' +
      '          <article class="card">\n' +
      '            <div class="card-meta">\n' +
      '              <span class="card-date">' + date + '</span>\n' +
      '              <span class="status-badge ' + statusClass(exp.status) + '">' + statusLabel(exp.status) + '</span>\n' +
      '            </div>\n' +
      '            <h3>' + esc(exp.title) + '</h3>\n' +
      '            <p>' + esc(exp.desc) + '</p>\n' +
      '            <div class="tags">\n              ' + tags + '\n            </div>\n' +
      '            <div class="card-footer">\n' +
      (exp.signal ? '              ' + _signalBadge(exp) + '\n' : '') +
      '              <a href="experiments/' + file + '" class="card-link card-link-overlay">Read more &rarr;</a>\n' +
      '            </div>\n' +
      '          </article>'
    );
  }

  function buildRowHtml(exp) {
    var date = formatDate(exp.date);
    var file = exp.file || ('experiment-' + exp.number + '.html');
    return (
      '          <!-- Experiment ' + exp.number + ' -->\n' +
      '          <article class="experiment-row">\n' +
      '            <div class="experiment-row-main">\n' +
      '              <div class="experiment-row-meta">\n' +
      _toolTags(exp, '                ') + '\n' +
      (exp.category ? '                ' + _categoryTag(exp) + '\n' : '') +
      '              </div>\n' +
      '              <h3>' + esc(exp.title) + '</h3>\n' +
      '              <p>' + esc(exp.desc) + '</p>\n' +
      '            </div>\n' +
      '            <div class="experiment-row-right">\n' +
      '              <span class="card-date">' + date + '</span>\n' +
      '              <span class="status-badge ' + statusClass(exp.status) + '">' + statusLabel(exp.status) + '</span>\n' +
      '              <a href="' + file + '" class="card-link" style="position:relative;z-index:1;">Read &rarr;</a>\n' +
      '            </div>\n' +
      '          </article>'
    );
  }

  function buildDetailHeader(exp) {
    var svgArrow = '<svg width="14" height="14" viewBox="0 0 14 14" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M8.5 11L4.5 7L8.5 3" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>';
    return (
      '<header class="experiment-header">\n' +
      '    <div class="container">\n' +
      '      <a href="index.html" class="back-link">\n' +
      '        ' + svgArrow + '\n' +
      '        All Experiments\n' +
      '      </a>\n' +
      '      <div class="experiment-header-meta">\n' +
      '        <span class="status-badge ' + statusClass(exp.status) + '">' + statusLabel(exp.status) + '</span>\n' +
      (exp.category ? '        ' + _categoryTag(exp) + '\n' : '') +
      _toolTags(exp, '        ') + '\n' +
      '      </div>\n' +
      '      <h1>' + esc(exp.title) + '</h1>\n' +
      '      <p class="experiment-header-desc">' + esc(exp.desc) + '</p>\n' +
      '    </div>\n' +
      '  </header>'
    );
  }

  function buildDetailHtml(exp) {
    return (
      '<!DOCTYPE html>\n<html lang="en">\n<head>\n' +
      '  <meta charset="UTF-8">\n' +
      '  <meta name="viewport" content="width=device-width, initial-scale=1.0">\n' +
      '  <title>Experiment ' + exp.number + ': ' + esc(exp.title) + ' \u2014 Field Notes</title>\n' +
      '  <meta name="description" content="' + esc(exp.desc) + '">\n' +
      '  <link rel="stylesheet" href="../css/style.css">\n' +
      '</head>\n<body>\n\n' +
      '  <nav class="site-nav">\n' +
      '    <div class="nav-inner">\n' +
      '      <a href="../index.html" class="nav-brand">\n' +
      '        <span class="nav-brand-name">Field Notes</span>\n' +
      '        <span class="nav-brand-sub">AI Experiments &amp; Learning</span>\n' +
      '      </a>\n' +
      '      <ul class="nav-links">\n' +
      '        <li><a href="../index.html">Home</a></li>\n' +
      '        <li><a href="index.html" class="active">Experiments</a></li>\n' +
      '        <li><a href="../learnings/index.html">Learnings</a></li>\n' +
      '        <li><a href="../about/index.html">About</a></li>\n' +
      '      </ul>\n' +
      '    </div>\n' +
      '  </nav>\n\n  ' +
      buildDetailHeader(exp) +
      '\n\n  <div class="experiment-body">\n' +
      '    <div class="container">\n' +
      '      <div class="experiment-layout">\n\n' +
      '        <div class="experiment-content">\n\n' +
      '          <div class="experiment-section">\n' +
      '            <div class="section-label">Context &amp; Goal</div>\n' +
      '            <p><!-- Add context here --></p>\n' +
      '          </div>\n\n' +
      '          <div class="experiment-section">\n' +
      '            <div class="section-label">What We Tried</div>\n' +
      '            <p><!-- Add details here --></p>\n' +
      '          </div>\n\n' +
      '          <div class="experiment-section">\n' +
      '            <div class="section-label">Results</div>\n' +
      '            <p><!-- Add results here --></p>\n' +
      '          </div>\n\n' +
      '          <div class="experiment-section">\n' +
      '            <div class="section-label">What This Means</div>\n' +
      '            <div class="callout callout--green">\n' +
      '              <div class="callout-label">Key Takeaway</div>\n' +
      '              <p><!-- Add key takeaway here --></p>\n' +
      '            </div>\n' +
      '          </div>\n\n' +
      '        </div>\n\n' +
      '        <aside class="experiment-sidebar">\n' +
      '          <div class="sidebar-card">\n' +
      '            <div class="sidebar-card-title">Details</div>\n' +
      '            <!-- Add sidebar rows here -->\n' +
      '          </div>\n' +
      '        </aside>\n\n' +
      '      </div>\n' +
      '    </div>\n' +
      '  </div>\n\n' +
      '  <footer class="site-footer">\n' +
      '    <div class="footer-inner">\n' +
      '      <p class="footer-left"><strong>Field Notes</strong> \u2014 a living document, not a finished product.</p>\n' +
      '      <p class="footer-right">Built in HTML. Updated as we learn.</p>\n' +
      '    </div>\n' +
      '  </footer>\n\n' +
      '</body>\n</html>'
    );
  }

  /* ═══════════════════════════════════════
     RESET
  ═══════════════════════════════════════ */
  resetBtn.addEventListener('click', function () {
    if (confirm('Reset to the 3 default experiments? Any additions or edits in this admin will be lost.')) {
      saveExperiments(JSON.parse(JSON.stringify(DEFAULTS)));
      closeForm();
      renderList();
    }
  });

  /* ═══════════════════════════════════════
     WIRE UP
  ═══════════════════════════════════════ */
  addBtn.addEventListener('click', openAddForm);
  formClose.addEventListener('click', closeForm);
  formCancelBtn.addEventListener('click', closeForm);

  /* ═══════════════════════════════════════
     INIT
  ═══════════════════════════════════════ */
  if (!loadExperiments()) {
    saveExperiments(JSON.parse(JSON.stringify(DEFAULTS)));
  }
  renderList();
  setDisconnected();

  // Try to restore a previously-connected folder handle
  loadHandle().then(function (handle) {
    if (!handle) return;
    handle.queryPermission({ mode: 'readwrite' }).then(function (perm) {
      if (perm === 'granted') {
        setConnected(handle);
      } else if (perm === 'prompt') {
        // Re-request permission silently — browser will auto-grant if not revoked
        handle.requestPermission({ mode: 'readwrite' }).then(function (newPerm) {
          if (newPerm === 'granted') { setConnected(handle); }
        });
      }
    });
  }).catch(function () { /* IndexedDB unavailable */ });

}());

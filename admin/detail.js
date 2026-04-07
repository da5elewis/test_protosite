(function () {
  'use strict';

  /* =====================================================
     CONSTANTS
  ===================================================== */
  var EXP_STORE_KEY    = 'fieldnotes_experiments';
  var DRAFT_KEY_PREFIX = 'fieldnotes_page_draft_';
  var DB_NAME          = 'fieldnotes-admin';
  var DB_VERSION       = 1;
  var DB_STORE         = 'fs-handles';

  /* =====================================================
     INDEXEDDB — folder handle persistence (shared with admin.js)
  ===================================================== */
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

  /* =====================================================
     FILE SYSTEM — helpers
  ===================================================== */
  var dirHandle = null;

  function getFileHandle(relPath, create) {
    var parts = relPath.split('/');
    var dir   = dirHandle;
    var p     = Promise.resolve();
    for (var i = 0; i < parts.length - 1; i++) {
      (function (part) {
        p = p.then(function () {
          return dir.getDirectoryHandle(part).then(function (d) { dir = d; });
        });
      })(parts[i]);
    }
    var name = parts[parts.length - 1];
    return p.then(function () { return dir.getFileHandle(name, { create: !!create }); });
  }

  function readSiteFile(relPath) {
    return getFileHandle(relPath, false)
      .then(function (fh) { return fh.getFile(); })
      .then(function (f)  { return f.text(); });
  }

  function writeSiteFile(relPath, content) {
    return getFileHandle(relPath, true).then(function (fh) {
      return fh.createWritable().then(function (w) {
        return w.write(content).then(function () { return w.close(); });
      });
    });
  }

  /* =====================================================
     CONNECTION UI
  ===================================================== */
  var connBanner  = document.getElementById('conn-banner');
  var connStatus  = document.getElementById('conn-status');
  var connectBtn  = document.getElementById('connect-btn');
  var syncMsgEl   = document.getElementById('sync-msg');
  var loadFromFileBtn = document.getElementById('load-from-file-btn');

  function setConnected(handle) {
    dirHandle = handle;
    connBanner.className     = 'conn-banner conn-banner--on';
    connStatus.innerHTML     = '<strong>Connected:</strong> ' + esc(handle.name);
    connectBtn.textContent   = 'Change folder';
    if (loadFromFileBtn) loadFromFileBtn.style.display = 'inline-flex';
  }

  function setDisconnected() {
    dirHandle = null;
    connBanner.className   = 'conn-banner conn-banner--off';
    connStatus.innerHTML   = 'No site folder connected — edits save as draft only.';
    connectBtn.textContent = 'Connect site folder';
    if (loadFromFileBtn) loadFromFileBtn.style.display = 'none';
  }

  function showSyncMsg(msg, isError) {
    syncMsgEl.textContent   = msg;
    syncMsgEl.className     = 'sync-msg ' + (isError ? 'sync-msg--err' : 'sync-msg--ok');
    syncMsgEl.style.display = 'block';
    clearTimeout(syncMsgEl._t);
    syncMsgEl._t = setTimeout(function () { syncMsgEl.style.display = 'none'; }, 4000);
  }

  connectBtn.addEventListener('click', function () {
    if (!window.showDirectoryPicker) {
      alert('Your browser does not support the File System Access API.\nUse Chrome or Edge to enable direct file writing.');
      return;
    }
    window.showDirectoryPicker({ mode: 'readwrite' })
      .then(function (h) { return persistHandle(h).then(function () { return h; }); })
      .then(function (h) {
        setConnected(h);
        showSyncMsg('Folder connected.');
      })
      .catch(function (e) { if (e.name !== 'AbortError') alert('Could not access folder: ' + e.message); });
  });

  /* =====================================================
     HELPERS
  ===================================================== */
  function esc(str) {
    return String(str)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;')
      .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }
  function formatDate(iso) {
    if (!iso) return '';
    return new Date(iso + 'T12:00:00').toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
  }
  function signalLabel(s) {
    return s === 'high' ? 'High' : s === 'nuanced' ? 'Nuanced' : s === 'low' ? 'Low' : '';
  }
  function statusLabel(s) {
    return s === 'complete' ? 'Complete' : s === 'ongoing' ? 'Ongoing' : 'Draft';
  }
  function statusClass(s) {
    return s === 'complete' ? 'status--complete' : s === 'ongoing' ? 'status--ongoing' : 'status--draft';
  }

  /* Convert plain-text paragraphs (blank-line separated) to HTML <p> tags.
     Raw HTML tags in the input are passed through unchanged. */
  function textToParas(text) {
    if (!text || !text.trim()) return '';
    return text.trim().split(/\n\s*\n/).map(function (block) {
      var t = block.trim();
      if (!t) return '';
      // If the block starts with an HTML tag, output raw
      if (/^<[a-z]/i.test(t)) return t;
      return '<p>' + t + '</p>';
    }).filter(Boolean).join('\n            ');
  }

  /* Parse paragraphs out of a DOM NodeList (children of a section) into plain text */
  function domNodesToText(nodes) {
    var parts = [];
    nodes.forEach(function (node) {
      if (node.nodeType !== 1) return;
      if (node.classList.contains('section-label')) return;
      if (node.classList.contains('callout')) return;
      parts.push(node.innerHTML.replace(/<\/p>\s*<p>/g, '\n\n').replace(/<\/?p>/g, ''));
    });
    return parts.join('\n\n');
  }

  /* =====================================================
     DRAFT PERSISTENCE
  ===================================================== */
  function draftKey(expId) { return DRAFT_KEY_PREFIX + expId; }

  function saveDraft(expId, data) {
    try { localStorage.setItem(draftKey(expId), JSON.stringify(data)); } catch (e) {}
  }

  function loadDraft(expId) {
    try { var r = localStorage.getItem(draftKey(expId)); return r ? JSON.parse(r) : null; } catch (e) { return null; }
  }

  /* =====================================================
     FORM FIELD REFS
  ===================================================== */
  var fContext            = document.getElementById('f-context');
  var fTried              = document.getElementById('f-tried');
  var fResults            = document.getElementById('f-results');
  var fResultsCalloutOn   = document.getElementById('results-callout-enabled');
  var fResultsCalloutWrap = document.getElementById('results-callout-wrap');
  var fResultsCalloutLbl  = document.getElementById('f-results-callout-label');
  var fResultsCalloutBody = document.getElementById('f-results-callout-body');
  var fCaveats            = document.getElementById('f-caveats');
  var fTakeawayLabel      = document.getElementById('f-takeaway-label');
  var fTakeawayCallout    = document.getElementById('f-takeaway-callout');
  var fTakeawayExtra      = document.getElementById('f-takeaway-extra');
  var fEffort             = document.getElementById('f-effort');
  var fRel1Label          = document.getElementById('f-rel1-label');
  var fRel1Href           = document.getElementById('f-rel1-href');
  var fRel2Label          = document.getElementById('f-rel2-label');
  var fRel2Href           = document.getElementById('f-rel2-href');

  var caveatsOverlay  = document.getElementById('caveats-overlay');
  var enableCaveatsBtn  = document.getElementById('enable-caveats-btn');
  var disableCaveatsBtn = document.getElementById('disable-caveats-btn');
  var caveatsEnabled  = false;

  var draftStatus = document.getElementById('draft-status');
  var dirty = false;

  function markDirty() {
    dirty = true;
    draftStatus.textContent = 'Unsaved changes';
    draftStatus.className   = 'draft-status';
  }

  /* =====================================================
     SECTION TOGGLES
  ===================================================== */
  document.querySelectorAll('.section-editor-header[data-toggle]').forEach(function (hdr) {
    hdr.addEventListener('click', function () {
      var body   = hdr.parentElement.querySelector('.section-editor-body');
      var toggle = hdr.querySelector('.section-toggle');
      if (!body) return;
      var open = body.classList.toggle('open');
      toggle.classList.toggle('open', open);
    });
  });

  /* Callout toggle in Results */
  fResultsCalloutOn.addEventListener('change', function () {
    fResultsCalloutWrap.style.display = fResultsCalloutOn.checked ? 'block' : 'none';
    markDirty();
  });

  /* Optional caveats section */
  enableCaveatsBtn.addEventListener('click', function () {
    caveatsEnabled = true;
    caveatsOverlay.style.display = 'none';
    document.getElementById('sec-caveats').classList.add('is-enabled');
    markDirty();
  });
  disableCaveatsBtn.addEventListener('click', function () {
    caveatsEnabled = false;
    caveatsOverlay.style.display = 'flex';
    document.getElementById('sec-caveats').classList.remove('is-enabled');
    fCaveats.value = '';
    markDirty();
  });

  /* Mark dirty on any input change */
  [fContext, fTried, fResults, fResultsCalloutLbl, fResultsCalloutBody,
   fCaveats, fTakeawayLabel, fTakeawayCallout, fTakeawayExtra,
   fEffort, fRel1Label, fRel1Href, fRel2Label, fRel2Href].forEach(function (el) {
    el.addEventListener('input', markDirty);
  });

  /* =====================================================
     COLLECT FORM DATA
  ===================================================== */
  function collectFormData() {
    return {
      context:             fContext.value,
      tried:               fTried.value,
      results:             fResults.value,
      resultsCalloutOn:    fResultsCalloutOn.checked,
      resultsCalloutLabel: fResultsCalloutLbl.value,
      resultsCalloutBody:  fResultsCalloutBody.value,
      caveatsEnabled:      caveatsEnabled,
      caveats:             fCaveats.value,
      takeawayLabel:       fTakeawayLabel.value,
      takeawayCallout:     fTakeawayCallout.value,
      takeawayExtra:       fTakeawayExtra.value,
      effort:              fEffort.value,
      rel1Label:           fRel1Label.value,
      rel1Href:            fRel1Href.value,
      rel2Label:           fRel2Label.value,
      rel2Href:            fRel2Href.value
    };
  }

  /* =====================================================
     POPULATE FORM DATA
  ===================================================== */
  function populateForm(data) {
    if (!data) return;
    fContext.value             = data.context             || '';
    fTried.value               = data.tried               || '';
    fResults.value             = data.results             || '';
    fResultsCalloutOn.checked  = !!data.resultsCalloutOn;
    fResultsCalloutWrap.style.display = data.resultsCalloutOn ? 'block' : 'none';
    fResultsCalloutLbl.value   = data.resultsCalloutLabel || '';
    fResultsCalloutBody.value  = data.resultsCalloutBody  || '';
    caveatsEnabled             = !!data.caveatsEnabled;
    if (caveatsEnabled) {
      caveatsOverlay.style.display = 'none';
      document.getElementById('sec-caveats').classList.add('is-enabled');
    }
    fCaveats.value             = data.caveats             || '';
    fTakeawayLabel.value       = data.takeawayLabel       || '';
    fTakeawayCallout.value     = data.takeawayCallout     || '';
    fTakeawayExtra.value       = data.takeawayExtra       || '';
    fEffort.value              = data.effort              || '';
    fRel1Label.value           = data.rel1Label           || '';
    fRel1Href.value            = data.rel1Href            || '';
    fRel2Label.value           = data.rel2Label           || '';
    fRel2Href.value            = data.rel2Href            || '';
  }

  /* =====================================================
     PARSE EXISTING HTML FILE -> form data
  ===================================================== */
  function parseExistingPage(html) {
    var doc = new DOMParser().parseFromString(html, 'text/html');
    var data = {};

    var sections = doc.querySelectorAll('.experiment-section');
    sections.forEach(function (sec) {
      var labelEl = sec.querySelector('.section-label');
      if (!labelEl) return;
      var label    = labelEl.textContent.trim().toLowerCase();
      var children = Array.from(sec.childNodes).filter(function (n) { return n.nodeType === 1; });
      var paras    = children.filter(function (n) {
        return n.tagName === 'P' || (n.tagName !== 'DIV' && !n.classList.contains('callout'));
      });
      var callout  = sec.querySelector('.callout');

      var plainText = paras.filter(function (n) { return !n.classList || !n.classList.contains('section-label'); })
        .map(function (n) { return n.textContent.trim(); }).filter(Boolean).join('\n\n');

      if (label.indexOf('context') !== -1) {
        data.context = plainText;
      } else if (label.indexOf('tried') !== -1) {
        data.tried = plainText;
      } else if (label.indexOf('result') !== -1) {
        data.results = plainText;
        if (callout) {
          data.resultsCalloutOn    = true;
          var lbl = callout.querySelector('.callout-label');
          var bod = callout.querySelector('p');
          data.resultsCalloutLabel = lbl ? lbl.textContent.trim() : '';
          data.resultsCalloutBody  = bod ? bod.textContent.trim() : '';
        }
      } else if (label.indexOf('complication') !== -1 || label.indexOf('caveat') !== -1) {
        data.caveatsEnabled = true;
        data.caveats        = plainText;
      } else if (label.indexOf('takeaway') !== -1) {
        if (callout) {
          var lbl2 = callout.querySelector('.callout-label');
          var bod2 = callout.querySelector('p');
          data.takeawayLabel   = lbl2 ? lbl2.textContent.trim() : '';
          data.takeawayCallout = bod2 ? bod2.textContent.trim() : '';
        }
        data.takeawayExtra = plainText;
      }
    });

    // Sidebar details
    var sidebarRows = doc.querySelectorAll('.sidebar-card .sidebar-row');
    sidebarRows.forEach(function (row) {
      var lbl = row.querySelector('.sidebar-row-label');
      var val = row.querySelector('.sidebar-row-value');
      if (!lbl || !val) return;
      var key = lbl.textContent.trim().toLowerCase();
      if (key === 'effort') data.effort = val.textContent.trim();
    });

    // Related links
    var relLinks = doc.querySelectorAll('.sidebar-card a[href]');
    relLinks.forEach(function (a, i) {
      if (i === 0) { data.rel1Label = a.textContent.trim(); data.rel1Href = a.getAttribute('href'); }
      if (i === 1) { data.rel2Label = a.textContent.trim(); data.rel2Href = a.getAttribute('href'); }
    });

    return data;
  }

  /* =====================================================
     BUILD DETAIL PAGE HTML
  ===================================================== */
  function buildDetailHtml(exp, formData) {
    var svgArrow = '<svg width="14" height="14" viewBox="0 0 14 14" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M8.5 11L4.5 7L8.5 3" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>';

    var catTag = exp.category
      ? '<span class="tag' + (exp.categoryColor ? ' tag--' + exp.categoryColor : '') + '">' + esc(exp.category) + '</span>'
      : '';
    var toolTags = (exp.tools || '').split(',').map(function (t) { return t.trim(); }).filter(Boolean)
      .map(function (t) { return '\n        <span class="tag">' + esc(t) + '</span>'; }).join('');

    /* Build main sections */
    var sections = '';

    // Context & Goal
    if (formData.context && formData.context.trim()) {
      sections +=
        '\n          <div class="experiment-section">' +
        '\n            <div class="section-label">Context &amp; Goal</div>' +
        '\n            ' + textToParas(formData.context) +
        '\n          </div>\n';
    }

    // What We Tried
    if (formData.tried && formData.tried.trim()) {
      sections +=
        '\n          <div class="experiment-section">' +
        '\n            <div class="section-label">What We Tried</div>' +
        '\n            ' + textToParas(formData.tried) +
        '\n          </div>\n';
    }

    // Results
    if (formData.results && formData.results.trim()) {
      var resultsCallout = '';
      if (formData.resultsCalloutOn && formData.resultsCalloutBody && formData.resultsCalloutBody.trim()) {
        resultsCallout =
          '\n            <div class="callout">' +
          '\n              <div class="callout-label">' + esc(formData.resultsCalloutLabel || 'Key Result') + '</div>' +
          '\n              <p>' + formData.resultsCalloutBody.trim() + '</p>' +
          '\n            </div>';
      }
      sections +=
        '\n          <div class="experiment-section">' +
        '\n            <div class="section-label">Results</div>' +
        '\n            ' + textToParas(formData.results) +
        resultsCallout +
        '\n          </div>\n';
    }

    // Complications & Caveats
    if (formData.caveatsEnabled && formData.caveats && formData.caveats.trim()) {
      sections +=
        '\n          <div class="experiment-section">' +
        '\n            <div class="section-label">Complications &amp; Caveats</div>' +
        '\n            ' + textToParas(formData.caveats) +
        '\n          </div>\n';
    }

    // Takeaway
    var takeawayCallout = '';
    if (formData.takeawayCallout && formData.takeawayCallout.trim()) {
      takeawayCallout =
        '\n            <div class="callout callout--green">' +
        '\n              <div class="callout-label">' + esc(formData.takeawayLabel || 'Key Takeaway') + '</div>' +
        '\n              <p>' + formData.takeawayCallout.trim() + '</p>' +
        '\n            </div>';
    }
    var takeawayExtra = (formData.takeawayExtra && formData.takeawayExtra.trim())
      ? '\n            ' + textToParas(formData.takeawayExtra) : '';
    if (takeawayCallout || takeawayExtra) {
      sections +=
        '\n          <div class="experiment-section">' +
        '\n            <div class="section-label">Takeaway</div>' +
        takeawayCallout +
        takeawayExtra +
        '\n          </div>\n';
    }

    /* Sidebar */
    var effortRow = (formData.effort && formData.effort.trim())
      ? '\n            <div class="sidebar-row">' +
        '\n              <span class="sidebar-row-label">Effort</span>' +
        '\n              <span class="sidebar-row-value">' + esc(formData.effort.trim()) + '</span>' +
        '\n            </div>' : '';

    var relLinks = '';
    if (formData.rel1Label && formData.rel1Href) {
      relLinks += '\n            <div class="sidebar-row"><a href="' + esc(formData.rel1Href) + '" style="font-size:0.875rem;color:var(--accent);font-weight:500;">' + esc(formData.rel1Label) + '</a></div>';
    }
    if (formData.rel2Label && formData.rel2Href) {
      relLinks += '\n            <div class="sidebar-row"><a href="' + esc(formData.rel2Href) + '" style="font-size:0.875rem;color:var(--accent);font-weight:500;">' + esc(formData.rel2Label) + '</a></div>';
    }
    var relatedCard = relLinks
      ? '\n\n          <div class="sidebar-card">' +
        '\n            <div class="sidebar-card-title">Related</div>' +
        relLinks +
        '\n          </div>' : '';

    return (
      '<!DOCTYPE html>\n' +
      '<html lang="en">\n' +
      '<head>\n' +
      '  <meta charset="UTF-8">\n' +
      '  <meta name="viewport" content="width=device-width, initial-scale=1.0">\n' +
      '  <title>Experiment ' + esc(exp.number) + ': ' + esc(exp.title) + ' \u2014 Field Notes</title>\n' +
      '  <meta name="description" content="' + esc(exp.desc) + '">\n' +
      '  <link rel="stylesheet" href="../css/style.css">\n' +
      '</head>\n' +
      '<body>\n\n' +
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
      '        <li><a href="../admin/index.html">Admin</a></li>\n' +
      '      </ul>\n' +
      '    </div>\n' +
      '  </nav>\n\n' +
      '  <header class="experiment-header">\n' +
      '    <div class="container">\n' +
      '      <a href="index.html" class="back-link">\n' +
      '        ' + svgArrow + '\n' +
      '        All Experiments\n' +
      '      </a>\n' +
      '      <div class="experiment-header-meta">\n' +
      '        <span class="status-badge ' + statusClass(exp.status) + '">' + statusLabel(exp.status) + '</span>\n' +
      (catTag   ? '        ' + catTag   + '\n' : '') +
      (toolTags ? '       ' + toolTags + '\n' : '') +
      '      </div>\n' +
      '      <h1>' + esc(exp.title) + '</h1>\n' +
      '      <p class="experiment-header-desc">' + esc(exp.desc) + '</p>\n' +
      '    </div>\n' +
      '  </header>\n\n' +
      '  <div class="experiment-body">\n' +
      '    <div class="container">\n' +
      '      <div class="experiment-layout">\n\n' +
      '        <div class="experiment-content">\n' +
      sections +
      '        </div>\n\n' +
      '        <aside class="experiment-sidebar">\n\n' +
      '          <div class="sidebar-card">\n' +
      '            <div class="sidebar-card-title">Experiment Details</div>\n' +
      '            <div class="sidebar-row">\n' +
      '              <span class="sidebar-row-label">Date</span>\n' +
      '              <span class="sidebar-row-value">' + formatDate(exp.date) + '</span>\n' +
      '            </div>\n' +
      (exp.tools ? '            <div class="sidebar-row">\n              <span class="sidebar-row-label">Tool / Model</span>\n              <span class="sidebar-row-value">' + esc(exp.tools) + '</span>\n            </div>\n' : '') +
      (exp.category ? '            <div class="sidebar-row">\n              <span class="sidebar-row-label">Category</span>\n              <span class="sidebar-row-value">' + esc(exp.category) + '</span>\n            </div>\n' : '') +
      effortRow + '\n' +
      (exp.signal ? '            <div class="sidebar-row">\n              <span class="sidebar-row-label">Signal level</span>\n              <span class="sidebar-row-value">' + signalLabel(exp.signal) + '</span>\n            </div>\n' : '') +
      '          </div>' +
      relatedCard +
      '\n\n        </aside>\n\n' +
      '      </div>\n' +
      '    </div>\n' +
      '  </div>\n\n' +
      '  <footer class="site-footer">\n' +
      '    <div class="footer-inner">\n' +
      '      <p class="footer-left"><strong>Field Notes</strong> \u2014 a living document, not a finished product.</p>\n' +
      '      <p class="footer-right">Built in HTML. Updated as we learn.</p>\n' +
      '    </div>\n' +
      '  </footer>\n\n' +
      '</body>\n' +
      '</html>'
    );
  }

  /* =====================================================
     DRAFT ACTIONS
  ===================================================== */
  var currentExpId = null;

  document.getElementById('save-draft-btn').addEventListener('click', function () {
    if (!currentExpId) return;
    saveDraft(currentExpId, collectFormData());
    draftStatus.textContent = 'Draft saved';
    draftStatus.className   = 'draft-status saved';
    dirty = false;
  });

  document.getElementById('publish-btn').addEventListener('click', function () {
    if (!currentExpId) return;
    if (!dirHandle) {
      alert('No folder connected. Click "Connect site folder" to enable direct file publishing.');
      return;
    }
    var exps = getExperiments();
    var exp  = exps.find(function (e) { return e.id === currentExpId; });
    if (!exp) { alert('Experiment not found in admin data.'); return; }
    var data    = collectFormData();
    var html    = buildDetailHtml(exp, data);
    var relPath = 'experiments/' + (exp.file || 'experiment-' + exp.number + '.html');
    saveDraft(currentExpId, data);
    draftStatus.textContent = 'Draft saved';
    draftStatus.className   = 'draft-status saved';
    dirty = false;
    writeSiteFile(relPath, html)
      .then(function () { showSyncMsg('Published to ' + relPath); })
      .catch(function (err) { showSyncMsg('Write error: ' + err.message, true); });
  });

  /* Preview in new tab */
  document.getElementById('preview-btn').addEventListener('click', function () {
    var exps = getExperiments();
    var exp  = exps.find(function (e) { return e.id === currentExpId; });
    if (!exp) return;
    var html = buildDetailHtml(exp, collectFormData());
    var blob = new Blob([html], { type: 'text/html' });
    var url  = URL.createObjectURL(blob);
    var tab  = window.open(url, '_blank');
    if (tab) { tab.focus(); }
    setTimeout(function () { URL.revokeObjectURL(url); }, 60000);
  });

  /* Load from existing file */
  if (loadFromFileBtn) {
    loadFromFileBtn.addEventListener('click', function () {
      var exps = getExperiments();
      var exp  = exps.find(function (e) { return e.id === currentExpId; });
      if (!exp || !dirHandle) return;
      var relPath = 'experiments/' + (exp.file || 'experiment-' + exp.number + '.html');
      readSiteFile(relPath).then(function (html) {
        var data = parseExistingPage(html);
        populateForm(data);
        saveDraft(currentExpId, data);
        draftStatus.textContent = 'Loaded from file';
        draftStatus.className   = 'draft-status saved';
        showSyncMsg('Content loaded from ' + relPath);
      }).catch(function () {
        showSyncMsg('Could not read ' + relPath + ' — file may not exist yet.', true);
      });
    });
  }

  /* =====================================================
     HELPERS
  ===================================================== */
  function getExperiments() {
    try {
      var r = localStorage.getItem(EXP_STORE_KEY);
      return r ? JSON.parse(r) : [];
    } catch (e) { return []; }
  }

  /* =====================================================
     INIT — read ?id= param and set up the editor
  ===================================================== */
  var params   = new URLSearchParams(window.location.search);
  var expId    = params.get('id');
  var notFound = document.getElementById('not-found');
  var editorRoot = document.getElementById('editor-root');
  var publishBar = document.getElementById('publish-bar');

  if (!expId) {
    notFound.style.display = 'block';
  } else {
    var exps = getExperiments();
    var exp  = exps.find(function (e) { return e.id === expId; });
    if (!exp) {
      notFound.style.display = 'block';
    } else {
      currentExpId = expId;
      editorRoot.style.display = 'block';
      publishBar.style.display = 'block';

      /* Populate header */
      document.getElementById('bc-title').textContent   = 'Experiment ' + exp.number;
      document.getElementById('page-title').textContent = exp.title || ('Experiment ' + exp.number);
      document.getElementById('page-sub').textContent   =
        'Editing detail page for Experiment ' + exp.number + ' \u2014 ' + (exp.file || 'experiment-' + exp.number + '.html');

      /* Sidebar meta */
      document.getElementById('s-number').textContent   = exp.number || '\u2014';
      document.getElementById('s-date').textContent     = exp.date ? new Date(exp.date + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '\u2014';
      document.getElementById('s-tools').textContent    = exp.tools    || '\u2014';
      document.getElementById('s-category').textContent = exp.category || '\u2014';
      document.getElementById('s-signal').textContent   = signalLabel(exp.signal) || '\u2014';

      /* View link */
      var viewLink = document.getElementById('view-link');
      viewLink.href         = '../experiments/' + (exp.file || 'experiment-' + exp.number + '.html');
      viewLink.style.display = 'inline-flex';

      /* Load draft or blank */
      var draft = loadDraft(expId);
      if (draft) {
        populateForm(draft);
        draftStatus.textContent = 'Draft loaded';
        draftStatus.className   = 'draft-status saved';
      }
    }
  }

  /* Restore folder handle */
  setDisconnected();
  loadHandle().then(function (handle) {
    if (!handle) return;
    handle.queryPermission({ mode: 'readwrite' }).then(function (perm) {
      if (perm === 'granted') setConnected(handle);
    });
  }).catch(function () {});

  /* Warn before leaving with unsaved changes */
  window.addEventListener('beforeunload', function (e) {
    if (dirty) { e.preventDefault(); e.returnValue = ''; }
  });

}());

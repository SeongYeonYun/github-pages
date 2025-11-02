/**
 * soap_utils_patched.js
 * Safe replacement for renderLeaderboard to avoid "Cannot set properties of null" errors.
 * - Usage: replace your existing soap_utils.js's renderLeaderboard implementation with this file's function,
 *   or include this script after soap_utils.js to override the broken function.
 *
 * Exposes:
 *  - window.renderLeaderboard(entries)
 *  - window.safeRenderLeaderboard(entries)  (alias)
 *
 * The implementation is defensive: it will create #leaderboardBody if missing,
 * escape HTML when rendering, and never throw an uncaught exception.
 */

(function () {
  'use strict';

  // HTML escaping helper
  function escapeHtml(s) {
    return String(s === undefined || s === null ? '' : s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  // Safe renderLeaderboard implementation
  function renderLeaderboard(entries) {
    try {
      entries = Array.isArray(entries) ? entries : [];

      // Try to find existing tbody
      var tbody = document.getElementById('leaderboardBody');
      if (!tbody) {
        console.warn('renderLeaderboard: #leaderboardBody not found — creating one dynamically.');

        // Try to find a logical container first
        var container = document.getElementById('leaderboardSection') || document.querySelector('.panel.side-panel') || document.body;
        var table = container && container.querySelector('table');

        // If no table, create one
        if (!table) {
          table = document.createElement('table');
          table.className = 'leaderboard-table';
          // Create a simple thead
          var thead = document.createElement('thead');
          thead.innerHTML = '<tr><th>순위</th><th>이름</th><th>스테이지</th><th>결과</th><th>시간</th><th>날짜</th></tr>';
          table.appendChild(thead);
          // Append into container (prefer #leaderboardSection if present)
          if (container) container.appendChild(table);
          else document.body.appendChild(table);
        }

        tbody = document.createElement('tbody');
        tbody.id = 'leaderboardBody';
        table.appendChild(tbody);
      }

      // If no entries, show placeholder
      if (entries.length === 0) {
        tbody.innerHTML = '<tr><td colspan="6" style="text-align:center; color:#666; padding:10px;">기록이 없습니다.</td></tr>';
        return;
      }

      // Build rows
      var html = '';
      for (var i = 0; i < entries.length; i++) {
        var e = entries[i] || {};
        var rank = i + 1;
        var name = escapeHtml(e.name || '-');
        var stage = escapeHtml(e.stage === undefined ? '-' : String(e.stage));
        var result = escapeHtml(e.result || '-');
        var time = escapeHtml(e.time === undefined ? '-' : String(e.time));
        var date = escapeHtml(e.date === undefined ? '-' : String(e.date));

        html += '<tr>' +
                  '<td style="text-align:center;">' + rank + '</td>' +
                  '<td>' + name + '</td>' +
                  '<td style="text-align:center;">' + stage + '</td>' +
                  '<td style="text-align:center;">' + result + '</td>' +
                  '<td style="text-align:right;">' + time + '</td>' +
                  '<td style="text-align:center;">' + date + '</td>' +
                '</tr>';
      }

      tbody.innerHTML = html;
    } catch (err) {
      // Log but never throw to avoid breaking the app
      console.error('renderLeaderboard error:', err);
      try {
        // Last-resort: ensure there's at least a placeholder tbody so future calls don't fail
        var _tb = document.getElementById('leaderboardBody');
        if (!_tb) {
          var _container = document.getElementById('leaderboardSection') || document.body;
          var _table = _container.querySelector('table') || document.createElement('table');
          if (!_table.parentNode) {
            _container.appendChild(_table);
          }
          _tb = document.createElement('tbody');
          _tb.id = 'leaderboardBody';
          _table.appendChild(_tb);
        }
        _tb.innerHTML = '<tr><td colspan="6" style="text-align:center; color:#666; padding:10px;">오류로 인해 내용을 로드할 수 없습니다.</td></tr>';
      } catch (e2) {
        // swallow
      }
    }
  }

  // Expose to global scope (overwrites existing)
  window.renderLeaderboard = renderLeaderboard;
  window.safeRenderLeaderboard = renderLeaderboard;

})();

/* ================================================
   PROFILE TAB — Gauge, Stats, Radar, Responsibility Score
   ================================================ */

window.ProfileTab = (function() {

  var _debounceTimer = null;

  function init() {
    // Bind all toggles and selects
    var inputs = [
      'pf-cosigner', 'pf-mortgage', 'pf-dependents',
      'pf-marital', 'pf-employment', 'pf-education', 'pf-purpose'
    ];

    inputs.forEach(function(id) {
      var el = document.getElementById(id);
      if (!el) return;
      el.addEventListener('change', function() {
        if (id === 'pf-cosigner')   document.getElementById('pf-cosigner-val').textContent   = el.checked ? '是' : '否';
        if (id === 'pf-mortgage')   document.getElementById('pf-mortgage-val').textContent   = el.checked ? '是' : '否';
        if (id === 'pf-dependents') document.getElementById('pf-dependents-val').textContent = el.checked ? '是' : '否';
        scheduleUpdate();
      });
    });

    // "Send to Explorer" button
    var sendBtn = document.getElementById('btn-profile-to-explorer');
    if (sendBtn) {
      sendBtn.addEventListener('click', function() {
        var conditions = getConditions();
        var label = buildProfileLabel(conditions);
        var color = window.nextGroupColor();
        var group = {
          id: 'profile_' + Date.now(),
          conditions: conditions,
          label: label,
          color: color
        };
        if (window.ExplorerTab) {
          window.ExplorerTab.addGroup(group);
        }
        switchToTab('explorer');
      });
    }

    // Initial render
    updateProfile();
  }

  function scheduleUpdate() {
    clearTimeout(_debounceTimer);
    _debounceTimer = setTimeout(updateProfile, 80);
  }

  function getConditions() {
    return {
      HasCoSigner:   document.getElementById('pf-cosigner').checked   ? 'Yes' : '',
      HasMortgage:   document.getElementById('pf-mortgage').checked   ? 'Yes' : '',
      HasDependents: document.getElementById('pf-dependents').checked ? 'Yes' : '',
      MaritalStatus:  document.getElementById('pf-marital').value,
      EmploymentType: document.getElementById('pf-employment').value,
      Education:      document.getElementById('pf-education').value,
      LoanPurpose:    document.getElementById('pf-purpose').value
    };
  }

  function buildProfileLabel(cond) {
    var parts = [];
    if (cond.HasCoSigner   === 'Yes') parts.push('担保');
    if (cond.HasMortgage   === 'Yes') parts.push('房贷');
    if (cond.HasDependents === 'Yes') parts.push('抚养');
    if (cond.MaritalStatus)  parts.push({ Married:'已婚', Single:'单身', Divorced:'离婚' }[cond.MaritalStatus] || cond.MaritalStatus);
    if (cond.EmploymentType) parts.push({ 'Full-time':'全职', 'Part-time':'兼职', 'Self-employed':'自雇', 'Unemployed':'无业' }[cond.EmploymentType] || cond.EmploymentType);
    if (cond.LoanPurpose)    parts.push({ Business:'商业', Home:'住房', Auto:'汽车', Education:'教育', Other:'其他' }[cond.LoanPurpose] || cond.LoanPurpose);
    return parts.length > 0 ? parts.join('+') : '全部借款人';
  }

  function updateProfile() {
    var data = window.AppState.data;
    if (!data || data.length === 0) return;

    var conditions = getConditions();

    // Filter data
    var subset = data.filter(function(d) {
      if (conditions.HasCoSigner   === 'Yes' && d.HasCoSigner   !== 'Yes') return false;
      if (conditions.HasMortgage   === 'Yes' && d.HasMortgage   !== 'Yes') return false;
      if (conditions.HasDependents === 'Yes' && d.HasDependents !== 'Yes') return false;
      if (conditions.MaritalStatus  && d.MaritalStatus  !== conditions.MaritalStatus)  return false;
      if (conditions.EmploymentType && d.EmploymentType !== conditions.EmploymentType) return false;
      if (conditions.Education      && d.Education      !== conditions.Education)      return false;
      if (conditions.LoanPurpose    && d.LoanPurpose    !== conditions.LoanPurpose)    return false;
      return true;
    });

    var n = subset.length;
    var defaults = d3.sum(subset, function(d) { return d.Default; });
    var rate = n >= 30 ? defaults / n * 100 : null;
    var avgIncome = n > 0 ? d3.mean(subset, function(d) { return d.Income; }) : null;
    var avgCredit = n > 0 ? d3.mean(subset, function(d) { return d.CreditScore; }) : null;
    var avgAge    = n > 0 ? d3.mean(subset, function(d) { return d.Age; }) : null;
    var avgLoan   = n > 0 ? d3.mean(subset, function(d) { return d.LoanAmount; }) : null;
    var avgDTI    = n > 0 ? d3.mean(subset, function(d) { return d.DTIRatio; }) : null;

    // Update stats
    document.getElementById('stat-count').textContent  = n >= 1000 ? (n/1000).toFixed(1) + 'k' : n;
    document.getElementById('stat-income').textContent = avgIncome != null ? '$' + Math.round(avgIncome/1000) + 'k' : '—';
    document.getElementById('stat-credit').textContent = avgCredit != null ? Math.round(avgCredit) : '—';
    document.getElementById('stat-age').textContent    = avgAge    != null ? Math.round(avgAge) + '岁' : '—';

    // Responsibility score (0-5)
    var score = 0;
    if (conditions.HasCoSigner   === 'Yes') score++;
    if (conditions.HasMortgage   === 'Yes') score++;
    if (conditions.HasDependents === 'Yes') score++;
    if (conditions.MaritalStatus  === 'Married') score++;
    if (conditions.EmploymentType === 'Full-time') score++;
    updateResponsibilityScore(score);

    // Draw gauge
    if (rate !== null) {
      window.drawGauge('profile-gauge', rate, 25);
    } else {
      var gEl = document.getElementById('profile-gauge');
      if (gEl) gEl.innerHTML = '<div style="color:#8b949e;font-size:12px;padding:20px;text-align:center;">样本量不足（<30）</div>';
    }

    // Radar
    var popStats = window.AppState.popStats;
    if (popStats && n > 0) {
      var profileStats = {
        defaultRate: rate !== null ? rate : popStats.defaultRate,
        avgAge:      avgAge   || popStats.avgAge,
        avgIncome:   avgIncome || popStats.avgIncome,
        avgCredit:   avgCredit || popStats.avgCredit,
        avgLoan:     avgLoan   || popStats.avgLoan,
        avgDTI:      avgDTI    || popStats.avgDTI
      };
      window.drawRadar('profile-radar', profileStats, popStats);
    }
  }

  function updateResponsibilityScore(score) {
    var maxScore = 5;
    var el = document.getElementById('resp-score-value');
    var bar = document.getElementById('resp-score-bar');
    var desc = document.getElementById('resp-score-desc');
    if (!el) return;

    el.textContent = score;
    if (bar) bar.style.width = (score / maxScore * 100) + '%';

    var descs = [
      '无额外责任负担',
      '轻度责任（1 项）',
      '中度责任（2 项）',
      '较重责任（3 项）',
      '重度责任（4 项）',
      '全责任负担（最高）'
    ];
    if (desc) desc.textContent = descs[score] || descs[0];
  }

  return {
    init: init,
    updateProfile: updateProfile
  };
})();

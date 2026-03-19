/* ================================================
   DATA LOADER — CSV parsing with FileReader fallback
   ================================================ */

window.AppState = {
  data: [],
  groups: [],
  xField: 'CreditScore',
  brushExtent: null,
  popStats: null  // population-level averages
};

// Color palette for group lines
window.GROUP_COLORS = ['#58a6ff','#f85149','#3fb950','#d29922','#bc8cff','#39d353'];
window._groupColorIdx = 0;
window.nextGroupColor = function() {
  var c = window.GROUP_COLORS[window._groupColorIdx % window.GROUP_COLORS.length];
  window._groupColorIdx++;
  return c;
};

// Numeric fields to parse
var NUMERIC_FIELDS = [
  'Age','Income','LoanAmount','CreditScore','MonthsEmployed',
  'NumCreditLines','InterestRate','LoanTerm','DTIRatio','Default'
];

// X-axis field metadata
window.X_FIELDS = {
  CreditScore:  { label: 'Credit Score',    bins: 20, fmt: function(d){ return Math.round(d); } },
  Income:       { label: 'Income',          bins: 20, fmt: function(d){ return '$' + Math.round(d/1000) + 'k'; } },
  Age:          { label: 'Age',             bins: 20, fmt: function(d){ return Math.round(d); } },
  LoanAmount:   { label: 'Loan Amount',     bins: 20, fmt: function(d){ return '$' + Math.round(d/1000) + 'k'; } },
  LoanTerm:     { label: 'Loan Term (mo)',  bins: 5,  fmt: function(d){ return Math.round(d) + 'mo'; } },
  DTIRatio:     { label: 'DTI Ratio',       bins: 20, fmt: function(d){ return d.toFixed(2); } },
  InterestRate: { label: 'Interest Rate',   bins: 20, fmt: function(d){ return d.toFixed(1) + '%'; } }
};

/**
 * filterData(conditions)
 * conditions: { HasCoSigner, HasMortgage, HasDependents, MaritalStatus, EmploymentType, LoanPurpose }
 * Each can be "" (all) or a specific value string.
 */
window.filterData = function(conditions) {
  var data = window.AppState.data;
  if (!conditions) return data;
  return data.filter(function(d) {
    if (conditions.HasCoSigner    && d.HasCoSigner    !== conditions.HasCoSigner)    return false;
    if (conditions.HasMortgage    && d.HasMortgage    !== conditions.HasMortgage)    return false;
    if (conditions.HasDependents  && d.HasDependents  !== conditions.HasDependents)  return false;
    if (conditions.MaritalStatus  && d.MaritalStatus  !== conditions.MaritalStatus)  return false;
    if (conditions.EmploymentType && d.EmploymentType !== conditions.EmploymentType) return false;
    if (conditions.LoanPurpose    && d.LoanPurpose    !== conditions.LoanPurpose)    return false;
    if (conditions.Education      && d.Education      !== conditions.Education)      return false;
    return true;
  });
};

/**
 * aggregateByX(rows, xField, numBins)
 * Returns array of { x, xMid, count, defaults, rate }
 */
window.aggregateByX = function(rows, xField, numBins) {
  if (!rows || rows.length === 0) return [];
  var meta = window.X_FIELDS[xField] || { bins: 20 };
  numBins = numBins || meta.bins;

  var vals = rows.map(function(d) { return d[xField]; }).filter(function(v) { return isFinite(v); });
  if (vals.length === 0) return [];

  var ext = d3.extent(vals);
  if (xField === 'LoanTerm') {
    // LoanTerm is categorical: 12,24,36,48,60 — use exact values
    var terms = [12,24,36,48,60];
    return terms.map(function(t) {
      var subset = rows.filter(function(d) { return d.LoanTerm === t; });
      var defaults = d3.sum(subset, function(d) { return d.Default; });
      return {
        x: t, xMid: t,
        count: subset.length,
        defaults: defaults,
        rate: subset.length >= 30 ? defaults / subset.length * 100 : null
      };
    }).filter(function(b) { return b.count > 0; });
  }

  var binner = d3.bin()
    .value(function(d) { return d[xField]; })
    .domain(ext)
    .thresholds(numBins);

  var bins = binner(rows);
  return bins.map(function(bin) {
    var count = bin.length;
    var defaults = d3.sum(bin, function(d) { return d.Default; });
    var xMid = (bin.x0 + bin.x1) / 2;
    return {
      x0: bin.x0, x1: bin.x1,
      x: xMid, xMid: xMid,
      count: count,
      defaults: defaults,
      rate: count >= 30 ? defaults / count * 100 : null
    };
  }).filter(function(b) { return b.count > 0; });
};

/**
 * computePopStats() — population averages for radar chart
 */
window.computePopStats = function() {
  var data = window.AppState.data;
  if (!data || data.length === 0) return null;
  return {
    defaultRate:  d3.mean(data, function(d) { return d.Default; }) * 100,
    avgAge:       d3.mean(data, function(d) { return d.Age; }),
    avgIncome:    d3.mean(data, function(d) { return d.Income; }),
    avgCredit:    d3.mean(data, function(d) { return d.CreditScore; }),
    avgLoan:      d3.mean(data, function(d) { return d.LoanAmount; }),
    avgDTI:       d3.mean(data, function(d) { return d.DTIRatio; }),
    avgRate:      d3.mean(data, function(d) { return d.InterestRate; }),
    total:        data.length
  };
};

/**
 * setLoadingStatus(msg, pct) — update loading UI
 */
window.setLoadingStatus = function(msg, pct) {
  var el = document.getElementById('loading-status');
  var bar = document.getElementById('loading-bar');
  if (el) el.textContent = msg;
  if (bar && pct !== undefined) bar.style.width = pct + '%';
};

/**
 * loadData(csvPath, onSuccess, onError)
 * Tries d3.csv first, falls back to FileReader prompt.
 */
window.loadData = function(csvPath, onSuccess, onError) {
  window.setLoadingStatus('Loading CSV…', 10);

  // Try d3.csv (works on http/https, may fail on file://)
  d3.csv(csvPath).then(function(rawRows) {
    window.setLoadingStatus('Parsing rows…', 40);
    parseRows(rawRows, onSuccess);
  }).catch(function(err) {
    console.warn('d3.csv failed, trying FileReader...', err);
    window.setLoadingStatus('Please select local CSV file…', 15);
    promptFileReader(onSuccess, onError);
  });
};

function parseRows(rawRows, onSuccess) {
  window.setLoadingStatus('Parsing numeric fields…', 55);
  var t0 = performance.now();

  var parsed = new Array(rawRows.length);
  for (var i = 0; i < rawRows.length; i++) {
    var r = rawRows[i];
    var obj = {};
    // String fields
    obj.LoanID        = r.LoanID;
    obj.Education     = r.Education;
    obj.EmploymentType = r.EmploymentType;
    obj.MaritalStatus = r.MaritalStatus;
    obj.HasMortgage   = r.HasMortgage;
    obj.HasDependents = r.HasDependents;
    obj.LoanPurpose   = r.LoanPurpose;
    obj.HasCoSigner   = r.HasCoSigner;
    // Numeric fields
    obj.Age            = +r.Age;
    obj.Income         = +r.Income;
    obj.LoanAmount     = +r.LoanAmount;
    obj.CreditScore    = +r.CreditScore;
    obj.MonthsEmployed = +r.MonthsEmployed;
    obj.NumCreditLines = +r.NumCreditLines;
    obj.InterestRate   = +r.InterestRate;
    obj.LoanTerm       = +r.LoanTerm;
    obj.DTIRatio       = +r.DTIRatio;
    obj.Default        = +r.Default;
    parsed[i] = obj;
  }

  console.log('Parsed ' + parsed.length + ' rows in ' + (performance.now() - t0).toFixed(1) + 'ms');
  window.setLoadingStatus('Computing statistics…', 80);

  window.AppState.data = parsed;
  window.AppState.popStats = window.computePopStats();

  window.setLoadingStatus('Ready!', 100);
  setTimeout(function() { onSuccess(parsed); }, 200);
}

function promptFileReader(onSuccess, onError) {
  // Create a hidden file input
  var input = document.createElement('input');
  input.type = 'file';
  input.accept = '.csv';
  input.style.display = 'none';
  document.body.appendChild(input);

  // Update UI to guide user
  var statusEl = document.getElementById('loading-status');
  if (statusEl) statusEl.textContent = '请在对话框中选择 Loan_default.csv 文件';

  // Show a click prompt
  var promptDiv = document.createElement('div');
  promptDiv.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.8);z-index:10000;display:flex;align-items:center;justify-content:center;';
  promptDiv.innerHTML = '<div style="background:#161b22;border:1px solid #30363d;border-radius:12px;padding:40px;text-align:center;max-width:420px;">' +
    '<div style="font-size:40px;margin-bottom:16px;">📂</div>' +
    '<div style="font-size:18px;font-weight:700;color:#e6edf3;margin-bottom:8px;">选择数据文件</div>' +
    '<div style="color:#8b949e;margin-bottom:24px;font-size:14px;">由于浏览器安全限制，请手动选择<br><strong style="color:#58a6ff;">Loan_default.csv</strong> 文件</div>' +
    '<button id="file-pick-btn" style="background:#58a6ff;color:#fff;border:none;border-radius:8px;padding:12px 28px;font-size:14px;cursor:pointer;font-weight:600;">选择文件</button>' +
    '</div>';
  document.body.appendChild(promptDiv);

  document.getElementById('file-pick-btn').addEventListener('click', function() {
    input.click();
  });

  input.addEventListener('change', function() {
    if (!input.files || !input.files[0]) {
      if (onError) onError(new Error('No file selected'));
      return;
    }
    document.body.removeChild(promptDiv);
    window.setLoadingStatus('Reading file…', 25);

    var file = input.files[0];
    var reader = new FileReader();
    reader.onprogress = function(e) {
      if (e.lengthComputable) {
        var pct = Math.round(e.loaded / e.total * 40) + 25;
        window.setLoadingStatus('Reading… ' + Math.round(e.loaded/1024/1024) + 'MB', pct);
      }
    };
    reader.onload = function(e) {
      window.setLoadingStatus('Parsing CSV…', 65);
      var text = e.target.result;
      // Parse CSV text manually using d3.csvParse
      var rawRows = d3.csvParse(text);
      parseRows(rawRows, onSuccess);
    };
    reader.onerror = function() {
      if (onError) onError(new Error('FileReader error'));
    };
    reader.readAsText(file);
  });

  document.body.removeChild(input);
  document.body.appendChild(input);
}

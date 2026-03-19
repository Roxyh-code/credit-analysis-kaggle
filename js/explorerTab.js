/* ================================================
   EXPLORER TAB — Line Chart with Brushing, Pan/Zoom,
   Crosshair Tooltip, Dynamic Groups
   ================================================ */

window.ExplorerTab = (function() {

  // ---- State ----
  var state = {
    xField: 'CreditScore',
    brushExtent: null,
    zoomTransform: null
  };

  // ---- Chart dimensions ----
  var MARGIN = { top: 30, right: 30, bottom: 50, left: 60 };
  var CTX_MARGIN = { top: 4, right: 30, bottom: 20, left: 60 };
  var CTX_H = 50;

  // ---- Scales (shared, updated on render) ----
  var mainSvg, mainG, ctxSvg, ctxG;
  var xScale, yScale, xScaleCtx, yScaleCtx;
  var mainW, mainH, ctxW;
  var xAxisG, yAxisG, gridG;
  var linesG, dotsG, crosshairG;
  var ctxLinesG, brushG, brushObj;
  var mainChartReady = false;
  var isTransitioning = false;

  // ---- PRESETS ----
  var PRESETS = {
    cosigner: [
      { conditions: { HasCoSigner: 'Yes' }, label: '有担保人', color: '#58a6ff' },
      { conditions: { HasCoSigner: 'No' },  label: '无担保人', color: '#f85149' }
    ],
    mortgage: [
      { conditions: { HasMortgage: 'Yes' }, label: '有房贷', color: '#58a6ff' },
      { conditions: { HasMortgage: 'No' },  label: '无房贷', color: '#f85149' }
    ],
    dependents: [
      { conditions: { HasDependents: 'Yes' }, label: '有受抚养人', color: '#58a6ff' },
      { conditions: { HasDependents: 'No' },  label: '无受抚养人', color: '#f85149' }
    ],
    maxcontrast: [
      {
        conditions: { HasCoSigner:'Yes', HasMortgage:'Yes', HasDependents:'Yes', MaritalStatus:'Married', EmploymentType:'Full-time' },
        label: '责任最重',
        color: '#3fb950'
      },
      {
        conditions: { HasCoSigner:'No', HasMortgage:'No', HasDependents:'No', MaritalStatus:'Divorced', EmploymentType:'Unemployed' },
        label: '责任最轻',
        color: '#f85149'
      }
    ],
    baseline: [
      { conditions: {}, label: '全部借款人', color: '#8b949e' }
    ]
  };

  // ---- DISCOVERY CARDS ----
  var DISCOVERY_LIBRARY = [
    {
      id: 'responsibility_paradox',
      icon: '🔄',
      title: '责任悖论',
      body: '无论在哪个 X 轴变量上，有担保人 + 有房贷 + 有抚养的"重责任"群体违约率始终更低。',
      relevant: function(groups, xField) { return groups.length >= 2; }
    },
    {
      id: 'credit_strong',
      icon: '📉',
      title: '信用分是最强预测因子',
      body: '当 X 轴为信用评分时，违约率从低分区的 <span class="dc-highlight">~20%</span> 降至高分区的 <span class="dc-highlight">~5%</span>，跨度最大。',
      relevant: function(groups, xField) { return xField === 'CreditScore'; }
    },
    {
      id: 'loanterm_flat',
      icon: '📏',
      title: '贷款期限几乎无影响',
      body: '12 ~ 60 个月的违约率都在 <span class="dc-highlight">11.6%</span> 左右浮动，差距不到 0.2%。直觉认为期限越长风险越大，但数据不支持。',
      relevant: function(groups, xField) { return xField === 'LoanTerm'; }
    },
    {
      id: 'income_nonlinear',
      icon: '💰',
      title: '收入影响呈平台效应',
      body: '收入超过约 $80k 后，违约率趋于平稳，边际降幅减小——超过某阈值后，更高收入并不再显著降低违约风险。',
      relevant: function(groups, xField) { return xField === 'Income'; }
    },
    {
      id: 'dti_threshold',
      icon: '⚠️',
      title: 'DTI 超过 0.5 是危险线',
      body: '债务收入比 > 0.5 时违约率明显上升，是最重要的风险阈值之一。',
      relevant: function(groups, xField) { return xField === 'DTIRatio'; }
    },
    {
      id: 'age_u_shape',
      icon: '📊',
      title: '年龄与违约率关系',
      body: '年轻借款人（< 30 岁）和老年借款人（> 60 岁）违约率略高，中年群体最稳定。',
      relevant: function(groups, xField) { return xField === 'Age'; }
    },
    {
      id: 'maxcontrast_gap',
      icon: '🏆',
      title: '最大对比组差距',
      body: '"责任最重"组（担保+房贷+抚养+已婚+全职）与"责任最轻"组之间，违约率差距可达 <span class="dc-highlight">3-5%</span>，横跨整个信用分范围。',
      relevant: function(groups, xField) { return groups.length >= 2 && groups.some(function(g) { return g.label === '责任最重'; }); }
    }
  ];

  // ---- Init ----
  function init() {
    buildCharts();
    bindToolbar();
    bindGroupPanel();

    // Load default preset
    loadPreset('cosigner');
  }

  // ---- Build SVG Scaffolding ----
  function buildCharts() {
    var mainEl = document.getElementById('main-chart');
    var ctxEl  = document.getElementById('context-chart');
    if (!mainEl || !ctxEl) return;

    // Main chart
    mainEl.innerHTML = '';
    ctxEl.innerHTML  = '';

    var mRect = mainEl.getBoundingClientRect();
    var cRect = ctxEl.getBoundingClientRect();

    mainW = (mRect.width  || 600) - MARGIN.left - MARGIN.right;
    mainH = (mRect.height || 380) - MARGIN.top  - MARGIN.bottom;
    ctxW  = (cRect.width  || 600) - CTX_MARGIN.left - CTX_MARGIN.right;

    if (mainW < 100) mainW = 600;
    if (mainH < 100) mainH = 300;
    if (ctxW  < 100) ctxW  = 600;

    // Main SVG
    mainSvg = d3.select('#main-chart')
      .append('svg')
      .attr('width', mainW + MARGIN.left + MARGIN.right)
      .attr('height', mainH + MARGIN.top + MARGIN.bottom)
      .style('overflow', 'visible');

    // Clip path for main chart lines
    mainSvg.append('defs')
      .append('clipPath').attr('id', 'main-clip')
      .append('rect')
      .attr('width', mainW).attr('height', mainH + 4).attr('y', -2);

    mainG = mainSvg.append('g')
      .attr('transform', 'translate(' + MARGIN.left + ',' + MARGIN.top + ')');

    // Background rect for mouse events
    mainG.append('rect')
      .attr('class', 'chart-bg')
      .attr('width', mainW).attr('height', mainH)
      .attr('fill', 'transparent')
      .attr('cursor', 'crosshair');

    // Grid
    gridG = mainG.append('g').attr('class', 'grid');

    // Axes
    xAxisG = mainG.append('g').attr('class', 'axis x-axis')
      .attr('transform', 'translate(0,' + mainH + ')');
    yAxisG = mainG.append('g').attr('class', 'axis y-axis');

    // Y-axis label
    mainG.append('text')
      .attr('class', 'y-axis-label')
      .attr('transform', 'rotate(-90)')
      .attr('x', -mainH / 2).attr('y', -48)
      .attr('text-anchor', 'middle')
      .attr('fill', '#8b949e')
      .attr('font-size', 12)
      .attr('font-family', 'inherit')
      .text('违约率 (%)');

    // Clipped lines + dots group
    var clippedG = mainG.append('g')
      .attr('clip-path', 'url(#main-clip)');
    linesG = clippedG.append('g').attr('class', 'lines-group');
    dotsG  = clippedG.append('g').attr('class', 'dots-group');

    // Crosshair group (on top)
    crosshairG = mainG.append('g').attr('class', 'crosshair-g').style('display', 'none');
    crosshairG.append('line').attr('class', 'crosshair-line')
      .attr('y1', 0).attr('y2', mainH);

    // Mouse overlay
    mainG.append('rect')
      .attr('class', 'mouse-overlay')
      .attr('width', mainW).attr('height', mainH)
      .attr('fill', 'transparent')
      .attr('cursor', 'crosshair')
      .on('mousemove', onMouseMove)
      .on('mouseleave', onMouseLeave);

    // Zoom behavior
    var zoomBehavior = d3.zoom()
      .scaleExtent([1, 20])
      .translateExtent([[-mainW, -Infinity], [2*mainW, Infinity]])
      .on('zoom', function(event) {
        state.zoomTransform = event.transform;
        applyZoom();
      });
    mainSvg.call(zoomBehavior);

    // Context SVG
    ctxSvg = d3.select('#context-chart')
      .append('svg')
      .attr('width', ctxW + CTX_MARGIN.left + CTX_MARGIN.right)
      .attr('height', CTX_H + CTX_MARGIN.top + CTX_MARGIN.bottom);

    ctxG = ctxSvg.append('g')
      .attr('transform', 'translate(' + CTX_MARGIN.left + ',' + CTX_MARGIN.top + ')');

    ctxLinesG = ctxG.append('g').attr('class', 'ctx-lines');

    // Brush
    brushObj = d3.brushX()
      .extent([[0, 0], [ctxW, CTX_H]])
      .on('brush end', onBrush);

    brushG = ctxG.append('g').attr('class', 'brush').call(brushObj);

    mainChartReady = true;
  }

  // ---- Toolbar Bindings ----
  function bindToolbar() {
    var xSelect = document.getElementById('xaxis-select');
    if (xSelect) {
      xSelect.addEventListener('change', function() {
        state.xField = this.value;
        state.brushExtent = null;
        state.zoomTransform = null;
        window.AppState.xField = this.value;
        brushG && brushG.call(brushObj.move, null);
        render(true);
        updateDiscoveryCards();
      });
    }

    document.querySelectorAll('.preset-btn').forEach(function(btn) {
      btn.addEventListener('click', function() {
        loadPreset(this.dataset.preset);
      });
    });

    document.getElementById('myth-goto-explorer') &&
      document.getElementById('myth-goto-explorer').addEventListener('click', function() {
        switchToTab('explorer');
        loadPreset('cosigner');
      });
  }

  // ---- Group Panel Bindings ----
  function bindGroupPanel() {
    var addBtn    = document.getElementById('btn-add-group');
    var cancelBtn = document.getElementById('btn-cancel-group');
    var confirmBtn = document.getElementById('btn-confirm-group');
    var form = document.getElementById('add-group-form');

    if (addBtn) addBtn.addEventListener('click', function() {
      form.style.display = form.style.display === 'none' ? 'block' : 'none';
    });
    if (cancelBtn) cancelBtn.addEventListener('click', function() {
      form.style.display = 'none';
      resetGroupForm();
    });
    if (confirmBtn) confirmBtn.addEventListener('click', function() {
      var conditions = {
        HasCoSigner:   document.getElementById('fg-cosigner').value,
        HasMortgage:   document.getElementById('fg-mortgage').value,
        HasDependents: document.getElementById('fg-dependents').value,
        MaritalStatus: document.getElementById('fg-marital').value,
        EmploymentType: document.getElementById('fg-employment').value,
        LoanPurpose:   document.getElementById('fg-purpose').value
      };
      var label = window.buildGroupLabel(conditions);
      var color = window.nextGroupColor();
      addGroup({ conditions: conditions, label: label, color: color });
      form.style.display = 'none';
      resetGroupForm();
    });
  }

  function resetGroupForm() {
    ['fg-cosigner','fg-mortgage','fg-dependents','fg-marital','fg-employment','fg-purpose'].forEach(function(id) {
      var el = document.getElementById(id);
      if (el) el.value = '';
    });
  }

  // ---- Group Management ----
  function addGroup(groupDef) {
    // Assign id
    groupDef.id = 'g_' + Date.now() + '_' + Math.random().toString(36).slice(2,6);
    window.AppState.groups.push(groupDef);
    renderGroupList();
    render(false);
    updateDiscoveryCards();
  }

  function removeGroup(id) {
    window.AppState.groups = window.AppState.groups.filter(function(g) { return g.id !== id; });
    renderGroupList();
    render(false);
    updateDiscoveryCards();
  }

  function renderGroupList() {
    var list = document.getElementById('groups-list');
    if (!list) return;
    list.innerHTML = '';
    window.AppState.groups.forEach(function(g) {
      var item = document.createElement('div');
      item.className = 'group-item';
      item.innerHTML =
        '<div class="group-dot" style="background:' + g.color + ';"></div>' +
        '<span class="group-name" title="' + g.label + '">' + g.label + '</span>' +
        '<button class="group-delete" data-id="' + g.id + '" title="删除">×</button>';
      item.querySelector('.group-delete').addEventListener('click', function() {
        removeGroup(this.dataset.id);
      });
      list.appendChild(item);
    });
  }

  // ---- Load Preset ----
  function loadPreset(presetName) {
    var preset = PRESETS[presetName];
    if (!preset) return;

    // Mark active preset button
    document.querySelectorAll('.preset-btn').forEach(function(btn) {
      btn.classList.toggle('active', btn.dataset.preset === presetName);
    });

    // Reset color index
    window._groupColorIdx = 0;
    window.AppState.groups = [];

    preset.forEach(function(def) {
      var g = {
        id: 'g_' + Date.now() + '_' + Math.random().toString(36).slice(2,6),
        conditions: def.conditions,
        label: def.label,
        color: def.color
      };
      window.AppState.groups.push(g);
    });

    renderGroupList();
    render(false);
    updateDiscoveryCards();
  }

  // ---- Core Render ----
  function render(animated) {
    if (!mainChartReady) return;
    var groups = window.AppState.groups;
    var xField = state.xField;
    if (groups.length === 0) {
      linesG.selectAll('*').remove();
      dotsG.selectAll('*').remove();
      ctxLinesG.selectAll('*').remove();
      clearAxes();
      return;
    }

    // Aggregate data for all groups
    var allData = groups.map(function(g) {
      var rows = window.filterData(g.conditions);
      var bins = window.aggregateByX(rows, xField);
      // Filter out null rates
      bins = bins.filter(function(b) { return b.rate !== null; });
      return { group: g, bins: bins };
    });

    // Compute domains
    var allBins = [];
    allData.forEach(function(d) { allBins = allBins.concat(d.bins); });
    if (allBins.length === 0) { clearAxes(); return; }

    var xExtent = d3.extent(allBins, function(b) { return b.x; });
    var yMax = d3.max(allBins, function(b) { return b.rate; });
    yMax = Math.max(yMax * 1.2, 5);

    // Apply brush/zoom to xExtent
    var xDomain = state.brushExtent || xExtent;

    // Build scales
    xScale = d3.scaleLinear().domain(xDomain).range([0, mainW]).nice();
    yScale = d3.scaleLinear().domain([0, yMax]).range([mainH, 0]).nice();
    xScaleCtx = d3.scaleLinear().domain(xExtent).range([0, ctxW]).nice();
    yScaleCtx = d3.scaleLinear().domain([0, yMax]).range([CTX_H, 0]);

    // Apply zoom transform if any
    if (state.zoomTransform) {
      xScale = state.zoomTransform.rescaleX(
        d3.scaleLinear().domain(xDomain).range([0, mainW])
      );
    }

    var xMeta = window.X_FIELDS[xField] || {};
    var xFmt = xMeta.fmt || function(d) { return d; };

    // Axes (animated transition)
    var t = animated ? d3.transition().duration(500).ease(d3.easeQuadInOut) : d3.transition().duration(200);

    xAxisG.transition(t).call(
      d3.axisBottom(xScale).ticks(8).tickFormat(xFmt)
    ).call(function(g) {
      g.select('.domain').attr('stroke', '#30363d');
      g.selectAll('text').attr('fill', '#8b949e').attr('font-size', 11).attr('font-family', 'inherit');
      g.selectAll('line').attr('stroke', '#30363d');
    });

    yAxisG.transition(t).call(
      d3.axisLeft(yScale).ticks(6).tickFormat(function(d) { return d.toFixed(1) + '%'; })
    ).call(function(g) {
      g.select('.domain').attr('stroke', '#30363d');
      g.selectAll('text').attr('fill', '#8b949e').attr('font-size', 11).attr('font-family', 'inherit');
      g.selectAll('line').attr('stroke', '#30363d');
    });

    // Grid
    gridG.selectAll('*').remove();
    gridG.call(
      d3.axisLeft(yScale).ticks(6).tickSize(-mainW).tickFormat('')
    ).call(function(g) {
      g.select('.domain').remove();
      g.selectAll('line').attr('stroke', '#30363d').attr('stroke-dasharray', '3,3').attr('opacity', 0.5);
    });

    // Draw lines
    drawLines(allData, xScale, yScale, t);
    drawContextLines(allData, xScaleCtx, yScaleCtx);
  }

  function clearAxes() {
    if (xAxisG) xAxisG.selectAll('*').remove();
    if (yAxisG) yAxisG.selectAll('*').remove();
    if (gridG)  gridG.selectAll('*').remove();
  }

  function drawLines(allData, xs, ys, t) {
    var lineGen = d3.line()
      .x(function(b) { return xs(b.x); })
      .y(function(b) { return ys(b.rate); })
      .curve(d3.curveCatmullRom.alpha(0.5))
      .defined(function(b) { return b.rate !== null; });

    // Remove old lines for groups that no longer exist
    var existingIds = window.AppState.groups.map(function(g) { return g.id; });
    linesG.selectAll('.group-line').each(function() {
      var id = d3.select(this).attr('data-id');
      if (existingIds.indexOf(id) === -1) d3.select(this).remove();
    });
    dotsG.selectAll('.group-dot-g').each(function() {
      var id = d3.select(this).attr('data-id');
      if (existingIds.indexOf(id) === -1) d3.select(this).remove();
    });

    allData.forEach(function(gd) {
      var g = gd.group;
      var bins = gd.bins;
      if (bins.length === 0) return;

      var pathStr = lineGen(bins);

      // Update or create path
      var existing = linesG.selectAll('.group-line[data-id="' + g.id + '"]');
      if (existing.empty()) {
        // New line — animate draw with stroke-dashoffset
        var path = linesG.append('path')
          .attr('class', 'chart-line group-line')
          .attr('data-id', g.id)
          .attr('d', pathStr)
          .attr('stroke', g.color)
          .attr('stroke-width', 2.5);

        var totalLen = path.node().getTotalLength();
        path
          .attr('stroke-dasharray', totalLen + ' ' + totalLen)
          .attr('stroke-dashoffset', totalLen)
          .transition().duration(800).ease(d3.easeQuadOut)
          .attr('stroke-dashoffset', 0)
          .on('end', function() { d3.select(this).attr('stroke-dasharray', null).attr('stroke-dashoffset', null); });
      } else {
        existing.transition(t).attr('d', pathStr).attr('stroke', g.color);
      }

      // Dots
      var dotG = dotsG.selectAll('.group-dot-g[data-id="' + g.id + '"]');
      if (dotG.empty()) {
        dotG = dotsG.append('g').attr('class', 'group-dot-g').attr('data-id', g.id);
      }
      var dots = dotG.selectAll('circle').data(bins, function(b) { return b.x; });
      dots.enter()
        .append('circle')
        .attr('class', 'chart-dot')
        .attr('r', 4)
        .attr('fill', g.color)
        .attr('stroke', '#0d1117')
        .attr('stroke-width', 1.5)
        .attr('cx', function(b) { return xs(b.x); })
        .attr('cy', function(b) { return ys(b.rate); })
        .attr('opacity', 0)
        .transition().delay(400).duration(300)
        .attr('opacity', 1)
      .merge(dots)
        .transition(t)
        .attr('cx', function(b) { return xs(b.x); })
        .attr('cy', function(b) { return ys(b.rate); })
        .attr('fill', g.color);
      dots.exit().remove();
    });
  }

  function drawContextLines(allData, xs, ys) {
    ctxLinesG.selectAll('*').remove();

    var lineGen = d3.line()
      .x(function(b) { return xs(b.x); })
      .y(function(b) { return ys(b.rate); })
      .curve(d3.curveCatmullRom.alpha(0.5))
      .defined(function(b) { return b.rate !== null; });

    allData.forEach(function(gd) {
      var bins = gd.bins;
      if (bins.length === 0) return;
      ctxLinesG.append('path')
        .attr('d', lineGen(bins))
        .attr('fill', 'none')
        .attr('stroke', gd.group.color)
        .attr('stroke-width', 1.5)
        .attr('opacity', 0.7);
    });

    // Context x-axis
    var ctxAxis = ctxG.selectAll('.ctx-axis').data([null]);
    ctxAxis.enter()
      .append('g').attr('class', 'ctx-axis axis')
      .attr('transform', 'translate(0,' + CTX_H + ')')
      .merge(ctxAxis)
      .call(d3.axisBottom(xs).ticks(6).tickFormat(window.X_FIELDS[state.xField] && window.X_FIELDS[state.xField].fmt || function(d){return d;}))
      .call(function(g) {
        g.select('.domain').attr('stroke', '#30363d');
        g.selectAll('text').attr('fill', '#8b949e').attr('font-size', 10).attr('font-family', 'inherit');
        g.selectAll('line').attr('stroke', '#30363d');
      });
  }

  function applyZoom() {
    if (!xScale) return;
    render(false);
  }

  // ---- Brush ----
  function onBrush(event) {
    if (!event.selection) {
      state.brushExtent = null;
    } else {
      var s = event.selection;
      state.brushExtent = [xScaleCtx.invert(s[0]), xScaleCtx.invert(s[1])];
    }
    state.zoomTransform = null;
    render(false);
  }

  // ---- Crosshair Tooltip ----
  function onMouseMove(event) {
    var groups = window.AppState.groups;
    if (!groups.length || !xScale || !yScale) return;

    var pos = d3.pointer(event, this);
    var mx = pos[0];
    var xVal = xScale.invert(mx);

    crosshairG.style('display', null);
    crosshairG.select('line')
      .attr('x1', mx).attr('x2', mx);

    // Find nearest bin for each group
    var lines = [];
    window.AppState.groups.forEach(function(g) {
      var rows = window.filterData(g.conditions);
      var bins = window.aggregateByX(rows, state.xField).filter(function(b) { return b.rate !== null; });
      if (bins.length === 0) return;
      var closest = bins.reduce(function(a, b) {
        return Math.abs(b.x - xVal) < Math.abs(a.x - xVal) ? b : a;
      });
      lines.push({ group: g, bin: closest });
    });

    // Tooltip
    var tooltip = document.getElementById('crosshair-tooltip');
    if (!tooltip) return;
    if (lines.length === 0) { tooltip.style.display = 'none'; return; }

    var xFmt = (window.X_FIELDS[state.xField] && window.X_FIELDS[state.xField].fmt) || function(d){ return d.toFixed(1); };
    var xLabel = (window.X_FIELDS[state.xField] && window.X_FIELDS[state.xField].label) || state.xField;

    var html = '<div class="tt-title">' + xLabel + ': ' + xFmt(xVal) + '</div>';
    lines.forEach(function(item) {
      html += '<div class="tt-row">' +
        '<div class="tt-dot" style="background:' + item.group.color + ';"></div>' +
        '<span class="tt-name">' + item.group.label + '</span>' +
        '<span class="tt-val">' + item.bin.rate.toFixed(2) + '%</span>' +
        '</div>';
    });
    tooltip.innerHTML = html;

    // Position tooltip
    var wrap = document.getElementById('chart-wrap');
    var wRect = wrap ? wrap.getBoundingClientRect() : { width: 800 };
    var svgRect = mainSvg.node().getBoundingClientRect();
    var tooltipX = MARGIN.left + mx + 14;
    var tooltipY = MARGIN.top + (mainH / 3);
    if (tooltipX + 180 > (svgRect.width || 800)) tooltipX = MARGIN.left + mx - 180;
    tooltip.style.left = tooltipX + 'px';
    tooltip.style.top  = tooltipY + 'px';
    tooltip.style.display = 'block';

    // Highlight dots on lines
    dotsG.selectAll('circle').attr('r', 4).attr('stroke-width', 1.5);
    lines.forEach(function(item) {
      dotsG.selectAll('.group-dot-g[data-id="' + item.group.id + '"] circle')
        .filter(function(b) { return b && Math.abs(b.x - item.bin.x) < 0.001; })
        .attr('r', 6).attr('stroke-width', 2);
    });
  }

  function onMouseLeave() {
    crosshairG.style('display', 'none');
    var tooltip = document.getElementById('crosshair-tooltip');
    if (tooltip) tooltip.style.display = 'none';
    dotsG.selectAll('circle').attr('r', 4).attr('stroke-width', 1.5);
  }

  // ---- Discovery Cards ----
  function updateDiscoveryCards() {
    var container = document.getElementById('discovery-cards');
    if (!container) return;
    container.innerHTML = '';

    var groups = window.AppState.groups;
    var xField = state.xField;

    var relevant = DISCOVERY_LIBRARY.filter(function(card) {
      return card.relevant(groups, xField);
    });

    if (relevant.length === 0) {
      container.innerHTML = '<div style="color:#8b949e;font-size:12px;padding:8px 0;">添加对比组后，这里会显示自动发现的洞察。</div>';
      return;
    }

    relevant.slice(0, 4).forEach(function(card) {
      var el = document.createElement('div');
      el.className = 'discovery-card';
      el.innerHTML = '<div class="dc-icon">' + card.icon + '</div>' +
        '<div class="dc-title">' + card.title + '</div>' +
        '<div class="dc-body">' + card.body + '</div>';
      container.appendChild(el);
    });
  }

  // Public API
  return {
    init: init,
    loadPreset: loadPreset,
    addGroup: addGroup,
    getState: function() { return state; }
  };
})();

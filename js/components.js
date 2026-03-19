/* ================================================
   SHARED COMPONENTS: Gauge, Radar, Animated Counter
   ================================================ */

/**
 * drawGauge(containerId, rate, maxRate)
 * Semi-circle gauge showing default rate.
 */
window.drawGauge = function(containerId, rate, maxRate) {
  var container = document.getElementById(containerId);
  if (!container) return;
  container.innerHTML = '';

  maxRate = maxRate || 25;
  var W = 260, H = 160;
  var cx = W / 2, cy = H - 10;
  var R = 100, rInner = 60;

  var svg = d3.select('#' + containerId)
    .append('svg')
    .attr('width', W).attr('height', H)
    .attr('viewBox', '0 0 ' + W + ' ' + H);

  // Background arc (full half-circle)
  var bgArc = d3.arc()
    .innerRadius(rInner)
    .outerRadius(R)
    .startAngle(-Math.PI / 2)
    .endAngle(Math.PI / 2);

  svg.append('path')
    .attr('d', bgArc())
    .attr('transform', 'translate(' + cx + ',' + cy + ')')
    .attr('fill', '#1c2128')
    .attr('stroke', '#30363d')
    .attr('stroke-width', 1);

  // Color zones
  var zones = [
    { start: -Math.PI/2, end: -Math.PI/6, fill: '#3fb950' },   // 0-8.3% green
    { start: -Math.PI/6, end:  Math.PI/6, fill: '#d29922' },   // 8.3-16.7% yellow
    { start:  Math.PI/6, end:  Math.PI/2, fill: '#f85149' }    // 16.7-25% red
  ];
  zones.forEach(function(z) {
    var zArc = d3.arc()
      .innerRadius(rInner + 2)
      .outerRadius(R - 2)
      .startAngle(z.start)
      .endAngle(z.end);
    svg.append('path')
      .attr('d', zArc())
      .attr('transform', 'translate(' + cx + ',' + cy + ')')
      .attr('fill', z.fill)
      .attr('opacity', 0.25);
  });

  // Tick marks
  for (var i = 0; i <= 5; i++) {
    var angle = -Math.PI/2 + (Math.PI * i / 5);
    var x1 = cx + (R - 4) * Math.cos(angle);
    var y1 = cy + (R - 4) * Math.sin(angle);
    var x2 = cx + (R + 6) * Math.cos(angle);
    var y2 = cy + (R + 6) * Math.sin(angle);
    svg.append('line')
      .attr('x1', x1).attr('y1', y1)
      .attr('x2', x2).attr('y2', y2)
      .attr('stroke', '#30363d')
      .attr('stroke-width', 1.5);
    var tickVal = (maxRate * i / 5);
    var tx = cx + (R + 18) * Math.cos(angle);
    var ty = cy + (R + 18) * Math.sin(angle);
    svg.append('text')
      .attr('x', tx).attr('y', ty)
      .attr('text-anchor', 'middle')
      .attr('dominant-baseline', 'middle')
      .attr('fill', '#8b949e')
      .attr('font-size', 9)
      .text(tickVal.toFixed(0) + '%');
  }

  // Animated needle
  var clampedRate = Math.max(0, Math.min(maxRate, rate));
  var targetAngle = -Math.PI/2 + (Math.PI * clampedRate / maxRate);

  // Needle group
  var needle = svg.append('g')
    .attr('transform', 'translate(' + cx + ',' + cy + ')');

  var needlePath = needle.append('line')
    .attr('x1', 0).attr('y1', 0)
    .attr('x2', 0).attr('y2', -(R - 8))
    .attr('stroke', '#e6edf3')
    .attr('stroke-width', 2.5)
    .attr('stroke-linecap', 'round')
    .attr('transform', 'rotate(' + (-90) + ')'); // start at left

  needle.append('circle')
    .attr('r', 6)
    .attr('fill', '#e6edf3');

  // Animate needle
  var startAngleDeg = -90;
  var targetAngleDeg = targetAngle * 180 / Math.PI;

  needlePath.transition()
    .duration(1200)
    .ease(d3.easeCubicOut)
    .attrTween('transform', function() {
      return function(t) {
        var a = startAngleDeg + (targetAngleDeg - startAngleDeg) * t;
        return 'rotate(' + a + ')';
      };
    });

  // Center text (animated count-up)
  var rateText = needle.append('text')
    .attr('x', 0).attr('y', -18)
    .attr('text-anchor', 'middle')
    .attr('fill', '#e6edf3')
    .attr('font-size', 0)
    .attr('font-weight', 700)
    .attr('font-family', 'inherit');

  // Determine color
  var rateColor = rate < 8 ? '#3fb950' : rate < 15 ? '#d29922' : '#f85149';

  svg.append('text')
    .attr('x', cx).attr('y', cy - 20)
    .attr('text-anchor', 'middle')
    .attr('font-size', 28)
    .attr('font-weight', 800)
    .attr('font-family', 'inherit')
    .attr('fill', rateColor)
    .text('—')
    .transition()
    .duration(1200)
    .ease(d3.easeCubicOut)
    .tween('text', function() {
      var i = d3.interpolateNumber(0, rate);
      var el = this;
      return function(t) {
        d3.select(el).text(i(t).toFixed(2) + '%');
      };
    });

  svg.append('text')
    .attr('x', cx).attr('y', cy - 0)
    .attr('text-anchor', 'middle')
    .attr('font-size', 11)
    .attr('font-family', 'inherit')
    .attr('fill', '#8b949e')
    .text('违约率');
};

/**
 * drawRadar(containerId, profileStats, popStats)
 * 5-axis radar chart comparing profile vs population.
 */
window.drawRadar = function(containerId, profileStats, popStats) {
  var container = document.getElementById(containerId);
  if (!container) return;
  container.innerHTML = '';
  if (!profileStats || !popStats) return;

  var W = 240, H = 240;
  var cx = W/2, cy = H/2;
  var R = 90;

  var axes = [
    {
      label: '信用评分',
      key: 'avgCredit',
      min: 300, max: 850,
      profileVal: profileStats.avgCredit,
      popVal: popStats.avgCredit
    },
    {
      label: '年收入',
      key: 'avgIncome',
      min: 0, max: 200000,
      profileVal: profileStats.avgIncome,
      popVal: popStats.avgIncome
    },
    {
      label: '平均年龄',
      key: 'avgAge',
      min: 18, max: 75,
      profileVal: profileStats.avgAge,
      popVal: popStats.avgAge
    },
    {
      label: '贷款金额',
      key: 'avgLoan',
      min: 0, max: 250000,
      profileVal: profileStats.avgLoan,
      popVal: popStats.avgLoan,
      invert: true
    },
    {
      label: '低违约率',
      key: 'defaultRate',
      min: 0, max: 25,
      profileVal: profileStats.defaultRate,
      popVal: popStats.defaultRate,
      invert: true
    }
  ];

  var N = axes.length;
  var angleStep = (2 * Math.PI) / N;

  var svg = d3.select('#' + containerId)
    .append('svg')
    .attr('width', W).attr('height', H);

  // Grid circles
  [0.2, 0.4, 0.6, 0.8, 1.0].forEach(function(r) {
    svg.append('circle')
      .attr('cx', cx).attr('cy', cy)
      .attr('r', R * r)
      .attr('fill', 'none')
      .attr('stroke', '#30363d')
      .attr('stroke-width', 1);
  });

  // Axis lines + labels
  axes.forEach(function(ax, i) {
    var angle = i * angleStep - Math.PI/2;
    var x = cx + R * Math.cos(angle);
    var y = cy + R * Math.sin(angle);
    svg.append('line')
      .attr('x1', cx).attr('y1', cy)
      .attr('x2', x).attr('y2', y)
      .attr('stroke', '#30363d').attr('stroke-width', 1);

    var lx = cx + (R + 18) * Math.cos(angle);
    var ly = cy + (R + 18) * Math.sin(angle);
    svg.append('text')
      .attr('x', lx).attr('y', ly)
      .attr('text-anchor', 'middle')
      .attr('dominant-baseline', 'middle')
      .attr('fill', '#8b949e')
      .attr('font-size', 10)
      .attr('font-family', 'inherit')
      .text(ax.label);
  });

  function normalize(ax) {
    var pv = ax.profileVal != null ? ax.profileVal : ax.popVal;
    var n = (pv - ax.min) / (ax.max - ax.min);
    if (ax.invert) n = 1 - n;
    return Math.max(0, Math.min(1, n));
  }
  function normalizeVal(ax, val) {
    var n = (val - ax.min) / (ax.max - ax.min);
    if (ax.invert) n = 1 - n;
    return Math.max(0, Math.min(1, n));
  }

  function makePoints(vals) {
    return vals.map(function(v, i) {
      var angle = i * angleStep - Math.PI/2;
      return [cx + R * v * Math.cos(angle), cy + R * v * Math.sin(angle)];
    });
  }

  // Population polygon
  var popVals = axes.map(function(ax) { return normalizeVal(ax, ax.popVal); });
  var popPts = makePoints(popVals);
  svg.append('polygon')
    .attr('points', popPts.map(function(p) { return p.join(','); }).join(' '))
    .attr('fill', 'rgba(139,148,158,0.15)')
    .attr('stroke', '#8b949e')
    .attr('stroke-width', 1.5);

  // Profile polygon
  var profVals = axes.map(function(ax) { return normalize(ax); });
  var profPts = makePoints(profVals);
  svg.append('polygon')
    .attr('points', profPts.map(function(p) { return p.join(','); }).join(' '))
    .attr('fill', 'rgba(88,166,255,0.15)')
    .attr('stroke', '#58a6ff')
    .attr('stroke-width', 2)
    .attr('opacity', 0)
    .transition().duration(600)
    .attr('opacity', 1);

  // Profile dots
  profPts.forEach(function(p) {
    svg.append('circle')
      .attr('cx', p[0]).attr('cy', p[1])
      .attr('r', 3)
      .attr('fill', '#58a6ff');
  });
};

/**
 * animateCounter(element, start, end, duration, suffix)
 * Animates a number count-up in an element.
 */
window.animateCounter = function(element, start, end, duration, suffix) {
  suffix = suffix || '';
  var startTime = null;
  function step(timestamp) {
    if (!startTime) startTime = timestamp;
    var progress = Math.min((timestamp - startTime) / duration, 1);
    var ease = 1 - Math.pow(1 - progress, 3); // ease-out cubic
    var current = start + (end - start) * ease;
    element.textContent = current.toFixed(2) + suffix;
    if (progress < 1) requestAnimationFrame(step);
  }
  requestAnimationFrame(step);
};

/**
 * buildGroupLabel(conditions) — generates a human-readable label
 */
window.buildGroupLabel = function(conditions) {
  var parts = [];
  if (conditions.HasCoSigner   === 'Yes') parts.push('有担保');
  if (conditions.HasCoSigner   === 'No')  parts.push('无担保');
  if (conditions.HasMortgage   === 'Yes') parts.push('有房贷');
  if (conditions.HasMortgage   === 'No')  parts.push('无房贷');
  if (conditions.HasDependents === 'Yes') parts.push('有抚养');
  if (conditions.HasDependents === 'No')  parts.push('无抚养');
  if (conditions.MaritalStatus)           parts.push({ Married:'已婚', Single:'单身', Divorced:'离婚' }[conditions.MaritalStatus] || conditions.MaritalStatus);
  if (conditions.EmploymentType)          parts.push({ 'Full-time':'全职', 'Part-time':'兼职', 'Self-employed':'自雇', 'Unemployed':'无业' }[conditions.EmploymentType] || conditions.EmploymentType);
  if (conditions.LoanPurpose)             parts.push({ Business:'商业', Home:'住房', Auto:'汽车', Education:'教育', Other:'其他' }[conditions.LoanPurpose] || conditions.LoanPurpose);
  return parts.length > 0 ? parts.join(' + ') : '全部借款人';
};

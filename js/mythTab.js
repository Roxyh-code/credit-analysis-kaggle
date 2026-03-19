/* ================================================
   MYTH TAB — Flip Cards + Summary Chart
   ================================================ */

window.MythTab = (function() {

  var MYTHS = [
    {
      id: 'cosigner',
      tag: '担保人效应',
      mythText: '有担保人的借款人，因为有人帮忙"兜底"，更不努力还款，违约率更高。',
      verdict: '迷思',
      verdictClass: 'myth',
      groups: [
        { label: '有担保人', value: 11.36, color: '#58a6ff' },
        { label: '无担保人', value: 12.87, color: '#f85149' }
      ],
      explanation: '现实恰恰相反！有担保人的借款人违约率（11.36%）低于无担保人（12.87%）。有担保人意味着有人对你的信用背书，这类借款人往往更有责任心。',
      preset: 'cosigner'
    },
    {
      id: 'mortgage',
      tag: '房贷负担',
      mythText: '已有房贷的借款人，债务负担更重，还款压力更大，更容易违约。',
      verdict: '迷思',
      verdictClass: 'myth',
      groups: [
        { label: '有房贷', value: 10.88, color: '#58a6ff' },
        { label: '无房贷', value: 12.35, color: '#f85149' }
      ],
      explanation: '有房贷者违约率（10.88%）反而低于无房贷者（12.35%）。拥有房贷通常说明该借款人通过了严格的信用审查，且有稳定资产，更有动力维持良好信用记录。',
      preset: 'mortgage'
    },
    {
      id: 'dependents',
      tag: '家庭负担',
      mythText: '有受抚养人（孩子或老人）的借款人，家庭开支更大，更难偿还贷款，违约率更高。',
      verdict: '迷思',
      verdictClass: 'myth',
      groups: [
        { label: '有受抚养人', value: 10.50, color: '#58a6ff' },
        { label: '无受抚养人', value: 12.72, color: '#f85149' }
      ],
      explanation: '有受抚养人的借款人违约率（10.50%）显著低于无受抚养人（12.72%）。家庭责任往往带来更强的还款动力——他们不能让家人失去保障。',
      preset: 'dependents'
    },
    {
      id: 'married',
      tag: '婚姻状态',
      mythText: '已婚人士因为家庭开支多、财务共同决策复杂，比离婚人士更容易违约。',
      verdict: '迷思',
      verdictClass: 'myth',
      groups: [
        { label: '已婚', value: 10.40, color: '#58a6ff' },
        { label: '离婚', value: 12.53, color: '#f85149' }
      ],
      explanation: '已婚借款人违约率（10.40%）远低于离婚者（12.53%）。已婚通常意味着双收入家庭和更稳定的财务状况；离婚可能带来财务压力和信用风险。',
      preset: 'cosigner' // opens explorer with related preset
    }
  ];

  var revealedCount = 0;
  var votedCards = {};

  function init() {
    var container = document.getElementById('flip-cards-container');
    if (!container) return;
    container.innerHTML = '';

    MYTHS.forEach(function(myth, idx) {
      var card = buildCard(myth, idx);
      container.appendChild(card);
    });
  }

  function buildCard(myth, idx) {
    var card = document.createElement('div');
    card.className = 'flip-card';
    card.id = 'flip-card-' + myth.id;

    card.innerHTML =
      '<div class="flip-card-inner">' +
        // FRONT
        '<div class="flip-card-front">' +
          '<div class="card-tag">' + myth.tag + '</div>' +
          '<div class="card-myth-text">' + myth.mythText + '</div>' +
          '<div class="card-vote-area">' +
            '<button class="vote-btn true-btn" data-card="' + myth.id + '" data-vote="true">✓ 对，这说法正确</button>' +
            '<button class="vote-btn false-btn" data-card="' + myth.id + '" data-vote="false">✗ 不对，这是迷思</button>' +
          '</div>' +
          '<div class="card-flip-hint">点击投票后可翻转查看真相</div>' +
        '</div>' +
        // BACK
        '<div class="flip-card-back">' +
          '<div class="card-verdict ' + myth.verdictClass + '">' + myth.verdict + '！</div>' +
          '<div class="card-back-title">' + myth.tag + '的真实数据</div>' +
          '<div class="card-numbers">' +
            myth.groups.map(function(g) {
              return '<div class="card-num-item">' +
                '<span class="card-num-value" data-target="' + g.value + '" style="color:' + g.color + '">0.00%</span>' +
                '<span class="card-num-label">' + g.label + '</span>' +
              '</div>';
            }).join('') +
          '</div>' +
          '<div class="card-explanation">' + myth.explanation + '</div>' +
          '<button class="card-goto-btn" data-preset="' + myth.preset + '">放到图里看 →</button>' +
        '</div>' +
      '</div>';

    // Vote buttons
    card.querySelectorAll('.vote-btn').forEach(function(btn) {
      btn.addEventListener('click', function(e) {
        e.stopPropagation();
        var cardId = btn.dataset.card;
        if (votedCards[cardId]) return; // already voted
        votedCards[cardId] = btn.dataset.vote;

        // Highlight the selected button
        var allBtns = card.querySelectorAll('.vote-btn');
        allBtns.forEach(function(b) { b.classList.remove('selected-true','selected-false'); });
        if (btn.dataset.vote === 'true') btn.classList.add('selected-true');
        else btn.classList.add('selected-false');

        // Auto-flip after short delay
        setTimeout(function() { flipCard(card, myth); }, 500);
      });
    });

    // Click anywhere on back-face goto button
    card.querySelector('.card-goto-btn').addEventListener('click', function(e) {
      e.stopPropagation();
      var preset = this.dataset.preset;
      window.AppState.pendingPreset = preset;
      switchToTab('explorer');
      setTimeout(function() {
        if (window.ExplorerTab) window.ExplorerTab.loadPreset(preset);
      }, 100);
    });

    // Click card to flip (if voted)
    card.addEventListener('click', function() {
      if (votedCards[myth.id]) {
        flipCard(card, myth);
      }
    });

    return card;
  }

  function flipCard(card, myth) {
    if (card.classList.contains('flipped')) return;
    card.classList.add('flipped');
    revealedCount++;
    document.getElementById('myth-revealed-count').textContent = revealedCount;

    // Animate count-up numbers on back
    setTimeout(function() {
      card.querySelectorAll('.card-num-value').forEach(function(el) {
        var target = parseFloat(el.dataset.target);
        window.animateCounter(el, 0, target, 1000, '%');
      });
    }, 300);

    // Show summary if all revealed
    if (revealedCount === 4) {
      setTimeout(showSummary, 800);
    }
  }

  function showSummary() {
    var summaryEl = document.getElementById('myth-summary');
    if (!summaryEl) return;
    summaryEl.style.display = 'block';
    drawSummaryChart();
  }

  function drawSummaryChart() {
    var container = document.getElementById('myth-summary-chart');
    if (!container) return;
    container.innerHTML = '';

    var summaryData = [
      { factor: '有担保人', withVal: 11.36, withLabel: '有担保人', withoutVal: 12.87, withoutLabel: '无担保人' },
      { factor: '有房贷',   withVal: 10.88, withLabel: '有房贷',   withoutVal: 12.35, withoutLabel: '无房贷' },
      { factor: '有受抚养人', withVal: 10.50, withLabel: '有受抚养人', withoutVal: 12.72, withoutLabel: '无受抚养人' },
      { factor: '已婚',     withVal: 10.40, withLabel: '已婚',     withoutVal: 12.53, withoutLabel: '离婚' }
    ];

    var margin = { top: 10, right: 140, bottom: 30, left: 100 };
    var W = Math.min(900, container.clientWidth || 800);
    var H = summaryData.length * 56 + margin.top + margin.bottom;
    var width = W - margin.left - margin.right;
    var height = H - margin.top - margin.bottom;

    var svg = d3.select('#myth-summary-chart')
      .append('svg')
      .attr('width', W).attr('height', H)
      .append('g')
      .attr('transform', 'translate(' + margin.left + ',' + margin.top + ')');

    var xScale = d3.scaleLinear()
      .domain([8, 15])
      .range([0, width]);

    var yScale = d3.scaleBand()
      .domain(summaryData.map(function(d) { return d.factor; }))
      .range([0, height])
      .padding(0.35);

    var bandH = yScale.bandwidth();
    var barH = bandH / 2 - 2;

    // Grid lines
    svg.append('g')
      .attr('class', 'grid')
      .attr('transform', 'translate(0,' + height + ')')
      .call(d3.axisBottom(xScale)
        .tickSize(-height)
        .tickFormat('')
        .ticks(6))
      .call(function(g) {
        g.select('.domain').remove();
        g.selectAll('line').attr('stroke', '#30363d').attr('stroke-dasharray', '3,3').attr('opacity', 0.5);
      });

    // X axis
    svg.append('g')
      .attr('class', 'axis')
      .attr('transform', 'translate(0,' + height + ')')
      .call(d3.axisBottom(xScale)
        .ticks(6)
        .tickFormat(function(d) { return d + '%'; }))
      .call(function(g) {
        g.select('.domain').attr('stroke', '#30363d');
        g.selectAll('text').attr('fill', '#8b949e').attr('font-size', 11);
        g.selectAll('line').attr('stroke', '#30363d');
      });

    // Baseline (total average)
    svg.append('line')
      .attr('x1', xScale(11.61)).attr('x2', xScale(11.61))
      .attr('y1', -6).attr('y2', height)
      .attr('stroke', '#8b949e')
      .attr('stroke-width', 1)
      .attr('stroke-dasharray', '4,4');
    svg.append('text')
      .attr('x', xScale(11.61) + 4).attr('y', -8)
      .attr('fill', '#8b949e').attr('font-size', 10).attr('font-family', 'inherit')
      .text('总体 11.61%');

    // Bars
    summaryData.forEach(function(d, i) {
      var y = yScale(d.factor);

      // "With" bar (blue) — top bar
      svg.append('rect')
        .attr('x', xScale(Math.min(d.withVal, d.withoutVal)) )
        .attr('y', y)
        .attr('height', barH)
        .attr('width', 0)
        .attr('fill', '#58a6ff')
        .attr('rx', 3)
        .transition().delay(i * 120).duration(600).ease(d3.easeQuadOut)
        .attr('width', xScale(d.withVal) - xScale(Math.min(d.withVal, d.withoutVal)));

      // "Without" bar (red) — bottom bar
      svg.append('rect')
        .attr('x', xScale(Math.min(d.withVal, d.withoutVal)))
        .attr('y', y + barH + 4)
        .attr('height', barH)
        .attr('width', 0)
        .attr('fill', '#f85149')
        .attr('rx', 3)
        .transition().delay(i * 120 + 60).duration(600).ease(d3.easeQuadOut)
        .attr('width', xScale(d.withoutVal) - xScale(Math.min(d.withVal, d.withoutVal)));

      // Both bars start from minimum — show full bars
      svg.append('rect')
        .attr('x', 0)
        .attr('y', y)
        .attr('height', barH)
        .attr('width', 0)
        .attr('fill', '#58a6ff')
        .attr('opacity', 0.2)
        .attr('rx', 3)
        .transition().delay(i * 120).duration(600)
        .attr('width', xScale(d.withVal));

      svg.append('rect')
        .attr('x', 0)
        .attr('y', y + barH + 4)
        .attr('height', barH)
        .attr('width', 0)
        .attr('fill', '#f85149')
        .attr('opacity', 0.2)
        .attr('rx', 3)
        .transition().delay(i * 120 + 60).duration(600)
        .attr('width', xScale(d.withoutVal));

      // Labels on right
      svg.append('text')
        .attr('x', xScale(d.withVal) + 6)
        .attr('y', y + barH / 2)
        .attr('dominant-baseline', 'middle')
        .attr('fill', '#58a6ff')
        .attr('font-size', 12)
        .attr('font-family', 'inherit')
        .attr('opacity', 0)
        .text(d.withLabel + ' ' + d.withVal + '%')
        .transition().delay(i * 120 + 300).duration(300)
        .attr('opacity', 1);

      svg.append('text')
        .attr('x', xScale(d.withoutVal) + 6)
        .attr('y', y + barH + 4 + barH / 2)
        .attr('dominant-baseline', 'middle')
        .attr('fill', '#f85149')
        .attr('font-size', 12)
        .attr('font-family', 'inherit')
        .attr('opacity', 0)
        .text(d.withoutLabel + ' ' + d.withoutVal + '%')
        .transition().delay(i * 120 + 360).duration(300)
        .attr('opacity', 1);
    });

    // Y axis labels
    svg.append('g')
      .attr('class', 'axis')
      .call(d3.axisLeft(yScale).tickSize(0))
      .call(function(g) {
        g.select('.domain').remove();
        g.selectAll('text')
          .attr('fill', '#e6edf3')
          .attr('font-size', 13)
          .attr('font-weight', 600)
          .attr('dx', -8);
      });
  }

  // Public API
  return {
    init: init,
    MYTHS: MYTHS
  };
})();

/* ================================================
   RIVER TAB — Responsibility Paradox River
   Click any node to bifurcate the downstream river
   into YES (blue) and NO (orange) sub-rivers
   ================================================ */

window.RiverTab = (function () {
  'use strict';

  var NODE_W   = 46;
  var NODE_PAD = 8;
  var SPLIT_GAP = 30;
  var PAD = { top: 62, right: 60, bottom: 22, left: 44 };

  var COLUMNS = [
    { key: 'ageGroup',    label: 'Age Group',
      order: ['Youth <30','Mid 30-45','Senior 45-60','Elder 60+'],
      cat: function(d) { return d.Age < 30 ? 'Youth <30' : d.Age < 45 ? 'Mid 30-45' : d.Age < 60 ? 'Senior 45-60' : 'Elder 60+'; }
    },
    { key: 'incomeGroup', label: 'Income Tier',
      order: ['Low <35k','Mid 35-65k','High 65-110k','Top 110k+'],
      cat: function(d) { return d.Income < 35000 ? 'Low <35k' : d.Income < 65000 ? 'Mid 35-65k' : d.Income < 110000 ? 'High 65-110k' : 'Top 110k+'; }
    },
    { key: 'creditGroup', label: 'Credit Score',
      order: ['Poor <580','Fair 580-670','Good 670-740','Excellent 740+'],
      cat: function(d) { return d.CreditScore < 580 ? 'Poor <580' : d.CreditScore < 670 ? 'Fair 580-670' : d.CreditScore < 740 ? 'Good 670-740' : 'Excellent 740+'; }
    },
    { key: 'loanGroup',   label: 'Loan Size',
      order: ['Small <8k','Medium 8-22k','Large 22k+'],
      cat: function(d) { return d.LoanAmount < 8000 ? 'Small <8k' : d.LoanAmount < 22000 ? 'Medium 8-22k' : 'Large 22k+'; }
    },
    { key: 'outcome',     label: 'Outcome',
      order: ['Repaid','Defaulted'],
      cat: function(d) { return d.Default === 1 ? 'Defaulted' : 'Repaid'; }
    }
  ];

  var FACTORS = [
    { key: 'HasCoSigner',   label: 'Co-Signer',  yesLabel: 'Has Co-Signer',  noLabel: 'No Co-Signer',  fn: function(d) { return d.HasCoSigner   === 'Yes'; } },
    { key: 'HasMortgage',   label: 'Mortgage',   yesLabel: 'Has Mortgage',   noLabel: 'No Mortgage',   fn: function(d) { return d.HasMortgage   === 'Yes'; } },
    { key: 'HasDependents', label: 'Dependents', yesLabel: 'Has Dependents', noLabel: 'No Dependents', fn: function(d) { return d.HasDependents === 'Yes'; } },
    { key: 'MaritalStatus', label: 'Married',    yesLabel: 'Married',        noLabel: 'Not Married',   fn: function(d) { return d.MaritalStatus === 'Married'; } }
  ];

  /* ── STATE ─────────────────────────────────────── */
  var rawData = [], colData = [], baseLinks = [];
  var activeFactor = FACTORS[0];
  var splitState   = null;
  var particles    = [];
  var animId       = null;
  var pSpeed       = 1.0;
  var W = 0, H = 0;

  var svg, mainG, linksG, nodesG, splitG, particlesG, headersG;

  /* ══════════════════════════════════════════════
     INIT
  ══════════════════════════════════════════════ */
  function init() {
    rawData = window.AppState.data;
    if (!rawData || !rawData.length) return;
    buildSVG();
    processData();
    render();
    startParticles();
    bindControls();
    clearSidebar();
  }

  /* ── SVG ──────────────────────────────────────── */
  function buildSVG() {
    var el = document.getElementById('river-canvas');
    if (!el) return;
    el.innerHTML = '';
    var rect = el.getBoundingClientRect();
    W = rect.width  || 900;
    H = rect.height || 510;

    svg        = d3.select('#river-canvas').append('svg').attr('width', W).attr('height', H);
    mainG      = svg.append('g');
    linksG     = mainG.append('g');
    nodesG     = mainG.append('g');
    splitG     = mainG.append('g');
    particlesG = mainG.append('g');
    headersG   = mainG.append('g');
  }

  /* ══════════════════════════════════════════════
     DATA
  ══════════════════════════════════════════════ */
  function processData() {
    var total  = rawData.length;
    var availH = H - PAD.top - PAD.bottom;
    var availW = W - PAD.left - PAD.right;
    var colGap = availW / (COLUMNS.length - 1);

    rawData.forEach(function(d) {
      d._cats = COLUMNS.map(function(col) { return col.cat(d); });
    });

    colData = COLUMNS.map(function(col, ci) {
      var groups = {};
      rawData.forEach(function(d) {
        var c = d._cats[ci];
        if (!groups[c]) groups[c] = [];
        groups[c].push(d);
      });

      var nodes = col.order
        .filter(function(name) { return groups[name] && groups[name].length > 0; })
        .map(function(name) {
          var rows = groups[name];
          var def  = d3.sum(rows, function(d) { return d.Default; });
          return { id: col.key+'__'+name, col: col.key, colIndex: ci,
                   name: name, count: rows.length, defaultRate: def/rows.length*100 };
        });

      var usableH = availH - NODE_PAD * (nodes.length - 1);
      var y = PAD.top;
      nodes.forEach(function(n) {
        n.h  = Math.max(8, n.count / total * usableH);
        n.y  = y;  n._outY = y;  n._inY = y;
        y += n.h + NODE_PAD;
      });
      return { key: col.key, label: col.label, ci: ci, x: PAD.left + ci * colGap, nodes: nodes };
    });

    /* base links */
    baseLinks = [];
    for (var ci = 0; ci < COLUMNS.length - 1; ci++) {
      var colA = colData[ci], colB = colData[ci + 1];
      var fm = {};
      rawData.forEach(function(d) {
        var k = d._cats[ci] + '|||' + d._cats[ci+1];
        if (!fm[k]) fm[k] = { count:0, defaults:0 };
        fm[k].count++; fm[k].defaults += d.Default;
      });
      Object.keys(fm).forEach(function(k) {
        var pts = k.split('|||');
        var nA  = colA.nodes.find(function(n){ return n.name===pts[0]; });
        var nB  = colB.nodes.find(function(n){ return n.name===pts[1]; });
        if (!nA || !nB) return;
        var f = fm[k], w = Math.max(1.5, f.count/total*availH*0.86);
        baseLinks.push({ id:k+'_'+ci, ci:ci, colA:colA, nodeA:nA, colB:colB, nodeB:nB,
                         count:f.count, defaultRate:f.defaults/f.count*100,
                         w:w, y0:nA._outY+w/2, y1:nB._inY+w/2 });
        nA._outY += w;  nB._inY += w;
      });
    }
  }

  /* ══════════════════════════════════════════════
     BASE RENDER
  ══════════════════════════════════════════════ */
  function render() {
    renderLinks();
    renderNodes();
    renderHeaders();
  }

  function renderLinks() {
    linksG.selectAll('path').data(baseLinks, function(d){ return d.id; })
      .join('path')
      .attr('fill', 'none')
      .attr('stroke', function(d){ return riskColor(d.defaultRate); })
      .attr('stroke-width', function(d){ return d.w; })
      .attr('opacity', 0.18)
      .attr('d', lkPath)
      .on('mouseover', function(event, d) {
        if (splitState && d.ci >= splitState.ci) return;
        d3.select(this).attr('opacity', 0.45);
        tip(event, '<b>'+d.nodeA.name+' → '+d.nodeB.name+'</b><br>Count: '+d.count.toLocaleString()+'<br>Default rate: <span style="color:#f85149">'+d.defaultRate.toFixed(1)+'%</span>');
      })
      .on('mousemove', moveTip)
      .on('mouseout', function(event, d) {
        d3.select(this).attr('opacity', (splitState && d.ci >= splitState.ci) ? 0.03 : 0.18);
        hideTip();
      });
  }

  function renderNodes() {
    nodesG.selectAll('.node-g').remove();
    colData.forEach(function(col) {
      col.nodes.forEach(function(node) {
        var g = nodesG.append('g').attr('class','node-g').attr('id','node-'+node.id);
        g.append('rect').attr('class','node-rect')
          .attr('x', col.x-NODE_W/2).attr('y', node.y)
          .attr('width', NODE_W).attr('height', node.h).attr('rx', 4)
          .attr('fill', nodeColor(node.defaultRate))
          .attr('stroke', d3.color(nodeColor(node.defaultRate)).brighter(0.5))
          .attr('stroke-width', 0.8).attr('opacity', 0.88)
          .attr('cursor', col.key !== 'outcome' ? 'pointer' : 'default')
          .on('click',     (function(c,n){ return function(){ handleNodeClick(c,n); }; })(col,node))
          .on('mouseover', function(event) {
            d3.select(this).attr('stroke-width', 2);
            var hint = col.key !== 'outcome' ? '<br><span style="color:#8b949e;font-size:11px">Click to split river</span>' : '';
            tip(event, '<b>'+node.name+'</b><br>Count: '+node.count.toLocaleString()+'<br>Default rate: <span style="color:#f85149">'+node.defaultRate.toFixed(1)+'%</span>'+hint);
          })
          .on('mousemove', moveTip)
          .on('mouseout',  function(){ d3.select(this).attr('stroke-width',0.8); hideTip(); });

        if (node.h > 16) {
          g.append('text')
            .attr('x', col.x).attr('y', node.y+node.h/2)
            .attr('text-anchor','middle').attr('dominant-baseline','middle')
            .attr('font-size', Math.min(11, node.h*0.48))
            .attr('fill','#e6edf3').attr('pointer-events','none')
            .text(node.h > 22 ? node.name : '');
        }
      });
    });
  }

  function renderHeaders() {
    headersG.selectAll('*').remove();
    colData.forEach(function(col) {
      var g = headersG.append('g').attr('transform','translate('+col.x+','+(PAD.top-26)+')');
      g.append('rect').attr('x',-40).attr('y',-13).attr('width',80).attr('height',26).attr('rx',5)
        .attr('fill','#1c2128').attr('stroke','#30363d');
      g.append('text').attr('text-anchor','middle').attr('dominant-baseline','middle')
        .attr('font-size',11).attr('font-weight',600).attr('font-family','inherit').attr('fill','#58a6ff')
        .text(col.label);
    });
  }

  /* ══════════════════════════════════════════════
     SPLIT INTERACTION
  ══════════════════════════════════════════════ */
  function handleNodeClick(col, node) {
    if (col.key === 'outcome') return;
    if (splitState && splitState.nodeId === node.id) { collapseSplit(); return; }
    if (splitState) collapseSplit(true);
    computeAndRenderSplit(col, node);
  }

  function computeAndRenderSplit(col, node) {
    var total  = rawData.length;
    var availH = H - PAD.top - PAD.bottom;
    var availW = W - PAD.left - PAD.right;
    var colGap = availW / (COLUMNS.length - 1);

    var nodeRows = rawData.filter(function(d){ return d._cats[col.ci] === node.name; });
    var yesRows  = nodeRows.filter(function(d){ return activeFactor.fn(d); });
    var noRows   = nodeRows.filter(function(d){ return !activeFactor.fn(d); });
    var nodeTot  = nodeRows.length;
    var yesFrac  = yesRows.length / nodeTot;

    var yesH = (availH - SPLIT_GAP) * yesFrac;
    var noH  = (availH - SPLIT_GAP) * (1 - yesFrac);
    var yesY = PAD.top;
    var noY  = PAD.top + yesH + SPLIT_GAP;

    var splitCols = [];
    for (var ci2 = col.ci + 1; ci2 < COLUMNS.length; ci2++) {
      var colDef  = COLUMNS[ci2];
      var yesGrp  = {}, noGrp = {};
      yesRows.forEach(function(d){ var c=d._cats[ci2]; if(!yesGrp[c]) yesGrp[c]=[]; yesGrp[c].push(d); });
      noRows.forEach(function(d){  var c=d._cats[ci2]; if(!noGrp[c])  noGrp[c]=[]; noGrp[c].push(d); });

      var yesNodes = makeSplitNodes(colDef, yesGrp, yesRows.length, yesY, yesH, ci2, 'yes');
      var noNodes  = makeSplitNodes(colDef, noGrp,  noRows.length,  noY,  noH,  ci2, 'no');

      splitCols.push({ key:colDef.key, label:colDef.label, ci:ci2,
                       x: PAD.left + ci2 * colGap, yesNodes:yesNodes, noNodes:noNodes });
    }

    var yesDefaults = d3.sum(yesRows, function(d){ return d.Default; });
    var noDefaults  = d3.sum(noRows,  function(d){ return d.Default; });
    var yesRate = yesRows.length ? yesDefaults / yesRows.length * 100 : 0;
    var noRate  = noRows.length  ? noDefaults  / noRows.length  * 100 : 0;

    var sLinks = buildSplitLinks(col, node, yesRows, noRows, splitCols, yesFrac, total, availH);

    /* pre-partition links by side for fast particle spawning */
    var yesLinks = sLinks.filter(function(l){ return l.side === 'yes'; });
    var noLinks  = sLinks.filter(function(l){ return l.side === 'no'; });
    var yesTotalW = d3.sum(yesLinks, function(l){ return l.w; });
    var noTotalW  = d3.sum(noLinks,  function(l){ return l.w; });

    splitState = { ci:col.ci, nodeId:node.id, col:col, node:node,
                   yesRows:yesRows, noRows:noRows, yesFrac:yesFrac,
                   yesH:yesH, noH:noH, yesY:yesY, noY:noY,
                   yesRate:yesRate, noRate:noRate,
                   splitCols:splitCols, sLinks:sLinks,
                   yesLinks:yesLinks, noLinks:noLinks,
                   yesTotalW:yesTotalW, noTotalW:noTotalW };

    linksG.selectAll('path').transition().duration(250)
      .attr('opacity', function(d){ return d.ci >= col.ci ? 0.03 : 0.18; });
    nodesG.selectAll('.node-g').each(function(){
      var nodeId  = this.id.replace('node-', '');
      var nodeObj = findNodeById(nodeId);
      if (nodeObj && nodeObj.colIndex > col.ci)
        d3.select(this).transition().duration(250).attr('opacity', 0.06);
    });

    renderSplitOverlay();
    updateSidebar(node);
  }

  function makeSplitNodes(colDef, groups, groupTotal, startY, regionH, ci, side) {
    var nodes = colDef.order
      .filter(function(name){ return groups[name] && groups[name].length > 0; })
      .map(function(name){
        var rows = groups[name];
        var def  = d3.sum(rows, function(d){ return d.Default; });
        return { id:colDef.key+'__'+name+'__'+side, name:name, col:colDef.key, ci:ci, side:side,
                 count:rows.length, defaultRate: rows.length ? def/rows.length*100 : 0 };
      });

    var usableH = Math.max(0, regionH - NODE_PAD * (nodes.length - 1));
    var y = startY;
    nodes.forEach(function(n){
      n.h     = Math.max(4, n.count / groupTotal * usableH);
      n.y     = y;
      n._outY = y;
      n._inY  = y;
      y += n.h + NODE_PAD;
    });
    return nodes;
  }

  function buildSplitLinks(clickedCol, clickedNode, yesRows, noRows, splitCols, yesFrac, total, availH) {
    var links = [];
    if (!splitCols.length) return links;

    var yesOutY = clickedNode.y;
    var noOutY  = clickedNode.y + clickedNode.h * yesFrac;

    var first = splitCols[0];
    first.yesNodes.forEach(function(n){ n._inY = n.y; });
    first.noNodes.forEach(function(n){  n._inY = n.y; });

    var yF={}, nF={};
    yesRows.forEach(function(d){ var k=d._cats[first.ci]; yF[k]=(yF[k]||0)+1; });
    noRows.forEach(function(d){  var k=d._cats[first.ci]; nF[k]=(nF[k]||0)+1; });

    first.yesNodes.forEach(function(nB){
      var cnt=yF[nB.name]||0; if(!cnt) return;
      var w=Math.max(1.5, cnt/total*availH*0.86);
      links.push({ id:'sy0'+nB.name, side:'yes',
                   x0:clickedCol.x+NODE_W/2+2, x1:first.x-NODE_W/2-2,
                   y0:yesOutY+w/2, y1:nB._inY+w/2, w:w, defaultRate:nB.defaultRate });
      yesOutY += w; nB._inY += w;
    });
    first.noNodes.forEach(function(nB){
      var cnt=nF[nB.name]||0; if(!cnt) return;
      var w=Math.max(1.5, cnt/total*availH*0.86);
      links.push({ id:'sn0'+nB.name, side:'no',
                   x0:clickedCol.x+NODE_W/2+2, x1:first.x-NODE_W/2-2,
                   y0:noOutY+w/2, y1:nB._inY+w/2, w:w, defaultRate:nB.defaultRate });
      noOutY += w; nB._inY += w;
    });

    for (var i = 0; i < splitCols.length - 1; i++) {
      var from = splitCols[i], to = splitCols[i+1];
      to.yesNodes.forEach(function(n){ n._inY = n.y; });
      to.noNodes.forEach(function(n){  n._inY = n.y; });
      addGroupLinks(yesRows, from, to, 'yes', i+1, total, availH, links);
      addGroupLinks(noRows,  from, to, 'no',  i+1, total, availH, links);
    }
    return links;
  }

  function addGroupLinks(rows, fromSC, toSC, side, step, total, availH, links) {
    var fromNodes = side==='yes' ? fromSC.yesNodes : fromSC.noNodes;
    var toNodes   = side==='yes' ? toSC.yesNodes   : toSC.noNodes;
    var fm = {};
    rows.forEach(function(d){
      var k = d._cats[fromSC.ci]+'|||'+d._cats[toSC.ci];
      fm[k] = (fm[k]||0) + 1;
    });
    fromNodes.forEach(function(nA){
      toNodes.forEach(function(nB){
        var cnt = fm[nA.name+'|||'+nB.name]||0; if(!cnt) return;
        var w = Math.max(1.5, cnt/total*availH*0.86);
        links.push({ id:'s'+side+step+nA.name+nB.name, side:side,
                     x0:fromSC.x+NODE_W/2+2, x1:toSC.x-NODE_W/2-2,
                     y0:nA._outY+w/2, y1:nB._inY+w/2, w:w, defaultRate:nB.defaultRate });
        nA._outY += w; nB._inY += w;
      });
    });
  }

  /* ── Render split overlay ─────────────────────── */
  function renderSplitOverlay() {
    splitG.selectAll('*').remove();
    var s = splitState;
    var node = s.node, col = s.col;

    /* separator line */
    var sepY   = s.noY - SPLIT_GAP / 2;
    var leftX  = col.x - NODE_W/2;
    var rightX = colData[colData.length-1].x + NODE_W/2 + 55;

    splitG.append('line')
      .attr('x1', leftX).attr('x2', rightX).attr('y1', sepY).attr('y2', sepY)
      .attr('stroke', '#58a6ff').attr('stroke-width', 1.5)
      .attr('stroke-dasharray', '6,4').attr('opacity', 0)
      .transition().duration(500).attr('opacity', 0.5);

    /* region labels */
    var labelX = col.x + NODE_W/2 + 10;

    splitG.append('text')
      .attr('x', labelX).attr('y', s.yesY + s.yesH * 0.5)
      .attr('dominant-baseline','middle').attr('font-size',12).attr('font-weight',700)
      .attr('fill','#79c0ff').attr('font-family','inherit').attr('opacity',0)
      .text('↑ ' + activeFactor.yesLabel)
      .transition().delay(200).duration(350).attr('opacity', 1);

    splitG.append('text')
      .attr('x', labelX).attr('y', s.noY + s.noH * 0.5)
      .attr('dominant-baseline','middle').attr('font-size',12).attr('font-weight',700)
      .attr('fill','#ff7b72').attr('font-family','inherit').attr('opacity',0)
      .text('↓ ' + activeFactor.noLabel)
      .transition().delay(200).duration(350).attr('opacity', 1);

    /* split clicked node */
    var nx   = col.x - NODE_W/2;
    var topH = node.h * s.yesFrac;
    var botH = node.h * (1 - s.yesFrac);

    splitG.append('rect')
      .attr('x',nx).attr('y',node.y).attr('width',NODE_W).attr('rx',4)
      .attr('fill','#1a4a7a').attr('stroke','#58a6ff').attr('stroke-width',2)
      .attr('height',0)
      .transition().duration(420).ease(d3.easeCubicOut).attr('height', topH);

    splitG.append('rect')
      .attr('x',nx).attr('y',node.y+topH).attr('width',NODE_W).attr('rx',4)
      .attr('fill','#4a200a').attr('stroke','#f85149').attr('stroke-width',2)
      .attr('height',0)
      .transition().duration(420).ease(d3.easeCubicOut).attr('height', botH);

    /* split links */
    s.sLinks.forEach(function(lk, i) {
      var clr = lk.side==='yes' ? '#58a6ff' : '#f85149';
      var mx  = (lk.x0+lk.x1)/2;
      splitG.append('path')
        .attr('fill','none').attr('stroke',clr).attr('stroke-width',lk.w)
        .attr('d','M'+lk.x0+','+lk.y0+' C'+mx+','+lk.y0+' '+mx+','+lk.y1+' '+lk.x1+','+lk.y1)
        .attr('opacity',0)
        .transition().delay(Math.min(i*1.5,180)).duration(380).attr('opacity',0.3);
    });

    /* split nodes */
    s.splitCols.forEach(function(sc) {
      var sepLineY = s.noY - SPLIT_GAP/2;
      splitG.append('line')
        .attr('x1',sc.x-NODE_W/2-4).attr('x2',sc.x+NODE_W/2+4)
        .attr('y1',sepLineY).attr('y2',sepLineY)
        .attr('stroke','#58a6ff').attr('stroke-width',1.5).attr('stroke-dasharray','4,3')
        .attr('opacity',0).transition().duration(400).attr('opacity',0.4);

      ['yes','no'].forEach(function(side) {
        var nodes = side==='yes' ? sc.yesNodes : sc.noNodes;
        var clr   = side==='yes' ? '#58a6ff'   : '#f85149';
        var bg    = side==='yes' ? '#1a3a4a'   : '#3d1a1a';

        nodes.forEach(function(n) {
          if (n.h < 3) return;
          splitG.append('rect')
            .attr('x',sc.x-NODE_W/2).attr('y',n.y)
            .attr('width',NODE_W).attr('height',n.h).attr('rx',3)
            .attr('fill',bg).attr('stroke',clr).attr('stroke-width',1)
            .attr('opacity',0).transition().duration(400).attr('opacity',0.88);

          if (n.h > 13) {
            splitG.append('text')
              .attr('x',sc.x).attr('y',n.y+n.h/2)
              .attr('text-anchor','middle').attr('dominant-baseline','middle')
              .attr('font-size',Math.min(10,n.h*0.45)).attr('fill',clr)
              .attr('pointer-events','none')
              .text(n.h > 20 ? n.name : '')
              .attr('opacity',0).transition().delay(200).duration(300).attr('opacity',1);
          }
        });
      });
    });

    /* outcome default-rate labels + difference badge */
    var lastSC = s.splitCols[s.splitCols.length-1];
    if (lastSC && lastSC.key === 'outcome') {
      var yDefNode = lastSC.yesNodes.find(function(n){ return n.name==='Defaulted'; });
      var nDefNode = lastSC.noNodes.find(function(n){  return n.name==='Defaulted'; });
      var ox = lastSC.x + NODE_W/2 + 10;

      if (yDefNode && yDefNode.h > 4) {
        splitG.append('text')
          .attr('x', ox).attr('y', yDefNode.y + yDefNode.h/2)
          .attr('dominant-baseline','middle').attr('font-size',13).attr('font-weight',800)
          .attr('fill','#79c0ff').attr('font-family','inherit').attr('opacity',0)
          .text(s.yesRate.toFixed(1)+'%')
          .transition().delay(450).duration(350).attr('opacity',1);
      }
      if (nDefNode && nDefNode.h > 4) {
        splitG.append('text')
          .attr('x', ox).attr('y', nDefNode.y + nDefNode.h/2)
          .attr('dominant-baseline','middle').attr('font-size',13).attr('font-weight',800)
          .attr('fill','#ff7b72').attr('font-family','inherit').attr('opacity',0)
          .text(s.noRate.toFixed(1)+'%')
          .transition().delay(450).duration(350).attr('opacity',1);
      }

      var diff = s.noRate - s.yesRate;
      if (Math.abs(diff) > 0.1) {
        var midY = (s.yesY + s.yesH/2 + s.noY + s.noH/2) / 2;
        var dc   = diff > 0 ? '#3fb950' : '#f85149';

        splitG.append('rect')
          .attr('x',ox-2).attr('y',midY-14).attr('width',68).attr('height',28).attr('rx',6)
          .attr('fill','#1c2128').attr('stroke',dc).attr('stroke-width',1.5)
          .attr('opacity',0).transition().delay(600).duration(300).attr('opacity',1);

        splitG.append('text')
          .attr('x',ox+32).attr('y',midY)
          .attr('text-anchor','middle').attr('dominant-baseline','middle')
          .attr('font-size',14).attr('font-weight',800)
          .attr('fill',dc).attr('font-family','inherit').attr('opacity',0)
          .text((diff>0?'↓':'↑')+Math.abs(diff).toFixed(1)+'%')
          .transition().delay(650).duration(300).attr('opacity',1);
      }
    }
  }

  /* ── Collapse ─────────────────────────────────── */
  function collapseSplit(instant) {
    if (!splitState) return;
    if (instant) {
      splitG.selectAll('*').remove();
    } else {
      splitG.selectAll('*').transition().duration(250).attr('opacity',0);
      setTimeout(function(){ splitG.selectAll('*').remove(); }, 260);
    }
    linksG.selectAll('path').transition().duration(instant?0:250).attr('opacity',0.18);
    nodesG.selectAll('.node-g').transition().duration(instant?0:250).attr('opacity',1);
    splitState = null;
    clearSidebar();
  }

  /* ══════════════════════════════════════════════
     PARTICLES
  ══════════════════════════════════════════════ */
  function startParticles() {
    var lastT = 0;
    function tick(ts) {
      var dt = Math.min(50, ts - lastT); lastT = ts;

      if (Math.random() < 0.55 * pSpeed) {
        var pool = baseLinks.filter(function(lk){
          return !splitState || lk.ci < splitState.ci;
        });
        if (pool.length) {
          var lk = pool[Math.floor(Math.random()*pool.length)];
          particles.push({ lk:lk, t:0, spd:(0.0026+Math.random()*0.0032)*pSpeed,
                           r:1.7+Math.random()*1.8, off:(Math.random()-0.5)*lk.w*0.44, split:false });
        }
      }

      if (splitState && splitState.sLinks.length) {
        /* Spawn one particle per side per frame (guaranteed), sized by that side's share of total flow.
           Bigger share → more particles this tick AND larger radius → immediately visible difference. */
        var ss      = splitState;
        var bothW   = ss.yesTotalW + ss.noTotalW;
        var sides   = [
          { pool: ss.yesLinks, poolW: ss.yesTotalW, color: 'yes' },
          { pool: ss.noLinks,  poolW: ss.noTotalW,  color: 'no'  }
        ];

        sides.forEach(function(s) {
          if (!s.pool.length) return;
          /* fraction ∈ (0,1): how much of total flow this side carries */
          var frac = s.poolW / bothW;
          /* spawn count: guaranteed 1, occasionally 2 for the dominant side */
          var count = Math.random() < frac * 2 * pSpeed ? 2 : 1;
          for (var k = 0; k < count; k++) {
            if (Math.random() > pSpeed * 0.9) continue;
            /* pick link within side, weighted by width */
            var rw = Math.random() * s.poolW, cum2 = 0, slk = s.pool[s.pool.length-1];
            for (var j = 0; j < s.pool.length; j++) {
              cum2 += s.pool[j].w;
              if (rw <= cum2) { slk = s.pool[j]; break; }
            }
            /* radius: aggressively scaled — dominant side dots are noticeably larger */
            var r = Math.min(6, Math.max(0.8, (1.2 + Math.random() * 2.0) * Math.pow(frac * 2, 1.2)));
            particles.push({ slk:slk, t:0, spd:(0.0024+Math.random()*0.003)*pSpeed,
                             r:r, off:(Math.random()-0.5)*slk.w*0.35, split:true });
          }
        });
      }

      particles.forEach(function(p){ p.t += p.spd * (dt/16); });
      particles = particles.filter(function(p){ return p.t < 1; });

      particlesG.selectAll('circle').data(particles).join('circle')
        .attr('r',    function(p){ return p.r; })
        .attr('cx',   function(p){ return p.split ? spx(p) : bpx(p); })
        .attr('cy',   function(p){ return p.split ? spy(p) : bpy(p); })
        .attr('fill', function(p){
          if (p.split) return p.slk.side==='yes' ? '#58a6ff' : '#f85149';
          return riskColor(p.lk.defaultRate);
        })
        .attr('opacity', function(p){ return Math.min(p.t*6,(1-p.t)*6,1)*0.85; });

      animId = requestAnimationFrame(tick);
    }
    animId = requestAnimationFrame(tick);
  }

  function bpx(p) {
    var xA=p.lk.colA.x+NODE_W/2+2, xB=p.lk.colB.x-NODE_W/2-2, mx=(xA+xB)/2, t=p.t;
    return (1-t)*(1-t)*xA + 2*(1-t)*t*mx + t*t*xB;
  }
  function bpy(p) {
    var xA=p.lk.colA.x+NODE_W/2+2, xB=p.lk.colB.x-NODE_W/2-2, mx=(xA+xB)/2, t=p.t;
    var by=(1-t)*(1-t)*p.lk.y0 + 2*(1-t)*t*((p.lk.y0+p.lk.y1)/2) + t*t*p.lk.y1;
    return by + p.off*Math.sin(t*Math.PI);
  }
  function spx(p) {
    var mx=(p.slk.x0+p.slk.x1)/2, t=p.t;
    return (1-t)*(1-t)*p.slk.x0 + 2*(1-t)*t*mx + t*t*p.slk.x1;
  }
  function spy(p) {
    var mx=(p.slk.x0+p.slk.x1)/2, t=p.t;
    var by=(1-t)*(1-t)*p.slk.y0 + 2*(1-t)*t*((p.slk.y0+p.slk.y1)/2) + t*t*p.slk.y1;
    return by + p.off*Math.sin(t*Math.PI);
  }

  /* ══════════════════════════════════════════════
     CONTROLS
  ══════════════════════════════════════════════ */
  function bindControls() {
    document.querySelectorAll('.factor-btn').forEach(function(btn) {
      btn.addEventListener('click', function() {
        document.querySelectorAll('.factor-btn').forEach(function(b){ b.classList.remove('active'); });
        this.classList.add('active');
        var k = this.dataset.factor;
        activeFactor = FACTORS.find(function(f){ return f.key===k; }) || FACTORS[0];
        if (splitState) {
          var c = splitState.col, n = splitState.node;
          collapseSplit(true);
          setTimeout(function(){ computeAndRenderSplit(c, n); }, 50);
        }
      });
    });

    var sp = document.getElementById('river-speed');
    if (sp) sp.addEventListener('input', function(){ pSpeed = +this.value; });

    var rb = document.getElementById('river-reset');
    if (rb) rb.addEventListener('click', function(){ collapseSplit(); });
  }

  /* ══════════════════════════════════════════════
     SIDEBAR
  ══════════════════════════════════════════════ */
  function updateSidebar(node) {
    var el = document.getElementById('river-lens-detail');
    if (!el || !splitState) return;
    var s    = splitState;
    var diff = s.noRate - s.yesRate;
    var dc   = diff > 0 ? '#3fb950' : '#f85149';

    el.innerHTML =
      '<div class="ld-node">' + node.name + '</div>' +
      '<div class="ld-factor">Factor: ' + activeFactor.label + '</div>' +
      '<div class="ld-row">' +
        '<span class="ld-dot" style="background:#58a6ff"></span>' +
        '<span class="ld-name">' + activeFactor.yesLabel + '</span>' +
        '<span class="ld-val" style="color:#79c0ff">' + s.yesRate.toFixed(2) + '%</span>' +
        '<span class="ld-n">(' + (s.yesRows.length/1000).toFixed(0) + 'k)</span>' +
      '</div>' +
      '<div class="ld-row">' +
        '<span class="ld-dot" style="background:#f85149"></span>' +
        '<span class="ld-name">' + activeFactor.noLabel + '</span>' +
        '<span class="ld-val" style="color:#ff7b72">' + s.noRate.toFixed(2) + '%</span>' +
        '<span class="ld-n">(' + (s.noRows.length/1000).toFixed(0) + 'k)</span>' +
      '</div>' +
      '<div class="ld-diff">Difference: <b style="color:' + dc + '">' + (diff>0?'+':'') + diff.toFixed(2) + '%</b></div>' +
      '<div class="ld-insight">' + insightText(node, diff) + '</div>' +
      '<div class="ld-hint" style="margin-top:10px;opacity:0.6;font-size:11px;">Click node again to collapse</div>';
  }

  function insightText(node, diff) {
    if (diff > 0.5) return 'Even within the <b>' + node.name + '</b> group, ' + activeFactor.yesLabel + ' borrowers default ' + diff.toFixed(1) + '% less. Responsibility acts as a protective factor across every segment.';
    if (diff > 0)   return 'Consistent direction (' + diff.toFixed(1) + '% gap). Try clicking other nodes.';
    return 'Difference is small here — try another node.';
  }

  function clearSidebar() {
    var el = document.getElementById('river-lens-detail');
    if (el) el.innerHTML = '<div class="ld-hint">Click any node to<br>bifurcate the river by factor<br>and compare default rates<br><b style="color:#58a6ff">side by side</b>.</div>';
  }

  /* ── HELPERS ─────────────────────────────────── */
  function findNodeById(id) {
    for (var ci=0; ci<colData.length; ci++)
      for (var ni=0; ni<colData[ci].nodes.length; ni++)
        if (colData[ci].nodes[ni].id === id) return colData[ci].nodes[ni];
    return null;
  }
  function riskColor(pct) { return d3.interpolateRgb('#3fb950','#f85149')(Math.min(1,Math.max(0,pct/25))); }
  function nodeColor(pct) { return d3.interpolateRgb('#1a3d2b','#5c1c1a')(Math.min(1,Math.max(0,pct/25))); }
  function lkPath(lk) {
    var xA=lk.colA.x+NODE_W/2+2, xB=lk.colB.x-NODE_W/2-2, mx=(xA+xB)/2;
    return 'M'+xA+','+lk.y0+' C'+mx+','+lk.y0+' '+mx+','+lk.y1+' '+xB+','+lk.y1;
  }
  function tip(event, html) {
    var el=document.getElementById('tooltip'); if(!el) return;
    el.innerHTML=html; el.classList.add('show'); moveTip(event);
  }
  function moveTip(event) {
    var el=document.getElementById('tooltip'); if(!el) return;
    var x=event.clientX+14, y=event.clientY-14;
    if(x+230>window.innerWidth) x=event.clientX-230;
    el.style.left=x+'px'; el.style.top=y+'px';
  }
  function hideTip(){ var el=document.getElementById('tooltip'); if(el) el.classList.remove('show'); }

  return { init: init };
})();

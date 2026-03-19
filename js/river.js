/* ================================================
   DEFAULT RIVER — Animated Sankey Flow
   ================================================ */

class DefaultRiver {
  constructor(containerId, data, onSelectionChange) {
    this.container  = document.getElementById(containerId).parentElement;
    this.svgEl      = document.getElementById(containerId);
    this.svg        = d3.select('#' + containerId);
    this.rawData    = data;
    this.catData    = data.map(categorize);
    this.onSelChange = onSelectionChange || (() => {});

    // Column order (can be rearranged by drag)
    this.colOrder = ['ageGroup', 'incomeGroup', 'creditGroup', 'loanGroup', 'outcome'];
    this.colLabels = {
      ageGroup:    '年龄段',
      incomeGroup: '收入层级',
      creditGroup: '信用评分',
      loanGroup:   '贷款规模',
      outcome:     '结果'
    };

    // Category sort orders
    this.sortOrder = {
      ageGroup:    ['青年 <30','中年 30-45','壮年 45-60','老年 60+'],
      incomeGroup: ['低 <3.5万','中 3.5-6.5万','高 6.5-11万','极高 11万+'],
      creditGroup: ['差 <580','一般 580-670','良 670-740','优 740+'],
      loanGroup:   ['小额 <8k','中额 8-22k','大额 22k+'],
      outcome:     ['正常还款','违约']
    };

    // Selection state: set of "col:value" strings
    this.activeNodes = new Set();

    // Particles
    this.particles   = [];
    this.particleSpeed = 1.0;
    this.animId      = null;
    this.lastTs      = 0;

    // Drag-to-reorder state
    this._dragCol = null;

    this._init();
  }

  _init() {
    this._resize();
    this.svg.append('g').attr('class', 'links-g');
    this.svg.append('g').attr('class', 'nodes-g');
    this.svg.append('g').attr('class', 'particles-g');
    this.svg.append('g').attr('class', 'headers-g');

    this._compute();
    this._render();
    this._startParticles();

    // Resize observer
    const ro = new ResizeObserver(() => {
      this._resize();
      this._compute();
      this._render();
    });
    ro.observe(this.svgEl);
  }

  _resize() {
    const rect = this.svgEl.getBoundingClientRect();
    this.W = rect.width  || 800;
    this.H = rect.height || 480;
    this.svg.attr('viewBox', `0 0 ${this.W} ${this.H}`);
  }

  // ---- Build Sankey graph data ----
  _compute() {
    const { W, H, catData, colOrder } = this;
    const PAD = { top: 58, bottom: 20, left: 28, right: 28 };
    const availH = H - PAD.top - PAD.bottom;
    const colGap  = (W - PAD.left - PAD.right) / (colOrder.length - 1);
    const NODE_GAP = 10;

    // Build per-column node info
    this.cols = colOrder.map((key, ci) => {
      const groups = d3.group(catData, d => d[key]);
      const total  = catData.length;
      let cats = [...groups.entries()].map(([name, items]) => ({
        name, count: items.length,
        defaultCount: items.filter(d => d.default === 1).length,
        defaultRate:  items.filter(d => d.default === 1).length / items.length,
        col: key, ci
      }));

      // Sort
      const order = this.sortOrder[key];
      if (order) cats.sort((a, b) => order.indexOf(a.name) - order.indexOf(b.name));

      // Assign y positions
      const totalH = availH - NODE_GAP * (cats.length - 1);
      let y = PAD.top;
      cats.forEach(c => {
        c.h = Math.max(6, (c.count / total) * totalH);
        c.y = y;
        c.cy = y + c.h / 2;
        y += c.h + NODE_GAP;
        c._outY = c.y;
        c._inY  = c.y;
      });

      return { key, label: this.colLabels[key], ci, x: PAD.left + ci * colGap, cats };
    });

    // Build links
    this.links = [];
    for (let ci = 0; ci < colOrder.length - 1; ci++) {
      const colA = this.cols[ci];
      const colB = this.cols[ci + 1];
      const flows = new Map();

      catData.forEach(d => {
        const a = d[colA.key], b = d[colB.key];
        const key = a + '|||' + b;
        if (!flows.has(key)) flows.set(key, { count: 0, def: 0 });
        const f = flows.get(key);
        f.count++;
        if (d.default === 1) f.def++;
      });

      flows.forEach((f, key) => {
        const [nameA, nameB] = key.split('|||');
        const nA = colA.cats.find(c => c.name === nameA);
        const nB = colB.cats.find(c => c.name === nameB);
        if (!nA || !nB) return;

        const totalFlow = catData.length;
        const w = Math.max(1.5, (f.count / totalFlow) * (availH * 0.9));

        const y0 = nA._outY + w / 2;
        nA._outY += w;
        const y1 = nB._inY + w / 2;
        nB._inY += w;

        this.links.push({
          colA, colB, nameA, nameB, nA, nB,
          count: f.count,
          defaultRate: f.def / f.count,
          w, y0, y1
        });
      });
    }
  }

  // ---- Path for a link ----
  _linkPath(lk) {
    const xA = lk.colA.x + 22;
    const xB = lk.colB.x - 22;
    const mx = (xA + xB) / 2;
    return `M${xA},${lk.y0} C${mx},${lk.y0} ${mx},${lk.y1} ${xB},${lk.y1}`;
  }

  // ---- Render ----
  _render() {
    const self = this;

    // --- Links ---
    const linksG = this.svg.select('.links-g');
    linksG.selectAll('path').data(this.links, (d, i) => i)
      .join(
        enter => enter.append('path')
          .attr('class', 's-link')
          .attr('d', d => this._linkPath(d))
          .attr('stroke', d => riskColor(d.defaultRate))
          .attr('stroke-width', d => d.w)
          .attr('opacity', 0.22),
        update => update.transition().duration(400)
          .attr('d', d => this._linkPath(d))
          .attr('stroke', d => riskColor(d.defaultRate))
          .attr('stroke-width', d => d.w)
      )
      .on('mouseover', function(event, d) {
        d3.select(this).attr('opacity', 0.6);
        showTip(event,
          `<b>${d.nameA} → ${d.nameB}</b><br>` +
          `人数: ${d.count}<br>` +
          `违约率: <span class="tt-warn">${(d.defaultRate * 100).toFixed(1)}%</span>`
        );
      })
      .on('mousemove', moveTip)
      .on('mouseout', function() {
        d3.select(this).attr('opacity', d => self._linkOpacity(d));
        hideTip();
      });

    // --- Nodes ---
    const nodesG = this.svg.select('.nodes-g');
    nodesG.selectAll('.s-node-g').remove();

    this.cols.forEach(col => {
      col.cats.forEach(cat => {
        const g = nodesG.append('g')
          .attr('class', 's-node-g')
          .attr('transform', `translate(${col.x - 22}, ${cat.y})`)
          .style('cursor', 'pointer')
          .on('click', () => this._toggleNode(col.key, cat.name))
          .on('mouseover', (event) => {
            showTip(event,
              `<b>${cat.name}</b><br>` +
              `人数: ${cat.count}<br>` +
              `违约率: <span class="tt-warn">${(cat.defaultRate * 100).toFixed(1)}%</span>`
            );
          })
          .on('mousemove', moveTip)
          .on('mouseout', hideTip);

        g.append('rect')
          .attr('width', 44).attr('height', Math.max(6, cat.h)).attr('rx', 4)
          .attr('fill', riskColor(cat.defaultRate)).attr('opacity', 0.85)
          .attr('id', `node-${col.key}-${cat.name.replace(/\s/g, '_')}`);

        if (cat.h > 14) {
          g.append('text')
            .attr('x', 22).attr('y', cat.h / 2 + 1)
            .attr('text-anchor', 'middle').attr('dominant-baseline', 'middle')
            .attr('font-size', Math.min(10, cat.h * 0.55))
            .attr('fill', '#e6edf3')
            .text(cat.h > 20 ? cat.name : '');
        }
      });
    });

    // --- Column headers (draggable) ---
    this._renderHeaders();
  }

  _renderHeaders() {
    const self = this;
    const headersG = this.svg.select('.headers-g');
    headersG.selectAll('*').remove();

    this.cols.forEach((col, ci) => {
      const g = headersG.append('g')
        .attr('class', 's-col-label')
        .attr('transform', `translate(${col.x}, 14)`)
        .datum(ci);

      g.append('rect')
        .attr('x', -36).attr('y', -10)
        .attr('width', 72).attr('height', 36).attr('rx', 5)
        .attr('fill', '#21262d').attr('stroke', '#30363d');

      g.append('text')
        .attr('text-anchor', 'middle').attr('y', 6)
        .attr('font-size', 12).attr('font-weight', '600').attr('fill', '#58a6ff')
        .text(col.label);

      g.append('text')
        .attr('text-anchor', 'middle').attr('y', 19)
        .attr('font-size', 8.5).attr('fill', '#484f58')
        .text('⇆ 拖拽排序');

      // Drag to reorder
      const drag = d3.drag()
        .on('start', (event) => {
          self._dragCol = ci;
          g.select('rect').attr('stroke', '#58a6ff');
        })
        .on('drag', (event) => {
          g.attr('transform', `translate(${event.x}, 14)`);
        })
        .on('end', (event) => {
          g.select('rect').attr('stroke', '#30363d');
          // Find nearest column
          const x = event.x;
          let nearest = 0;
          let minDist = Infinity;
          self.cols.forEach((c, i) => {
            const d = Math.abs(x - c.x);
            if (d < minDist) { minDist = d; nearest = i; }
          });
          if (nearest !== self._dragCol) {
            // Swap in colOrder
            const arr = self.colOrder;
            [arr[self._dragCol], arr[nearest]] = [arr[nearest], arr[self._dragCol]];
            self._compute();
            self._render();
          } else {
            self._renderHeaders();
          }
          self._dragCol = null;
        });

      g.call(drag);
    });
  }

  // ---- Filter / Selection ----
  _toggleNode(colKey, name) {
    const k = colKey + ':' + name;
    if (this.activeNodes.has(k)) {
      this.activeNodes.delete(k);
    } else {
      this.activeNodes.add(k);
    }
    this._applySelection();
  }

  _applySelection() {
    const active = this.activeNodes;
    const self = this;

    if (active.size === 0) {
      this.svg.select('.links-g').selectAll('path').attr('opacity', 0.22);
      this.svg.select('.nodes-g').selectAll('rect').attr('opacity', 0.85);
      this.onSelChange(null);
      return;
    }

    // Filter data
    const filtered = this.catData.filter(d => {
      for (const k of active) {
        const [col, name] = k.split(':');
        if (d[col] !== name) return false;
      }
      return true;
    });

    // Links: highlight if both endpoints share a selected node OR are on the path
    this.svg.select('.links-g').selectAll('path')
      .attr('opacity', function(d) { return self._linkOpacity(d); });

    // Nodes: dim unrelated
    this.svg.select('.nodes-g').selectAll('.s-node-g').each(function(_, i) {
      // not easy to rebind — just set via rect attr
    });

    this.onSelChange(filtered);
  }

  _linkOpacity(d) {
    if (this.activeNodes.size === 0) return 0.22;
    const kA = d.colA.key + ':' + d.nameA;
    const kB = d.colB.key + ':' + d.nameB;
    if (this.activeNodes.has(kA) || this.activeNodes.has(kB)) return 0.65;
    return 0.04;
  }

  reset() {
    this.activeNodes.clear();
    this._applySelection();
  }

  // ---- Particle Animation ----
  _startParticles() {
    const self = this;
    function tick(ts) {
      self.animId = requestAnimationFrame(tick);
      const dt = Math.min(60, ts - self.lastTs);
      self.lastTs = ts;

      // Spawn
      const rate = self.particleSpeed;
      if (Math.random() < 0.5 * rate) {
        const lk = self.links[Math.floor(Math.random() * self.links.length)];
        if (lk) {
          self.particles.push({
            lk, t: 0,
            speed: (0.0028 + Math.random() * 0.003) * rate,
            r: 1.5 + Math.random() * 2,
            off: (Math.random() - 0.5) * lk.w * 0.45
          });
        }
      }

      // Update & cull
      self.particles.forEach(p => { p.t += p.speed * (dt / 16); });
      self.particles = self.particles.filter(p => p.t < 1);

      // Draw
      self.svg.select('.particles-g').selectAll('circle')
        .data(self.particles)
        .join('circle')
        .attr('r', d => d.r)
        .attr('cx', d => self._particleX(d))
        .attr('cy', d => self._particleY(d))
        .attr('fill', d => riskColor(d.lk.defaultRate))
        .attr('opacity', d => {
          const fade = Math.min(d.t * 6, (1 - d.t) * 6, 1);
          return fade * 0.9;
        });
    }
    requestAnimationFrame(tick);
  }

  _particleX(p) {
    const xA = p.lk.colA.x + 22;
    const xB = p.lk.colB.x - 22;
    const mx = (xA + xB) / 2;
    const t  = p.t;
    return (1-t)*(1-t)*xA + 2*(1-t)*t*mx + t*t*xB;
  }

  _particleY(p) {
    const { y0, y1 } = p.lk;
    const xA = p.lk.colA.x + 22;
    const xB = p.lk.colB.x - 22;
    const mx = (xA + xB) / 2;
    const t  = p.t;
    // Quadratic bezier y (control point same y as start for a horizontal pull)
    const baseY = (1-t)*(1-t)*y0 + 2*(1-t)*t*((y0+y1)/2) + t*t*y1;
    return baseY + p.off * Math.sin(t * Math.PI);
  }

  setParticleSpeed(v) { this.particleSpeed = +v; }
}

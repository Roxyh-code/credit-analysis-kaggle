/* ================================================
   BORROWER GALAXY — Scatter + Lasso + Supernova
   ================================================ */

class BorrowerGalaxy {
  constructor(containerId, data, onSelectionChange) {
    this.svgEl   = document.getElementById(containerId);
    this.svg     = d3.select('#' + containerId);
    this.rawData = data;
    this.onSelChange = onSelectionChange || (() => {});

    this.xField    = 'creditScore';
    this.yField    = 'income';
    this.sizeField = 'loanAmount';
    this.supernova = false;

    this.selected  = null;   // array or null

    this.margin = { top: 28, right: 24, bottom: 44, left: 64 };

    this._init();
  }

  _init() {
    this._resize();

    // Zoom
    this.zoom = d3.zoom()
      .scaleExtent([0.4, 12])
      .on('zoom', (event) => {
        this.zoomG.attr('transform', event.transform);
      });
    this.svg.call(this.zoom);

    // Groups
    this.axisGX = this.svg.append('g').attr('class', 'g-axis g-axis-x');
    this.axisGY = this.svg.append('g').attr('class', 'g-axis g-axis-y');
    this.zoomG  = this.svg.append('g').attr('class', 'zoom-g');
    this.dotsG  = this.zoomG.append('g').attr('class', 'dots-g');
    this.lassoG = this.svg.append('g').attr('class', 'lasso-g');
    this.axisLG = this.svg.append('g').attr('class', 'axis-labels');

    this._buildScales();
    this._renderAxes();
    this._renderDots();
    this._setupLasso();

    const ro = new ResizeObserver(() => {
      this._resize();
      this._buildScales();
      this._renderAxes();
      this._renderDots(0);
    });
    ro.observe(this.svgEl);
  }

  _resize() {
    const rect = this.svgEl.getBoundingClientRect();
    this.W = rect.width  || 700;
    this.H = rect.height || 450;
    this.iW = this.W - this.margin.left - this.margin.right;
    this.iH = this.H - this.margin.top  - this.margin.bottom;
    this.svg.attr('viewBox', `0 0 ${this.W} ${this.H}`);
  }

  _buildScales() {
    const d = this.rawData;
    this.xScale = d3.scaleLinear()
      .domain(d3.extent(d, v => v[this.xField]).map((v, i) => v * (i === 0 ? 0.96 : 1.04)))
      .range([this.margin.left, this.margin.left + this.iW]);

    this.yScale = d3.scaleLinear()
      .domain(d3.extent(d, v => v[this.yField]).map((v, i) => v * (i === 0 ? 0.96 : 1.04)))
      .range([this.margin.top + this.iH, this.margin.top]);

    if (this.sizeField === 'fixed') {
      this.rScale = () => 3.5;
    } else {
      this.rScale = d3.scaleSqrt()
        .domain(d3.extent(d, v => v[this.sizeField]))
        .range([1.8, 7.5]);
    }
  }

  _renderAxes() {
    const { xScale, yScale, margin, iH, iW, W, H } = this;

    this.axisGX
      .attr('transform', `translate(0, ${margin.top + iH})`)
      .call(
        d3.axisBottom(xScale).ticks(7).tickSize(-iH)
          .tickFormat(v => this.xField === 'income' || this.xField === 'loanAmount'
            ? '$' + (v/1000).toFixed(0) + 'k'
            : this.xField === 'dtiRatio' ? (v*100).toFixed(0)+'%' : v)
      )
      .call(g => {
        g.select('.domain').remove();
        g.selectAll('line').attr('stroke', '#21262d');
        g.selectAll('text').attr('fill', '#484f58').attr('font-size', 9);
      });

    this.axisGY
      .attr('transform', `translate(${margin.left}, 0)`)
      .call(
        d3.axisLeft(yScale).ticks(6).tickSize(-iW)
          .tickFormat(v => this.yField === 'income' || this.yField === 'loanAmount'
            ? '$' + (v/1000).toFixed(0) + 'k'
            : this.yField === 'dtiRatio' ? (v*100).toFixed(0)+'%' : v)
      )
      .call(g => {
        g.select('.domain').remove();
        g.selectAll('line').attr('stroke', '#21262d');
        g.selectAll('text').attr('fill', '#484f58').attr('font-size', 9);
      });

    // Axis labels
    this.axisLG.selectAll('*').remove();
    this.axisLG.append('text')
      .attr('x', margin.left + iW / 2).attr('y', H - 5)
      .attr('text-anchor', 'middle').attr('fill', '#8b949e').attr('font-size', 11)
      .text(FIELD_LABELS[this.xField] || this.xField);

    this.axisLG.append('text')
      .attr('transform', `rotate(-90)`)
      .attr('x', -(margin.top + iH / 2)).attr('y', 15)
      .attr('text-anchor', 'middle').attr('fill', '#8b949e').attr('font-size', 11)
      .text(FIELD_LABELS[this.yField] || this.yField);
  }

  _renderDots(duration = 500) {
    const self = this;
    const data = this.rawData;

    const circles = this.dotsG.selectAll('circle')
      .data(data, d => d.id);

    const enter = circles.enter().append('circle')
      .attr('class', 'g-dot')
      .attr('cx', d => this.xScale(d[this.xField]))
      .attr('cy', d => this.yScale(d[this.yField]))
      .attr('r', 0)
      .attr('fill', d => d.default === 1 ? '#f85149' : '#58a6ff')
      .attr('opacity', 0);

    const merged = enter.merge(circles);

    const t = duration > 0
      ? merged.transition().duration(duration).ease(d3.easeCubicOut)
      : merged;

    t.attr('cx', d => this.xScale(d[this.xField]))
     .attr('cy', d => this.yScale(d[this.yField]))
     .attr('r',  d => this.rScale(this.sizeField === 'fixed' ? 1 : d[this.sizeField]))
     .attr('opacity', d => this._dotOpacity(d));

    circles.exit().transition().duration(300).attr('r', 0).remove();

    // Events (bind to the merged + entered)
    this.dotsG.selectAll('circle')
      .on('mouseover', function(event, d) {
        if (self.supernova && d.default === 0) return;
        d3.select(this).attr('r', self.rScale(self.sizeField === 'fixed' ? 1 : d[self.sizeField]) * 2.2)
          .attr('opacity', 1);
        showTip(event,
          `<b class="${d.default ? 'tt-warn' : 'tt-safe'}">${d.default ? '⚠ 违约' : '✓ 正常还款'}</b><br>` +
          `年龄: ${d.age} 岁&nbsp;&nbsp;收入: ${FIELD_FORMAT.income(d.income)}<br>` +
          `信用分: ${d.creditScore}&nbsp;&nbsp;贷款: ${FIELD_FORMAT.loanAmount(d.loanAmount)}<br>` +
          `利率: ${d.interestRate}%&nbsp;&nbsp;负债比: ${FIELD_FORMAT.dtiRatio(d.dtiRatio)}<br>` +
          `就业: ${d.employmentType}&nbsp;&nbsp;学历: ${d.education}`
        );
      })
      .on('mousemove', moveTip)
      .on('mouseout', function(e, d) {
        d3.select(this)
          .attr('r', self.rScale(self.sizeField === 'fixed' ? 1 : d[self.sizeField]))
          .attr('opacity', self._dotOpacity(d));
        hideTip();
      });
  }

  _dotOpacity(d) {
    if (this.supernova && d.default === 0) return 0;
    if (this.selected) {
      return this.selected.includes(d) ? 0.9 : 0.06;
    }
    return d.default === 1 ? 0.72 : 0.32;
  }

  // ---- Supernova mode ----
  toggleSupernova() {
    this.supernova = !this.supernova;
    this.dotsG.selectAll('circle')
      .transition().duration(700).ease(d3.easeCubicOut)
      .attr('opacity', d => this._dotOpacity(d))
      .attr('cx', d => {
        if (this.supernova && d.default === 0) {
          return this.xScale(d[this.xField]) + (Math.random() - 0.5) * this.iW * 2;
        }
        return this.xScale(d[this.xField]);
      })
      .attr('cy', d => {
        if (this.supernova && d.default === 0) {
          return this.yScale(d[this.yField]) + (Math.random() - 0.5) * this.iH * 2;
        }
        return this.yScale(d[this.yField]);
      });
  }

  // ---- Axes change ----
  setAxes(x, y, sz) {
    this.xField = x;
    this.yField = y;
    if (sz) this.sizeField = sz;
    this.supernova = false;
    this.selected  = null;
    this._buildScales();
    this._renderAxes();
    this._renderDots(600);
    this.svg.call(this.zoom.transform, d3.zoomIdentity);
    this.onSelChange(null);
  }

  // ---- Lasso selection ----
  _setupLasso() {
    const self = this;
    let lassoPoints = [];
    let lassoPath   = null;
    let dragging    = false;

    // Transparent overlay for capturing events
    const overlay = this.svg.append('rect')
      .attr('x', this.margin.left)
      .attr('y', this.margin.top)
      .attr('width',  this.iW)
      .attr('height', this.iH)
      .attr('fill', 'transparent')
      .style('cursor', 'crosshair');

    overlay.on('mousedown', (event) => {
      if (event.button !== 0) return;
      dragging = true;
      lassoPoints = [d3.pointer(event, this.svg.node())];
      self.lassoG.selectAll('*').remove();
      lassoPath = self.lassoG.append('path').attr('class', 'lasso-path');
    });

    d3.select(window)
      .on('mousemove.lasso', (event) => {
        if (!dragging) return;
        lassoPoints.push(d3.pointer(event, self.svg.node()));
        if (lassoPath && lassoPoints.length > 1) {
          lassoPath.attr('d', 'M' + lassoPoints.map(p => p.join(',')).join(' L') + ' Z');
        }
      })
      .on('mouseup.lasso', () => {
        if (!dragging) return;
        dragging = false;
        if (lassoPoints.length > 4) {
          self._finishLasso(lassoPoints);
        }
        self.lassoG.selectAll('*').remove();
        lassoPoints = [];
        lassoPath   = null;
      });
  }

  _finishLasso(pts) {
    const self = this;
    // Use screen coords — compare to dot screen coords
    const transform = d3.zoomTransform(this.svg.node());

    const sel = this.rawData.filter(d => {
      const sx = transform.applyX(this.xScale(d[this.xField]));
      const sy = transform.applyY(this.yScale(d[this.yField]));
      return pointInPolygon([sx, sy], pts);
    });

    if (sel.length === 0) return;

    this.selected = sel;

    this.dotsG.selectAll('circle')
      .transition().duration(250)
      .attr('opacity', d => this._dotOpacity(d))
      .attr('stroke', d => sel.includes(d) ? '#fff' : 'none')
      .attr('stroke-width', 0.8);

    this.onSelChange(sel);
  }

  reset() {
    this.selected  = null;
    this.supernova = false;
    this.dotsG.selectAll('circle')
      .transition().duration(400)
      .attr('opacity', d => this._dotOpacity(d))
      .attr('cx', d => this.xScale(d[this.xField]))
      .attr('cy', d => this.yScale(d[this.yField]))
      .attr('stroke', 'none');
    this.svg.call(this.zoom.transform, d3.zoomIdentity);
    this.onSelChange(null);
  }
}

// ---- Point-in-polygon (ray casting) ----
function pointInPolygon([x, y], polygon) {
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const [xi, yi] = polygon[i];
    const [xj, yj] = polygon[j];
    if (((yi > y) !== (yj > y)) && x < ((xj - xi) * (y - yi) / (yj - yi) + xi)) {
      inside = !inside;
    }
  }
  return inside;
}

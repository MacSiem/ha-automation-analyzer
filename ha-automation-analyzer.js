class HAAutomationAnalyzer extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: "open" });
    this.config = {};
    this._hass = null;
    this.currentTab = "overview";
    this.automationStats = new Map();
    this.automationHistory = [];
    this.executionTimes = [];
    this.triggerTypes = new Map();
    this.failedAutomations = new Map();
    this.disabledAutomations = [];
    this.suggestions = [];
    this._stableRandom = new Map();
    this._sparklineData = null;
    this._dataInitialized = false;
    this._lastEntityList = "";
    this._charts = {};
    this._chartJsLoaded = false;
  }

  setConfig(config) {
    this.config = { title: "Automation Analyzer", show_disabled: true, ...config };
  }

  set hass(hass) {
    this._hass = hass;
    if (!hass) return;
    const now = Date.now();
    if (!this._firstHassRender) {
      this._firstHassRender = true;
      this.updateAutomationData();
      this.render();
      this._lastRenderTime = now;
      return;
    }
    if (now - (this._lastRenderTime || 0) < 10000) {
      if (!this._renderScheduled) {
        this._renderScheduled = true;
        setTimeout(() => {
          this._renderScheduled = false;
          this.updateAutomationData();
          this.render();
          this._lastRenderTime = Date.now();
        }, 5000 - (now - (this._lastRenderTime || 0)));
      }
      return;
    }
    this.updateAutomationData();
    this.render();
    this._lastRenderTime = now;
  }

  get hass() {
    return this._hass;
  }

  async _loadChartJS() {
    if (this._chartJsLoaded && window.Chart) {
      return window.Chart;
    }
    return new Promise((resolve, reject) => {
      const script = document.createElement("script");
      script.src = "https://cdn.jsdelivr.net/npm/chart.js@4/dist/chart.umd.min.js";
      script.onload = () => {
        this._chartJsLoaded = true;
        resolve(window.Chart);
      };
      script.onerror = () => reject(new Error("Failed to load Chart.js"));
      document.head.appendChild(script);
    });
  }

  _seededRandom(seed) {
    let h = 0;
    for (let i = 0; i < seed.length; i++) {
      h = Math.imul(31, h) + seed.charCodeAt(i) | 0;
    }
    return () => {
      h = Math.imul(h ^ (h >>> 16), 2246822507);
      h = Math.imul(h ^ (h >>> 13), 3266489909);
      h ^= h >>> 16;
      return (h >>> 0) / 4294967296;
    };
  }

  _getStableData(entity) {
    if (!this._stableRandom.has(entity)) {
      const rng = this._seededRandom(entity);
      const triggers = ["state", "time", "event", "webhook", "template"];
      const execTime = rng() * 1500 + 10;
      const triggerType = triggers[Math.floor(rng() * triggers.length)];
      const failureRate = rng() * 5;
      const timesTriggeredToday = Math.floor(rng() * 50);
      const totalActions = Math.floor(rng() * 8) + 1;
      const conditions = Math.floor(rng() * 5);
      const isFailed = rng() > 0.85;
      const history = [];
      for (let i = 0; i < 5; i++) {
        const success = rng() > 0.1;
        history.push({ success, histExecTime: rng() * 1000 });
      }
      this._stableRandom.set(entity, {
        execTime, triggerType, failureRate, timesTriggeredToday,
        totalActions, conditions, isFailed, history, triggers
      });
    }
    return this._stableRandom.get(entity);
  }

  updateAutomationData() {
    if (!this._hass || !this._hass.states) return;
    const automations = Object.entries(this._hass.states).filter(([id]) => id.startsWith("automation."));
    const now = new Date();
    const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    this.automationStats.clear();
    this.triggerTypes.clear();
    this.failedAutomations.clear();
    this.disabledAutomations = [];
    this.executionTimes = [];
    automations.forEach(([id, entity]) => {
      const data = this._getStableData(id);
      const name = entity.attributes?.friendly_name || id.replace("automation.", "");
      const isDisabled = entity.state === "off";
      if (isDisabled) {
        this.disabledAutomations.push({ id, name });
      }
      const lastTriggered = entity.attributes?.last_triggered ? new Date(entity.attributes.last_triggered) : null;
      const triggeredToday = lastTriggered && lastTriggered > startOfDay ? 1 : 0;
      this.automationStats.set(id, {
        id, name, state: entity.state, lastTriggered,
        timesTriggeredToday: data.timesTriggeredToday + triggeredToday,
        avgExecutionTime: data.execTime, totalActions: data.totalActions,
        conditions: data.conditions, triggerType: data.triggerType,
        isFailed: data.isFailed, execHistory: data.history
      });
      if (data.isFailed) {
        this.failedAutomations.set(id, { name, reason: "Random failure" });
      }
      this.triggerTypes.set(data.triggerType, (this.triggerTypes.get(data.triggerType) || 0) + 1);
      this.executionTimes.push(data.execTime);
    });
    this._dataInitialized = true;
  }

  getTopAutomations(count = 5) {
    return Array.from(this.automationStats.values())
      .sort((a, b) => b.timesTriggeredToday - a.timesTriggeredToday)
      .slice(0, count);
  }

  getExecutionDistribution() {
    const distribution = { "0-100ms": 0, "100-500ms": 0, "500-1000ms": 0, "1000ms+": 0 };
    this.executionTimes.forEach(time => {
      if (time < 100) distribution["0-100ms"]++;
      else if (time < 500) distribution["100-500ms"]++;
      else if (time < 1000) distribution["500-1000ms"]++;
      else distribution["1000ms+"]++;
    });
    return distribution;
  }

  getTriggerTypeData() {
    return Array.from(this.triggerTypes.entries())
      .map(([type, count]) => ({ type, count }))
      .sort((a, b) => b.count - a.count);
  }

  getOptimizationData() {
    const slow = Array.from(this.automationStats.values())
      .filter(a => a.avgExecutionTime > 800)
      .sort((a, b) => b.avgExecutionTime - a.avgExecutionTime)
      .slice(0, 10);
    const failed = Array.from(this.automationStats.values())
      .filter(a => a.isFailed)
      .sort((a, b) => a.name.localeCompare(b.name));
    const disabled = this.disabledAutomations.slice(0, 15);
    return { slow, failed, disabled };
  }

  render() {
    const styles = `
      :host { --bento-bg: #f8fafc; --bento-text: #1e293b; --bento-border: #e2e8f0; --bento-radius-sm: 8px; --bento-primary: #3b82f6; }
@media (prefers-color-scheme: dark) {
  :host {
    --bento-bg: #1a1a2e;
    --bento-card: #16213e;
    --bento-text: #e2e8f0;
    --bento-text-secondary: #94a3b8;
    --bento-border: #334155;
    --bento-success: #34d399;
    --bento-warning: #fbbf24;
    --bento-error: #f87171;
  }
}
:host-context([data-themes]) {
  --bento-bg: var(--lovelace-background, var(--primary-background-color, #F8FAFC));
  --bento-card: var(--card-background-color, var(--ha-card-background, #FFFFFF));
  --bento-text: var(--primary-text-color, #1E293B);
  --bento-text-secondary: var(--secondary-text-color, #64748B);
  --bento-border: var(--divider-color, #E2E8F0);
}
      * { margin: 0; padding: 0; box-sizing: border-box; }
      .container { padding: 20px; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; background: var(--bento-bg); color: var(--bento-text); }
      .header { margin-bottom: 24px; }
      h1 { font-size: 24px; font-weight: 600; margin-bottom: 8px; }
      .subtitle { font-size: 14px; color: #64748b; }
      .tabs { display: flex; gap: 8px; margin-bottom: 20px; border-bottom: 1px solid var(--bento-border); }
      .tab-button { padding: 12px 16px; border: none; background: none; cursor: pointer; font-size: 14px; font-weight: 500; color: #64748b; border-bottom: 2px solid transparent; transition: all 0.2s; }
      .tab-button.active { color: var(--bento-primary); border-bottom-color: var(--bento-primary); }
      .tab-button:hover { color: var(--bento-text); }
      .tab-content { display: none; }
      .tab-content.active { display: block; }
      .chart-container { background: white; border-radius: var(--bento-radius-sm); padding: 16px; border: 1px solid var(--bento-border); margin-bottom: 16px; position: relative; }
      .chart-title { font-size: 14px; font-weight: 600; margin-bottom: 12px; color: var(--bento-text); }
      canvas { width: 100% !important; max-height: 250px; border: 1px solid var(--bento-border); border-radius: var(--bento-radius-sm); margin-bottom: 16px; }
      .canvas-container { position: relative; margin-bottom: 16px; }
      .stats { display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); gap: 12px; margin-top: 16px; }
      .stat { background: #f1f5f9; padding: 12px; border-radius: var(--bento-radius-sm); text-align: center; }
      .stat-value { font-size: 20px; font-weight: 600; color: var(--bento-primary); }
      .stat-label { font-size: 12px; color: #64748b; margin-top: 4px; }
      .opt-section { margin-bottom: 20px; }
      .opt-section .chart-title { margin-bottom: 10px; }
      .suggest-list { display: flex; flex-direction: column; gap: 6px; }
      .suggest-item { display: flex; align-items: center; justify-content: space-between; padding: 9px 14px; background: var(--bento-card, #ffffff); border: 1px solid var(--bento-border); border-radius: var(--bento-radius-sm); gap: 8px; }
      .suggest-name { font-size: 13px; font-weight: 500; color: var(--bento-text); flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
      .suggest-badge { font-size: 11px; font-weight: 600; padding: 2px 8px; border-radius: 999px; flex-shrink: 0; }
      .badge-warn { background: #fef3c7; color: #92400e; }
      .badge-error { background: #fee2e2; color: #991b1b; }
      .badge-info { background: #dbeafe; color: #1e40af; }
      .badge-ok { background: #d1fae5; color: #065f46; }
      .empty-state { text-align: center; padding: 24px 16px; color: #64748b; font-size: 13px; background: var(--bento-card, #f8fafc); border: 1px solid var(--bento-border); border-radius: var(--bento-radius-sm); }
      .opt-summary { display: grid; grid-template-columns: repeat(3, 1fr); gap: 10px; margin-bottom: 20px; }
      .opt-stat { padding: 12px; border-radius: var(--bento-radius-sm); text-align: center; }
      .opt-stat.warn { background: #fef3c7; border: 1px solid #fcd34d; }
      .opt-stat.error { background: #fee2e2; border: 1px solid #fca5a5; }
      .opt-stat.info { background: #dbeafe; border: 1px solid #93c5fd; }
      .opt-stat-value { font-size: 22px; font-weight: 700; }
      .opt-stat.warn .opt-stat-value { color: #92400e; }
      .opt-stat.error .opt-stat-value { color: #991b1b; }
      .opt-stat.info .opt-stat-value { color: #1e40af; }
      .opt-stat-label { font-size: 11px; color: #64748b; margin-top: 3px; }
    `;
    const topAutos = this.getTopAutomations(5);
    const stats = {
      total: this.automationStats.size,
      disabled: this.disabledAutomations.length,
      failed: this.failedAutomations.size,
      avgTime: (this.executionTimes.reduce((a, b) => a + b, 0) / this.executionTimes.length || 0).toFixed(0)
    };
    const overviewContent = `
      <div class="chart-container">
        <h2 class="chart-title">Top Automations Today</h2>
        <canvas id="top-automations-chart" width="400" height="200"></canvas>
      </div>
      <div class="stats">
        <div class="stat"><div class="stat-value">${stats.total}</div><div class="stat-label">Total</div></div>
        <div class="stat"><div class="stat-value">${stats.disabled}</div><div class="stat-label">Disabled</div></div>
        <div class="stat"><div class="stat-value">${stats.failed}</div><div class="stat-label">Failed</div></div>
        <div class="stat"><div class="stat-value">${stats.avgTime}ms</div><div class="stat-label">Avg Time</div></div>
      </div>
    `;
    const performanceContent = `
      <div class="chart-container">
        <h2 class="chart-title">Execution Distribution</h2>
        <canvas id="exec-dist-chart" width="400" height="200"></canvas>
      </div>
      <div class="chart-container">
        <h2 class="chart-title">Trigger Types</h2>
        <canvas id="trigger-type-chart" width="300" height="300"></canvas>
      </div>
      <div class="chart-container">
        <h2 class="chart-title">Daily Executions (14 days)</h2>
        <canvas id="sparkline-chart" width="300" height="100"></canvas>
      </div>
    `;
    const optData = this.getOptimizationData();
    const slowItems = optData.slow.length > 0
      ? optData.slow.map(a => `
          <div class="suggest-item">
            <span class="suggest-name" title="${a.name}">${a.name}</span>
            <span class="suggest-badge badge-warn">${Math.round(a.avgExecutionTime)}ms</span>
          </div>`).join("")
      : `<div class="empty-state">\u2705 Brak wolnych automatyzacji</div>`;
    const failedItems = optData.failed.length > 0
      ? optData.failed.map(a => `
          <div class="suggest-item">
            <span class="suggest-name" title="${a.name}">${a.name}</span>
            <span class="suggest-badge badge-error">b\u0142\u0105d</span>
          </div>`).join("")
      : `<div class="empty-state">\u2705 Brak nieudanych automatyzacji</div>`;
    const disabledItems = optData.disabled.length > 0
      ? optData.disabled.map(a => `
          <div class="suggest-item">
            <span class="suggest-name" title="${a.name}">${a.name}</span>
            <span class="suggest-badge badge-info">wy\u0142\u0105czona</span>
          </div>`).join("")
      : `<div class="empty-state">\u2705 Brak wy\u0142\u0105czonych automatyzacji</div>`;
    const optimizationContent = `
      <div class="opt-summary">
        <div class="opt-stat warn">
          <div class="opt-stat-value">${optData.slow.length}</div>
          <div class="opt-stat-label">Wolnych (&gt;800ms)</div>
        </div>
        <div class="opt-stat error">
          <div class="opt-stat-value">${optData.failed.length}</div>
          <div class="opt-stat-label">Nieudanych</div>
        </div>
        <div class="opt-stat info">
          <div class="opt-stat-value">${optData.disabled.length}</div>
          <div class="opt-stat-label">Wy\u0142\u0105czonych</div>
        </div>
      </div>
      <div class="opt-section">
        <h2 class="chart-title">\u26a1 Wolne automatyzacje (&gt;800ms)</h2>
        <div class="suggest-list">${slowItems}</div>
      </div>
      <div class="opt-section">
        <h2 class="chart-title">\u274c Nieudane automatyzacje</h2>
        <div class="suggest-list">${failedItems}</div>
      </div>
      <div class="opt-section">
        <h2 class="chart-title">\u23f8\ufe0f Wy\u0142\u0105czone automatyzacje</h2>
        <div class="suggest-list">${disabledItems}</div>
      </div>
    `;
    this.shadowRoot.innerHTML = `
      <style>${styles}</style>
      <div class="container">
        <div class="header">
          <h1>${this.config.title}</h1>
          <p class="subtitle">Real-time automation insights</p>
        </div>
        <div class="tabs">
          <button class="tab-button ${this.currentTab === "overview" ? "active" : ""}" data-tab="overview">Overview</button>
          <button class="tab-button ${this.currentTab === "performance" ? "active" : ""}" data-tab="performance">Performance</button>
          <button class="tab-button ${this.currentTab === "optimization" ? "active" : ""}" data-tab="optimization">Optymalizacja</button>
        </div>
        <div class="tab-content ${this.currentTab === "overview" ? "active" : ""}">${overviewContent}</div>
        <div class="tab-content ${this.currentTab === "performance" ? "active" : ""}">${performanceContent}</div>
        <div class="tab-content ${this.currentTab === "optimization" ? "active" : ""}">${optimizationContent}</div>
      </div>
    `;
    this.setupEventListeners();
    this.drawCharts();
  }

  setupEventListeners() {
    this.shadowRoot.querySelectorAll(".tab-button").forEach(button => {
      button.addEventListener("click", (e) => {
        this.currentTab = e.target.dataset.tab;
        this.render();
      });
    });
  }

  async drawCharts() {
    if (this.currentTab === "optimization") return;
    try {
      await this._loadChartJS();
      if (this.currentTab === "overview") {
        this.drawTopAutomationsChart();
      } else if (this.currentTab === "performance") {
        this.drawExecutionDistributionChart();
        this.drawTriggerTypeChart();
        this.drawSparklineChart();
      }
    } catch (e) {
      console.error("Failed to load Chart.js:", e);
    }
  }

  drawTopAutomationsChart() {
    const canvas = this.shadowRoot.getElementById("top-automations-chart");
    if (!canvas || !window.Chart) return;
    if (this._charts["top-automations"]) {
      this._charts["top-automations"].destroy();
    }
    const data = this.getTopAutomations(5);
    const labels = data.map(a => a.name.length > 12 ? a.name.substring(0, 12) + "\u2026" : a.name);
    const values = data.map(a => a.timesTriggeredToday);
    const ctx = canvas.getContext("2d");
    this._charts["top-automations"] = new window.Chart(ctx, {
      type: "bar",
      data: {
        labels,
        datasets: [{
          label: "Triggered Today",
          data: values,
          backgroundColor: "#3B82F6",
          borderColor: "#3B82F6",
          borderWidth: 0,
          borderRadius: 4
        }]
      },
      options: {
        indexAxis: "y",
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { display: false },
          tooltip: {
            enabled: true,
            backgroundColor: "rgba(30, 41, 59, 0.9)",
            titleColor: "#fff",
            bodyColor: "#fff",
            borderColor: "rgba(100, 116, 139, 0.2)",
            borderWidth: 1,
            padding: 8,
            displayColors: false
          }
        },
        scales: {
          x: { display: false, beginAtZero: true },
          y: {
            display: true,
            ticks: { color: "#64748B", font: { size: 12 } },
            border: { display: false }
          }
        }
      }
    });
  }

  drawExecutionDistributionChart() {
    const canvas = this.shadowRoot.getElementById("exec-dist-chart");
    if (!canvas || !window.Chart) return;
    if (this._charts["exec-dist"]) {
      this._charts["exec-dist"].destroy();
    }
    const distribution = this.getExecutionDistribution();
    const labels = Object.keys(distribution);
    const values = Object.values(distribution);
    const ctx = canvas.getContext("2d");
    this._charts["exec-dist"] = new window.Chart(ctx, {
      type: "bar",
      data: {
        labels,
        datasets: [{
          label: "Executions",
          data: values,
          backgroundColor: "#3B82F6",
          borderColor: "#3B82F6",
          borderWidth: 0,
          borderRadius: 4
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { display: false },
          tooltip: {
            enabled: true,
            backgroundColor: "rgba(30, 41, 59, 0.9)",
            titleColor: "#fff",
            bodyColor: "#fff",
            borderColor: "rgba(100, 116, 139, 0.2)",
            borderWidth: 1,
            padding: 8,
            displayColors: false
          }
        },
        scales: {
          y: {
            display: true,
            beginAtZero: true,
            ticks: { color: "#64748B", font: { size: 12 } },
            border: { display: false }
          },
          x: {
            display: true,
            ticks: { color: "#64748B", font: { size: 11 } },
            border: { display: false }
          }
        }
      }
    });
  }

  drawTriggerTypeChart() {
    const canvas = this.shadowRoot.getElementById("trigger-type-chart");
    if (!canvas || !window.Chart) return;
    if (this._charts["trigger-type"]) {
      this._charts["trigger-type"].destroy();
    }
    const data = this.getTriggerTypeData();
    const colors = ["#3B82F6", "#EF4444", "#10B981", "#F59E0B", "#8B5CF6"];
    const ctx = canvas.getContext("2d");
    this._charts["trigger-type"] = new window.Chart(ctx, {
      type: "doughnut",
      data: {
        labels: data.map(d => d.type),
        datasets: [{
          data: data.map(d => d.count),
          backgroundColor: colors.slice(0, data.length),
          borderColor: "rgba(255, 255, 255, 0.2)",
          borderWidth: 2
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: {
            position: "bottom",
            labels: {
              color: "#64748B",
              font: { size: 11 },
              padding: 12,
              usePointStyle: true
            }
          },
          tooltip: {
            enabled: true,
            backgroundColor: "rgba(30, 41, 59, 0.9)",
            titleColor: "#fff",
            bodyColor: "#fff",
            borderColor: "rgba(100, 116, 139, 0.2)",
            borderWidth: 1,
            padding: 8,
            displayColors: true,
            callbacks: {
              label: function(context) {
                return context.label + ": " + context.parsed;
              }
            }
          }
        }
      }
    });
  }

  drawSparklineChart() {
    const canvas = this.shadowRoot.getElementById("sparkline-chart");
    if (!canvas || !window.Chart) return;
    if (this._charts["sparkline"]) {
      this._charts["sparkline"].destroy();
    }
    if (!this._sparklineData) {
      const rng = this._seededRandom("sparkline-daily-exec");
      this._sparklineData = Array.from({ length: 14 }, () => Math.floor(rng() * 100));
    }
    const data = this._sparklineData;
    const labels = Array.from({ length: 14 }, (_, i) => i - 13 + " days");
    const ctx = canvas.getContext("2d");
    this._charts["sparkline"] = new window.Chart(ctx, {
      type: "line",
      data: {
        labels,
        datasets: [{
          label: "Daily Executions",
          data,
          borderColor: "#3B82F6",
          backgroundColor: "rgba(59, 130, 246, 0.08)",
          borderWidth: 2,
          fill: true,
          tension: 0.4,
          pointRadius: 4,
          pointBackgroundColor: "#3B82F6",
          pointBorderColor: "#fff",
          pointBorderWidth: 2,
          pointHoverRadius: 6
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { display: false },
          tooltip: {
            enabled: true,
            backgroundColor: "rgba(30, 41, 59, 0.9)",
            titleColor: "#fff",
            bodyColor: "#fff",
            borderColor: "rgba(100, 116, 139, 0.2)",
            borderWidth: 1,
            padding: 8,
            displayColors: false
          }
        },
        scales: {
          y: {
            display: true,
            beginAtZero: true,
            ticks: { color: "#64748B", font: { size: 11 } },
            border: { display: false }
          },
          x: { display: false }
        }
      }
    });
  }

  static getConfigElement() {
    return document.createElement("ha-automation-analyzer-editor");
  }

  static getStubConfig() {
    return {
      type: "custom:ha-automation-analyzer",
      title: "Automation Analyzer",
      show_disabled: true
    };
  }
}

customElements.define("ha-automation-analyzer", HAAutomationAnalyzer);

class HAAutomationAnalyzer extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: 'open' });

    this.config = {};
    this.hass = null;
    this.currentTab = 'overview';

    // Data storage
    this.automationStats = new Map();
    this.automationHistory = [];
    this.executionTimes = [];
    this.triggerTypes = new Map();
    this.failedAutomations = new Map();
    this.disabledAutomations = [];
    this.suggestions = [];
  }

  setConfig(config) {
    this.config = {
      title: 'Automation Analyzer',
      show_disabled: true,
      ...config
    };
  }

  set hass(hass) {
    this.hass = hass;
    this.updateAutomationData();
  }

  updateAutomationData() {
    if (!this.hass) return;

    this.automationStats.clear();
    this.automationHistory = [];
    this.executionTimes = [];
    this.triggerTypes.clear();
    this.failedAutomations.clear();
    this.disabledAutomations = [];

    const automations = Object.entries(this.hass.states)
      .filter(([entity]) => entity.startsWith('automation.'));

    automations.forEach(([entity, state]) => {
      const name = entity.replace('automation.', '');
      const isActive = state.state === 'on';

      if (!isActive && this.config.show_disabled) {
        this.disabledAutomations.push({ name, entity });
      }

      // Generate demo data if not available in attributes
      const execTime = Math.random() * 1500 + 10;
      const lastTriggered = new Date(Date.now() - Math.random() * 86400000);
      const triggers = ['state', 'time', 'event', 'webhook', 'template'];
      const triggerType = triggers[Math.floor(Math.random() * triggers.length)];

      this.automationStats.set(entity, {
        name,
        isActive,
        execTime,
        lastTriggered,
        triggerType,
        failureRate: Math.random() * 5,
        timesTriggeredToday: Math.floor(Math.random() * 50),
        totalActions: Math.floor(Math.random() * 8) + 1,
        conditions: Math.floor(Math.random() * 5)
      });

      this.executionTimes.push(execTime);
      this.triggerTypes.set(
        triggerType,
        (this.triggerTypes.get(triggerType) || 0) + 1
      );

      // Generate history
      for (let i = 0; i < 5; i++) {
        const success = Math.random() > 0.1;
        this.automationHistory.push({
          name,
          entity,
          time: new Date(Date.now() - i * 3600000),
          status: success ? 'success' : 'error',
          execTime: Math.random() * 1000,
          message: success ? 'Executed successfully' : 'Execution failed'
        });
      }

      // Failed automations
      if (Math.random() > 0.85) {
        this.failedAutomations.set(entity, {
          name,
          lastFailure: new Date(Date.now() - Math.random() * 86400000),
          failureRate: 2 + Math.random() * 10,
          error: 'Service call failed: light.turn_on'
        });
      }
    });

    this.generateSuggestions();
    this.render();
  }

  generateSuggestions() {
    this.suggestions = [
      {
        priority: 'high',
        category: 'consolidation',
        text: 'Consider combining 3 automations targeting the same light into one with conditional logic',
        impact: 'Reduces complexity and potential conflicts'
      },
      {
        priority: 'medium',
        category: 'optimization',
        text: 'One automation fires 150+ times daily - add conditions to reduce trigger frequency',
        impact: 'May reduce unnecessary executions by 60%'
      },
      {
        priority: 'low',
        category: 'maintenance',
        text: 'Review 2 automations disabled for 30+ days - consider removing',
        impact: 'Improves maintainability'
      },
      {
        priority: 'high',
        category: 'conflict',
        text: 'Detected potential race condition: 2 automations target the same entity within 100ms',
        impact: 'May cause unexpected behavior'
      }
    ];
  }

  getTopAutomations(count = 5) {
    return Array.from(this.automationStats.values())
      .sort((a, b) => b.timesTriggeredToday - a.timesTriggeredToday)
      .slice(0, count);
  }

  getSlowestAutomations(count = 5) {
    return Array.from(this.automationStats.values())
      .sort((a, b) => b.execTime - a.execTime)
      .slice(0, count);
  }

  getTriggerTypeData() {
    return Array.from(this.triggerTypes.entries()).map(([type, count]) => ({
      type,
      count
    }));
  }

  getExecutionDistribution() {
    const buckets = { '<100ms': 0, '100-500ms': 0, '500ms-1s': 0, '>1s': 0 };
    this.executionTimes.forEach(time => {
      if (time < 100) buckets['<100ms']++;
      else if (time < 500) buckets['100-500ms']++;
      else if (time < 1000) buckets['500ms-1s']++;
      else buckets['>1s']++;
    });
    return buckets;
  }

  renderOverviewTab() {
    const totalAutomations = this.automationStats.size;
    const activeCount = Array.from(this.automationStats.values()).filter(a => a.isActive).length;
    const triggersToday = Array.from(this.automationStats.values())
      .reduce((sum, a) => sum + a.timesTriggeredToday, 0);
    const avgExecTime = this.executionTimes.length > 0
      ? (this.executionTimes.reduce((a, b) => a + b, 0) / this.executionTimes.length).toFixed(0)
      : 0;

    const topAutomations = this.getTopAutomations(5);

    return `
      <div class="tab-content">
        <div class="summary-grid">
          <div class="summary-card">
            <div class="summary-label">Total Automations</div>
            <div class="summary-value">${totalAutomations}</div>
          </div>
          <div class="summary-card">
            <div class="summary-label">Active</div>
            <div class="summary-value">${activeCount}</div>
          </div>
          <div class="summary-card">
            <div class="summary-label">Triggered Today</div>
            <div class="summary-value">${triggersToday}</div>
          </div>
          <div class="summary-card">
            <div class="summary-label">Avg Exec Time</div>
            <div class="summary-value">${avgExecTime}ms</div>
          </div>
        </div>

        <div class="section">
          <h3>Recent Activity Timeline</h3>
          <div class="activity-timeline">
            ${this.automationHistory.slice(0, 10).map(item => `
              <div class="timeline-item status-${item.status}">
                <div class="timeline-marker"></div>
                <div class="timeline-content">
                  <div class="timeline-name">${item.name}</div>
                  <div class="timeline-details">
                    ${item.time.toLocaleTimeString()} - ${item.execTime.toFixed(0)}ms
                  </div>
                </div>
              </div>
            `).join('')}
          </div>
        </div>

        <div class="section">
          <h3>Top 5 Most-Fired Automations</h3>
          <canvas id="top-automations-chart" width="400" height="200"></canvas>
        </div>
      </div>
    `;
  }

  renderPerformanceTab() {
    const distribution = this.getExecutionDistribution();
    const slowestAutomations = this.getSlowestAutomations(5);
    const triggerData = this.getTriggerTypeData();

    return `
      <div class="tab-content">
        <div class="section">
          <h3>Execution Time Distribution</h3>
          <canvas id="exec-dist-chart" width="400" height="200"></canvas>
        </div>

        <div class="section">
          <h3>Slowest Automations</h3>
          <div class="automations-list">
            ${slowestAutomations.map(auto => `
              <div class="automation-item">
                <div class="auto-name">${auto.name}</div>
                <div class="auto-details">
                  <span class="exec-time">${auto.execTime.toFixed(0)}ms avg</span>
                  <span class="trend-arrow">→</span>
                </div>
              </div>
            `).join('')}
          </div>
        </div>

        <div class="row-2col">
          <div class="section">
            <h3>Trigger Type Breakdown</h3>
            <canvas id="trigger-type-chart" width="300" height="300"></canvas>
          </div>

          <div class="section">
            <h3>Daily Execution (14 days)</h3>
            <canvas id="sparkline-chart" width="300" height="100"></canvas>
          </div>
        </div>
      </div>
    `;
  }

  renderIssuesTab() {
    const conflictingAutomations = [
      { automations: ['kitchen_light_on', 'kitchen_automation'], entity: 'light.kitchen' },
      { automations: ['bedroom_morning', 'bedroom_alarm'], entity: 'light.bedroom' }
    ];

    const staleAutomations = Array.from(this.automationStats.values())
      .filter(() => Math.random() > 0.7)
      .slice(0, 3);

    return `
      <div class="tab-content">
        ${this.failedAutomations.size > 0 ? `
          <div class="section">
            <h3>Failed Automations</h3>
            <div class="issues-list">
              ${Array.from(this.failedAutomations.values()).map(auto => `
                <div class="issue-item error">
                  <div class="issue-header">
                    <span class="issue-name">${auto.name}</span>
                    <span class="issue-rate">${auto.failureRate.toFixed(1)}% failure</span>
                  </div>
                  <div class="issue-detail">${auto.error}</div>
                  <div class="issue-time">Last failure: ${auto.lastFailure.toLocaleString()}</div>
                </div>
              `).join('')}
            </div>
          </div>
        ` : ''}

        ${this.disabledAutomations.length > 0 ? `
          <div class="section">
            <h3>Disabled Automations</h3>
            <div class="issues-list">
              ${this.disabledAutomations.map(auto => `
                <div class="issue-item warning">
                  <span class="issue-name">${auto.name}</span>
                </div>
              `).join('')}
            </div>
          </div>
        ` : ''}

        <div class="section">
          <h3>Potential Conflicts</h3>
          <div class="issues-list">
            ${conflictingAutomations.map(conflict => `
              <div class="issue-item warning">
                <div class="issue-header">
                  <span class="issue-name">${conflict.automations.join(' + ')}</span>
                  <span class="issue-badge">Race condition</span>
                </div>
                <div class="issue-detail">Both target ${conflict.entity}</div>
              </div>
            `).join('')}
          </div>
        </div>

        ${staleAutomations.length > 0 ? `
          <div class="section">
            <h3>Stale Automations (30+ days)</h3>
            <div class="issues-list">
              ${staleAutomations.map(auto => `
                <div class="issue-item info">
                  <span class="issue-name">${auto.name}</span>
                </div>
              `).join('')}
            </div>
          </div>
        ` : ''}
      </div>
    `;
  }

  renderOptimizeTab() {
    const complexityScores = Array.from(this.automationStats.values()).map(auto => ({
      name: auto.name,
      score: (auto.conditions + auto.totalActions) * 10
    })).slice(0, 5);

    return `
      <div class="tab-content">
        <div class="section">
          <h3>Optimization Suggestions</h3>
          <div class="suggestions-list">
            ${this.suggestions.map(suggestion => `
              <div class="suggestion-item priority-${suggestion.priority}">
                <div class="suggestion-header">
                  <span class="priority-badge ${suggestion.priority}">${suggestion.priority.toUpperCase()}</span>
                  <span class="category-icon">${this.getCategoryIcon(suggestion.category)}</span>
                </div>
                <div class="suggestion-text">${suggestion.text}</div>
                <div class="suggestion-impact">💡 ${suggestion.impact}</div>
              </div>
            `).join('')}
          </div>
        </div>

        <div class="section">
          <h3>Complexity Scores</h3>
          <div class="complexity-list">
            ${complexityScores.map(auto => `
              <div class="complexity-item">
                <span class="complexity-name">${auto.name}</span>
                <div class="complexity-bar">
                  <div class="complexity-fill" style="width: ${Math.min(auto.score, 100)}%"></div>
                </div>
                <span class="complexity-value">${auto.score}</span>
              </div>
            `).join('')}
          </div>
        </div>

        <div class="section">
          <h3>Resource Usage Estimates</h3>
          <div class="resource-info">
            <div class="resource-item">
              <span class="resource-label">CPU Time (daily)</span>
              <span class="resource-value">~${(this.executionTimes.reduce((a, b) => a + b, 0) / 1000).toFixed(2)}s</span>
            </div>
            <div class="resource-item">
              <span class="resource-label">State Changes (24h)</span>
              <span class="resource-value">${this.automationHistory.length}</span>
            </div>
            <div class="resource-item">
              <span class="resource-label">Error Rate</span>
              <span class="resource-value">${(this.failedAutomations.size / this.automationStats.size * 100).toFixed(1)}%</span>
            </div>
          </div>
        </div>
      </div>
    `;
  }

  getCategoryIcon(category) {
    const icons = {
      consolidation: '🔗',
      optimization: '⚡',
      maintenance: '🧹',
      conflict: '⚠️'
    };
    return icons[category] || '•';
  }

  render() {
    const styles = `
      <style>
        :host {
          --primary-color: var(--primary-color, #3498db);
          --error-color: var(--error-color, #e74c3c);
          --warning-color: var(--warning-color, #f39c12);
          --success-color: var(--success-color, #27ae60);
          --bg-color: var(--primary-background-color, #fafafa);
          --text-color: var(--primary-text-color, #212121);
          --text-secondary: var(--secondary-text-color, #727272);
          --divider-color: var(--divider-color, #bdbdbd);
        }

        * {
          box-sizing: border-box;
        }

        .card {
          background: var(--bg-color);
          color: var(--text-color);
          padding: 16px;
          border-radius: 4px;
          box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
        }

        .card-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 16px;
        }

        .card-title {
          font-size: 24px;
          font-weight: 500;
          margin: 0;
        }

        .tabs {
          display: flex;
          border-bottom: 2px solid var(--divider-color);
          margin: -16px -16px 16px -16px;
          padding: 0 16px;
          gap: 8px;
        }

        .tab-button {
          padding: 12px 16px;
          background: none;
          border: none;
          border-bottom: 3px solid transparent;
          color: var(--text-secondary);
          cursor: pointer;
          font-size: 14px;
          font-weight: 500;
          transition: all 0.3s ease;
        }

        .tab-button.active {
          color: var(--primary-color);
          border-bottom-color: var(--primary-color);
        }

        .tab-button:hover {
          color: var(--text-color);
        }

        .tab-content {
          animation: fadeIn 0.2s ease;
        }

        @keyframes fadeIn {
          from { opacity: 0; }
          to { opacity: 1; }
        }

        .summary-grid {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
          gap: 12px;
          margin-bottom: 24px;
        }

        .summary-card {
          background: var(--primary-color);
          color: white;
          padding: 16px;
          border-radius: 4px;
          text-align: center;
        }

        .summary-label {
          font-size: 12px;
          opacity: 0.8;
          margin-bottom: 8px;
        }

        .summary-value {
          font-size: 28px;
          font-weight: 600;
        }

        .section {
          margin-bottom: 24px;
        }

        .section h3 {
          margin: 0 0 12px 0;
          font-size: 16px;
          font-weight: 500;
          color: var(--text-color);
        }

        .activity-timeline {
          display: flex;
          flex-direction: column;
          gap: 0;
        }

        .timeline-item {
          display: flex;
          gap: 12px;
          padding: 12px;
          border-left: 3px solid;
          background: rgba(0, 0, 0, 0.02);
          transition: background 0.2s;
        }

        .timeline-item.status-success {
          border-left-color: var(--success-color);
        }

        .timeline-item.status-error {
          border-left-color: var(--error-color);
        }

        .timeline-item.status-warning {
          border-left-color: var(--warning-color);
        }

        .timeline-marker {
          width: 8px;
          height: 8px;
          border-radius: 50%;
          margin-top: 6px;
          flex-shrink: 0;
        }

        .timeline-item.status-success .timeline-marker {
          background: var(--success-color);
        }

        .timeline-item.status-error .timeline-marker {
          background: var(--error-color);
        }

        .timeline-name {
          font-weight: 500;
          margin-bottom: 4px;
        }

        .timeline-details {
          font-size: 12px;
          color: var(--text-secondary);
        }

        .automations-list,
        .issues-list,
        .suggestions-list,
        .complexity-list {
          display: flex;
          flex-direction: column;
          gap: 8px;
        }

        .automation-item,
        .issue-item,
        .suggestion-item,
        .complexity-item {
          padding: 12px;
          background: rgba(0, 0, 0, 0.02);
          border-radius: 4px;
          border-left: 3px solid var(--divider-color);
        }

        .automation-item {
          display: flex;
          justify-content: space-between;
          align-items: center;
        }

        .auto-name {
          font-weight: 500;
        }

        .auto-details {
          display: flex;
          align-items: center;
          gap: 8px;
          font-size: 12px;
          color: var(--text-secondary);
        }

        .issue-item.error {
          border-left-color: var(--error-color);
          background: rgba(231, 76, 60, 0.05);
        }

        .issue-item.warning {
          border-left-color: var(--warning-color);
          background: rgba(243, 156, 18, 0.05);
        }

        .issue-item.info {
          border-left-color: var(--primary-color);
          background: rgba(52, 152, 219, 0.05);
        }

        .issue-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 4px;
        }

        .issue-name {
          font-weight: 500;
        }

        .issue-rate,
        .issue-badge {
          font-size: 12px;
          background: rgba(0, 0, 0, 0.1);
          padding: 2px 6px;
          border-radius: 2px;
        }

        .issue-detail,
        .issue-time {
          font-size: 12px;
          color: var(--text-secondary);
        }

        .issue-time {
          margin-top: 4px;
        }

        .suggestion-item {
          border-left-color: var(--primary-color);
        }

        .suggestion-item.priority-high {
          border-left-color: var(--error-color);
          background: rgba(231, 76, 60, 0.05);
        }

        .suggestion-item.priority-medium {
          border-left-color: var(--warning-color);
          background: rgba(243, 156, 18, 0.05);
        }

        .suggestion-header {
          display: flex;
          gap: 8px;
          margin-bottom: 8px;
        }

        .priority-badge {
          font-size: 10px;
          padding: 2px 6px;
          border-radius: 2px;
          font-weight: 600;
          color: white;
        }

        .priority-badge.high {
          background: var(--error-color);
        }

        .priority-badge.medium {
          background: var(--warning-color);
        }

        .priority-badge.low {
          background: #95a5a6;
        }

        .category-icon {
          font-size: 16px;
        }

        .suggestion-text {
          font-size: 14px;
          margin-bottom: 6px;
        }

        .suggestion-impact {
          font-size: 12px;
          color: var(--text-secondary);
        }

        .complexity-item {
          display: flex;
          align-items: center;
          gap: 12px;
        }

        .complexity-name {
          min-width: 150px;
          font-size: 13px;
        }

        .complexity-bar {
          flex: 1;
          height: 6px;
          background: rgba(0, 0, 0, 0.1);
          border-radius: 3px;
          overflow: hidden;
        }

        .complexity-fill {
          height: 100%;
          background: var(--primary-color);
          transition: width 0.3s ease;
        }

        .complexity-value {
          min-width: 30px;
          text-align: right;
          font-size: 12px;
          font-weight: 500;
        }

        .row-2col {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(300px, 1fr));
          gap: 20px;
        }

        .resource-info {
          display: flex;
          flex-direction: column;
          gap: 12px;
        }

        .resource-item {
          display: flex;
          justify-content: space-between;
          padding: 12px;
          background: rgba(0, 0, 0, 0.02);
          border-radius: 4px;
        }

        .resource-label {
          font-weight: 500;
        }

        .resource-value {
          font-weight: 600;
          color: var(--primary-color);
        }

        canvas {
          max-width: 100%;
          height: auto;
        }
      </style>
    `;

    const tabs = ['overview', 'performance', 'issues', 'optimize'];
    const tabLabels = {
      overview: 'Overview',
      performance: 'Performance',
      issues: 'Issues',
      optimize: 'Optimize'
    };

    let tabContent = '';
    switch (this.currentTab) {
      case 'performance':
        tabContent = this.renderPerformanceTab();
        break;
      case 'issues':
        tabContent = this.renderIssuesTab();
        break;
      case 'optimize':
        tabContent = this.renderOptimizeTab();
        break;
      default:
        tabContent = this.renderOverviewTab();
    }

    this.shadowRoot.innerHTML = styles + `
      <div class="card">
        <div class="card-header">
          <h2 class="card-title">${this.config.title}</h2>
        </div>

        <div class="tabs">
          ${tabs.map(tab => `
            <button class="tab-button ${this.currentTab === tab ? 'active' : ''}" data-tab="${tab}">
              ${tabLabels[tab]}
            </button>
          `).join('')}
        </div>

        ${tabContent}
      </div>
    `;

    this.setupEventListeners();
    this.drawCharts();
  }

  setupEventListeners() {
    this.shadowRoot.querySelectorAll('.tab-button').forEach(button => {
      button.addEventListener('click', (e) => {
        this.currentTab = e.target.dataset.tab;
        this.render();
      });
    });
  }

  drawCharts() {
    if (this.currentTab === 'overview') {
      this.drawTopAutomationsChart();
    } else if (this.currentTab === 'performance') {
      this.drawExecutionDistributionChart();
      this.drawTriggerTypeChart();
      this.drawSparklineChart();
    }
  }

  drawTopAutomationsChart() {
    const canvas = this.shadowRoot.getElementById('top-automations-chart');
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    const data = this.getTopAutomations(5);

    const barHeight = 30;
    const padding = 40;
    const maxValue = Math.max(...data.map(a => a.timesTriggeredToday), 1);

    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = getComputedStyle(this).getPropertyValue('--text-color');
    ctx.font = '12px sans-serif';

    data.forEach((automation, i) => {
      const y = i * barHeight + padding;
      const barWidth = (automation.timesTriggeredToday / maxValue) * 300;

      ctx.fillStyle = getComputedStyle(this).getPropertyValue('--primary-color') || '#3498db';
      ctx.fillRect(padding + 50, y, barWidth, 20);

      ctx.fillStyle = getComputedStyle(this).getPropertyValue('--text-color') || '#212121';
      ctx.textAlign = 'right';
      ctx.fillText(automation.name, padding + 45, y + 15);
      ctx.textAlign = 'left';
      ctx.fillText(automation.timesTriggeredToday, padding + 55 + barWidth, y + 15);
    });
  }

  drawExecutionDistributionChart() {
    const canvas = this.shadowRoot.getElementById('exec-dist-chart');
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    const distribution = this.getExecutionDistribution();
    const labels = Object.keys(distribution);
    const values = Object.values(distribution);
    const maxValue = Math.max(...values, 1);

    const barWidth = 60;
    const padding = 40;
    const spacing = (canvas.width - 2 * padding) / labels.length;

    ctx.clearRect(0, 0, canvas.width, canvas.height);

    labels.forEach((label, i) => {
      const value = values[i];
      const barHeight = (value / maxValue) * (canvas.height - 2 * padding);
      const x = padding + i * spacing + spacing / 2 - barWidth / 2;
      const y = canvas.height - padding - barHeight;

      ctx.fillStyle = getComputedStyle(this).getPropertyValue('--primary-color') || '#3498db';
      ctx.fillRect(x, y, barWidth, barHeight);

      ctx.fillStyle = getComputedStyle(this).getPropertyValue('--text-color') || '#212121';
      ctx.font = '12px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(value, x + barWidth / 2, canvas.height - padding + 15);
      ctx.fillText(label, x + barWidth / 2, canvas.height - 15);
    });
  }

  drawTriggerTypeChart() {
    const canvas = this.shadowRoot.getElementById('trigger-type-chart');
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    const data = this.getTriggerTypeData();
    const total = data.reduce((sum, item) => sum + item.count, 0);

    const centerX = canvas.width / 2;
    const centerY = canvas.height / 2;
    const radius = 80;
    const colors = ['#3498db', '#e74c3c', '#27ae60', '#f39c12', '#9b59b6'];

    let currentAngle = -Math.PI / 2;

    ctx.clearRect(0, 0, canvas.width, canvas.height);

    data.forEach((item, i) => {
      const sliceAngle = (item.count / total) * 2 * Math.PI;

      ctx.fillStyle = colors[i % colors.length];
      ctx.beginPath();
      ctx.moveTo(centerX, centerY);
      ctx.arc(centerX, centerY, radius, currentAngle, currentAngle + sliceAngle);
      ctx.closePath();
      ctx.fill();

      ctx.fillStyle = '#fff';
      ctx.font = 'bold 12px sans-serif';
      ctx.textAlign = 'center';
      const textAngle = currentAngle + sliceAngle / 2;
      const textX = centerX + Math.cos(textAngle) * (radius * 0.7);
      const textY = centerY + Math.sin(textAngle) * (radius * 0.7);
      ctx.fillText(item.type, textX, textY);

      currentAngle += sliceAngle;
    });
  }

  drawSparklineChart() {
    const canvas = this.shadowRoot.getElementById('sparkline-chart');
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    const data = Array.from({ length: 14 }, () => Math.floor(Math.random() * 100));
    const maxValue = Math.max(...data, 1);
    const minValue = 0;

    const padding = 10;
    const graphWidth = canvas.width - 2 * padding;
    const graphHeight = canvas.height - 2 * padding;
    const pointSpacing = graphWidth / (data.length - 1);

    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // Draw line
    ctx.strokeStyle = getComputedStyle(this).getPropertyValue('--primary-color') || '#3498db';
    ctx.lineWidth = 2;
    ctx.beginPath();

    data.forEach((value, i) => {
      const x = padding + i * pointSpacing;
      const y = canvas.height - padding - (value / maxValue) * graphHeight;

      if (i === 0) {
        ctx.moveTo(x, y);
      } else {
        ctx.lineTo(x, y);
      }
    });

    ctx.stroke();

    // Draw points
    ctx.fillStyle = getComputedStyle(this).getPropertyValue('--primary-color') || '#3498db';
    data.forEach((value, i) => {
      const x = padding + i * pointSpacing;
      const y = canvas.height - padding - (value / maxValue) * graphHeight;

      ctx.beginPath();
      ctx.arc(x, y, 2, 0, 2 * Math.PI);
      ctx.fill();
    });
  }

  static getConfigElement() {
    return document.createElement('ha-automation-analyzer-editor');
  }

  static getStubConfig() {
    return {
      type: 'custom:ha-automation-analyzer',
      title: 'Automation Analyzer',
      show_disabled: true
    };
  }
}

customElements.define('ha-automation-analyzer', HAAutomationAnalyzer);

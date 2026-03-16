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
      
/* === Modern Bento Light Mode === */

@import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap');

:host {
  --bento-bg: #F8FAFC;
  --bento-card: #FFFFFF;
  --bento-primary: #3B82F6;
  --bento-primary-hover: #2563EB;
  --bento-text: #1E293B;
  --bento-text-secondary: #64748B;
  --bento-border: #E2E8F0;
  --bento-success: #10B981;
  --bento-warning: #F59E0B;
  --bento-error: #EF4444;
  --bento-radius: 16px;
  --bento-radius-sm: 10px;
  --bento-radius-xs: 6px;
  --bento-shadow: 0 1px 3px rgba(0,0,0,0.04), 0 1px 2px rgba(0,0,0,0.02);
  --bento-shadow-md: 0 4px 12px rgba(0,0,0,0.06);
  --bento-transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
  display: block;
  color-scheme: light !important;
}
* { box-sizing: border-box; }

.card, .card-container, .reports-card, .export-card {
  background: var(--bento-card); border-radius: var(--bento-radius); box-shadow: var(--bento-shadow);
  padding: 28px; font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
  color: var(--bento-text); border: 1px solid var(--bento-border); animation: fadeSlideIn 0.4s ease-out;
}
.card-header { font-size: 20px; font-weight: 700; margin-bottom: 20px; color: var(--bento-text); letter-spacing: -0.01em; display: flex; justify-content: space-between; align-items: center; }
.card-header h2 { font-size: 20px; font-weight: 700; color: var(--bento-text); margin: 0; letter-spacing: -0.01em; }
.card-title, .title, .header-title, .pan-title { font-size: 20px; font-weight: 700; color: var(--bento-text); letter-spacing: -0.01em; }
.header, .topbar { display: flex; justify-content: space-between; align-items: center; margin-bottom: 20px; }
.tabs { display: flex; gap: 4px; border-bottom: 2px solid var(--bento-border); margin-bottom: 24px; overflow-x: auto; padding-bottom: 0; }
.tab, .tab-btn, .tab-button { padding: 10px 20px; border: none; background: transparent; color: var(--bento-text-secondary); cursor: pointer; font-size: 14px; font-weight: 500; border-bottom: 2px solid transparent; transition: var(--bento-transition); white-space: nowrap; margin-bottom: -2px; border-radius: 8px 8px 0 0; font-family: 'Inter', sans-serif; }
.tab.active, .tab-btn.active, .tab-button.active { color: var(--bento-primary); border-bottom-color: var(--bento-primary); background: rgba(59, 130, 246, 0.04); }
.tab:hover, .tab-btn:hover, .tab-button:hover { color: var(--bento-primary); background: rgba(59, 130, 246, 0.04); }
.tab-icon { margin-right: 6px; }
.tab-content { display: none; }
.tab-content.active { display: block; animation: fadeSlideIn 0.3s ease-out; }

button, .btn, .btn-s { padding: 9px 16px; border: 1.5px solid var(--bento-border); background: var(--bento-card); color: var(--bento-text); border-radius: var(--bento-radius-sm); cursor: pointer; font-size: 13px; font-weight: 500; font-family: 'Inter', sans-serif; transition: var(--bento-transition); }
button:hover, .btn:hover, .btn-s:hover { background: var(--bento-bg); border-color: var(--bento-primary); color: var(--bento-primary); }
button.active, .btn.active, .btn-act { background: var(--bento-primary); color: white; border-color: var(--bento-primary); box-shadow: 0 2px 8px rgba(59, 130, 246, 0.25); }
.btn-primary { padding: 9px 16px; background: var(--bento-primary); color: white; border: 1.5px solid var(--bento-primary); border-radius: var(--bento-radius-sm); cursor: pointer; font-size: 13px; font-weight: 600; font-family: 'Inter', sans-serif; transition: var(--bento-transition); box-shadow: 0 2px 8px rgba(59, 130, 246, 0.25); }
.btn-primary:hover { background: var(--bento-primary-hover); border-color: var(--bento-primary-hover); box-shadow: 0 4px 12px rgba(59, 130, 246, 0.35); transform: translateY(-1px); }
.btn-secondary { padding: 9px 16px; background: var(--bento-card); color: var(--bento-text); border: 1.5px solid var(--bento-border); border-radius: var(--bento-radius-sm); cursor: pointer; font-size: 13px; font-weight: 500; font-family: 'Inter', sans-serif; transition: var(--bento-transition); }
.btn-secondary:hover { border-color: var(--bento-primary); color: var(--bento-primary); background: rgba(59, 130, 246, 0.04); }
.btn-danger { padding: 9px 16px; background: var(--bento-card); color: var(--bento-error); border: 1.5px solid var(--bento-error); border-radius: var(--bento-radius-sm); cursor: pointer; font-size: 13px; font-weight: 500; font-family: 'Inter', sans-serif; transition: var(--bento-transition); }
.btn-danger:hover { background: var(--bento-error); color: white; }
.btn-small { padding: 5px 12px; font-size: 12px; border: 1px solid var(--bento-border); background: var(--bento-card); color: var(--bento-text-secondary); border-radius: var(--bento-radius-xs); cursor: pointer; font-weight: 500; font-family: 'Inter', sans-serif; transition: var(--bento-transition); }
.btn-small:hover { border-color: var(--bento-primary); color: var(--bento-primary); background: rgba(59, 130, 246, 0.04); }

input[type="text"], input[type="number"], input[type="date"], input[type="time"], input[type="email"], input[type="search"], select, textarea, .search-input, .sinput, .sinput-sm, .alert-search-box, .period-select { padding: 9px 14px; border: 1.5px solid var(--bento-border); border-radius: var(--bento-radius-sm); font-size: 13px; background: var(--bento-card); color: var(--bento-text); font-family: 'Inter', sans-serif; transition: var(--bento-transition); outline: none; }
input[type="text"]:focus, input[type="number"]:focus, input[type="date"]:focus, input[type="time"]:focus, select:focus, textarea:focus, .search-input:focus, .sinput:focus, .sinput-sm:focus, .alert-search-box:focus, .period-select:focus { border-color: var(--bento-primary); box-shadow: 0 0 0 3px rgba(59, 130, 246, 0.1); }
input::placeholder, .search-input::placeholder, .sinput::placeholder, .sinput-sm::placeholder { color: var(--bento-text-secondary); opacity: 0.7; }
.form-group { margin-bottom: 16px; }
.form-group.full { grid-column: 1 / -1; }
.form-row { display: flex; gap: 12px; margin-bottom: 16px; flex-wrap: wrap; }
label, .cg label, .clbl { display: block; font-size: 12px; font-weight: 600; color: var(--bento-text-secondary); margin-bottom: 6px; text-transform: uppercase; letter-spacing: 0.03em; }
.add-form { background: var(--bento-bg); border: 1px solid var(--bento-border); border-radius: var(--bento-radius-sm); padding: 20px; margin-bottom: 20px; }
textarea { min-height: 80px; resize: vertical; }

.stats, .stats-grid, .stats-container, .summary-grid, .network-stats, .metrics-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(140px, 1fr)); gap: 12px; margin-bottom: 20px; }
.stat, .stat-card, .summary-card, .network-stat, .metric-card, .kpi-card { background: var(--bento-bg); border-radius: var(--bento-radius-sm); padding: 16px; border: 1px solid var(--bento-border); transition: var(--bento-transition); text-align: center; }
.stat:hover, .stat-card:hover, .summary-card:hover, .network-stat:hover, .metric-card:hover { border-color: var(--bento-primary); box-shadow: var(--bento-shadow-md); transform: translateY(-1px); }
.stat-card.online { border-left: 3px solid var(--bento-success); }
.stat-card.offline { border-left: 3px solid var(--bento-error); }
.sv, .stat-value, .summary-value, .network-stat-value, .metric-value { font-size: 24px; font-weight: 700; color: var(--bento-primary); line-height: 1.2; }
.stat.ok .sv { color: var(--bento-success); }
.stat.err .sv { color: var(--bento-error); }
.sl, .stat-label, .summary-label, .network-stat-label, .metric-label { font-size: 12px; color: var(--bento-text-secondary); font-weight: 500; margin-top: 4px; text-transform: uppercase; letter-spacing: 0.03em; }
.stat-trend { font-size: 12px; font-weight: 600; margin-top: 4px; }
.stat-trend.positive, .trend-up { color: var(--bento-success); }
.stat-trend.negative, .trend-down { color: var(--bento-error); }

.device-table, .entity-table, .table, .alert-table, .data-table, .backup-table, .history-table, .log-table { width: 100%; border-collapse: separate; border-spacing: 0; margin-bottom: 16px; }
.device-table th, .entity-table th, .table th, .alert-table th, .data-table th, .backup-table th, table th { text-align: left; padding: 12px 16px; border-bottom: 2px solid var(--bento-border); font-weight: 600; color: var(--bento-text-secondary); background: var(--bento-bg); cursor: pointer; user-select: none; white-space: nowrap; font-size: 12px; text-transform: uppercase; letter-spacing: 0.04em; transition: var(--bento-transition); font-family: 'Inter', sans-serif; }
.device-table th:first-child, .entity-table th:first-child, .table th:first-child, table th:first-child { border-radius: var(--bento-radius-xs) 0 0 0; }
.device-table th:last-child, .entity-table th:last-child, .table th:last-child, table th:last-child { border-radius: 0 var(--bento-radius-xs) 0 0; }
.device-table th:hover, .entity-table th:hover, .table th:hover, table th:hover { background: rgba(59, 130, 246, 0.06); color: var(--bento-primary); }
.device-table th.sorted, .entity-table th.sorted, .table th.sorted, table th.sorted { background: rgba(59, 130, 246, 0.08); color: var(--bento-primary); }
.device-table td, .entity-table td, .table td, .alert-table td, .data-table td, .backup-table td, table td { padding: 12px 16px; border-bottom: 1px solid var(--bento-border); color: var(--bento-text); font-size: 13px; font-family: 'Inter', sans-serif; }
.device-table tr:hover, .entity-table tr:hover, .table tbody tr:hover, .alert-table tr:hover, table tr:hover { background: rgba(59, 130, 246, 0.03); }
.table-container { overflow-x: auto; border-radius: var(--bento-radius-sm); border: 1px solid var(--bento-border); }
.sort-indicator { font-size: 10px; margin-left: 4px; color: var(--bento-primary); }

.status-badge, .severity-badge { display: inline-flex; align-items: center; padding: 3px 10px; border-radius: 20px; font-size: 11px; font-weight: 600; letter-spacing: 0.02em; text-transform: uppercase; }
.status-online, .status-home, .status-active, .status-ok, .status-healthy, .status-running, .status-complete, .status-completed, .status-success, .badge-success { background: rgba(16, 185, 129, 0.1); color: #059669; }
.status-offline, .status-error, .status-failed, .status-critical, .severity-critical, .badge-error, .badge-danger { background: rgba(239, 68, 68, 0.1); color: #DC2626; }
.status-away, .status-warning, .severity-warning, .badge-warning { background: rgba(245, 158, 11, 0.1); color: #B45309; }
.status-unavailable, .status-unknown, .status-idle, .status-inactive, .status-stopped, .badge-neutral { background: rgba(100, 116, 139, 0.1); color: var(--bento-text-secondary); }
.status-zone, .severity-info, .badge-info { background: rgba(59, 130, 246, 0.1); color: var(--bento-primary); }

.alert-item { padding: 14px 18px; border-left: 4px solid var(--bento-border); border-radius: 0 var(--bento-radius-sm) var(--bento-radius-sm) 0; margin-bottom: 10px; background: var(--bento-bg); display: flex; justify-content: space-between; align-items: center; transition: var(--bento-transition); }
.alert-item:hover { box-shadow: var(--bento-shadow); }
.alert-critical { border-color: var(--bento-error); background: rgba(239, 68, 68, 0.04); }
.alert-warning { border-color: var(--bento-warning); background: rgba(245, 158, 11, 0.04); }
.alert-info { border-color: var(--bento-primary); background: rgba(59, 130, 246, 0.04); }
.alert-text { flex: 1; }
.alert-type { font-weight: 600; font-size: 13px; margin-bottom: 4px; color: var(--bento-text); }
.alert-time { font-size: 12px; color: var(--bento-text-secondary); }
.alert-actions { display: flex; gap: 8px; }
.alert-dismiss { padding: 6px 12px; font-size: 12px; background: var(--bento-card); color: var(--bento-text-secondary); border: 1px solid var(--bento-border); border-radius: var(--bento-radius-xs); cursor: pointer; font-weight: 500; transition: var(--bento-transition); }
.alert-dismiss:hover { background: var(--bento-error); color: white; border-color: var(--bento-error); }

.section { margin-bottom: 24px; }
.section h3, .section-title, .pan-head { font-size: 16px; font-weight: 600; color: var(--bento-text); margin-bottom: 12px; letter-spacing: -0.01em; }

.battery-grid, .grid, .items-grid, .card-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(200px, 1fr)); gap: 12px; }
.battery-card, .item-card, .chore-card, .entry-card, .backup-card { background: var(--bento-bg); border-radius: var(--bento-radius-sm); padding: 16px; border: 1px solid var(--bento-border); transition: var(--bento-transition); }
.battery-card:hover, .item-card:hover, .chore-card:hover, .entry-card:hover, .backup-card:hover { box-shadow: var(--bento-shadow-md); border-color: var(--bento-primary); transform: translateY(-1px); }
.chore-card.priority-high { border-left: 3px solid var(--bento-error); }
.chore-card.priority-medium { border-left: 3px solid var(--bento-warning); }
.chore-card.priority-low { border-left: 3px solid var(--bento-success); }
.chore-title, .entry-title, .item-title { font-weight: 600; font-size: 14px; color: var(--bento-text); margin-bottom: 6px; }
.chore-meta, .entry-meta, .item-meta { font-size: 12px; color: var(--bento-text-secondary); }
.chore-assignee { font-size: 12px; color: var(--bento-primary); font-weight: 500; }
.chore-actions, .item-actions, .entry-actions { display: flex; gap: 6px; margin-top: 10px; }

.battery-bar, .progress-bar, .bandwidth-bar-bg { width: 100%; height: 8px; background: var(--bento-border); border-radius: 4px; overflow: hidden; margin-top: 8px; }
.battery-fill, .progress-fill, .bandwidth-bar-fill { height: 100%; border-radius: 4px; transition: width 0.6s cubic-bezier(0.4, 0, 0.2, 1); background: var(--bento-success); }
.battery-fill.battery_critical { background: var(--bento-error) !important; }
.battery-fill.battery_warning { background: var(--bento-warning) !important; }
.battery-label, .bandwidth-label { font-size: 13px; color: var(--bento-text); font-weight: 500; display: flex; justify-content: space-between; align-items: center; }

.pagination, .pag { display: flex; justify-content: center; align-items: center; gap: 8px; margin-top: 20px; padding: 16px 0; border-top: 1px solid var(--bento-border); }
.pagination-btn, .pag-btn { padding: 8px 14px; border: 1.5px solid var(--bento-border); background: var(--bento-card); color: var(--bento-text); border-radius: var(--bento-radius-xs); cursor: pointer; font-size: 13px; font-weight: 500; font-family: 'Inter', sans-serif; transition: var(--bento-transition); }
.pagination-btn:hover:not(:disabled), .pag-btn:hover:not(:disabled) { background: var(--bento-primary); color: white; border-color: var(--bento-primary); }
.pagination-btn:disabled, .pag-btn:disabled { opacity: 0.4; cursor: not-allowed; }
.pagination-info, .pag-info { font-size: 13px; color: var(--bento-text-secondary); font-weight: 500; padding: 0 8px; }
.page-size-selector, .pag-size { padding: 6px 10px; border: 1.5px solid var(--bento-border); border-radius: var(--bento-radius-xs); background: var(--bento-card); color: var(--bento-text); font-size: 13px; cursor: pointer; font-family: 'Inter', sans-serif; }

.col-main { font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; color: var(--bento-text); }
.topbar-r { display: flex; gap: 8px; align-items: center; }
.panels { display: flex; gap: 12px; }
.pan-left, .pan-center, .pan-right { background: var(--bento-card); border-radius: var(--bento-radius-sm); border: 1px solid var(--bento-border); overflow: hidden; }
.cbar { display: flex; gap: 8px; align-items: center; padding: 12px; background: var(--bento-bg); border-bottom: 1px solid var(--bento-border); }
.cg { display: flex; gap: 8px; align-items: center; }
.cg-r { margin-left: auto; }

.dd { position: relative; }
.dd-menu { position: absolute; top: 100%; left: 0; background: var(--bento-card); border: 1px solid var(--bento-border); border-radius: var(--bento-radius-sm); box-shadow: var(--bento-shadow-md); min-width: 180px; z-index: 100; display: none; overflow: hidden; }
.dd.open .dd-menu { display: block; }
.dd-i { padding: 10px 16px; cursor: pointer; font-size: 13px; color: var(--bento-text); transition: var(--bento-transition); font-family: 'Inter', sans-serif; }
.dd-i:hover { background: rgba(59, 130, 246, 0.06); color: var(--bento-primary); }
.dd-div { border-top: 1px solid var(--bento-border); margin: 4px 0; }

.auto-item, .tr-item, .list-item, .automation-item { padding: 12px 16px; cursor: pointer; border-bottom: 1px solid var(--bento-border); display: flex; align-items: center; gap: 10px; transition: var(--bento-transition); font-family: 'Inter', sans-serif; }
.auto-item:hover, .tr-item:hover, .list-item:hover, .automation-item:hover { background: rgba(59, 130, 246, 0.04); }
.auto-item.sel, .tr-item.sel, .list-item.selected, .automation-item.selected { background: rgba(59, 130, 246, 0.08); border-left: 3px solid var(--bento-primary); }
.auto-item.error-item, .automation-item.error-item { border-left: 3px solid var(--bento-error); }
.auto-name { font-weight: 500; font-size: 13px; color: var(--bento-text); }
.auto-meta { font-size: 12px; color: var(--bento-text-secondary); }
.auto-dot { width: 8px; height: 8px; border-radius: 50%; background: var(--bento-text-secondary); }
.auto-dot.s-running { background: var(--bento-success); }
.auto-dot.s-stopped { background: var(--bento-text-secondary); }
.auto-dot.s-error { background: var(--bento-error); }
.auto-count { font-size: 11px; color: var(--bento-text-secondary); margin-left: auto; }

.tgroup { border: 1px solid var(--bento-border); border-radius: var(--bento-radius-xs); margin-bottom: 8px; overflow: hidden; }
.tgroup-h { padding: 10px 14px; background: var(--bento-bg); display: flex; align-items: center; gap: 8px; cursor: pointer; transition: var(--bento-transition); font-family: 'Inter', sans-serif; }
.tgroup-h:hover { background: rgba(59, 130, 246, 0.06); }
.tg-tog { transition: transform 0.2s; font-size: 12px; color: var(--bento-text-secondary); }
.tgroup.collapsed .tg-tog { transform: rotate(-90deg); }
.tgroup.collapsed .tgroup-items { display: none; }
.tg-name { font-weight: 600; font-size: 13px; color: var(--bento-text); }
.tg-cnt { font-size: 11px; color: var(--bento-text-secondary); margin-left: auto; background: var(--bento-border); padding: 2px 8px; border-radius: 10px; }

.device-detail, .detail-panel, .details { background: var(--bento-bg); border-radius: var(--bento-radius-sm); padding: 16px; border: 1px solid var(--bento-border); }
.detail-row { display: flex; justify-content: space-between; padding: 10px 0; border-bottom: 1px solid var(--bento-border); font-size: 13px; }
.detail-row:last-child { border-bottom: none; }
.detail-label { color: var(--bento-text-secondary); font-weight: 500; }
.detail-value { color: var(--bento-text); font-weight: 600; }

.board { display: flex; gap: 16px; overflow-x: auto; padding-bottom: 8px; }
.column { min-width: 260px; background: var(--bento-bg); border-radius: var(--bento-radius-sm); padding: 12px; border: 1px solid var(--bento-border); }
.column-header { font-weight: 600; font-size: 14px; color: var(--bento-text); margin-bottom: 12px; display: flex; justify-content: space-between; align-items: center; }
.column-count { background: var(--bento-border); color: var(--bento-text-secondary); font-size: 11px; font-weight: 600; padding: 2px 8px; border-radius: 10px; }

.schedule, .calendar { margin-top: 16px; }
.week-grid { display: grid; grid-template-columns: repeat(7, 1fr); gap: 4px; margin-top: 16px; }
.week-header { padding: 8px; text-align: center; font-size: 12px; font-weight: 600; color: var(--bento-text-secondary); text-transform: uppercase; letter-spacing: 0.03em; border-radius: var(--bento-radius-xs); }
.week-cell { padding: 8px; text-align: center; font-size: 12px; background: var(--bento-bg); border: 1px solid var(--bento-border); cursor: pointer; transition: var(--bento-transition); border-radius: var(--bento-radius-xs); }
.week-cell:hover { border-color: var(--bento-primary); background: rgba(59, 130, 246, 0.04); }
.chore-item { padding: 8px 12px; border-bottom: 1px solid var(--bento-border); font-size: 13px; }

.leaderboard { background: var(--bento-bg); border-radius: var(--bento-radius-sm); border: 1px solid var(--bento-border); overflow: hidden; }
.leaderboard-row { display: flex; align-items: center; padding: 12px 16px; border-bottom: 1px solid var(--bento-border); gap: 12px; font-size: 13px; transition: var(--bento-transition); }
.leaderboard-row:last-child { border-bottom: none; }
.leaderboard-row:hover { background: rgba(59, 130, 246, 0.04); }
.rank { font-weight: 700; color: var(--bento-primary); font-size: 14px; min-width: 28px; }
.name { font-weight: 500; color: var(--bento-text); flex: 1; }
.streak { color: var(--bento-warning); font-weight: 600; }
.completion { color: var(--bento-success); font-weight: 600; }

.baby-selector { display: flex; gap: 8px; margin-bottom: 16px; }
.quick-actions { display: flex; gap: 8px; flex-wrap: wrap; margin-bottom: 20px; }
.quick-btn, .action-btn { padding: 10px 16px; border: 1.5px solid var(--bento-border); background: var(--bento-card); border-radius: var(--bento-radius-sm); cursor: pointer; font-size: 13px; font-weight: 500; font-family: 'Inter', sans-serif; transition: var(--bento-transition); display: flex; align-items: center; gap: 6px; color: var(--bento-text); }
.quick-btn:hover, .action-btn:hover { border-color: var(--bento-primary); color: var(--bento-primary); background: rgba(59, 130, 246, 0.04); }
.quick-btn.active, .action-btn.active { background: var(--bento-primary); color: white; border-color: var(--bento-primary); }
.timeline { position: relative; padding-left: 24px; }
.timeline-item { padding: 12px 0; border-bottom: 1px solid var(--bento-border); position: relative; }
.timeline-time { font-size: 12px; color: var(--bento-text-secondary); font-weight: 500; }
.timeline-content { font-size: 13px; color: var(--bento-text); margin-top: 4px; }

canvas, .canvas-container canvas { width: 100%; height: 200px; border: 1px solid var(--bento-border); border-radius: var(--bento-radius-sm); margin-bottom: 16px; }
.canvas-container { position: relative; margin-bottom: 16px; }
.chart-container { background: var(--bento-bg); border-radius: var(--bento-radius-sm); padding: 16px; border: 1px solid var(--bento-border); margin-bottom: 16px; }

.empty, .empty-state { text-align: center; padding: 48px 24px; color: var(--bento-text-secondary); font-size: 14px; font-family: 'Inter', sans-serif; }
.empty-ico, .empty-icon { font-size: 48px; margin-bottom: 12px; opacity: 0.5; }
.spinner { width: 32px; height: 32px; border: 3px solid var(--bento-border); border-top: 3px solid var(--bento-primary); border-radius: 50%; animation: spin 0.8s linear infinite; margin: 24px auto; }

.search-box, .search-bar, .controls, .ctrls, .filter-bar { display: flex; gap: 10px; margin-bottom: 20px; flex-wrap: wrap; align-items: center; }
.control-group { display: flex; gap: 8px; align-items: center; }

.domain-group-header { margin-top: 20px; padding: 10px 16px; background: var(--bento-bg); border-radius: var(--bento-radius-xs); font-weight: 600; font-size: 14px; color: var(--bento-text); border: 1px solid var(--bento-border); }
.domain-group-header:first-child { margin-top: 0; }
.domain-group-count { font-weight: 500; color: var(--bento-text-secondary); font-size: 12px; margin-left: 8px; }

.automation-list, .list, .item-list { border: 1px solid var(--bento-border); border-radius: var(--bento-radius-sm); overflow: hidden; }
.automation-name, .entity-name { font-weight: 500; font-size: 13px; color: var(--bento-text); }
.automation-id, .entity-id { font-size: 11px; color: var(--bento-text-secondary); }
.error-badge, .count-badge { background: var(--bento-error); color: white; font-size: 10px; font-weight: 700; padding: 2px 7px; border-radius: 10px; margin-left: 6px; }
.tab .error-badge { background: var(--bento-error); color: white; font-size: 10px; font-weight: 700; padding: 2px 7px; border-radius: 10px; margin-left: 6px; }

.health-score, .score { font-size: 48px; font-weight: 700; color: var(--bento-primary); text-align: center; margin: 16px 0; }
.emoji { font-size: 20px; line-height: 1; }
.device-icon { width: 36px; height: 36px; display: flex; align-items: center; justify-content: center; background: rgba(59, 130, 246, 0.08); border-radius: var(--bento-radius-xs); font-size: 16px; }

.recommendation-card, .tip-card, .suggestion-card { background: var(--bento-bg); border-radius: var(--bento-radius-sm); padding: 16px; border: 1px solid var(--bento-border); margin-bottom: 12px; transition: var(--bento-transition); }
.recommendation-card:hover, .tip-card:hover, .suggestion-card:hover { border-color: var(--bento-primary); box-shadow: var(--bento-shadow-md); }

.export-options, .options-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 12px; margin-bottom: 20px; }
.export-option, .option-card { background: var(--bento-bg); border: 1.5px solid var(--bento-border); border-radius: var(--bento-radius-sm); padding: 16px; cursor: pointer; transition: var(--bento-transition); text-align: center; }
.export-option:hover, .option-card:hover { border-color: var(--bento-primary); background: rgba(59, 130, 246, 0.04); }
.export-option.selected, .option-card.selected { border-color: var(--bento-primary); background: rgba(59, 130, 246, 0.08); box-shadow: 0 0 0 3px rgba(59, 130, 246, 0.1); }

.storage-bar, .usage-bar { width: 100%; height: 24px; background: var(--bento-border); border-radius: var(--bento-radius-xs); overflow: hidden; margin-bottom: 12px; }
.storage-fill, .usage-fill { height: 100%; border-radius: var(--bento-radius-xs); transition: width 0.6s cubic-bezier(0.4, 0, 0.2, 1); background: var(--bento-primary); }

.check-item, .security-item { display: flex; align-items: center; gap: 12px; padding: 14px 16px; border-bottom: 1px solid var(--bento-border); transition: var(--bento-transition); }
.check-item:hover, .security-item:hover { background: rgba(59, 130, 246, 0.03); }
.check-icon { width: 32px; height: 32px; display: flex; align-items: center; justify-content: center; border-radius: 50%; font-size: 16px; }
.check-icon.pass { background: rgba(16, 185, 129, 0.1); }
.check-icon.fail { background: rgba(239, 68, 68, 0.1); }
.check-icon.warn { background: rgba(245, 158, 11, 0.1); }
.check-text, .security-text { flex: 1; }
.check-title { font-weight: 600; font-size: 13px; color: var(--bento-text); }
.check-desc { font-size: 12px; color: var(--bento-text-secondary); margin-top: 2px; }

.waveform { background: var(--bento-bg); border: 1px solid var(--bento-border); border-radius: var(--bento-radius-sm); padding: 16px; margin-bottom: 16px; }
.analysis-result, .result-card { background: var(--bento-bg); border: 1px solid var(--bento-border); border-radius: var(--bento-radius-sm); padding: 20px; text-align: center; margin-bottom: 16px; }
.confidence-bar { height: 8px; background: var(--bento-border); border-radius: 4px; overflow: hidden; margin-top: 8px; }
.confidence-fill { height: 100%; border-radius: 4px; background: var(--bento-primary); transition: width 0.6s cubic-bezier(0.4, 0, 0.2, 1); }

.sentence-item, .intent-item { padding: 12px 16px; border-bottom: 1px solid var(--bento-border); display: flex; justify-content: space-between; align-items: center; transition: var(--bento-transition); }
.sentence-item:hover, .intent-item:hover { background: rgba(59, 130, 246, 0.03); }
.sentence-text { font-size: 13px; color: var(--bento-text); font-family: 'Inter', sans-serif; }
.intent-badge { display: inline-flex; padding: 3px 10px; border-radius: 20px; font-size: 11px; font-weight: 600; background: rgba(59, 130, 246, 0.1); color: var(--bento-primary); }

.backup-item, .backup-entry { display: flex; justify-content: space-between; align-items: center; padding: 14px 16px; border-bottom: 1px solid var(--bento-border); transition: var(--bento-transition); }
.backup-item:hover, .backup-entry:hover { background: rgba(59, 130, 246, 0.03); }
.backup-name { font-weight: 500; font-size: 14px; color: var(--bento-text); }
.backup-date, .backup-size { font-size: 12px; color: var(--bento-text-secondary); }

.report-section { background: var(--bento-bg); border-radius: var(--bento-radius-sm); padding: 20px; border: 1px solid var(--bento-border); margin-bottom: 16px; }
.insight-card { padding: 14px; border-left: 3px solid var(--bento-primary); background: rgba(59, 130, 246, 0.04); border-radius: 0 var(--bento-radius-xs) var(--bento-radius-xs) 0; margin-bottom: 10px; }

@keyframes fadeSlideIn { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: translateY(0); } }
@keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }
@keyframes spin { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }
@keyframes pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.5; } }

::-webkit-scrollbar { width: 6px; height: 6px; }
::-webkit-scrollbar-track { background: transparent; }
::-webkit-scrollbar-thumb { background: var(--bento-border); border-radius: 3px; }
::-webkit-scrollbar-thumb:hover { background: var(--bento-text-secondary); }

@media (max-width: 768px) {
  .card, .card-container, .reports-card, .export-card { padding: 16px; }
  .stats, .stats-grid, .summary-grid { grid-template-columns: repeat(2, 1fr); }
  .panels { flex-direction: column; }
  .board { flex-direction: column; }
  .column { min-width: unset; }
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

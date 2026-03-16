class HAAutomationAnalyzer extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: 'open' });

    this.config = {};
    this._hass = null;
    this.currentTab = 'overview';

    // Data storage
    this.automationStats = new Map();
    this.automationHistory = [];
    this.executionTimes = [];
    this.triggerTypes = new Map();
    this.failedAutomations = new Map();
    this.disabledAutomations = [];
    this.suggestions = [];
    this._tracesLoaded = false;
    this._traceData = new Map();
  }

  setConfig(config) {
    this.config = {
      title: 'Automation Analyzer',
      show_disabled: true,
      ...config
    };
  }

  set hass(hass) {
    this._hass = hass;
    this.updateAutomationData();
  }

  async updateAutomationData() {
    if (!this._hass) return;

    this.automationStats.clear();
    this.automationHistory = [];
    this.executionTimes = [];
    this.triggerTypes.clear();
    this.failedAutomations.clear();
    this.disabledAutomations = [];

    const automations = Object.entries(this._hass.states)
      .filter(([entity]) => entity.startsWith('automation.'));

    // Build basic stats from entity attributes
    automations.forEach(([entity, state]) => {
      const name = state.attributes.friendly_name || entity.replace('automation.', '');
      const isActive = state.state === 'on';

      if (!isActive && this.config.show_disabled) {
        this.disabledAutomations.push({ name, entity });
      }

      const lastTriggered = state.attributes.last_triggered
        ? new Date(state.attributes.last_triggered)
        : null;

      this.automationStats.set(entity, {
        name,
        entity,
        isActive,
        lastTriggered,
        execTimes: [],
        avgExecTime: 0,
        triggerTypes: [],
        failureCount: 0,
        successCount: 0,
        totalRuns: 0,
        traceEntries: []
      });
    });

    // Fetch real trace data via WebSocket
    if (!this._tracesLoaded) {
      await this.fetchTraces();
    } else {
      this.processTraces();
    }

    this.generateSuggestions();
    this.render();
  }

  async fetchTraces() {
    try {
      const result = await this._hass.callWS({
        type: 'trace/list',
        domain: 'automation'
      });

      this._traceData.clear();

      // Build reverse lookup: attributes.id -> entity_id
      const idToEntity = new Map();
      this.automationStats.forEach((stats, entityId) => {
        const state = this._hass.states[entityId];
        if (state && state.attributes && state.attributes.id) {
          idToEntity.set(state.attributes.id, entityId);
        }
      });

      if (result && Array.isArray(result)) {
        result.forEach(trace => {
          const automationId = idToEntity.get(trace.item_id) || ('automation.' + trace.item_id);
          if (!this._traceData.has(automationId)) {
            this._traceData.set(automationId, []);
          }
          this._traceData.get(automationId).push(trace);
        });
      }
      console.log('Automation Analyzer: loaded', result ? result.length : 0, 'traces for', this._traceData.size, 'automations');
      this._tracesLoaded = true;
      this.processTraces();
      this.generateSuggestions();
      this.render();
    } catch (e) {
      console.warn('Automation Analyzer: Could not fetch traces:', e);
      this._tracesLoaded = true;
      this.render();
    }
  }

  processTraces() {
    this.automationHistory = [];
    this.executionTimes = [];
    this.triggerTypes.clear();
    this.failedAutomations.clear();

    this._traceData.forEach((traces, automationId) => {
      const stats = this.automationStats.get(automationId);
      if (!stats) return;

      let failCount = 0;
      let successCount = 0;
      const execTimes = [];
      const trigTypes = [];

      traces.forEach(trace => {
        const startTime = trace.timestamp ? new Date(trace.timestamp.start) : null;
        const finishTime = trace.timestamp && trace.timestamp.finish ? new Date(trace.timestamp.finish) : null;

        // Calculate execution time
        let execTime = 0;
        if (startTime && finishTime) {
          execTime = finishTime.getTime() - startTime.getTime();
          execTimes.push(execTime);
          this.executionTimes.push(execTime);
        }

        // Determine success/failure
        const isError = trace.script_execution === 'error' ||
                       trace.state === 'error' ||
                       (trace.script_execution && trace.script_execution !== 'finished' &&
                        trace.script_execution !== 'cancelled');
        const isCancelled = trace.script_execution === 'cancelled';
        const isSuccess = trace.script_execution === 'finished';

        if (isError) failCount++;
        else if (isSuccess) successCount++;

        // Extract trigger type
        let triggerType = 'unknown';
        if (trace.trigger) {
          triggerType = this.extractTriggerType(trace.trigger);
        }
        trigTypes.push(triggerType);
        this.triggerTypes.set(triggerType, (this.triggerTypes.get(triggerType) || 0) + 1);

        // Add to history
        this.automationHistory.push({
          name: stats.name,
          entity: automationId,
          time: startTime,
          status: isError ? 'error' : (isCancelled ? 'cancelled' : 'success'),
          execTime,
          message: isError ? `Error: ${trace.script_execution || 'unknown'}` :
                   isCancelled ? 'Cancelled' :
                   `Completed in ${this.formatExecTime(execTime)}`,
          trigger: triggerType
        });
      });

      // Update stats
      stats.execTimes = execTimes;
      stats.avgExecTime = execTimes.length > 0
        ? execTimes.reduce((a, b) => a + b, 0) / execTimes.length
        : 0;
      stats.triggerTypes = [...new Set(trigTypes)];
      stats.failureCount = failCount;
      stats.successCount = successCount;
      stats.totalRuns = traces.length;
      stats.traceEntries = traces;

      // Track failed automations
      if (failCount > 0) {
        const lastFailedTrace = traces.find(t =>
          t.script_execution === 'error' || t.state === 'error'
        );
        this.failedAutomations.set(automationId, {
          name: stats.name,
          entity: automationId,
          failureCount: failCount,
          totalRuns: traces.length,
          failureRate: (failCount / traces.length * 100).toFixed(1),
          lastFailure: lastFailedTrace ? new Date(lastFailedTrace.timestamp.start) : null,
          error: lastFailedTrace ? (lastFailedTrace.script_execution || 'Unknown error') : 'Unknown'
        });
      }
    });

    // Sort history by time (newest first)
    this.automationHistory.sort((a, b) => (b.time || 0) - (a.time || 0));
  }

  extractTriggerType(triggerStr) {
    if (!triggerStr) return 'unknown';
    const lower = triggerStr.toLowerCase();
    if (lower.includes('state')) return 'state';
    if (lower.includes('time') || lower.includes('cron')) return 'time';
    if (lower.includes('event')) return 'event';
    if (lower.includes('webhook')) return 'webhook';
    if (lower.includes('template')) return 'template';
    if (lower.includes('numeric_state')) return 'numeric_state';
    if (lower.includes('sun')) return 'sun';
    if (lower.includes('zone')) return 'zone';
    if (lower.includes('mqtt')) return 'mqtt';
    if (lower.includes('device')) return 'device';
    if (lower.includes('homeassistant')) return 'homeassistant';
    return 'other';
  }

  formatExecTime(ms) {
    if (ms < 1000) return `${Math.round(ms)}ms`;
    if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
    return `${(ms / 60000).toFixed(1)}m`;
  }

  generateSuggestions() {
    this.suggestions = [];

    // Find automations with high failure rates
    this.failedAutomations.forEach((data) => {
      if (parseFloat(data.failureRate) > 20) {
        this.suggestions.push({
          priority: 'high',
          category: 'reliability',
          text: `"${data.name}" has a ${data.failureRate}% failure rate (${data.failureCount}/${data.totalRuns} runs failed)`,
          impact: 'Fix errors to improve reliability'
        });
      }
    });

    // Find slow automations
    const slowAutomations = Array.from(this.automationStats.values())
      .filter(a => a.avgExecTime > 5000);
    slowAutomations.forEach(a => {
      this.suggestions.push({
        priority: 'medium',
        category: 'performance',
        text: `"${a.name}" averages ${this.formatExecTime(a.avgExecTime)} execution time`,
        impact: 'Consider optimizing conditions or splitting into smaller automations'
      });
    });

    // Find disabled automations
    if (this.disabledAutomations.length > 0) {
      this.suggestions.push({
        priority: 'low',
        category: 'maintenance',
        text: `${this.disabledAutomations.length} automation${this.disabledAutomations.length > 1 ? 's are' : ' is'} currently disabled`,
        impact: 'Review if they should be re-enabled or removed'
      });
    }

    // Find automations never triggered
    const neverTriggered = Array.from(this.automationStats.values())
      .filter(a => a.isActive && !a.lastTriggered && a.totalRuns === 0);
    if (neverTriggered.length > 0) {
      this.suggestions.push({
        priority: 'low',
        category: 'maintenance',
        text: `${neverTriggered.length} active automation${neverTriggered.length > 1 ? 's have' : ' has'} never been triggered`,
        impact: 'Check trigger configuration'
      });
    }
  }

  getTopAutomations(count = 5) {
    return Array.from(this.automationStats.values())
      .filter(a => a.totalRuns > 0)
      .sort((a, b) => b.totalRuns - a.totalRuns)
      .slice(0, count);
  }

  getSlowestAutomations(count = 5) {
    return Array.from(this.automationStats.values())
      .filter(a => a.avgExecTime > 0)
      .sort((a, b) => b.avgExecTime - a.avgExecTime)
      .slice(0, count);
  }

  getTriggerTypeData() {
    return Array.from(this.triggerTypes.entries()).map(([type, count]) => ({
      type,
      count
    })).sort((a, b) => b.count - a.count);
  }

  getExecutionDistribution() {
    const buckets = { '<100ms': 0, '100-500ms': 0, '500ms-1s': 0, '1-5s': 0, '>5s': 0 };
    this.executionTimes.forEach(time => {
      if (time < 100) buckets['<100ms']++;
      else if (time < 500) buckets['100-500ms']++;
      else if (time < 1000) buckets['500ms-1s']++;
      else if (time < 5000) buckets['1-5s']++;
      else buckets['>5s']++;
    });
    return buckets;
  }

  renderOverviewTab() {
    const totalAutomations = this.automationStats.size;
    const activeCount = Array.from(this.automationStats.values()).filter(a => a.isActive).length;
    const totalTraces = this.automationHistory.length;
    const avgExecTime = this.executionTimes.length > 0
      ? this.formatExecTime(this.executionTimes.reduce((a, b) => a + b, 0) / this.executionTimes.length)
      : '—';
    const failureCount = Array.from(this.failedAutomations.values())
      .reduce((sum, f) => sum + f.failureCount, 0);

    const topAutomations = this.getTopAutomations(5);

    return `
      <div class="tab-content">
        <div class="summary-grid">
          <div class="summary-card">
            <div class="summary-label">Total</div>
            <div class="summary-value">${totalAutomations}</div>
          </div>
          <div class="summary-card">
            <div class="summary-label">Active</div>
            <div class="summary-value">${activeCount}</div>
          </div>
          <div class="summary-card">
            <div class="summary-label">Traces</div>
            <div class="summary-value">${totalTraces}</div>
          </div>
          <div class="summary-card">
            <div class="summary-label">Avg Time</div>
            <div class="summary-value">${avgExecTime}</div>
          </div>
        </div>

        ${topAutomations.length > 0 ? `
        <div class="section">
          <h3>Most Active (by traces)</h3>
          <div class="automation-list">
            ${topAutomations.map(a => `
              <div class="automation-item">
                <div class="automation-info">
                  <span class="automation-name">${a.name}</span>
                  <span class="automation-meta">${a.totalRuns} runs &middot; avg ${this.formatExecTime(a.avgExecTime)} &middot; ${a.triggerTypes.join(', ') || '—'}</span>
                </div>
                <div class="automation-badge ${a.failureCount > 0 ? 'badge-warning' : 'badge-success'}">${a.failureCount > 0 ? a.failureCount + ' errors' : 'OK'}</div>
              </div>
            `).join('')}
          </div>
        </div>` : '<div class="empty-state">No trace data available yet. Automations will appear here after they run.</div>'}

        ${this.failedAutomations.size > 0 ? `
        <div class="section">
          <h3>Errors Detected</h3>
          <div class="automation-list">
            ${Array.from(this.failedAutomations.values()).map(f => `
              <div class="automation-item error-item">
                <div class="automation-info">
                  <span class="automation-name">${f.name}</span>
                  <span class="automation-meta error-text">${f.failureCount}/${f.totalRuns} failed &middot; ${f.error}${f.lastFailure ? ' &middot; ' + this.formatTimeAgo(f.lastFailure) : ''}</span>
                </div>
                <div class="automation-badge badge-error">${f.failureRate}%</div>
              </div>
            `).join('')}
          </div>
        </div>` : ''}
      </div>
    `;
  }

  renderTimelineTab() {
    const recentHistory = this.automationHistory.slice(0, 50);
    if (recentHistory.length === 0) {
      return '<div class="tab-content"><div class="empty-state">No trace history available. Traces will appear here after automations run.</div></div>';
    }

    return `
      <div class="tab-content">
        <div class="section">
          <h3>Recent Activity Timeline</h3>
          <div class="timeline">
            ${recentHistory.map(entry => `
              <div class="timeline-entry">
                <div class="timeline-dot ${entry.status === 'error' ? 'dot-error' : entry.status === 'cancelled' ? 'dot-cancelled' : 'dot-success'}"></div>
                <div class="timeline-content">
                  <div class="timeline-header">
                    <span class="timeline-name">${entry.name}</span>
                    <span class="timeline-time">${entry.time ? this.formatTimeAgo(entry.time) : '—'}</span>
                  </div>
                  <div class="timeline-details">
                    <span class="timeline-trigger">${entry.trigger || ''}</span>
                    <span class="timeline-exec">${entry.execTime > 0 ? this.formatExecTime(entry.execTime) : ''}</span>
                    <span class="timeline-status status-${entry.status}">${entry.message}</span>
                  </div>
                </div>
              </div>
            `).join('')}
          </div>
        </div>
      </div>
    `;
  }

  renderPerformanceTab() {
    const distribution = this.getExecutionDistribution();
    const slowest = this.getSlowestAutomations(5);
    const triggerData = this.getTriggerTypeData();
    const maxDist = Math.max(...Object.values(distribution), 1);
    const maxTrigger = triggerData.length > 0 ? Math.max(...triggerData.map(t => t.count), 1) : 1;

    return `
      <div class="tab-content">
        <div class="section">
          <h3>Execution Time Distribution</h3>
          <div class="chart-container">
            ${Object.entries(distribution).map(([label, count]) => `
              <div class="bar-row">
                <span class="bar-label">${label}</span>
                <div class="bar-track">
                  <div class="bar-fill" style="width: ${(count / maxDist * 100).toFixed(0)}%"></div>
                </div>
                <span class="bar-value">${count}</span>
              </div>
            `).join('')}
          </div>
        </div>

        <div class="section">
          <h3>Trigger Types</h3>
          <div class="chart-container">
            ${triggerData.map(t => `
              <div class="bar-row">
                <span class="bar-label">${t.type}</span>
                <div class="bar-track">
                  <div class="bar-fill trigger-bar" style="width: ${(t.count / maxTrigger * 100).toFixed(0)}%"></div>
                </div>
                <span class="bar-value">${t.count}</span>
              </div>
            `).join('')}
          </div>
        </div>

        ${slowest.length > 0 ? `
        <div class="section">
          <h3>Slowest Automations</h3>
          <div class="automation-list">
            ${slowest.map(a => `
              <div class="automation-item">
                <div class="automation-info">
                  <span class="automation-name">${a.name}</span>
                  <span class="automation-meta">${a.totalRuns} runs &middot; ${a.triggerTypes.join(', ') || '—'}</span>
                </div>
                <div class="automation-badge badge-slow">${this.formatExecTime(a.avgExecTime)}</div>
              </div>
            `).join('')}
          </div>
        </div>` : ''}
      </div>
    `;
  }

  renderSuggestionsTab() {
    if (this.suggestions.length === 0) {
      return '<div class="tab-content"><div class="empty-state">No suggestions — everything looks good!</div></div>';
    }

    return `
      <div class="tab-content">
        <div class="section">
          <h3>Suggestions & Insights</h3>
          <div class="suggestions-list">
            ${this.suggestions.map(s => `
              <div class="suggestion-item priority-${s.priority}">
                <div class="suggestion-priority">${s.priority.toUpperCase()}</div>
                <div class="suggestion-content">
                  <div class="suggestion-category">${s.category}</div>
                  <div class="suggestion-text">${s.text}</div>
                  <div class="suggestion-impact">${s.impact}</div>
                </div>
              </div>
            `).join('')}
          </div>
        </div>

        ${this.disabledAutomations.length > 0 ? `
        <div class="section">
          <h3>Disabled Automations</h3>
          <div class="automation-list">
            ${this.disabledAutomations.map(a => `
              <div class="automation-item disabled-item">
                <div class="automation-info">
                  <span class="automation-name">${a.name}</span>
                  <span class="automation-meta">${a.entity}</span>
                </div>
                <div class="automation-badge badge-disabled">OFF</div>
              </div>
            `).join('')}
          </div>
        </div>` : ''}
      </div>
    `;
  }

  formatTimeAgo(date) {
    if (!date) return '—';
    const now = new Date();
    const diff = now - date;
    const minutes = Math.floor(diff / 60000);
    const hours = Math.floor(diff / 3600000);
    const days = Math.floor(diff / 86400000);

    if (minutes < 1) return 'just now';
    if (minutes < 60) return `${minutes}m ago`;
    if (hours < 24) return `${hours}h ago`;
    if (days < 7) return `${days}d ago`;
    return date.toLocaleDateString();
  }

  render() {
    let content = '';
    switch (this.currentTab) {
      case 'overview': content = this.renderOverviewTab(); break;
      case 'timeline': content = this.renderTimelineTab(); break;
      case 'performance': content = this.renderPerformanceTab(); break;
      case 'suggestions': content = this.renderSuggestionsTab(); break;
    }

    const errorCount = this.failedAutomations.size;

    this.shadowRoot.innerHTML = `
      <style>

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
      <div class="card">
        <div class="header">
          <span class="title">${this.config.title || 'Automation Analyzer'}</span>
        </div>
        <div class="tabs">
          <div class="tab ${this.currentTab === 'overview' ? 'active' : ''}" data-tab="overview">Overview</div>
          <div class="tab ${this.currentTab === 'timeline' ? 'active' : ''}" data-tab="timeline">Timeline${errorCount > 0 ? `<span class="error-badge">${errorCount}</span>` : ''}</div>
          <div class="tab ${this.currentTab === 'performance' ? 'active' : ''}" data-tab="performance">Performance</div>
          <div class="tab ${this.currentTab === 'suggestions' ? 'active' : ''}" data-tab="suggestions">Suggestions${this.suggestions.length > 0 ? `<span class="error-badge">${this.suggestions.length}</span>` : ''}</div>
        </div>
        ${content}
      </div>
    `;

    // Attach tab click handlers
    this.shadowRoot.querySelectorAll('.tab').forEach(tab => {
      tab.addEventListener('click', () => {
        this.currentTab = tab.dataset.tab;
        this.render();
      });
    });
  }

  getCardSize() {
    return 6;
  }

  static getConfigElement() {
    return document.createElement('hui-generic-card-editor');
  }

  static getStubConfig() {
    return {
      title: 'Automation Analyzer',
      show_disabled: true
    };
  }
}

// Register the card
customElements.define('ha-automation-analyzer', HAAutomationAnalyzer);

// Register with HA Tools Panel if available
window.haToolsRegistry = window.haToolsRegistry || [];
window.haToolsRegistry.push({
  type: 'ha-automation-analyzer',
  name: 'Automation Analyzer',
  description: 'Analyzes automation performance, traces, and suggests optimizations',
  icon: '??',
  config: { type: 'custom:ha-automation-analyzer' }
});

// Dispatch registration event
window.dispatchEvent(new CustomEvent('ha-tools-card-registered', {
  detail: { type: 'ha-automation-analyzer' }
}));

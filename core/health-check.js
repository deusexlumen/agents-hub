/**
 * Health Check System
 * 
 * Provides comprehensive health monitoring, diagnostics, and
 * system status reporting for Agents Hub.
 * 
 * @module health-check
 * @version 2.1.0
 */

const fs = require('fs');
const path = require('path');

// ============================================================================
// Health Check Configuration
// ============================================================================

const HEALTH_CONFIG = {
  checkInterval: 60000, // 1 minute
  unhealthyThreshold: 3,
  autoRecovery: true,
  checks: {
    diskSpace: true,
    memory: true,
    stateFiles: true,
    sessions: true
  }
};

// ============================================================================
// Health Monitor Class
// ============================================================================

class HealthMonitor {
  constructor(config = {}) {
    this.config = { ...HEALTH_CONFIG, ...config };
    this.status = {
      overall: 'healthy', // healthy, degraded, unhealthy
      checks: {},
      lastCheck: null,
      uptime: Date.now()
    };
    this.checkHistory = [];
    this.intervalId = null;
    this.alerts = [];
  }
  
  /**
   * Start automatic health monitoring
   */
  start() {
    if (this.intervalId) {
      return;
    }
    
    this.intervalId = setInterval(() => {
      this.runChecks();
    }, this.config.checkInterval);
    
    console.log('[HealthMonitor] Started with interval:', this.config.checkInterval, 'ms');
  }
  
  /**
   * Stop automatic health monitoring
   */
  stop() {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
      console.log('[HealthMonitor] Stopped');
    }
  }
  
  /**
   * Run all health checks
   */
  async runChecks() {
    const checks = [];
    
    if (this.config.checks.diskSpace) {
      checks.push(this._checkDiskSpace());
    }
    
    if (this.config.checks.memory) {
      checks.push(this._checkMemory());
    }
    
    if (this.config.checks.stateFiles) {
      checks.push(this._checkStateFiles());
    }
    
    if (this.config.checks.sessions) {
      checks.push(this._checkSessions());
    }
    
    const results = await Promise.allSettled(checks);
    
    // Update status
    const checkResults = {};
    let healthy = 0;
    let degraded = 0;
    let unhealthy = 0;
    
    results.forEach((result, index) => {
      const checkName = ['diskSpace', 'memory', 'stateFiles', 'sessions'][index];
      
      if (result.status === 'fulfilled') {
        checkResults[checkName] = result.value;
        
        if (result.value.status === 'healthy') healthy++;
        else if (result.value.status === 'degraded') degraded++;
        else unhealthy++;
      } else {
        checkResults[checkName] = {
          status: 'unhealthy',
          error: result.reason?.message || 'Check failed'
        };
        unhealthy++;
      }
    });
    
    this.status.checks = checkResults;
    this.status.lastCheck = new Date().toISOString();
    
    // Determine overall status
    if (unhealthy > 0) {
      this.status.overall = 'unhealthy';
    } else if (degraded > 0) {
      this.status.overall = 'degraded';
    } else {
      this.status.overall = 'healthy';
    }
    
    // Add to history
    this.checkHistory.push({
      timestamp: this.status.lastCheck,
      overall: this.status.overall,
      checks: { ...checkResults }
    });
    
    // Keep history manageable
    if (this.checkHistory.length > 100) {
      this.checkHistory = this.checkHistory.slice(-100);
    }
    
    // Trigger alerts if needed
    if (this.status.overall !== 'healthy') {
      this._triggerAlerts();
    }
    
    return this.status;
  }
  
  /**
   * Get current health status
   */
  getStatus() {
    return {
      ...this.status,
      uptime: Date.now() - this.status.uptime,
      uptimeFormatted: this._formatDuration(Date.now() - this.status.uptime)
    };
  }
  
  /**
   * Get health check history
   */
  getHistory(limit = 10) {
    return this.checkHistory.slice(-limit);
  }
  
  /**
   * Add custom alert handler
   */
  onAlert(handler) {
    this.alerts.push(handler);
  }
  
  /**
   * Generate diagnostic report
   */
  generateReport() {
    const report = {
      timestamp: new Date().toISOString(),
      status: this.status.overall,
      summary: {
        uptime: this._formatDuration(Date.now() - this.status.uptime),
        totalChecks: this.checkHistory.length,
        healthyChecks: this.checkHistory.filter(h => h.overall === 'healthy').length,
        degradedChecks: this.checkHistory.filter(h => h.overall === 'degraded').length,
        unhealthyChecks: this.checkHistory.filter(h => h.overall === 'unhealthy').length
      },
      current: this.status.checks,
      recommendations: this._generateRecommendations()
    };
    
    return report;
  }
  
  /**
   * Check if system can perform an operation
   */
  canPerform(operation) {
    if (this.status.overall === 'unhealthy') {
      return { allowed: false, reason: 'System is unhealthy' };
    }
    
    // Check specific requirements
    switch (operation) {
      case 'newSession':
        if (this.status.checks.sessions?.activeSessions >= 50) {
          return { allowed: false, reason: 'Too many active sessions' };
        }
        break;
      case 'spawnAgent':
        if (this.status.checks.memory?.usagePercent > 85) {
          return { allowed: false, reason: 'Memory usage too high' };
        }
        break;
    }
    
    return { allowed: true };
  }
  
  // -------------------------------------------------------------------------
  // Private Check Methods
  // -------------------------------------------------------------------------
  
  async _checkDiskSpace() {
    try {
      const stateDir = './session_state';
      const stats = fs.statSync(stateDir);
      
      // Calculate directory size
      const size = this._getDirSize(stateDir);
      const sizeMB = Math.round(size / 1024 / 1024);
      
      // Check for issues
      const issues = [];
      let status = 'healthy';
      
      if (sizeMB > 1000) {
        status = 'degraded';
        issues.push('State directory exceeds 1GB');
      }
      
      // Check individual file sizes
      const largeFiles = [];
      const files = fs.readdirSync(stateDir, { recursive: true });
      for (const file of files) {
        const filePath = path.join(stateDir, file);
        try {
          const stat = fs.statSync(filePath);
          if (stat.isFile() && stat.size > 50 * 1024 * 1024) { // 50MB
            largeFiles.push({ file, size: Math.round(stat.size / 1024 / 1024) });
          }
        } catch (e) {
          // Ignore errors
        }
      }
      
      if (largeFiles.length > 0) {
        status = largeFiles.length > 5 ? 'unhealthy' : 'degraded';
        issues.push(`${largeFiles.length} files larger than 50MB`);
      }
      
      return {
        status,
        sizeMB,
        fileCount: files.length,
        largeFiles,
        issues
      };
    } catch (error) {
      return {
        status: 'unhealthy',
        error: error.message
      };
    }
  }
  
  async _checkMemory() {
    const usage = process.memoryUsage();
    const usagePercent = Math.round((usage.heapUsed / usage.heapTotal) * 100);
    
    let status = 'healthy';
    const issues = [];
    
    if (usagePercent > 85) {
      status = 'unhealthy';
      issues.push('Memory usage exceeds 85%');
    } else if (usagePercent > 70) {
      status = 'degraded';
      issues.push('Memory usage above 70%');
    }
    
    return {
      status,
      usagePercent,
      heapUsed: Math.round(usage.heapUsed / 1024 / 1024) + 'MB',
      heapTotal: Math.round(usage.heapTotal / 1024 / 1024) + 'MB',
      rss: Math.round(usage.rss / 1024 / 1024) + 'MB',
      issues
    };
  }
  
  async _checkStateFiles() {
    try {
      const activeDir = './session_state/active';
      const recoveryDir = './session_state/recovery';
      
      let activeCount = 0;
      let recoveryCount = 0;
      const corruptFiles = [];
      
      // Check active sessions
      if (fs.existsSync(activeDir)) {
        const files = fs.readdirSync(activeDir).filter(f => f.endsWith('.json'));
        activeCount = files.length;
        
        // Sample check for corruption
        for (const file of files.slice(0, 5)) {
          try {
            const content = fs.readFileSync(path.join(activeDir, file), 'utf8');
            JSON.parse(content);
          } catch (e) {
            corruptFiles.push(file);
          }
        }
      }
      
      // Check recovery files
      if (fs.existsSync(recoveryDir)) {
        recoveryCount = fs.readdirSync(recoveryDir).filter(f => f.endsWith('.json')).length;
      }
      
      let status = 'healthy';
      const issues = [];
      
      if (corruptFiles.length > 0) {
        status = 'unhealthy';
        issues.push(`${corruptFiles.length} corrupt state files detected`);
      }
      
      if (recoveryCount > 50) {
        status = status === 'healthy' ? 'degraded' : status;
        issues.push('Excessive recovery files');
      }
      
      return {
        status,
        activeSessions: activeCount,
        recoveryFiles: recoveryCount,
        corruptFiles,
        issues
      };
    } catch (error) {
      return {
        status: 'unhealthy',
        error: error.message
      };
    }
  }
  
  async _checkSessions() {
    try {
      const activeDir = './session_state/active';
      
      if (!fs.existsSync(activeDir)) {
        return { status: 'healthy', activeSessions: 0 };
      }
      
      const files = fs.readdirSync(activeDir).filter(f => f.endsWith('.json'));
      const now = Date.now();
      const staleSessions = [];
      const longRunning = [];
      
      for (const file of files) {
        try {
          const content = fs.readFileSync(path.join(activeDir, file), 'utf8');
          const session = JSON.parse(content);
          
          const updated = new Date(session.metadata?.updated_at || 0).getTime();
          const created = new Date(session.metadata?.created_at || 0).getTime();
          const duration = now - created;
          
          // Check for stale sessions (no update in 24 hours)
          if (now - updated > 24 * 60 * 60 * 1000) {
            staleSessions.push({
              id: session.metadata?.session_id,
              lastUpdate: session.metadata?.updated_at
            });
          }
          
          // Check for very long running sessions
          if (duration > 7 * 24 * 60 * 60 * 1000) { // 7 days
            longRunning.push({
              id: session.metadata?.session_id,
              duration: this._formatDuration(duration)
            });
          }
        } catch (e) {
          // Skip invalid files
        }
      }
      
      let status = 'healthy';
      const issues = [];
      
      if (staleSessions.length > 5) {
        status = 'degraded';
        issues.push(`${staleSessions.length} stale sessions`);
      }
      
      if (longRunning.length > 3) {
        status = status === 'healthy' ? 'degraded' : 'unhealthy';
        issues.push(`${longRunning.length} long-running sessions`);
      }
      
      return {
        status,
        activeSessions: files.length,
        staleSessions,
        longRunning,
        issues
      };
    } catch (error) {
      return {
        status: 'unhealthy',
        error: error.message
      };
    }
  }
  
  // -------------------------------------------------------------------------
  // Private Helper Methods
  // -------------------------------------------------------------------------
  
  _getDirSize(dirPath) {
    let size = 0;
    
    try {
      const files = fs.readdirSync(dirPath, { recursive: true });
      
      for (const file of files) {
        const filePath = path.join(dirPath, file);
        try {
          const stat = fs.statSync(filePath);
          if (stat.isFile()) {
            size += stat.size;
          }
        } catch (e) {
          // Ignore errors
        }
      }
    } catch (e) {
      // Ignore errors
    }
    
    return size;
  }
  
  _formatDuration(ms) {
    const seconds = Math.floor(ms / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);
    const days = Math.floor(hours / 24);
    
    if (days > 0) return `${days}d ${hours % 24}h`;
    if (hours > 0) return `${hours}h ${minutes % 60}m`;
    if (minutes > 0) return `${minutes}m ${seconds % 60}s`;
    return `${seconds}s`;
  }
  
  _triggerAlerts() {
    const alert = {
      timestamp: new Date().toISOString(),
      severity: this.status.overall,
      message: `System health is ${this.status.overall}`,
      checks: this.status.checks
    };
    
    this.alerts.forEach(handler => {
      try {
        handler(alert);
      } catch (e) {
        console.error('[HealthMonitor] Alert handler failed:', e.message);
      }
    });
  }
  
  _generateRecommendations() {
    const recommendations = [];
    
    if (this.status.checks.diskSpace?.issues?.length > 0) {
      recommendations.push({
        priority: 'high',
        category: 'disk',
        message: 'Run cleanup to remove old sessions',
        action: 'agents-hub cleanup --days 7'
      });
    }
    
    if (this.status.checks.stateFiles?.corruptFiles?.length > 0) {
      recommendations.push({
        priority: 'high',
        category: 'data',
        message: 'Restore from recovery files or archive corrupt sessions',
        action: 'Check recovery directory for backups'
      });
    }
    
    if (this.status.checks.sessions?.staleSessions?.length > 0) {
      recommendations.push({
        priority: 'medium',
        category: 'sessions',
        message: 'Close stale sessions',
        action: 'agents-hub cleanup --days 1'
      });
    }
    
    if (this.status.checks.memory?.usagePercent > 70) {
      recommendations.push({
        priority: 'medium',
        category: 'memory',
        message: 'Consider closing some sessions',
        action: 'Close unused sessions to free memory'
      });
    }
    
    return recommendations;
  }
}

// ============================================================================
// Singleton Instance
// ============================================================================

const healthMonitor = new HealthMonitor();

// ============================================================================
// Export
// ============================================================================

module.exports = {
  HealthMonitor,
  healthMonitor,
  HEALTH_CONFIG
};

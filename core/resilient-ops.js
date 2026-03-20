class Guardrails {
  constructor(config = {}) {
    this.maxIterations = config.maxIterations || 5;
    this.timeoutMs = config.timeoutMs || 60000;
  }

  checkIteration(current) {
    if (current >= this.maxIterations) {
      throw new Error(`Max iterations (${this.maxIterations}) exceeded`);
    }
    return true;
  }

  createTimeout(callback) {
    return setTimeout(() => {
      callback();
    }, this.timeoutMs);
  }
}

module.exports = { Guardrails };

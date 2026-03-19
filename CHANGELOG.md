# Changelog

All notable changes to the Agents Hub project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/).

## [2.1.0] - 2026-03-19

### Added

#### New Core Modules
- **`logger.js`** - Structured logging system with multiple levels, formats, and destinations
  - Supports console, file, and JSON logging
  - Configurable via environment variables
  - Child loggers with context inheritance
  - Operation tracking with start/success/fail pattern
  
- **`resilient-ops.js`** - Resilient operations with retry logic and circuit breaker
  - `withRetry()` - Execute functions with configurable retry attempts
  - `CircuitBreaker` - Prevent cascade failures with circuit breaker pattern
  - `ResilientFileOps` - Atomic file writes with backup/restore
  - `BatchProcessor` - Process items with controlled concurrency
  
- **`config-manager.js`** - Centralized configuration management
  - Environment variable overrides
  - File-based configuration (JS, JSON, YAML)
  - Schema validation
  - Hot reload in development mode
  
- **`health-check.js`** - System health monitoring and diagnostics
  - Automated health checks (disk, memory, state files, sessions)
  - Health status reporting
  - Automatic recommendations
  - Operation gating based on health status

#### New Scripts
- `npm run test:resilient` - Run resilient-ops tests
- `npm run health` - Run health check diagnostics

#### Tests
- Comprehensive test suite for `resilient-ops.js` (15 tests)
  - Retry logic tests
  - Circuit breaker tests
  - File operation tests
  - Batch processing tests

### Changed
- Updated version from 2.0.0 to 2.1.0
- Enhanced package.json with new scripts and updated description

### Security
- Atomic file writes prevent data corruption
- Backup creation before file modifications
- Graceful degradation on file system errors

## [2.0.0] - 2026-03-18

### Initial Release
- Dynamic Multi-Agent Orchestration System
- State Persistence Layer with JSON/YAML support
- Template Loading System
- Workflow Validation
- Task Decomposition
- Learning Engine
- Auto-Transition Detection
- MCP Integration
- CLI Interface

### Core Features
- Session lifecycle management
- Phase-based workflow execution
- Multi-agent coordination
- Context pruning and memory management
- Recovery from crashes
- Checkpoint system

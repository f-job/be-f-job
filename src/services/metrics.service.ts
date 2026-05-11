import client from "prom-client";
import { logger } from "@/config/logger";
import { singleton } from "@/decorators/singleton";
import { performance, PerformanceObserver } from 'perf_hooks';

interface GCPerformanceEntry extends PerformanceEntry {
  detail?: {
    kind: string;
  };
}

@singleton
export class MetricsService {
  private register!: client.Registry;
  private httpRequestDuration!: client.Histogram;
  private httpRequestTotal!: client.Counter;
  private activeUsers!: client.Gauge;
  private dbQueryDuration!: client.Histogram;
  private websocketConnections!: client.Gauge;
  private websocketMessages!: client.Counter;
  private apiLatencyPercentiles!: client.Summary;
  private circuitBreakerState!: client.Gauge;
  private httpErrors!: client.Counter;
  private nodeProcessStats!: client.Gauge;
  private gcStats!: client.Histogram;

  constructor() {
    this.register = new client.Registry();
    this.initializeMetrics();
  }

  private initializeMetrics(): void {
    try {
      // Initialize default metrics with error handling (only once)
      client.collectDefaultMetrics({
        register: this.register,
        prefix: 'node_',
        labels: { service: 'express-api' },
        gcDurationBuckets: [0.001, 0.01, 0.1, 1, 2, 5]
      });

      // Initialize custom metrics
      this.initializeHttpMetrics();
      this.initializeBusinessMetrics();
      this.initializeDatabaseMetrics();
      this.initializeWebsocketMetrics();
      this.initializeNodeMetrics();
    } catch (error) {
      logger.error('Failed to initialize metrics', { error });
      throw error;
    }
  }

  private initializeHttpMetrics(): void {
    this.httpRequestDuration = new client.Histogram({
      name: "http_request_duration_seconds",
      help: "Duration of HTTP requests in seconds",
      labelNames: ["method", "route", "status_code"],
      buckets: [0.1, 0.3, 0.5, 0.7, 1, 3, 5, 7, 10],
      registers: [this.register]
    });

    this.httpRequestTotal = new client.Counter({
      name: "http_requests_total",
      help: "Total number of HTTP requests",
      labelNames: ["method", "route", "status_code"],
      registers: [this.register]
    });

    this.apiLatencyPercentiles = new client.Summary({
      name: 'http_request_duration_percentiles',
      help: 'HTTP request latency percentiles',
      percentiles: [0.5, 0.9, 0.95, 0.99],
      labelNames: ['method', 'route'],
      registers: [this.register]
    });

    this.httpErrors = new client.Counter({
      name: "http_errors_total",
      help: "Total number of HTTP errors",
      labelNames: ["method", "route", "status_code"],
      registers: [this.register]
    });
  }

  private initializeBusinessMetrics(): void {
    this.activeUsers = new client.Gauge({
      name: "active_users_total",
      help: "Number of active users",
      registers: [this.register]
    });
  }

  private initializeDatabaseMetrics(): void {
    this.dbQueryDuration = new client.Histogram({
      name: "db_query_duration_seconds",
      help: "Duration of database queries in seconds",
      labelNames: ["operation", "table", "success"],
      buckets: [0.01, 0.05, 0.1, 0.5, 1, 2],
      registers: [this.register]
    });
  }

  private initializeWebsocketMetrics(): void {
    this.websocketConnections = new client.Gauge({
      name: "websocket_connections_total",
      help: "Number of active WebSocket connections",
      registers: [this.register]
    });

    this.websocketMessages = new client.Counter({
      name: "websocket_messages_total",
      help: "Total number of WebSocket messages",
      labelNames: ["type", "direction"],
      registers: [this.register]
    });
  }

  private initializeNodeMetrics(): void {
    // Raw Node.js metrics
    this.nodeProcessStats = new client.Gauge({
      name: 'node_process_stats',
      help: 'Node.js process statistics',
      labelNames: ['stat'],
      registers: [this.register]
    });

    // Enhanced GC metrics
    this.gcStats = new client.Histogram({
      name: 'node_gc_duration_seconds',
      help: 'Garbage collection duration by type',
      labelNames: ['gc_type'],
      buckets: [0.001, 0.01, 0.1, 1, 2, 5],
      registers: [this.register]
    });

    // Setup GC Performance Observer
    try {
      const obs = new PerformanceObserver((list) => {
        const entries = list.getEntries() as GCPerformanceEntry[];
        
        entries.forEach((entry) => {
          const gcType = entry.detail?.kind ?? 'unknown';
          const duration = entry.duration / 1000; // Convert to seconds
          
          this.gcStats.observe({ gc_type: this.getGCType(gcType) }, duration);
          
          logger.debug('GC Event recorded', {
            type: gcType,
            duration,
            startTime: entry.startTime,
            detail: entry.detail
          });
        });
      });
      
      obs.observe({ entryTypes: ['gc'] });
      logger.info('GC monitoring enabled via performance hooks');
    } catch (error) {
      logger.warn('GC monitoring could not be enabled', { error });
    }
  }

  private getGCType(type: string): string {
    switch (type) {
      case 'minor':
        return 'Scavenge';
      case 'major':
        return 'MarkSweepCompact';
      case 'incremental':
        return 'IncrementalMarking';
      case 'weakcb':
        return 'WeakPhantomCallbackProcessing';
      default:
        return type;
    }
  }

  private initializeSystemMetrics(): void {
    try {
      logger.info('System metrics initialized', {
        metrics: this.register.getMetricsAsJSON()
      });
    } catch (error) {
      logger.error('Failed to initialize system metrics', { error });
      throw error;
    }
  }

  // Public methods for recording metrics
  public recordHttpRequest(method: string, route: string, statusCode: number, duration: number): void {
    const labels = { method, route, status_code: statusCode.toString() };
    this.httpRequestDuration.observe(labels, duration);
    this.httpRequestTotal.inc(labels);
    this.apiLatencyPercentiles.observe({ method, route }, duration);
  }

  public recordDbQuery(operation: string, table: string, duration: number, success: boolean): void {
    this.dbQueryDuration.observe(
      { operation, table, success: success.toString() },
      duration
    );
  }

  public updateActiveUsers(count: number): void {
    this.activeUsers.set(count);
  }

  public recordWebsocketConnection(isConnect: boolean): void {
    if (isConnect) {
      this.websocketConnections.inc();
    } else {
      this.websocketConnections.dec();
    }
  }

  public recordWebsocketMessage(type: string, direction: 'in' | 'out'): void {
    this.websocketMessages.inc({ type, direction });
  }

  public updateCircuitBreakerState(service: string, state: 'closed' | 'open' | 'half-open'): void {
    const stateValue = state === 'closed' ? 0 : state === 'open' ? 1 : 0.5;
    this.circuitBreakerState.set({ service }, stateValue);
  }

  public async getMetrics(): Promise<string> {
    try {
      const metrics = await this.register.metrics();
      logger.debug('Metrics requested', {
        metricsLength: metrics.length,
        sampleMetrics: metrics.slice(0, 200) // Log first 200 chars for debugging
      });
      return metrics;
    } catch (error) {
      logger.error('Error generating metrics', { error });
      throw error;
    }
  }

  public getContentType(): string {
    return this.register.contentType;
  }

  public recordHttpError(method: string, route: string, statusCode: number): void {
    this.httpErrors.labels(method, route, statusCode.toString()).inc();
  }

  public updateNodeStats(): void {
    const stats = process.memoryUsage();
    this.nodeProcessStats.set({ stat: 'heap_used' }, stats.heapUsed);
    this.nodeProcessStats.set({ stat: 'heap_total' }, stats.heapTotal);
    this.nodeProcessStats.set({ stat: 'rss' }, stats.rss);
    this.nodeProcessStats.set({ stat: 'external' }, stats.external);
    
    const cpuUsage = process.cpuUsage();
    this.nodeProcessStats.set({ stat: 'cpu_user' }, cpuUsage.user);
    this.nodeProcessStats.set({ stat: 'cpu_system' }, cpuUsage.system);
  }

  public recordGCStats(type: string, duration: number): void {
    this.gcStats.observe({ gc_type: type }, duration);
  }
}

/**
 * TriLog Registry
 *
 * Manages schema registration and export to JSON format
 */

import { TrilogObject, TrilogProcess } from './base';

/**
 * Registry for TriLog schemas
 *
 * Collects Object and Process definitions and exports them to JSON format
 * compatible with the Python SDK.
 */
export class Registry {
  private objects: Map<string, typeof TrilogObject> = new Map();
  private processes: Map<string, typeof TrilogProcess> = new Map();
  private createdAt: Date;

  constructor(
    public name: string = 'default',
    public version: string = '1.0.0'
  ) {
    this.createdAt = new Date();
  }

  /**
   * Register an Object or Process class
   */
  register(cls: typeof TrilogObject | typeof TrilogProcess): void {
    const typeName = cls.getTypeName();

    if (cls.prototype instanceof TrilogProcess) {
      this.processes.set(typeName, cls as typeof TrilogProcess);
    } else if (cls.prototype instanceof TrilogObject || cls === TrilogObject) {
      this.objects.set(typeName, cls);
    } else {
      throw new Error(`Cannot register ${typeName}: must extend TrilogObject or TrilogProcess`);
    }
  }

  /**
   * Get an Object class by name
   */
  getObject(name: string): typeof TrilogObject | undefined {
    return this.objects.get(name);
  }

  /**
   * Get a Process class by name
   */
  getProcess(name: string): typeof TrilogProcess | undefined {
    return this.processes.get(name);
  }

  /**
   * Get all registered Object classes
   */
  getAllObjects(): Map<string, typeof TrilogObject> {
    return new Map(this.objects);
  }

  /**
   * Get all registered Process classes
   */
  getAllProcesses(): Map<string, typeof TrilogProcess> {
    return new Map(this.processes);
  }

  /**
   * Export registry to JSON string (compatible with Python registry format)
   */
  export(): string {
    const registryData = {
      registry: {
        name: this.name,
        version: this.version,
        created_at: this.createdAt.toISOString(),
        checksum: this.computeChecksum(),
      },
      objects: this.exportObjects(),
      processes: this.exportProcesses(),
      expected_keys: this.getExpectedKeys(),
    };

    return JSON.stringify(registryData, null, 2);
  }

  /**
   * Export to registry object (for programmatic access)
   */
  toDict(): Record<string, any> {
    return {
      registry: {
        name: this.name,
        version: this.version,
        created_at: this.createdAt.toISOString(),
        checksum: this.computeChecksum(),
      },
      objects: this.exportObjects(),
      processes: this.exportProcesses(),
      expected_keys: this.getExpectedKeys(),
    };
  }

  /**
   * Load registry from JSON string
   */
  static load(jsonString: string): Registry {
    const data = JSON.parse(jsonString);
    const registry = new Registry(
      data.registry.name,
      data.registry.version
    );

    // Note: This loads metadata only, not the actual classes
    // In a real implementation, you'd need to reconstruct classes from schema
    return registry;
  }

  /**
   * Export objects to schema format
   */
  private exportObjects(): Record<string, any> {
    const result: Record<string, any> = {};

    for (const [name, cls] of this.objects) {
      result[name] = cls.schema();
    }

    return result;
  }

  /**
   * Export processes to schema format
   */
  private exportProcesses(): Record<string, any> {
    const result: Record<string, any> = {};

    for (const [name, cls] of this.processes) {
      result[name] = cls.schema();
    }

    return result;
  }

  /**
   * Get all expected OpenTelemetry attribute keys
   */
  private getExpectedKeys(): string[] {
    const keys = new Set<string>([
      'trilog.obj.id',
      'trilog.obj.type',
      'trilog.obj.version',
      'trilog.process.type',
      'trilog.process.trace_id',
      'trilog.process.current_phase',
    ]);

    // Add object-specific keys
    for (const cls of this.objects.values()) {
      const prefix = cls.getOtelPrefix();
      const fields = cls.getFields();
      for (const fieldName of Object.keys(fields)) {
        keys.add(`${prefix}.${fieldName}`);
      }
    }

    // Add process-specific keys
    for (const cls of this.processes.values()) {
      const prefix = cls.getOtelPrefix();
      const fields = cls.getFields();
      for (const fieldName of Object.keys(fields)) {
        keys.add(`${prefix}.${fieldName}`);
      }
    }

    return Array.from(keys).sort();
  }

  /**
   * Compute checksum for version tracking
   */
  private computeChecksum(): string {
    const crypto = require('crypto');
    const content = JSON.stringify({
      objects: Array.from(this.objects.keys()).sort(),
      processes: Array.from(this.processes.keys()).sort(),
    });
    return crypto.createHash('sha256').update(content).digest('hex').substring(0, 16);
  }

  /**
   * String representation
   */
  toString(): string {
    return `Registry(name=${this.name}, version=${this.version}, objects=${this.objects.size}, processes=${this.processes.size})`;
  }
}

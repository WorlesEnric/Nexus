/**
 * TriLog Base Classes
 *
 * Provides TrilogObject and TrilogProcess base classes for schema definition
 */

import { randomUUID } from 'crypto';
import { Field, FIELDS_METADATA_KEY, getFieldMetadata } from './fields';

/**
 * Base class for TriLog Objects
 *
 * Objects represent stateful entities in your system that you want
 * to track over time. Each Object instance has a unique ID and
 * can be reconstructed from its event history.
 *
 * @example
 * class ShoppingCart extends TrilogObject {
 *   @field.integer({ default: 0 })
 *   itemCount: number = 0;
 *
 *   @field.float({ default: 0.0 })
 *   totalValue: number = 0.0;
 * }
 */
export abstract class TrilogObject {
  private __trilog_id: string;
  private __trilog_version: number = 0;
  private __trilog_created_at: Date;
  private __trilog_updated_at: Date;

  constructor(objId?: string) {
    this.__trilog_id = objId || randomUUID();
    this.__trilog_created_at = new Date();
    this.__trilog_updated_at = new Date();

    // Initialize fields with defaults
    this.initializeFields();
  }

  /**
   * Get the unique object ID
   */
  get id(): string {
    return this.__trilog_id;
  }

  /**
   * Get the object version
   */
  get version(): number {
    return this.__trilog_version;
  }

  /**
   * Get the creation timestamp
   */
  get createdAt(): Date {
    return this.__trilog_created_at;
  }

  /**
   * Get the last updated timestamp
   */
  get updatedAt(): Date {
    return this.__trilog_updated_at;
  }

  /**
   * Get the type name (class name)
   */
  static getTypeName(): string {
    return this.name;
  }

  /**
   * Get the OpenTelemetry attribute prefix (snake_case version of class name)
   */
  static getOtelPrefix(): string {
    // Convert CamelCase to snake_case
    return this.name
      .replace(/([A-Z])/g, '_$1')
      .toLowerCase()
      .slice(1);
  }

  /**
   * Get all fields defined on this object
   */
  static getFields(): Record<string, Field> {
    return getFieldMetadata(this);
  }

  /**
   * Get the schema for this object type
   */
  static schema(): Record<string, any> {
    const fields = this.getFields();
    const fieldSchemas: Record<string, any> = {};

    for (const [name, field] of Object.entries(fields)) {
      fieldSchemas[name] = field.toSchema();
    }

    return {
      type: 'object',
      name: this.getTypeName(),
      otel_prefix: this.getOtelPrefix(),
      fields: fieldSchemas,
    };
  }

  /**
   * Convert object to OpenTelemetry attributes
   */
  toOtelAttributes(): Record<string, any> {
    const Constructor = this.constructor as typeof TrilogObject;
    const prefix = Constructor.getOtelPrefix();
    const attrs: Record<string, any> = {
      'trilog.obj.id': this.__trilog_id,
      'trilog.obj.type': Constructor.getTypeName(),
      'trilog.obj.version': this.__trilog_version,
    };

    // Add field values with prefix
    const fields = Constructor.getFields();
    for (const [name, field] of Object.entries(fields)) {
      const value = (this as any)[name];
      if (value !== undefined && value !== null) {
        attrs[`${prefix}.${name}`] = field.toOtelValue(value);
      }
    }

    return attrs;
  }

  /**
   * Convert object to plain dictionary
   */
  toDict(): Record<string, any> {
    const Constructor = this.constructor as typeof TrilogObject;
    const fields = Constructor.getFields();
    const data: Record<string, any> = {
      __id__: this.__trilog_id,
      __type__: Constructor.getTypeName(),
      __version__: this.__trilog_version,
      __created_at__: this.__trilog_created_at.toISOString(),
      __updated_at__: this.__trilog_updated_at.toISOString(),
    };

    for (const [name, field] of Object.entries(fields)) {
      data[name] = (this as any)[name];
    }

    return data;
  }

  /**
   * Apply changes to the object (for reconstruction)
   */
  applyChange(changes: Record<string, any>): void {
    for (const [key, value] of Object.entries(changes)) {
      if (key.startsWith('__')) continue; // Skip internal fields
      (this as any)[key] = value;
    }

    this.__trilog_version++;
    this.__trilog_updated_at = new Date();
  }

  /**
   * Initialize fields with default values
   */
  private initializeFields(): void {
    const Constructor = this.constructor as typeof TrilogObject;
    const fields = Constructor.getFields();

    for (const [name, field] of Object.entries(fields)) {
      if (field.options.default !== undefined && (this as any)[name] === undefined) {
        (this as any)[name] = field.options.default;
      }
    }
  }
}

/**
 * Base class for TriLog Processes
 *
 * Processes represent workflows or distributed processes that you want
 * to track. They have phases and can involve multiple objects.
 *
 * @example
 * class CheckoutFlow extends TrilogProcess {
 *   @field.string()
 *   paymentMethod: string = '';
 *
 *   @field.string()
 *   status: string = 'pending';
 * }
 */
export abstract class TrilogProcess extends TrilogObject {
  private __trilog_trace_id?: string;
  private __trilog_current_phase?: string;
  private __trilog_phases: string[] = [];
  private __trilog_started_at: Date;
  private __trilog_completed_at?: Date;

  constructor(objId?: string, traceId?: string) {
    super(objId);
    this.__trilog_trace_id = traceId;
    this.__trilog_started_at = new Date();
  }

  /**
   * Get the trace ID for this process
   */
  get traceId(): string | undefined {
    return this.__trilog_trace_id;
  }

  /**
   * Set the trace ID for this process
   */
  set traceId(value: string | undefined) {
    this.__trilog_trace_id = value;
  }

  /**
   * Get the current phase
   */
  get currentPhase(): string | undefined {
    return this.__trilog_current_phase;
  }

  /**
   * Get all phases that have been entered
   */
  get phases(): string[] {
    return [...this.__trilog_phases];
  }

  /**
   * Get when the process started
   */
  get startedAt(): Date {
    return this.__trilog_started_at;
  }

  /**
   * Get when the process completed (if completed)
   */
  get completedAt(): Date | undefined {
    return this.__trilog_completed_at;
  }

  /**
   * Check if the process is completed
   */
  get isCompleted(): boolean {
    return this.__trilog_completed_at !== undefined;
  }

  /**
   * Enter a new phase
   */
  enterPhase(phase: string): void {
    this.__trilog_current_phase = phase;
    if (!this.__trilog_phases.includes(phase)) {
      this.__trilog_phases.push(phase);
    }
  }

  /**
   * Complete the process
   */
  complete(): void {
    this.__trilog_completed_at = new Date();
  }

  /**
   * Convert process to OpenTelemetry attributes
   */
  override toOtelAttributes(): Record<string, any> {
    const attrs = super.toOtelAttributes();

    attrs['trilog.process.type'] = (this.constructor as typeof TrilogProcess).getTypeName();
    if (this.__trilog_trace_id) {
      attrs['trilog.process.trace_id'] = this.__trilog_trace_id;
    }
    if (this.__trilog_current_phase) {
      attrs['trilog.process.current_phase'] = this.__trilog_current_phase;
    }
    attrs['trilog.process.phases'] = JSON.stringify(this.__trilog_phases);
    attrs['trilog.process.started_at'] = this.__trilog_started_at.toISOString();
    if (this.__trilog_completed_at) {
      attrs['trilog.process.completed_at'] = this.__trilog_completed_at.toISOString();
    }
    attrs['trilog.process.is_completed'] = this.isCompleted;

    return attrs;
  }

  /**
   * Convert process to plain dictionary
   */
  override toDict(): Record<string, any> {
    const data = super.toDict();

    data.__trace_id__ = this.__trilog_trace_id;
    data.__current_phase__ = this.__trilog_current_phase;
    data.__phases__ = this.__trilog_phases;
    data.__started_at__ = this.__trilog_started_at.toISOString();
    data.__completed_at__ = this.__trilog_completed_at?.toISOString();
    data.__is_completed__ = this.isCompleted;

    return data;
  }
}

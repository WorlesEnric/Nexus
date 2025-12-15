/**
 * QuickJS Wrapper for Nexus Handlers
 * 
 * This script runs inside the QuickJS sandbox and provides:
 * - $state: State management API
 * - $args: Handler arguments
 * - $emit: Event emission
 * - $view: View commands
 * - $ext: Extension access (with async support)
 * - $log: Logging utilities
 * 
 * The wrapper uses MessagePack for serialization of values passed
 * to/from the host environment.
 */

(function() {
    'use strict';

    // ===== Host Function Imports =====
    // These are injected by WasmEdge when the module loads
    
    // State functions
    const __nexus_state_get = globalThis.__nexus_state_get;
    const __nexus_state_set = globalThis.__nexus_state_set;
    const __nexus_state_delete = globalThis.__nexus_state_delete;
    const __nexus_state_has = globalThis.__nexus_state_has;
    const __nexus_state_keys = globalThis.__nexus_state_keys;
    
    // Event functions
    const __nexus_emit_event = globalThis.__nexus_emit_event;
    
    // View functions
    const __nexus_view_command = globalThis.__nexus_view_command;
    const __nexus_view_set_filter = globalThis.__nexus_view_set_filter;
    const __nexus_view_scroll_to = globalThis.__nexus_view_scroll_to;
    const __nexus_view_focus = globalThis.__nexus_view_focus;
    
    // Extension functions
    const __nexus_ext_suspend = globalThis.__nexus_ext_suspend;
    const __nexus_ext_exists = globalThis.__nexus_ext_exists;
    const __nexus_ext_methods = globalThis.__nexus_ext_methods;
    const __nexus_ext_list = globalThis.__nexus_ext_list;
    
    // Logging function
    const __nexus_log = globalThis.__nexus_log;
    
    // Time function
    const __nexus_now = globalThis.__nexus_now;

    // ===== MessagePack Utilities =====
    // Minimal MessagePack decoder/encoder for value passing
    
    const msgpack = {
        encode: function(value) {
            // For now, use JSON as a placeholder
            // Real implementation would use proper MessagePack
            return JSON.stringify(value);
        },
        
        decode: function(data) {
            if (!data || data.length === 0) {
                return null;
            }
            // For now, use JSON as a placeholder
            return JSON.parse(data);
        }
    };

    // ===== $state API =====
    const $state = {
        /**
         * Get a value from state
         * @param {string} key - The state key
         * @returns {*} The value, or undefined if not found
         */
        get: function(key) {
            if (typeof key !== 'string') {
                throw new TypeError('State key must be a string');
            }
            const result = __nexus_state_get(key);
            if (result === null || result === undefined) {
                return undefined;
            }
            return msgpack.decode(result);
        },
        
        /**
         * Set a value in state
         * @param {string} key - The state key
         * @param {*} value - The value to set
         */
        set: function(key, value) {
            if (typeof key !== 'string') {
                throw new TypeError('State key must be a string');
            }
            const encoded = msgpack.encode(value);
            __nexus_state_set(key, encoded);
        },
        
        /**
         * Delete a key from state
         * @param {string} key - The state key
         * @returns {boolean} True if the key existed
         */
        delete: function(key) {
            if (typeof key !== 'string') {
                throw new TypeError('State key must be a string');
            }
            return __nexus_state_delete(key);
        },
        
        /**
         * Check if a key exists in state
         * @param {string} key - The state key
         * @returns {boolean} True if the key exists
         */
        has: function(key) {
            if (typeof key !== 'string') {
                throw new TypeError('State key must be a string');
            }
            return __nexus_state_has(key);
        },
        
        /**
         * Get all state keys
         * @returns {string[]} Array of state keys
         */
        keys: function() {
            const result = __nexus_state_keys();
            return msgpack.decode(result) || [];
        },

        /**
         * Update a value in state using a function
         * @param {string} key - The state key
         * @param {function} updater - Function that receives old value and returns new value
         * @returns {*} The new value
         */
        update: function(key, updater) {
            const current = this.get(key);
            const next = updater(current);
            this.set(key, next);
            return next;
        }
    };

    // ===== $emit API =====
    /**
     * Emit an event
     * @param {string} name - Event name
     * @param {*} payload - Event payload
     */
    function $emit(name, payload) {
        if (typeof name !== 'string') {
            throw new TypeError('Event name must be a string');
        }
        const encoded = msgpack.encode(payload);
        __nexus_emit_event(name, encoded);
    }

    // Add convenience methods
    $emit.toast = function(message, level) {
        $emit('toast', { message, level: level || 'info' });
    };

    // ===== $view API =====
    const $view = {
        /**
         * Set a filter on a view
         * @param {string} viewId - The view ID
         * @param {object} filter - The filter configuration
         */
        setFilter: function(viewId, filter) {
            const encoded = msgpack.encode(filter);
            __nexus_view_set_filter(viewId, encoded);
        },
        
        /**
         * Scroll a view to a position
         * @param {string} viewId - The view ID
         * @param {object} position - The scroll position { row?, col?, animate? }
         */
        scrollTo: function(viewId, position) {
            const encoded = msgpack.encode(position);
            __nexus_view_scroll_to(viewId, encoded);
        },
        
        /**
         * Focus a view
         * @param {string} viewId - The view ID
         */
        focus: function(viewId) {
            __nexus_view_focus(viewId);
        },
        
        /**
         * Send a custom command to a view
         * @param {string} viewId - The view ID
         * @param {string} command - The command name
         * @param {object} params - Command parameters
         */
        command: function(viewId, command, params) {
            const encoded = msgpack.encode(params || {});
            __nexus_view_command(viewId, command, encoded);
        }
    };

    // ===== $ext API =====
    // Extension access with async suspend/resume support
    
    /**
     * Create an async extension call that suspends execution
     * @param {string} extName - Extension name
     * @param {string} method - Method name
     * @param {Array} args - Arguments
     * @returns {Promise<*>} The async result
     */
    function createExtensionCall(extName, method, args) {
        // This is where the magic happens - we suspend WASM execution
        // The host will perform the async operation and resume us
        const encodedArgs = msgpack.encode(args);
        const result = __nexus_ext_suspend(extName, method, encodedArgs);
        
        // When we resume, result contains the async result
        const decoded = msgpack.decode(result);
        
        if (!decoded.success) {
            const error = new Error(decoded.error || 'Extension call failed');
            error.extension = extName;
            error.method = method;
            throw error;
        }
        
        return decoded.value;
    }

    // Create $ext proxy
    const $ext = new Proxy({}, {
        get: function(target, extName) {
            // Check if extension exists
            if (!__nexus_ext_exists(extName)) {
                return undefined;
            }
            
            // Return a proxy for the extension's methods
            return new Proxy({}, {
                get: function(_, method) {
                    // Return an async function that suspends
                    return function(...args) {
                        return createExtensionCall(extName, method, args);
                    };
                }
            });
        },
        
        has: function(target, extName) {
            return __nexus_ext_exists(extName);
        }
    });

    // Extension utility functions
    $ext.exists = function(name) {
        return __nexus_ext_exists(name);
    };

    $ext.methods = function(name) {
        if (!__nexus_ext_exists(name)) {
            return [];
        }
        const result = __nexus_ext_methods(name);
        return msgpack.decode(result) || [];
    };

    $ext.list = function() {
        const result = __nexus_ext_list();
        return msgpack.decode(result) || [];
    };

    // ===== $log API =====
    const LOG_LEVELS = {
        DEBUG: 0,
        INFO: 1,
        WARN: 2,
        ERROR: 3
    };

    const $log = {
        /**
         * Log at debug level
         * @param {...*} args - Values to log
         */
        debug: function(...args) {
            const message = args.map(formatLogArg).join(' ');
            __nexus_log(LOG_LEVELS.DEBUG, message);
        },
        
        /**
         * Log at info level
         * @param {...*} args - Values to log
         */
        info: function(...args) {
            const message = args.map(formatLogArg).join(' ');
            __nexus_log(LOG_LEVELS.INFO, message);
        },
        
        /**
         * Log at warn level
         * @param {...*} args - Values to log
         */
        warn: function(...args) {
            const message = args.map(formatLogArg).join(' ');
            __nexus_log(LOG_LEVELS.WARN, message);
        },
        
        /**
         * Log at error level
         * @param {...*} args - Values to log
         */
        error: function(...args) {
            const message = args.map(formatLogArg).join(' ');
            __nexus_log(LOG_LEVELS.ERROR, message);
        }
    };

    /**
     * Format a value for logging
     * @param {*} value - The value to format
     * @returns {string} Formatted string
     */
    function formatLogArg(value) {
        if (value === null) return 'null';
        if (value === undefined) return 'undefined';
        if (typeof value === 'string') return value;
        if (typeof value === 'number' || typeof value === 'boolean') return String(value);
        if (value instanceof Error) {
            return value.stack || value.message || String(value);
        }
        try {
            return JSON.stringify(value);
        } catch (e) {
            return String(value);
        }
    }

    // ===== Time Utilities =====
    const $time = {
        /**
         * Get current timestamp in milliseconds
         * @returns {number} Timestamp
         */
        now: function() {
            return __nexus_now();
        }
    };

    // ===== Handler Execution =====
    
    /**
     * Execute a handler with the provided context
     * @param {Function} handlerFn - The handler function
     * @param {object} state - Initial state
     * @param {*} args - Handler arguments
     * @param {object} scope - Variable scope
     * @returns {*} Handler return value
     */
    globalThis.__nexus_execute_handler = function(handlerFn, state, args, scope) {
        // Make APIs available globally
        globalThis.$state = $state;
        globalThis.$emit = $emit;
        globalThis.$view = $view;
        globalThis.$ext = $ext;
        globalThis.$log = $log;
        globalThis.$time = $time;
        globalThis.$args = args;
        globalThis.$scope = scope;

        try {
            // Execute the handler
            const result = handlerFn(state, args, scope);
            return msgpack.encode({ success: true, value: result });
        } catch (error) {
            return msgpack.encode({
                success: false,
                error: {
                    name: error.name || 'Error',
                    message: error.message || String(error),
                    stack: error.stack,
                    line: error.lineNumber,
                    column: error.columnNumber
                }
            });
        }
    };

    // ===== Module Exports =====
    // Make APIs available for direct import in handlers
    globalThis.NexusAPI = {
        $state,
        $emit,
        $view,
        $ext,
        $log,
        $time,
        msgpack
    };

    // Signal that the wrapper is loaded
    globalThis.__nexus_wrapper_loaded = true;

})();

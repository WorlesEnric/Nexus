//! WASM instance pool management.
//!
//! This module provides instance pooling for efficient reuse of WASM instances.
//! Instances are expensive to create, so we maintain a pool and reuse them.

use super::instance::{InstanceId, InstanceState, WasmInstance};
use crate::config::RuntimeConfig;
use crate::error::{Result, RuntimeError};
use parking_lot::{Mutex, RwLock};
use std::collections::{HashMap, VecDeque};
use std::sync::atomic::{AtomicU64, AtomicUsize, Ordering};
use std::sync::Arc;
use tokio::sync::Semaphore;
use tracing::{debug, info, warn};

/// Instance wrapper for pool management
pub struct PooledInstance {
    /// The actual WASM instance
    pub instance: WasmInstance,
    /// Pool reference for release
    pool: Arc<InstancePoolInner>,
}

impl PooledInstance {
    /// Get a reference to the instance
    pub fn inner(&self) -> &WasmInstance {
        &self.instance
    }

    /// Get a mutable reference to the instance
    pub fn inner_mut(&mut self) -> &mut WasmInstance {
        &mut self.instance
    }
}

impl std::ops::Deref for PooledInstance {
    type Target = WasmInstance;

    fn deref(&self) -> &Self::Target {
        &self.instance
    }
}

impl std::ops::DerefMut for PooledInstance {
    fn deref_mut(&mut self) -> &mut Self::Target {
        &mut self.instance
    }
}

/// Inner pool state
struct InstancePoolInner {
    /// Configuration
    config: RuntimeConfig,
    /// Available instances (LIFO for cache locality)
    available: Mutex<VecDeque<WasmInstance>>,
    /// Suspended instances by suspension ID
    suspended: RwLock<HashMap<String, WasmInstance>>,
    /// Semaphore to limit concurrent instances
    semaphore: Semaphore,
    /// Total instances created
    instances_created: AtomicUsize,
    /// Active (checked out) instances
    active_count: AtomicUsize,
    /// Total memory used by pool
    total_memory: AtomicU64,
    /// Shutdown flag
    shutdown: RwLock<bool>,
}

/// WASM instance pool
pub struct InstancePool {
    inner: Arc<InstancePoolInner>,
}

impl InstancePool {
    /// Create a new instance pool
    pub fn new(config: &RuntimeConfig) -> Result<Self> {
        let max_instances = config.max_instances as usize;

        info!(
            max_instances = max_instances,
            "Creating instance pool"
        );

        let inner = Arc::new(InstancePoolInner {
            config: config.clone(),
            available: Mutex::new(VecDeque::with_capacity(max_instances)),
            suspended: RwLock::new(HashMap::new()),
            semaphore: Semaphore::new(max_instances),
            instances_created: AtomicUsize::new(0),
            active_count: AtomicUsize::new(0),
            total_memory: AtomicU64::new(0),
            shutdown: RwLock::new(false),
        });

        // Pre-warm pool with minimum instances
        let min_instances = config.min_instances.unwrap_or(1) as usize;
        {
            let mut available = inner.available.lock();
            for _ in 0..min_instances {
                match WasmInstance::new(&inner.config) {
                    Ok(instance) => {
                        inner.instances_created.fetch_add(1, Ordering::Relaxed);
                        available.push_back(instance);
                    }
                    Err(e) => {
                        warn!("Failed to pre-warm instance: {}", e);
                        break;
                    }
                }
            }
            debug!(count = available.len(), "Pre-warmed pool");
        }

        Ok(Self { inner })
    }

    /// Acquire an instance from the pool
    ///
    /// This will either return an existing idle instance or create a new one
    /// if the pool has capacity. Blocks if all instances are in use.
    pub async fn acquire(&self) -> Result<PooledInstance> {
        // Check shutdown
        if *self.inner.shutdown.read() {
            return Err(RuntimeError::Shutdown("Pool is shut down".into()));
        }

        // Acquire semaphore permit (blocks if at capacity)
        let _permit = self
            .inner
            .semaphore
            .acquire()
            .await
            .map_err(|_| RuntimeError::Shutdown("Pool semaphore closed".into()))?;

        // Try to get an existing instance
        let instance = {
            let mut available = self.inner.available.lock();
            available.pop_back() // LIFO for better cache locality
        };

        let instance = match instance {
            Some(mut inst) => {
                // Reset the instance for reuse
                inst.reset()?;
                debug!(id = %inst.id(), "Reusing pooled instance");
                inst
            }
            None => {
                // Create new instance
                let inst = WasmInstance::new(&self.inner.config)?;
                self.inner.instances_created.fetch_add(1, Ordering::Relaxed);
                debug!(id = %inst.id(), "Created new instance");
                inst
            }
        };

        self.inner.active_count.fetch_add(1, Ordering::Relaxed);
        self.inner.total_memory.fetch_add(
            instance.memory_used(),
            Ordering::Relaxed,
        );

        // Forget the permit - we track active count ourselves
        std::mem::forget(_permit);

        Ok(PooledInstance {
            instance,
            pool: Arc::clone(&self.inner),
        })
    }

    /// Release an instance back to the pool
    pub fn release(&self, mut pooled: PooledInstance) {
        self.inner.active_count.fetch_sub(1, Ordering::Relaxed);
        self.inner.total_memory.fetch_sub(
            pooled.instance.memory_used(),
            Ordering::Relaxed,
        );

        // Add permit back
        self.inner.semaphore.add_permits(1);

        // Check if instance should be returned to pool
        match pooled.instance.state() {
            InstanceState::Idle => {
                // Return to available pool
                if let Ok(()) = pooled.instance.reset() {
                    let mut available = self.inner.available.lock();
                    available.push_back(pooled.instance);
                    debug!("Returned instance to pool");
                } else {
                    debug!("Instance reset failed, dropping");
                    pooled.instance.terminate();
                }
            }
            InstanceState::Suspended => {
                // Move to suspended map
                if let Some(suspension_id) = pooled.instance.suspension_id() {
                    let mut suspended = self.inner.suspended.write();
                    suspended.insert(suspension_id.to_string(), pooled.instance);
                    debug!(suspension_id = suspension_id, "Moved instance to suspended");
                } else {
                    warn!("Suspended instance has no suspension ID");
                    pooled.instance.terminate();
                }
            }
            InstanceState::Executing => {
                warn!("Releasing executing instance - this shouldn't happen");
                pooled.instance.terminate();
            }
            InstanceState::Terminated => {
                // Already terminated, just drop
                debug!("Dropping terminated instance");
            }
        }
    }

    /// Get a suspended instance by suspension ID
    pub fn get_suspended(&self, suspension_id: &str) -> Option<PooledInstance> {
        let mut suspended = self.inner.suspended.write();
        suspended.remove(suspension_id).map(|instance| {
            self.inner.active_count.fetch_add(1, Ordering::Relaxed);
            self.inner.total_memory.fetch_add(
                instance.memory_used(),
                Ordering::Relaxed,
            );
            PooledInstance {
                instance,
                pool: Arc::clone(&self.inner),
            }
        })
    }

    /// Get count of active (checked out) instances
    pub fn active_count(&self) -> usize {
        self.inner.active_count.load(Ordering::Relaxed)
    }

    /// Get count of available (idle) instances
    pub fn available_count(&self) -> usize {
        self.inner.available.lock().len()
    }

    /// Get count of suspended instances
    pub fn suspended_count(&self) -> usize {
        self.inner.suspended.read().len()
    }

    /// Get total memory used by all instances
    pub fn total_memory(&self) -> u64 {
        self.inner.total_memory.load(Ordering::Relaxed)
    }

    /// Get total instances created
    pub fn instances_created(&self) -> usize {
        self.inner.instances_created.load(Ordering::Relaxed)
    }

    /// Shutdown the pool
    pub async fn shutdown(&self) {
        info!("Shutting down instance pool");
        *self.inner.shutdown.write() = true;

        // Close semaphore
        self.inner.semaphore.close();

        // Terminate all available instances
        {
            let mut available = self.inner.available.lock();
            for mut instance in available.drain(..) {
                instance.terminate();
            }
        }

        // Terminate all suspended instances
        {
            let mut suspended = self.inner.suspended.write();
            for (_, mut instance) in suspended.drain() {
                instance.terminate();
            }
        }

        info!("Instance pool shut down");
    }

    /// Clean up stale suspended instances
    pub fn cleanup_stale(&self, max_age_secs: u64) {
        let mut suspended = self.inner.suspended.write();
        let now = std::time::Instant::now();

        suspended.retain(|id, _instance| {
            // In a real implementation, we'd check instance.suspended_at
            // For now, we keep all instances
            debug!(suspension_id = %id, "Checking stale suspension");
            true
        });
    }
}

impl Clone for InstancePool {
    fn clone(&self) -> Self {
        Self {
            inner: Arc::clone(&self.inner),
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn create_pool() -> InstancePool {
        let config = RuntimeConfig::default();
        InstancePool::new(&config).unwrap()
    }

    #[tokio::test]
    async fn test_pool_creation() {
        let pool = create_pool();
        assert_eq!(pool.active_count(), 0);
    }

    #[tokio::test]
    async fn test_acquire_release() {
        let pool = create_pool();

        let instance = pool.acquire().await.unwrap();
        assert_eq!(pool.active_count(), 1);

        pool.release(instance);
        assert_eq!(pool.active_count(), 0);
        assert!(pool.available_count() > 0);
    }

    #[tokio::test]
    async fn test_multiple_acquire() {
        let pool = create_pool();

        let i1 = pool.acquire().await.unwrap();
        let i2 = pool.acquire().await.unwrap();
        let i3 = pool.acquire().await.unwrap();

        assert_eq!(pool.active_count(), 3);

        pool.release(i1);
        pool.release(i2);
        pool.release(i3);

        assert_eq!(pool.active_count(), 0);
    }

    #[tokio::test]
    async fn test_instance_reuse() {
        let pool = create_pool();

        // Acquire and release
        let instance = pool.acquire().await.unwrap();
        let id1 = instance.id().to_string();
        pool.release(instance);

        // Acquire again - should get the same instance back
        let instance = pool.acquire().await.unwrap();
        let id2 = instance.id().to_string();
        pool.release(instance);

        assert_eq!(id1, id2, "Should reuse instance");
    }

    #[tokio::test]
    async fn test_shutdown() {
        let pool = create_pool();

        let _instance = pool.acquire().await.unwrap();
        pool.shutdown().await;

        // Should fail after shutdown
        assert!(pool.acquire().await.is_err());
    }

    #[tokio::test]
    async fn test_pool_stats() {
        let pool = create_pool();

        let i1 = pool.acquire().await.unwrap();
        let i2 = pool.acquire().await.unwrap();

        assert_eq!(pool.active_count(), 2);
        assert!(pool.instances_created() >= 2);

        pool.release(i1);
        pool.release(i2);
    }
}

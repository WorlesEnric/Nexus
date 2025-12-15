//! Capability-based security system.
//!
//! Handlers must declare required capabilities in NXML. The runtime enforces
//! these capabilities at every host function call.

use serde::{Deserialize, Serialize};
use std::fmt;

/// Capability token format
#[derive(Debug, Clone, PartialEq, Eq, Hash, Serialize, Deserialize)]
#[serde(from = "String", into = "String")]
pub enum CapabilityToken {
    /// Read specific state key: `state:read:{key}`
    StateRead(String),
    /// Write specific state key: `state:write:{key}`
    StateWrite(String),
    /// Read all state: `state:read:*`
    StateReadAll,
    /// Write all state: `state:write:*`
    StateWriteAll,
    /// Emit specific event: `events:emit:{name}`
    EventsEmit(String),
    /// Emit all events: `events:emit:*`
    EventsEmitAll,
    /// Update specific component: `view:update:{id}`
    ViewUpdate(String),
    /// Update all components: `view:update:*`
    ViewUpdateAll,
    /// Access specific extension: `ext:{name}`
    Extension(String),
    /// Access all extensions: `ext:*`
    ExtensionAll,
}

impl CapabilityToken {
    /// Parse a capability token from a string
    pub fn parse(s: &str) -> Option<Self> {
        let parts: Vec<&str> = s.split(':').collect();
        
        match parts.as_slice() {
            ["state", "read", "*"] => Some(Self::StateReadAll),
            ["state", "write", "*"] => Some(Self::StateWriteAll),
            ["state", "read", key] => Some(Self::StateRead((*key).to_string())),
            ["state", "write", key] => Some(Self::StateWrite((*key).to_string())),
            ["events", "emit", "*"] => Some(Self::EventsEmitAll),
            ["events", "emit", name] => Some(Self::EventsEmit((*name).to_string())),
            ["view", "update", "*"] => Some(Self::ViewUpdateAll),
            ["view", "update", id] => Some(Self::ViewUpdate((*id).to_string())),
            ["ext", "*"] => Some(Self::ExtensionAll),
            ["ext", name] => Some(Self::Extension((*name).to_string())),
            _ => None,
        }
    }

    /// Check if this capability matches a required capability string
    pub fn matches(&self, required: &str) -> bool {
        // Parse the required capability
        let parts: Vec<&str> = required.split(':').collect();
        
        match (self, parts.as_slice()) {
            // State read
            (Self::StateReadAll, ["state", "read", _]) => true,
            (Self::StateRead(key), ["state", "read", k]) => key == *k,
            
            // State write
            (Self::StateWriteAll, ["state", "write", _]) => true,
            (Self::StateWrite(key), ["state", "write", k]) => key == *k,
            
            // Events
            (Self::EventsEmitAll, ["events", "emit", _]) => true,
            (Self::EventsEmit(name), ["events", "emit", n]) => name == *n,
            
            // View
            (Self::ViewUpdateAll, ["view", "update", _]) => true,
            (Self::ViewUpdate(id), ["view", "update", i]) => id == *i,
            
            // Extensions
            (Self::ExtensionAll, ["ext", _]) => true,
            (Self::Extension(name), ["ext", n]) => name == *n,
            
            _ => false,
        }
    }

    /// Convert to string representation
    pub fn to_string_repr(&self) -> String {
        match self {
            Self::StateRead(key) => format!("state:read:{}", key),
            Self::StateWrite(key) => format!("state:write:{}", key),
            Self::StateReadAll => "state:read:*".to_string(),
            Self::StateWriteAll => "state:write:*".to_string(),
            Self::EventsEmit(name) => format!("events:emit:{}", name),
            Self::EventsEmitAll => "events:emit:*".to_string(),
            Self::ViewUpdate(id) => format!("view:update:{}", id),
            Self::ViewUpdateAll => "view:update:*".to_string(),
            Self::Extension(name) => format!("ext:{}", name),
            Self::ExtensionAll => "ext:*".to_string(),
        }
    }
}

impl fmt::Display for CapabilityToken {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        write!(f, "{}", self.to_string_repr())
    }
}

impl From<String> for CapabilityToken {
    fn from(s: String) -> Self {
        Self::parse(&s).unwrap_or(Self::Extension(s))
    }
}

impl From<CapabilityToken> for String {
    fn from(cap: CapabilityToken) -> Self {
        cap.to_string_repr()
    }
}

/// Capability from NXML definition
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Capability {
    /// Capability type
    #[serde(rename = "type")]
    pub cap_type: CapabilityType,

    /// Scope (specific key/event/extension or '*' for all)
    pub scope: String,
}

impl Capability {
    /// Create a new capability
    pub fn new(cap_type: CapabilityType, scope: impl Into<String>) -> Self {
        Self {
            cap_type,
            scope: scope.into(),
        }
    }

    /// Convert to a capability token
    pub fn to_token(&self) -> CapabilityToken {
        match (&self.cap_type, self.scope.as_str()) {
            (CapabilityType::StateRead, "*") => CapabilityToken::StateReadAll,
            (CapabilityType::StateRead, key) => CapabilityToken::StateRead(key.to_string()),
            (CapabilityType::StateWrite, "*") => CapabilityToken::StateWriteAll,
            (CapabilityType::StateWrite, key) => CapabilityToken::StateWrite(key.to_string()),
            (CapabilityType::EventsEmit, "*") => CapabilityToken::EventsEmitAll,
            (CapabilityType::EventsEmit, name) => CapabilityToken::EventsEmit(name.to_string()),
            (CapabilityType::ViewUpdate, "*") => CapabilityToken::ViewUpdateAll,
            (CapabilityType::ViewUpdate, id) => CapabilityToken::ViewUpdate(id.to_string()),
            (CapabilityType::Extension, "*") => CapabilityToken::ExtensionAll,
            (CapabilityType::Extension, name) => CapabilityToken::Extension(name.to_string()),
        }
    }
}

/// Capability types
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum CapabilityType {
    /// Read state
    #[serde(rename = "state:read")]
    StateRead,
    /// Write state
    #[serde(rename = "state:write")]
    StateWrite,
    /// Emit events
    #[serde(rename = "events:emit")]
    EventsEmit,
    /// Update view
    #[serde(rename = "view:update")]
    ViewUpdate,
    /// Access extension
    #[serde(rename = "ext")]
    Extension,
}

/// Capability checker for runtime enforcement
pub struct CapabilityChecker {
    capabilities: Vec<CapabilityToken>,
}

impl CapabilityChecker {
    /// Create a new capability checker
    pub fn new(capabilities: Vec<CapabilityToken>) -> Self {
        Self { capabilities }
    }

    /// Check if a state read is allowed
    pub fn can_read_state(&self, key: &str) -> bool {
        let required = format!("state:read:{}", key);
        self.capabilities.iter().any(|c| c.matches(&required))
    }

    /// Check if a state write is allowed
    pub fn can_write_state(&self, key: &str) -> bool {
        let required = format!("state:write:{}", key);
        self.capabilities.iter().any(|c| c.matches(&required))
    }

    /// Check if an event emission is allowed
    pub fn can_emit_event(&self, event_name: &str) -> bool {
        let required = format!("events:emit:{}", event_name);
        self.capabilities.iter().any(|c| c.matches(&required))
    }

    /// Check if a view update is allowed
    pub fn can_update_view(&self, component_id: &str) -> bool {
        let required = format!("view:update:{}", component_id);
        self.capabilities.iter().any(|c| c.matches(&required))
    }

    /// Check if an extension access is allowed
    pub fn can_access_extension(&self, ext_name: &str) -> bool {
        let required = format!("ext:{}", ext_name);
        self.capabilities.iter().any(|c| c.matches(&required))
    }

    /// Check any capability
    pub fn check(&self, required: &str) -> bool {
        self.capabilities.iter().any(|c| c.matches(required))
    }
}

/// Infer capabilities from handler code (static analysis)
pub fn infer_capabilities(handler_code: &str) -> Vec<CapabilityToken> {
    let mut capabilities = Vec::new();
    
    // Simple regex-based detection
    // In a real implementation, use a proper JS parser
    
    // Detect $state reads: $state.key or $state['key']
    for cap in find_state_access(handler_code, false) {
        if !capabilities.contains(&cap) {
            capabilities.push(cap);
        }
    }
    
    // Detect $state writes: $state.key = ... or $state['key'] = ...
    for cap in find_state_access(handler_code, true) {
        if !capabilities.contains(&cap) {
            capabilities.push(cap);
        }
    }
    
    // Detect $emit calls: $emit('event', ...)
    for cap in find_emit_calls(handler_code) {
        if !capabilities.contains(&cap) {
            capabilities.push(cap);
        }
    }
    
    // Detect $ext access: $ext.name.method(...)
    for cap in find_extension_access(handler_code) {
        if !capabilities.contains(&cap) {
            capabilities.push(cap);
        }
    }
    
    capabilities
}

/// Find state access patterns (simple regex-based)
fn find_state_access(code: &str, writes_only: bool) -> Vec<CapabilityToken> {
    let mut caps = Vec::new();
    
    // Pattern: $state.key
    let re = if writes_only {
        regex::Regex::new(r"\$state\.(\w+)\s*=").ok()
    } else {
        regex::Regex::new(r"\$state\.(\w+)").ok()
    };
    
    if let Some(re) = re {
        for cap in re.captures_iter(code) {
            let key = cap.get(1).map(|m| m.as_str()).unwrap_or("");
            if !key.is_empty() {
                if writes_only {
                    caps.push(CapabilityToken::StateWrite(key.to_string()));
                } else {
                    caps.push(CapabilityToken::StateRead(key.to_string()));
                }
            }
        }
    }
    
    caps
}

/// Find $emit calls
fn find_emit_calls(code: &str) -> Vec<CapabilityToken> {
    let mut caps = Vec::new();
    
    // Pattern: $emit('event_name', ...)
    let re = regex::Regex::new(r#"\$emit\s*\(\s*['"](\w+)['"]"#).ok();
    
    if let Some(re) = re {
        for cap in re.captures_iter(code) {
            let event = cap.get(1).map(|m| m.as_str()).unwrap_or("");
            if !event.is_empty() {
                caps.push(CapabilityToken::EventsEmit(event.to_string()));
            }
        }
    }
    
    caps
}

/// Find extension access patterns
fn find_extension_access(code: &str) -> Vec<CapabilityToken> {
    let mut caps = Vec::new();
    
    // Pattern: $ext.name
    let re = regex::Regex::new(r"\$ext\.(\w+)").ok();
    
    if let Some(re) = re {
        for cap in re.captures_iter(code) {
            let ext = cap.get(1).map(|m| m.as_str()).unwrap_or("");
            if !ext.is_empty() {
                caps.push(CapabilityToken::Extension(ext.to_string()));
            }
        }
    }
    
    caps
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_capability_token_parse() {
        assert_eq!(
            CapabilityToken::parse("state:read:*"),
            Some(CapabilityToken::StateReadAll)
        );
        assert_eq!(
            CapabilityToken::parse("state:write:count"),
            Some(CapabilityToken::StateWrite("count".to_string()))
        );
        assert_eq!(
            CapabilityToken::parse("ext:http"),
            Some(CapabilityToken::Extension("http".to_string()))
        );
    }

    #[test]
    fn test_capability_token_matches() {
        let all_read = CapabilityToken::StateReadAll;
        assert!(all_read.matches("state:read:count"));
        assert!(all_read.matches("state:read:anything"));
        
        let specific_read = CapabilityToken::StateRead("count".to_string());
        assert!(specific_read.matches("state:read:count"));
        assert!(!specific_read.matches("state:read:other"));
    }

    #[test]
    fn test_capability_checker() {
        let checker = CapabilityChecker::new(vec![
            CapabilityToken::StateReadAll,
            CapabilityToken::StateWrite("count".to_string()),
            CapabilityToken::EventsEmit("toast".to_string()),
        ]);
        
        assert!(checker.can_read_state("anything"));
        assert!(checker.can_write_state("count"));
        assert!(!checker.can_write_state("other"));
        assert!(checker.can_emit_event("toast"));
        assert!(!checker.can_emit_event("other"));
    }

    #[test]
    fn test_capability_to_string() {
        assert_eq!(CapabilityToken::StateReadAll.to_string(), "state:read:*");
        assert_eq!(
            CapabilityToken::StateWrite("count".to_string()).to_string(),
            "state:write:count"
        );
    }
}

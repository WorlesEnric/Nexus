"""
NXML validation for marketplace panels.

Validates NXML source code before allowing publication to prevent
security issues and ensure basic structural correctness.
"""

from typing import Tuple, Optional, Dict
import re


class NXMLValidator:
    """Validates NXML source code before publication."""
    
    # Security patterns to reject
    DANGEROUS_PATTERNS = [
        (r'<script[^>]*>', "No raw script tags allowed"),
        (r'eval\s*\(', "eval() is not allowed"),
        (r'Function\s*\(', "Function constructor is not allowed"),
        (r'__proto__', "__proto__ manipulation is not allowed"),
        (r'constructor\s*\[', "Constructor manipulation is not allowed"),
    ]
    
    # Maximum allowed size (500KB)
    MAX_SIZE_BYTES = 500_000
    
    @staticmethod
    def validate(nxml_source: str) -> Tuple[bool, Optional[str]]:
        """
        Validate NXML source code.
        
        Args:
            nxml_source: The NXML source code to validate
            
        Returns:
            Tuple of (is_valid, error_message)
            - is_valid: True if valid, False otherwise
            - error_message: Error description if invalid, None if valid
        """
        
        # 1. Check for empty or whitespace-only
        if not nxml_source or not nxml_source.strip():
            return False, "NXML source cannot be empty"
        
        # 2. Size check
        size_bytes = len(nxml_source.encode('utf-8'))
        if size_bytes > NXMLValidator.MAX_SIZE_BYTES:
            return False, f"NXML size ({size_bytes} bytes) exceeds maximum of {NXMLValidator.MAX_SIZE_BYTES} bytes"
        
        # 3. Check for NexusPanel root tag with id attribute
        if not re.search(r'<NexusPanel\s+[^>]*id\s*=\s*["\']([^"\']+)["\']', nxml_source):
            return False, "NXML must have a <NexusPanel> root element with an 'id' attribute"
        
        # 4. Check for closing NexusPanel tag
        if '</NexusPanel>' not in nxml_source:
            return False, "NXML must have a closing </NexusPanel> tag"
        
        # 5. Check for balanced NexusPanel tags
        open_count = nxml_source.count('<NexusPanel')
        close_count = nxml_source.count('</NexusPanel>')
        if open_count != close_count:
            return False, f"Unbalanced <NexusPanel> tags (found {open_count} opening, {close_count} closing)"
        
        # 6. Check for View section (required for rendering)
        if '<View>' not in nxml_source and '<View ' not in nxml_source:
            return False, "NXML must contain a <View> section"
        
        # 7. Security checks - scan for dangerous patterns
        for pattern, error_msg in NXMLValidator.DANGEROUS_PATTERNS:
            if re.search(pattern, nxml_source, re.IGNORECASE):
                return False, f"Security violation: {error_msg}"
        
        # 8. Check for potential XSS patterns
        xss_patterns = [
            r'javascript:',
            r'on\w+\s*=\s*["\']',  # onclick="...", onerror="...", etc.
            r'data:text/html',
        ]
        for pattern in xss_patterns:
            if re.search(pattern, nxml_source, re.IGNORECASE):
                return False, "Potential XSS attack pattern detected"
        
        # All checks passed
        return True, None
    
    @staticmethod
    def extract_metadata(nxml_source: str) -> Dict[str, str]:
        """
        Extract metadata from NXML source.
        
        Args:
            nxml_source: The NXML source code
            
        Returns:
            Dictionary with extracted metadata
        """
        metadata = {}
        
        # Extract panel ID
        id_match = re.search(r'<NexusPanel\s+[^>]*id\s*=\s*["\']([^"\']+)["\']', nxml_source)
        if id_match:
            metadata['panel_id'] = id_match.group(1)
        
        # Extract title if present
        title_match = re.search(r'<NexusPanel[^>]+title\s*=\s*["\']([^"\']+)["\']', nxml_source)
        if title_match:
            metadata['title'] = title_match.group(1)
        
        # Extract version if present
        version_match = re.search(r'<NexusPanel[^>]+version\s*=\s*["\']([^"\']+)["\']', nxml_source)
        if version_match:
            metadata['version'] = version_match.group(1)
        
        # Check for sections
        metadata['has_data'] = '<Data>' in nxml_source or '<Data ' in nxml_source
        metadata['has_logic'] = '<Logic>' in nxml_source or '<Logic ' in nxml_source
        metadata['has_view'] = '<View>' in nxml_source or '<View ' in nxml_source
        
        # Count tools (approximate)
        tool_count = len(re.findall(r'<Tool\s+', nxml_source))
        metadata['tool_count'] = tool_count
        
        # Count state definitions (approximate)
        state_count = len(re.findall(r'<State\s+', nxml_source))
        metadata['state_count'] = state_count
        
        return metadata
    
    @staticmethod
    def validate_and_extract(nxml_source: str) -> Tuple[bool, Optional[str], Dict[str, str]]:
        """
        Validate NXML and extract metadata in one call.
        
        Args:
            nxml_source: The NXML source code
            
        Returns:
            Tuple of (is_valid, error_message, metadata)
        """
        is_valid, error = NXMLValidator.validate(nxml_source)
        metadata = NXMLValidator.extract_metadata(nxml_source) if is_valid else {}
        return is_valid, error, metadata


# Convenience function for quick validation
def validate_nxml(nxml_source: str) -> Tuple[bool, Optional[str]]:
    """
    Validate NXML source code.
    
    Args:
        nxml_source: The NXML source code to validate
        
    Returns:
        Tuple of (is_valid, error_message)
    """
    return NXMLValidator.validate(nxml_source)

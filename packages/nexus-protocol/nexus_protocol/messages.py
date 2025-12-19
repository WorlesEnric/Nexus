"""
WebSocket protocol message definitions for Nexus.

This module defines the messages exchanged between the React frontend
and the Python backend over WebSocket connections.
"""

from typing import Dict, List, Optional, Any, Union, Literal
from pydantic import BaseModel, Field
from datetime import datetime


# ============================================================================
# Client → Server Messages
# ============================================================================

class ExecuteHandlerMessage(BaseModel):
    """Client requests handler execution."""
    type: Literal["execute_handler"] = "execute_handler"
    handler_name: str = Field(..., description="Name of handler to execute")
    args: Dict[str, Any] = Field(default_factory=dict, description="Handler arguments")
    request_id: Optional[str] = Field(None, description="Request ID for correlation")


class SubscribeMessage(BaseModel):
    """Client subscribes to topics."""
    type: Literal["subscribe"] = "subscribe"
    topics: List[str] = Field(..., description="Topics to subscribe to")


class UnsubscribeMessage(BaseModel):
    """Client unsubscribes from topics."""
    type: Literal["unsubscribe"] = "unsubscribe"
    topics: List[str] = Field(..., description="Topics to unsubscribe from")


class NOGQueryMessage(BaseModel):
    """Client queries the NOG graph."""
    type: Literal["nog_query"] = "nog_query"
    query_type: str = Field(..., description="Type of query")
    params: Dict[str, Any] = Field(default_factory=dict, description="Query parameters")
    request_id: Optional[str] = Field(None, description="Request ID")


class PingMessage(BaseModel):
    """Client ping for keepalive."""
    type: Literal["ping"] = "ping"
    timestamp: datetime = Field(default_factory=datetime.utcnow)

    class Config:
        json_encoders = {
            datetime: lambda v: v.isoformat()
        }


# Union type for all client messages
ClientMessage = Union[
    ExecuteHandlerMessage,
    SubscribeMessage,
    UnsubscribeMessage,
    NOGQueryMessage,
    PingMessage,
]


# ============================================================================
# Server → Client Messages
# ============================================================================

class ConnectedMessage(BaseModel):
    """Server confirms WebSocket connection."""
    type: Literal["connected"] = "connected"
    workspace_id: str = Field(..., description="Connected workspace ID")
    panel_id: Optional[str] = Field(None, description="Connected panel ID")
    initial_state: Dict[str, Any] = Field(default_factory=dict, description="Initial state")
    timestamp: datetime = Field(default_factory=datetime.utcnow)

    class Config:
        json_encoders = {
            datetime: lambda v: v.isoformat()
        }


class StateMutation(BaseModel):
    """A single state mutation."""
    key: str = Field(..., description="State variable key")
    value: Any = Field(..., description="New value")
    operation: Literal["set", "merge", "delete"] = Field(default="set")


class StateUpdateMessage(BaseModel):
    """Server pushes state updates."""
    type: Literal["state_update"] = "state_update"
    mutations: List[StateMutation] = Field(..., description="State mutations")
    panel_id: Optional[str] = Field(None, description="Panel that changed")
    source: str = Field(..., description="Source of update (handler, AI, etc.)")
    timestamp: datetime = Field(default_factory=datetime.utcnow)

    class Config:
        json_encoders = {
            datetime: lambda v: v.isoformat()
        }


class EventMessage(BaseModel):
    """Server broadcasts an event."""
    type: Literal["event"] = "event"
    event_name: str = Field(..., description="Event name")
    event_data: Dict[str, Any] = Field(default_factory=dict, description="Event payload")
    panel_id: Optional[str] = Field(None, description="Panel that emitted event")
    timestamp: datetime = Field(default_factory=datetime.utcnow)

    class Config:
        json_encoders = {
            datetime: lambda v: v.isoformat()
        }


class ExecutionResult(BaseModel):
    """Result of handler execution."""
    success: bool = Field(..., description="Execution success")
    return_value: Any = Field(None, description="Handler return value")
    state_changes: Dict[str, Any] = Field(default_factory=dict, description="State changes")
    error: Optional[str] = Field(None, description="Error message if failed")
    execution_time_ms: float = Field(default=0.0, description="Execution time")


class ResultMessage(BaseModel):
    """Server returns handler execution result."""
    type: Literal["result"] = "result"
    request_id: Optional[str] = Field(None, description="Correlate with request")
    result: ExecutionResult = Field(..., description="Execution result")
    timestamp: datetime = Field(default_factory=datetime.utcnow)

    class Config:
        json_encoders = {
            datetime: lambda v: v.isoformat()
        }


class NOGUpdateMessage(BaseModel):
    """Server pushes NOG graph updates."""
    type: Literal["nog_update"] = "nog_update"
    update_type: Literal["full", "patch"] = Field(..., description="Full snapshot or patch")
    snapshot: Optional[Dict[str, Any]] = Field(None, description="Full graph snapshot")
    patches: Optional[List[Dict[str, Any]]] = Field(None, description="Graph patches")
    version: int = Field(..., description="Graph version")
    timestamp: datetime = Field(default_factory=datetime.utcnow)

    class Config:
        json_encoders = {
            datetime: lambda v: v.isoformat()
        }


class ErrorMessage(BaseModel):
    """Server sends error message."""
    type: Literal["error"] = "error"
    error_code: str = Field(..., description="Error code")
    message: str = Field(..., description="Error message")
    details: Optional[Dict[str, Any]] = Field(None, description="Error details")
    request_id: Optional[str] = Field(None, description="Related request ID")
    timestamp: datetime = Field(default_factory=datetime.utcnow)

    class Config:
        json_encoders = {
            datetime: lambda v: v.isoformat()
        }


class PongMessage(BaseModel):
    """Server responds to ping."""
    type: Literal["pong"] = "pong"
    timestamp: datetime = Field(default_factory=datetime.utcnow)

    class Config:
        json_encoders = {
            datetime: lambda v: v.isoformat()
        }


# Union type for all server messages
ServerMessage = Union[
    ConnectedMessage,
    StateUpdateMessage,
    EventMessage,
    ResultMessage,
    NOGUpdateMessage,
    ErrorMessage,
    PongMessage,
]


# ============================================================================
# Helper Functions
# ============================================================================

def create_state_update(
    mutations: List[tuple[str, Any]],
    panel_id: Optional[str] = None,
    source: str = "handler"
) -> StateUpdateMessage:
    """Helper to create a state update message."""
    mutation_objects = [
        StateMutation(key=key, value=value)
        for key, value in mutations
    ]
    return StateUpdateMessage(
        mutations=mutation_objects,
        panel_id=panel_id,
        source=source
    )


def create_error(
    error_code: str,
    message: str,
    details: Optional[Dict[str, Any]] = None,
    request_id: Optional[str] = None
) -> ErrorMessage:
    """Helper to create an error message."""
    return ErrorMessage(
        error_code=error_code,
        message=message,
        details=details,
        request_id=request_id
    )


def create_result(
    success: bool,
    return_value: Any = None,
    state_changes: Optional[Dict[str, Any]] = None,
    error: Optional[str] = None,
    execution_time_ms: float = 0.0,
    request_id: Optional[str] = None
) -> ResultMessage:
    """Helper to create a result message."""
    result = ExecutionResult(
        success=success,
        return_value=return_value,
        state_changes=state_changes or {},
        error=error,
        execution_time_ms=execution_time_ms
    )
    return ResultMessage(
        request_id=request_id,
        result=result
    )

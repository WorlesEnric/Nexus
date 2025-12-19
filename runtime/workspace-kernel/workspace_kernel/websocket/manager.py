"""
WebSocket manager - Handle real-time connections.
"""

import asyncio
import json
from typing import Dict, Set
from fastapi import WebSocket
from dataclasses import dataclass


@dataclass
class ConnectionInfo:
    """Information about a WebSocket connection."""

    websocket: WebSocket
    workspace_id: str
    user_id: str


class WebSocketManager:
    """
    Manages WebSocket connections for workspaces.

    Broadcasts state updates, events, and NOG updates to connected clients.
    """

    def __init__(self):
        # workspace_id -> set of WebSocket connections
        self.connections: Dict[str, Set[WebSocket]] = {}

        # websocket -> ConnectionInfo
        self.connection_info: Dict[WebSocket, ConnectionInfo] = {}

    async def connect(self, websocket: WebSocket, workspace_id: str, user_id: str):
        """
        Accept new WebSocket connection.

        Args:
            websocket: WebSocket connection
            workspace_id: Workspace ID
            user_id: User ID
        """
        await websocket.accept()

        if workspace_id not in self.connections:
            self.connections[workspace_id] = set()

        self.connections[workspace_id].add(websocket)
        self.connection_info[websocket] = ConnectionInfo(
            websocket=websocket, workspace_id=workspace_id, user_id=user_id
        )

        # Send connected message
        await websocket.send_json(
            {
                "type": "connected",
                "workspace_id": workspace_id,
                "message": "Connected to workspace",
            }
        )

    async def disconnect(self, websocket: WebSocket):
        """
        Remove WebSocket connection.

        Args:
            websocket: WebSocket connection
        """
        if websocket in self.connection_info:
            info = self.connection_info[websocket]

            if info.workspace_id in self.connections:
                self.connections[info.workspace_id].discard(websocket)

                if not self.connections[info.workspace_id]:
                    del self.connections[info.workspace_id]

            del self.connection_info[websocket]

    async def broadcast_to_workspace(self, workspace_id: str, message: Dict):
        """
        Broadcast message to all connections in workspace.

        Args:
            workspace_id: Workspace ID
            message: Message to broadcast
        """
        if workspace_id not in self.connections:
            return

        message_json = json.dumps(message)
        dead_connections = []

        for websocket in self.connections[workspace_id]:
            try:
                await websocket.send_text(message_json)
            except Exception:
                dead_connections.append(websocket)

        # Clean up dead connections
        for websocket in dead_connections:
            await self.disconnect(websocket)

    async def send_state_update(
        self, workspace_id: str, panel_id: str, mutations: list, source: str = "handler"
    ):
        """
        Send state update to workspace.

        Args:
            workspace_id: Workspace ID
            panel_id: Panel ID
            mutations: State mutations
            source: Source of update
        """
        message = {
            "type": "state_update",
            "panel_id": panel_id,
            "mutations": mutations,
            "source": source,
        }

        await self.broadcast_to_workspace(workspace_id, message)

    async def send_event(
        self, workspace_id: str, panel_id: str, event_name: str, event_data: Dict
    ):
        """
        Send event to workspace.

        Args:
            workspace_id: Workspace ID
            panel_id: Panel ID
            event_name: Event name
            event_data: Event data
        """
        message = {
            "type": "event",
            "panel_id": panel_id,
            "event_name": event_name,
            "event_data": event_data,
        }

        await self.broadcast_to_workspace(workspace_id, message)

    async def send_nog_update(self, workspace_id: str, snapshot: Dict):
        """
        Send NOG graph update to workspace.

        Args:
            workspace_id: Workspace ID
            snapshot: Graph snapshot
        """
        message = {"type": "nog_update", "snapshot": snapshot}

        await self.broadcast_to_workspace(workspace_id, message)

    async def handle_message(self, websocket: WebSocket, data: Dict):
        """
        Handle incoming WebSocket message.

        Args:
            websocket: WebSocket connection
            data: Message data
        """
        message_type = data.get("type")

        if message_type == "ping":
            await websocket.send_json({"type": "pong"})

        elif message_type == "subscribe":
            # Handle subscription (future enhancement)
            pass

        elif message_type == "unsubscribe":
            # Handle unsubscription (future enhancement)
            pass

    async def close_all(self):
        """Close all WebSocket connections."""
        for workspace_id in list(self.connections.keys()):
            for websocket in list(self.connections[workspace_id]):
                await websocket.close()

        self.connections.clear()
        self.connection_info.clear()

"""
Git service for state snapshot persistence
"""

import git
import json
import os
from pathlib import Path
from typing import Dict, Any, Optional
from datetime import datetime

from ..config import settings


class GitStateService:
    """Git-based state persistence"""

    def __init__(self):
        self.workspace_root = Path(settings.GIT_WORKSPACE_ROOT)
        self.workspace_root.mkdir(parents=True, exist_ok=True)

    def _get_workspace_repo(self, workspace_id: str) -> git.Repo:
        """Get or create Git repo for workspace"""
        repo_path = self.workspace_root / workspace_id

        if not repo_path.exists():
            repo_path.mkdir(parents=True)
            repo = git.Repo.init(repo_path)

            # Initial commit
            readme = repo_path / "README.md"
            readme.write_text(f"# Workspace {workspace_id}\n\nPanel state snapshots\n")
            repo.index.add(["README.md"])
            repo.index.commit("Initial commit")
        else:
            repo = git.Repo(repo_path)

        return repo

    async def save_snapshot(
        self,
        workspace_id: str,
        states: Dict[str, Dict[str, Any]],
        description: Optional[str] = None
    ) -> str:
        """Save state snapshot to Git"""
        try:
            repo = self._get_workspace_repo(workspace_id)
            repo_path = Path(repo.working_dir)

            # Create snapshots directory
            snapshots_dir = repo_path / "snapshots"
            snapshots_dir.mkdir(exist_ok=True)

            # Save each panel state
            for panel_id, state in states.items():
                panel_file = snapshots_dir / f"{panel_id}.json"
                panel_file.write_text(json.dumps(state, indent=2))

            # Stage all changes
            repo.index.add([str(snapshots_dir)])

            # Commit
            message = description or f"State snapshot at {datetime.utcnow().isoformat()}"
            commit = repo.index.commit(message)

            return commit.hexsha
        except Exception as e:
            print(f"[GitStateService] Error saving snapshot: {e}")
            raise

    async def load_snapshot(
        self,
        workspace_id: str,
        commit_hash: Optional[str] = None
    ) -> Dict[str, Dict[str, Any]]:
        """Load state snapshot from Git"""
        try:
            repo = self._get_workspace_repo(workspace_id)

            if commit_hash:
                # Checkout specific commit (detached HEAD)
                repo.git.checkout(commit_hash)

            # Read all panel states
            snapshots_dir = Path(repo.working_dir) / "snapshots"
            states = {}

            if snapshots_dir.exists():
                for panel_file in snapshots_dir.glob("*.json"):
                    panel_id = panel_file.stem
                    state = json.loads(panel_file.read_text())
                    states[panel_id] = state

            if commit_hash:
                # Return to main branch
                repo.git.checkout("main")

            return states
        except Exception as e:
            print(f"[GitStateService] Error loading snapshot: {e}")
            return {}

    async def get_commit_history(self, workspace_id: str, limit: int = 50) -> list:
        """Get commit history for workspace"""
        try:
            repo = self._get_workspace_repo(workspace_id)
            commits = []

            for commit in list(repo.iter_commits('main', max_count=limit)):
                commits.append({
                    "hash": commit.hexsha,
                    "short_hash": commit.hexsha[:7],
                    "message": commit.message,
                    "author": str(commit.author),
                    "timestamp": commit.committed_datetime.isoformat(),
                })

            return commits
        except Exception as e:
            print(f"[GitStateService] Error getting commit history: {e}")
            return []


# Global Git service instance
git_service = GitStateService()

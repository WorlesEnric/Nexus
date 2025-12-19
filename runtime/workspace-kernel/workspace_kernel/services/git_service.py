"""
Git service - Version control for workspaces.
"""

import os
from pathlib import Path
from typing import Optional
from git import Repo, GitCommandError

from ..config import settings


class GitService:
    """Service for Git version control."""

    def __init__(self):
        self.workspace_dir = Path(settings.git_workspace_dir)
        self.workspace_dir.mkdir(parents=True, exist_ok=True)

    def get_workspace_path(self, workspace_id: str) -> Path:
        """Get path to workspace Git repository."""
        return self.workspace_dir / workspace_id

    def init_workspace_repo(self, workspace_id: str) -> Repo:
        """
        Initialize Git repository for workspace.

        Args:
            workspace_id: Workspace ID

        Returns:
            Git repository
        """
        repo_path = self.get_workspace_path(workspace_id)

        if repo_path.exists():
            return Repo(repo_path)

        # Create directory
        repo_path.mkdir(parents=True, exist_ok=True)

        # Initialize Git repo
        repo = Repo.init(repo_path)

        # Create .nexus directory
        nexus_dir = repo_path / ".nexus"
        nexus_dir.mkdir(exist_ok=True)

        # Create initial .gitignore
        gitignore_path = repo_path / ".gitignore"
        gitignore_path.write_text("*.pyc\n__pycache__/\n.DS_Store\n")

        # Initial commit
        repo.index.add([".gitignore"])
        repo.index.commit("Initial commit")

        return repo

    def commit_changes(
        self, workspace_id: str, message: str, files: Optional[list] = None
    ) -> str:
        """
        Commit changes to workspace repository.

        Args:
            workspace_id: Workspace ID
            message: Commit message
            files: List of files to commit (None = commit all)

        Returns:
            Commit hash
        """
        repo_path = self.get_workspace_path(workspace_id)

        if not repo_path.exists():
            raise ValueError(f"Workspace repository not found: {workspace_id}")

        repo = Repo(repo_path)

        # Add files
        if files:
            repo.index.add(files)
        else:
            repo.git.add(A=True)

        # Commit
        commit = repo.index.commit(message)

        return commit.hexsha

    def save_nog_graph(self, workspace_id: str, graph_json: str) -> None:
        """
        Save NOG graph to Git.

        Args:
            workspace_id: Workspace ID
            graph_json: Graph JSON string
        """
        repo_path = self.get_workspace_path(workspace_id)
        nog_file = repo_path / ".nexus" / "nog-graph.json"

        nog_file.write_text(graph_json)

    def load_nog_graph(self, workspace_id: str) -> Optional[str]:
        """
        Load NOG graph from Git.

        Args:
            workspace_id: Workspace ID

        Returns:
            Graph JSON string or None
        """
        repo_path = self.get_workspace_path(workspace_id)
        nog_file = repo_path / ".nexus" / "nog-graph.json"

        if nog_file.exists():
            return nog_file.read_text()

        return None

    def save_panel_nxml(self, workspace_id: str, panel_id: str, nxml_source: str) -> None:
        """
        Save panel NXML to Git.

        Args:
            workspace_id: Workspace ID
            panel_id: Panel ID
            nxml_source: NXML source code
        """
        repo_path = self.get_workspace_path(workspace_id)
        panels_dir = repo_path / "panels"
        panels_dir.mkdir(exist_ok=True)

        panel_file = panels_dir / f"{panel_id}.nxml"
        panel_file.write_text(nxml_source)

    def get_commit_history(self, workspace_id: str, max_count: int = 10) -> list:
        """
        Get commit history for workspace.

        Args:
            workspace_id: Workspace ID
            max_count: Maximum number of commits

        Returns:
            List of commits
        """
        repo_path = self.get_workspace_path(workspace_id)

        if not repo_path.exists():
            return []

        repo = Repo(repo_path)

        commits = []
        for commit in list(repo.iter_commits())[:max_count]:
            commits.append(
                {
                    "hash": commit.hexsha,
                    "message": commit.message,
                    "author": commit.author.name,
                    "date": commit.committed_datetime.isoformat(),
                }
            )

        return commits

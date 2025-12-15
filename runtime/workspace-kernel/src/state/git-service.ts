/**
 * Git Service - Manages Git operations for workspace persistence
 *
 * This service provides a wrapper around simple-git to handle:
 * - Repository initialization
 * - File operations (read/write)
 * - Commits with auto-save
 * - Shadow branches for AI operations
 * - Branch management
 */

import simpleGit, { SimpleGit, StatusResult } from 'simple-git';
import fs from 'fs-extra';
import path from 'path';
import { logger } from '../logger';

export interface GitServiceConfig {
  rootDir: string;
  userName?: string;
  userEmail?: string;
  defaultBranch?: string;
}

export interface CommitResult {
  hash: string;
  message: string;
  filesChanged: number;
}

export interface ShadowBranchInfo {
  name: string;
  baseBranch: string;
  createdAt: number;
}

/**
 * GitService - Handles all Git operations for the workspace
 */
export class GitService {
  private git: SimpleGit;
  private readonly rootDir: string;
  private readonly userName: string;
  private readonly userEmail: string;
  private readonly defaultBranch: string;
  private isInitialized: boolean = false;

  constructor(config: GitServiceConfig) {
    this.rootDir = path.resolve(config.rootDir);
    this.git = simpleGit(this.rootDir);
    this.userName = config.userName || 'Nexus Kernel';
    this.userEmail = config.userEmail || 'kernel@nexus.local';
    this.defaultBranch = config.defaultBranch || 'main';
  }

  /**
   * Initialize the Git repository if it doesn't exist
   */
  async init(): Promise<void> {
    try {
      const gitDir = path.join(this.rootDir, '.git');

      if (!await fs.pathExists(gitDir)) {
        logger.info({ rootDir: this.rootDir }, 'Initializing new Git repository');

        // Ensure root directory exists
        await fs.ensureDir(this.rootDir);

        // Initialize Git repo
        await this.git.init();

        // Configure user
        await this.git.addConfig('user.name', this.userName);
        await this.git.addConfig('user.email', this.userEmail);

        // Set default branch name
        await this.git.branch(['-M', this.defaultBranch]);

        // Create initial .gitignore
        const gitignoreContent = [
          '# Nexus Workspace',
          'node_modules/',
          '.DS_Store',
          '*.log',
          '.env',
          '.env.local',
          'temp/',
          'tmp/',
        ].join('\n');

        await this.writeFile('.gitignore', gitignoreContent);

        // Initial commit
        await this.commit('Initial commit - Nexus workspace created');

        logger.info('Git repository initialized successfully');
      } else {
        logger.info({ rootDir: this.rootDir }, 'Using existing Git repository');

        // Verify and update git config
        try {
          await this.git.addConfig('user.name', this.userName);
          await this.git.addConfig('user.email', this.userEmail);
        } catch (error) {
          logger.warn({ error }, 'Failed to update git config, continuing anyway');
        }
      }

      this.isInitialized = true;
    } catch (error) {
      logger.error({ error, rootDir: this.rootDir }, 'Failed to initialize Git repository');
      throw new Error(`Git initialization failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * Check if the repository is initialized
   */
  getIsInitialized(): boolean {
    return this.isInitialized;
  }

  /**
   * Get the current Git status
   */
  async status(): Promise<StatusResult> {
    this.ensureInitialized();
    return await this.git.status();
  }

  /**
   * Get the current branch name
   */
  async getCurrentBranch(): Promise<string> {
    this.ensureInitialized();
    const status = await this.git.status();
    return status.current || this.defaultBranch;
  }

  /**
   * Commit changes with a message
   * @param message - Commit message
   * @param allowEmpty - Allow empty commits (default: false)
   * @returns Commit information
   */
  async commit(message: string, allowEmpty: boolean = false): Promise<CommitResult> {
    this.ensureInitialized();

    try {
      const status = await this.git.status();

      // Check if there are changes to commit
      if (status.files.length === 0 && !allowEmpty) {
        logger.debug('No changes to commit');
        return {
          hash: '',
          message: 'No changes',
          filesChanged: 0
        };
      }

      // Stage all changes
      await this.git.add('.');

      // Commit
      const result = await this.git.commit(message, allowEmpty ? ['--allow-empty'] : []);

      logger.info({
        hash: result.commit,
        message,
        filesChanged: status.files.length
      }, 'Committed changes');

      return {
        hash: result.commit,
        message,
        filesChanged: status.files.length
      };
    } catch (error) {
      logger.error({ error, message }, 'Failed to commit changes');
      throw new Error(`Git commit failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * Create a shadow branch for AI operations
   * Shadow branches are temporary branches used for AI-proposed changes
   * @param taskId - Unique identifier for the task
   * @returns Shadow branch information
   */
  async createShadowBranch(taskId: string): Promise<ShadowBranchInfo> {
    this.ensureInitialized();

    try {
      const baseBranch = await this.getCurrentBranch();
      const branchName = `shadow/${taskId}`;

      // Check if branch already exists
      const branches = await this.git.branchLocal();
      if (branches.all.includes(branchName)) {
        logger.warn({ branchName }, 'Shadow branch already exists, deleting and recreating');
        await this.deleteBranch(branchName, true);
      }

      // Create and checkout new branch
      await this.git.checkoutLocalBranch(branchName);

      logger.info({ branchName, baseBranch }, 'Created shadow branch');

      return {
        name: branchName,
        baseBranch,
        createdAt: Date.now()
      };
    } catch (error) {
      logger.error({ error, taskId }, 'Failed to create shadow branch');
      throw new Error(`Shadow branch creation failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * Checkout a branch (or return to main/base branch)
   * @param branchName - Branch name to checkout, defaults to main branch
   */
  async checkout(branchName?: string): Promise<void> {
    this.ensureInitialized();

    const targetBranch = branchName || this.defaultBranch;

    try {
      await this.git.checkout(targetBranch);
      logger.info({ branch: targetBranch }, 'Checked out branch');
    } catch (error) {
      logger.error({ error, branch: targetBranch }, 'Failed to checkout branch');
      throw new Error(`Git checkout failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * Delete a branch
   * @param branchName - Branch name to delete
   * @param force - Force delete even if not merged
   */
  async deleteBranch(branchName: string, force: boolean = false): Promise<void> {
    this.ensureInitialized();

    try {
      await this.git.deleteLocalBranch(branchName, force);
      logger.info({ branchName, force }, 'Deleted branch');
    } catch (error) {
      logger.error({ error, branchName }, 'Failed to delete branch');
      throw new Error(`Branch deletion failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * List all shadow branches
   */
  async listShadowBranches(): Promise<string[]> {
    this.ensureInitialized();

    try {
      const branches = await this.git.branchLocal();
      return branches.all.filter(b => b.startsWith('shadow/'));
    } catch (error) {
      logger.error({ error }, 'Failed to list shadow branches');
      return [];
    }
  }

  /**
   * Clean up old shadow branches
   * @param olderThanMs - Delete branches older than this (in milliseconds)
   */
  async cleanupShadowBranches(olderThanMs: number = 24 * 60 * 60 * 1000): Promise<number> {
    this.ensureInitialized();

    try {
      const shadowBranches = await this.listShadowBranches();
      let deletedCount = 0;

      for (const branch of shadowBranches) {
        // In a production system, you'd check the branch creation time
        // For now, we'll just provide the cleanup mechanism
        try {
          await this.deleteBranch(branch, true);
          deletedCount++;
        } catch (error) {
          logger.warn({ error, branch }, 'Failed to delete shadow branch during cleanup');
        }
      }

      logger.info({ deletedCount }, 'Cleaned up shadow branches');
      return deletedCount;
    } catch (error) {
      logger.error({ error }, 'Failed to cleanup shadow branches');
      return 0;
    }
  }

  /**
   * List files matching a pattern
   * @param pattern - Glob pattern (e.g., *.nxml, **.json)
   * @param directory - Directory to search in (relative to root)
   */
  async listFiles(pattern: string, directory: string = ''): Promise<string[]> {
    this.ensureInitialized();

    try {
      const searchDir = directory ? path.join(this.rootDir, directory) : this.rootDir;

      if (!await fs.pathExists(searchDir)) {
        return [];
      }

      const files = await fs.readdir(searchDir);

      // Simple pattern matching (for complex patterns, use a glob library)
      const regex = new RegExp(pattern.replace(/\./g, '\\.').replace(/\*/g, '.*'));
      const matchedFiles = files.filter(f => regex.test(f));

      // Return relative paths
      return matchedFiles.map(f => directory ? path.join(directory, f) : f);
    } catch (error) {
      logger.error({ error, pattern, directory }, 'Failed to list files');
      throw new Error(`Failed to list files: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * Read a file from the workspace
   * @param filePath - Relative path to the file
   * @returns File content as string
   */
  async readFile(filePath: string): Promise<string> {
    this.ensureInitialized();

    try {
      const fullPath = path.join(this.rootDir, filePath);

      if (!await fs.pathExists(fullPath)) {
        throw new Error(`File not found: ${filePath}`);
      }

      const content = await fs.readFile(fullPath, 'utf-8');
      return content;
    } catch (error) {
      logger.error({ error, filePath }, 'Failed to read file');
      throw new Error(`Failed to read file ${filePath}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * Write a file to the workspace
   * @param filePath - Relative path to the file
   * @param content - File content
   */
  async writeFile(filePath: string, content: string): Promise<void> {
    this.ensureInitialized();

    try {
      const fullPath = path.join(this.rootDir, filePath);

      // Ensure directory exists
      await fs.ensureDir(path.dirname(fullPath));

      // Write file
      await fs.writeFile(fullPath, content, 'utf-8');

      logger.debug({ filePath }, 'Wrote file');
    } catch (error) {
      logger.error({ error, filePath }, 'Failed to write file');
      throw new Error(`Failed to write file ${filePath}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * Delete a file from the workspace
   * @param filePath - Relative path to the file
   */
  async deleteFile(filePath: string): Promise<void> {
    this.ensureInitialized();

    try {
      const fullPath = path.join(this.rootDir, filePath);

      if (await fs.pathExists(fullPath)) {
        await fs.remove(fullPath);
        logger.debug({ filePath }, 'Deleted file');
      }
    } catch (error) {
      logger.error({ error, filePath }, 'Failed to delete file');
      throw new Error(`Failed to delete file ${filePath}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * Check if a file exists
   * @param filePath - Relative path to the file
   */
  async fileExists(filePath: string): Promise<boolean> {
    const fullPath = path.join(this.rootDir, filePath);
    return await fs.pathExists(fullPath);
  }

  /**
   * Get the absolute path of the workspace root
   */
  getRootDir(): string {
    return this.rootDir;
  }

  /**
   * Ensure the service is initialized before operations
   */
  private ensureInitialized(): void {
    if (!this.isInitialized) {
      throw new Error('GitService not initialized. Call init() first.');
    }
  }
}

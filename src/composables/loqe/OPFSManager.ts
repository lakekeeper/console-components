/**
 * OPFSManager — Origin Private File System manager for LoQE.
 *
 * Provides persistent storage for the DuckDB database file so that
 * user-created tables, views, and extension metadata survive page reloads.
 */
export class OPFSManager {
  private rootDir: FileSystemDirectoryHandle | null = null;
  private loqeDir: FileSystemDirectoryHandle | null = null;
  private _isAvailable = false;

  /** Whether OPFS was successfully initialised. */
  get isAvailable(): boolean {
    return this._isAvailable;
  }

  /**
   * Probe for OPFS support and create the `/loqe` directory tree.
   * Returns `true` when OPFS is ready, `false` otherwise (Firefox, insecure
   * context, …). Never throws.
   */
  async initialize(): Promise<boolean> {
    try {
      if (
        typeof navigator === 'undefined' ||
        !('storage' in navigator) ||
        typeof navigator.storage.getDirectory !== 'function'
      ) {
        console.warn('[LoQE] OPFS is not available in this browser');
        return false;
      }

      this.rootDir = await navigator.storage.getDirectory();
      this.loqeDir = await this.rootDir.getDirectoryHandle('loqe', { create: true });

      // Pre-create sub-directories
      await this.loqeDir.getDirectoryHandle('databases', { create: true });

      this._isAvailable = true;
      return true;
    } catch (e) {
      console.warn('[LoQE] OPFS initialisation failed:', e);
      return false;
    }
  }

  /**
   * Return (or create) a `FileSystemFileHandle` inside
   * `opfs://loqe/databases/<name>.duckdb`.
   */
  async getDatabaseFileHandle(name: string): Promise<FileSystemFileHandle | null> {
    if (!this.loqeDir) return null;

    try {
      const dbDir = await this.loqeDir.getDirectoryHandle('databases', { create: true });
      return await dbDir.getFileHandle(`${name}.duckdb`, { create: true });
    } catch (e) {
      console.error('[LoQE] Failed to obtain database file handle:', e);
      return null;
    }
  }

  /**
   * Check whether a database file exists in OPFS and has content.
   * Returns `true` only when the file is present and > 0 bytes.
   */
  async hasDatabaseFile(name: string): Promise<boolean> {
    if (!this.loqeDir) return false;
    try {
      const dbDir = await this.loqeDir.getDirectoryHandle('databases');
      const handle = await dbDir.getFileHandle(`${name}.duckdb`, { create: false });
      const file = await handle.getFile();
      return file.size > 0;
    } catch {
      return false;
    }
  }

  /** Delete a database file **and** its WAL / temp artefacts from OPFS. */
  async clearDatabase(name: string): Promise<void> {
    if (!this.loqeDir) return;
    try {
      const dbDir = await this.loqeDir.getDirectoryHandle('databases');
      // DuckDB may create .duckdb, .duckdb.wal, .duckdb.tmp, etc.
      const suffixes = ['.duckdb', '.duckdb.wal', '.duckdb.tmp'];
      for (const suffix of suffixes) {
        try {
          await dbDir.removeEntry(`${name}${suffix}`);
        } catch {
          /* entry may not exist — that's fine */
        }
      }
    } catch {
      /* directory may not exist */
    }
  }

  /** Nuke the entire `/loqe` OPFS tree. */
  async clearAll(): Promise<void> {
    if (!this.rootDir) return;
    try {
      await this.rootDir.removeEntry('loqe', { recursive: true });
      this.loqeDir = null;
    } catch {
      /* may not exist */
    }
  }
}

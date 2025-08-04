import { Octokit } from "octokit";

/**
 * Interface for MCP resources
 */
export interface IMCPResource {
  /**
   * Resource name
   */
  readonly name: string;

  /**
   * Resource URI
   */
  readonly uri: string;

  /**
   * Optional human-readable title
   */
  readonly title?: string;

  /**
   * Optional description
   */
  readonly description?: string;

  /**
   * Optional MIME type
   */
  readonly mimeType?: string;

  /**
   * Optional size in bytes
   */
  readonly size?: number;

  /**
   * Resource handler
   */
  handler(uri: URL): Promise<{
    contents: {
      uri: string;
      text: string;
      mimeType?: string;
      title?: string;
      description?: string;
      size?: number;
    }[];
  }>;
}

/**
 * Individual file resource
 */
class FileResource implements IMCPResource {
  readonly name: string;
  readonly uri: string;
  readonly title: string;
  readonly description: string;
  readonly size: number;

  constructor(
    private readonly accessToken: string,
    private readonly owner: string,
    private readonly repo: string,
    private readonly filePath: string,
    private readonly fileName: string,
    private readonly fileSize: number,
  ) {
    // Initialize readonly properties
    this.name = filePath;
    this.uri = `github://file/${filePath}`;
    this.title = fileName;
    this.description = `File: ${filePath} (${fileSize} bytes)`;
    this.size = fileSize;
  }

  get mimeType(): string {
    return this.getMimeType(this.fileName);
  }

  async handler(uri: URL): Promise<{
    contents: {
      uri: string;
      text: string;
      mimeType?: string;
      title?: string;
      description?: string;
      size?: number;
    }[];
  }> {
    try {
      const octokit = new Octokit({ auth: this.accessToken });
      const { data } = await octokit.rest.repos.getContent({
        owner: this.owner,
        repo: this.repo,
        path: this.filePath,
      });

      if (!Array.isArray(data) && data.type === "file") {
        const content = Buffer.from(data.content || "", "base64").toString(
          "utf-8",
        );

        return {
          contents: [
            {
              uri: uri.href,
              title: this.fileName,
              text: content,
              mimeType: this.mimeType,
              size: this.fileSize,
            },
          ],
        };
      } else {
        throw new Error(`Path ${this.filePath} is not a file`);
      }
    } catch (error) {
      throw new Error(`Failed to read file: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  private getMimeType(filename: string): string {
    const ext = filename.split(".").pop()?.toLowerCase();
    const mimeTypes: Record<string, string> = {
      js: "text/javascript",
      ts: "text/typescript",
      jsx: "text/jsx",
      tsx: "text/tsx",
      json: "application/json",
      md: "text/markdown",
      txt: "text/plain",
      html: "text/html",
      css: "text/css",
      py: "text/x-python",
      java: "text/x-java",
      c: "text/x-c",
      cpp: "text/x-c++",
      rs: "text/x-rust",
      go: "text/x-go",
      rb: "text/x-ruby",
      php: "text/x-php",
      sh: "text/x-shellscript",
      yaml: "text/yaml",
      yml: "text/yaml",
      xml: "text/xml",
      svg: "image/svg+xml",
      png: "image/png",
      jpg: "image/jpeg",
      jpeg: "image/jpeg",
      gif: "image/gif",
      pdf: "application/pdf",
    };

    return mimeTypes[ext || ""] || "application/octet-stream";
  }
}

/**
 * Factory function to create file resources from the source repository
 * @param accessToken GitHub access token
 * @param env Environment variables
 * @returns Array of file resources
 */
export async function createFileResources(
  accessToken: string,
  env: Env,
): Promise<IMCPResource[]> {
  try {
    // Validate SOURCE_REPOSITORY_NAME is set
    if (!env.SOURCE_REPOSITORY_NAME) {
      console.error("SOURCE_REPOSITORY_NAME environment variable is not set");
      return [];
    }

    // Validate repository name format (owner/repo)
    const repoMatch = env.SOURCE_REPOSITORY_NAME.match(/^([^/]+)\/([^/]+)$/);
    if (!repoMatch) {
      console.error(
        `Invalid repository name format: ${env.SOURCE_REPOSITORY_NAME}. Expected format: owner/repo`,
      );
      return [];
    }

    const [, owner, repo] = repoMatch;
    console.error(`Fetching files from repository: ${owner}/${repo}`);
    const octokit = new Octokit({ auth: accessToken });

    // List all files in the repository
    let files = await listFiles(octokit, owner, repo, env.BRANCH_NAME);
    if (files.length === 0) {
      console.error(
        `No files found in repository ${owner}/${repo} with the specified filters`,
      );
      return [];
    }
    console.error(
      `Found ${files.length} files in repository ${owner}/${repo} after filtering`,
    );

    // Create a resource for each file
    return files.map(
      (file) =>
        new FileResource(
          accessToken,
          owner,
          repo,
          file.path,
          file.name,
          file.size,
        ),
    );
  } catch (error) {
    console.error(`Failed to create file resources: ${error instanceof Error ? error.message : String(error)}`);
    return [];
  }
}

/**
 * List all files in a repository using the Git Tree API
 */
async function listFiles(
  octokit: Octokit,
  owner: string,
  repo: string,
  branch?: string,
): Promise<Array<{ path: string; name: string; size: number }>> {
  try {
    let targetBranch = branch;

    // Get repository information to get the default branch if branch is not specified
    if (!targetBranch) {
      const { data: repoInfo } = await octokit.rest.repos.get({
        owner,
        repo,
      });
      targetBranch = repoInfo.default_branch;
    }

    // Get the latest commit of the target branch
    const { data: ref } = await octokit.rest.git.getRef({
      owner,
      repo,
      ref: `heads/${targetBranch}`,
    });

    // Get the commit
    const { data: commit } = await octokit.rest.git.getCommit({
      owner,
      repo,
      commit_sha: ref.object.sha,
    });

    // Get the entire tree recursively
    const { data: tree } = await octokit.rest.git.getTree({
      owner,
      repo,
      tree_sha: commit.tree.sha,
      recursive: "true",
    });

    // Filter only files (blobs)
    return tree.tree
      .filter((item) => item.type === "blob" && item.path)
      .map((item) => ({
        path: item.path,
        name: item.path.split("/")?.pop() ?? "unknown",
        size: item.size || 0,
      }));
  } catch (error) {
    console.error("Error fetching files from tree:", error);
    throw error;
  }
}

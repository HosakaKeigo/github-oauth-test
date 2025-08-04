import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { createFileResources } from "./files.js";

/**
 * Register all resources with the MCP server
 * @param server The MCP server instance
 * @param accessToken GitHub access token
 * @param env Environment variables
 */
export async function registerResources(
  server: McpServer,
  accessToken: string,
  env: Env,
) {
  const fileResources = await createFileResources(accessToken, env);

  for (const resource of fileResources) {
    server.resource(
      resource.name,
      resource.uri,
      resource.handler.bind(resource),
    );
  }
}

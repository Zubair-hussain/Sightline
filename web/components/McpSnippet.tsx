'use client';
import { useOS } from './useOS';
import { MCP_PATH } from './os';

export function McpSnippet() {
  const os = useOS();
  const snippet = JSON.stringify({ mcpServers: { sightline: { command: '__PATH__', args: ['--mcp'] } } }, null, 2)
    .replace('"__PATH__"', `"${MCP_PATH[os]}"`);
  return <div className="code-box">{snippet}</div>;
}

#!/usr/bin/env node
/* Plain-Node MCP entry point (no browser engine): node out/mcp/stdio.js */
import { startMcpServer } from './server';

startMcpServer(null);

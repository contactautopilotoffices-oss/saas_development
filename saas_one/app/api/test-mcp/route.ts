/**
 * Test MCP endpoint.
 * GET: Test endpoint for development.
 * Auth: Open (dev only).
 */

import { NextResponse } from "next/server";
import { getMCPClient } from "@/lib/mcp-client";

export async function GET() {
    try {
        const client = await getMCPClient();
        const tools = await client.listTools();

        return NextResponse.json({
            tools
        });
    } catch (error: any) {
        console.error("Test MCP Error:", error);
        return NextResponse.json({
            error: "Failed to connect to MCP",
            details: error.message
        }, { status: 500 });
    }
}

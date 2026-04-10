import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";

let clientPromise: Promise<Client> | null = null;

export async function getMCPClient() {
    if (clientPromise) return clientPromise;

    clientPromise = (async () => {
        try {
            const mcpUrl = process.env.SUPABASE_MCP_URL;
            const adminKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

            if (!mcpUrl) {
                throw new Error("SUPABASE_MCP_URL is not defined in environment variables");
            }

            const transport = new StreamableHTTPClientTransport(new URL(mcpUrl), {
                requestInit: {
                    headers: {
                        'apikey': adminKey || '',
                        'Authorization': `Bearer ${adminKey || ''}`
                    }
                }
            });

            const client = new Client({
                name: "autopilot-ai",
                version: "1.0.0"
            }, {
                capabilities: {}
            });

            await client.connect(transport);
            return client;
        } catch (error) {
            clientPromise = null; // Reset on failure so we can retry
            throw error;
        }
    })();

    return clientPromise;
}

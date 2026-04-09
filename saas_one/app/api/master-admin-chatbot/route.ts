/**
 * Master admin AI chatbot API.
 * Accepts natural language questions, uses Groq LLM to generate SQL,
 * executes via RPC, returns humanized answer.
 * POST: Submit query.
 * Auth: Master Admin only.
 */
import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/frontend/utils/supabase/admin';
import { createClient } from '@/frontend/utils/supabase/server';
import { getMCPClient } from '@/lib/mcp-client';

const GROQ_API_KEY = process.env.GROQ_API_KEY;
const GROQ_API_URL = 'https://api.groq.com/openai/v1/chat/completions';
const MODEL = 'llama-3.3-70b-versatile';

const SYSTEM_PROMPT = `
You are a SQL expert. Generate a SINGLE valid PostgreSQL SELECT query based on the following schema.

### SCHEMA:
- organizations (id, name, code, status)
- properties (id, organization_id, name, code, status, address, city)
- users (id, full_name, email, phone, team)
- organization_memberships (user_id, organization_id, role, is_active)
- property_memberships (user_id, organization_id, property_id, role, is_active)
- tickets (id, title, description, status, priority, property_id, organization_id)

### RELATIONSHIPS:
- properties.organization_id = organizations.id
- organization_memberships.user_id = users.id
- organization_memberships.organization_id = organizations.id
- property_memberships.user_id = users.id
- property_memberships.property_id = properties.id
- tickets.property_id = properties.id
- tickets.organization_id = organizations.id

### RULES:
1. Output ONLY the SQL inside a markdown block.
2. NO explanation. NO conversation.
3. Use JOINs for all multi-table queries.
4. Use ILIKE '%...%' for all text filters.
5. Default organization name is 'Autopilot Offices'.

### EXAMPLES:
- User: "how many properties are there?"
  SQL: SELECT count(p.id) FROM properties p JOIN organizations o ON p.organization_id = o.id WHERE o.name ILIKE '%Autopilot Offices%';

- User: "how many users are in Head Office?"
  SQL: SELECT count(u.id) FROM users u JOIN property_memberships pm ON u.id = pm.user_id JOIN properties p ON pm.property_id = p.id WHERE p.name ILIKE '%Head Office%';
`;

async function callGroq(messages: any[]) {
    const response = await fetch(GROQ_API_URL, {
        method: 'POST',
        headers: {
            'Authorization': `Bearer ${GROQ_API_KEY}`,
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({
            model: MODEL,
            messages,
            temperature: 0.1,
        })
    });

    if (!response.ok) {
        const err = await response.text();
        throw new Error(`Groq API error: ${response.status} - ${err}`);
    }

    const data = await response.json();
    return data.choices[0].message.content;
}

export async function POST(req: NextRequest) {
    try {
        const { question } = await req.json();
        if (!question) {
            return NextResponse.json({ error: 'Question is required' }, { status: 400 });
        }

        // 1. Verify Master Admin
        const supabase = await createClient();
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

        const adminClient = createAdminClient();
        const { data: profile } = await adminClient
            .from('users')
            .select('is_master_admin')
            .eq('id', user.id)
            .single();

        if (!profile?.is_master_admin) {
            return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
        }

        // 2. Step 1: Generate SQL
        const sqlMessages = [
            { role: 'system', content: SYSTEM_PROMPT },
            { role: 'user', content: question }
        ];

        const sqlResponse = await callGroq(sqlMessages);
        // Robust regex to extract SQL from various markdown formats
        const sqlMatch = sqlResponse.match(/```(?:sql)?\s*([\s\S]*?)\s*```/) || [null, sqlResponse];
        const sql = sqlMatch[1].trim();

        console.log(`[Chatbot] Generated SQL: ${sql}`);

        // 3. Step 2: Execute SQL via RPC
        const { data: result, error: sqlError } = await adminClient.rpc('execute_ai_select', {
            sql_query: sql
        });

        if (sqlError) {
            console.error('[Chatbot SQL Error]:', sqlError);
            return NextResponse.json({
                error: 'SQL Execution Failed',
                details: sqlError.message,
                sql: sql
            }, { status: 400 });
        }

        // 4. Step 3: Humanize Result
        const humanizeMessages = [
            {
                role: 'system',
                content: 'You are a helpful assistant. Provide a concise, professional answer to the user based on the provided JSON data. If the data is an empty list, say that no results were found.'
            },
            { role: 'user', content: `Question: ${question}\nData: ${JSON.stringify(result)}` }
        ];

        const answer = await callGroq(humanizeMessages);

        return NextResponse.json({
            answer,
            sql
        });

    } catch (error: any) {
        console.error('[Chatbot API] Error:', error);
        return NextResponse.json({ error: 'Internal Server Error', details: error.message }, { status: 500 });
    }
}

import dotenv from 'dotenv';

dotenv.config();

const MASTERPBX_API_BASE = process.env.MASTERPBX_API_BASE || 'https://pbx.hodusoft.com/hodupbx_api/v1.4';
const MASTERPBX_TOKEN_ID = process.env.MASTERPBX_TOKEN_ID || '';

export interface MasterPBXCallLog {
    tenant_id: string;
    start_date: string; // "YYYY-MM-DD HH:mm:ss"
    end_date: string; // "YYYY-MM-DD HH:mm:ss"
    caller: string;
    callee: string;
    forward?: string;
    incoming_call_charges?: string;
    outgoing_call_charges?: string;
    /** Optional: we map when present for display */
    call_direction?: string;
    direction?: string;
    callee_answer_second?: number | string;
    answer_sec?: number | string;
    answer_seconds?: number | string;
    answer_time?: number | string;
    hangup_reason?: string;
    hangup_by?: string;
    callee_name?: string;
    calleeName?: string;
    agent_name?: string;
    extension_name?: string;
    /** Number the customer dialed (line). We map when API returns it. */
    dialed_number?: string;
    called_number?: string;
    destination?: string;
    line?: string;
    trunk?: string;
    did?: string;
    dnis?: string;
}

export interface MasterPBXCallLogResponse {
    status: string;
    message: string;
    data: MasterPBXCallLog[];
}

/**
 * Fetch call logs from MasterPBX API for a date range
 */
export async function fetchCallLogsFromMasterPBX(
    startDate: string, // YYYY-MM-DD
    endDate: string, // YYYY-MM-DD
    number?: string // Optional: extension or external number
): Promise<MasterPBXCallLog[]> {
    if (!MASTERPBX_TOKEN_ID || !MASTERPBX_TOKEN_ID.trim()) {
        throw new Error('סנכרון היסטוריה דורש הגדרת MASTERPBX_TOKEN_ID בקובץ .env של השרת. קבל את ה-Token ממערכת המרכזיה (הגדרות API).');
    }

    const url = `${MASTERPBX_API_BASE}/api/info/${startDate}/${endDate}/TENANT/callLog`;
    
    const body: Record<string, string> = {
        token_id: MASTERPBX_TOKEN_ID
    };
    if (number) {
        body.number = number;
    }

    console.log(`[MasterPBX] Fetching call logs from ${startDate} to ${endDate}${number ? ` for number ${number}` : ''}`);

    const response = await fetch(url, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
        },
        body: JSON.stringify(body),
    });

    if (!response.ok) {
        const errorText = await response.text().catch(() => response.statusText);
        console.error(`[MasterPBX] API error (${response.status}):`, errorText);
        throw new Error(`MasterPBX API error (${response.status}): ${errorText}`);
    }

    const result = (await response.json()) as MasterPBXCallLogResponse;

    if (result.status !== 'SUCCESS') {
        throw new Error(`MasterPBX API returned status: ${result.status}, message: ${result.message}`);
    }

    const logs = result.data || [];
    if (logs.length > 0) {
        const first = logs[0] as unknown as Record<string, unknown>;
        console.log('[MasterPBX] First record keys:', Object.keys(first));
        console.log('[MasterPBX] Sample (charges, answer time, hangup, callee name):', {
            incoming_call_charges: first.incoming_call_charges,
            outgoing_call_charges: first.outgoing_call_charges,
            callee_answer_second: first.callee_answer_second,
            answer_sec: first.answer_sec,
            answer_seconds: first.answer_seconds,
            hangup_reason: first.hangup_reason,
            hangup_by: first.hangup_by,
            callee_name: first.callee_name,
            calleeName: first.calleeName,
            caller: first.caller,
            callee: first.callee,
            forward: first.forward,
        });
    }
    console.log(`[MasterPBX] Fetched ${logs.length} call logs`);
    return logs;
}

/**
 * Get recording path for a call (if callid is available)
 * Note: MasterPBX API requires callid, which may not be in call log response.
 * This is a placeholder - may need to be called separately if callid is available.
 */
export async function getRecordingPath(callid: string): Promise<string | null> {
    if (!MASTERPBX_TOKEN_ID) {
        throw new Error('MASTERPBX_TOKEN_ID not configured');
    }

    const url = `${MASTERPBX_API_BASE}/api/info/TENANT/recordingPath`;
    
    const response = await fetch(url, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({
            token_id: MASTERPBX_TOKEN_ID,
            callid: callid
        }),
    });

    if (!response.ok) {
        return null;
    }

    const result = (await response.json()) as { status: string; data?: { recordingPath?: string } };
    return result.data?.recordingPath || null;
}

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
    if (!MASTERPBX_TOKEN_ID) {
        throw new Error('MASTERPBX_TOKEN_ID not configured in environment variables');
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

    console.log(`[MasterPBX] Fetched ${result.data?.length || 0} call logs`);
    return result.data || [];
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

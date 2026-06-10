import { supabase } from './client';
import fs from 'fs';
import path from 'path';

export interface AuditLog {
  id?: string;
  ca_id: string;
  action_type: string;
  description: string;
  client_id?: string | null;
  created_at?: string;
}

const LOCAL_AUDIT_FILE = path.join(process.cwd(), 'audit_logs.json');

// Helper to log actions with Supabase and JSON fallback
export async function logAuditAction(
  caId: string,
  actionType: string,
  description: string,
  clientId: string | null = null
): Promise<AuditLog> {
  const newLog: AuditLog = {
    ca_id: caId,
    action_type: actionType,
    description,
    client_id: clientId,
    created_at: new Date().toISOString()
  };

  try {
    // Attempt Supabase insert
    const { data, error } = await supabase
      .from('console_audit_logs')
      .insert([newLog])
      .select()
      .single();

    if (error) {
      throw error;
    }
    return data;
  } catch (err: any) {
    console.warn(`[Audit] Supabase logging failed (falling back to local storage):`, err.message || err);
    
    // Save to local file
    try {
      let logs: AuditLog[] = [];
      if (fs.existsSync(LOCAL_AUDIT_FILE)) {
        const fileContent = fs.readFileSync(LOCAL_AUDIT_FILE, 'utf8');
        logs = JSON.parse(fileContent);
      }
      
      newLog.id = Math.random().toString(36).substring(2, 11);
      logs.unshift(newLog);
      
      fs.writeFileSync(LOCAL_AUDIT_FILE, JSON.stringify(logs, null, 2), 'utf8');
      console.log(`[Audit] Logged to local JSON file successfully.`);
    } catch (fsErr) {
      console.error('[Audit] Local file fallback write error:', fsErr);
    }
    
    return newLog;
  }
}

// Helper to query actions
export async function getAuditLogs(caId: string): Promise<AuditLog[]> {
  try {
    // Attempt Supabase fetch
    const { data, error } = await supabase
      .from('console_audit_logs')
      .select('*')
      .eq('ca_id', caId)
      .order('created_at', { ascending: false });

    if (error) {
      throw error;
    }
    return data || [];
  } catch (err: any) {
    console.warn(`[Audit] Supabase query failed (falling back to local storage):`, err.message || err);
    
    // Read from local file
    try {
      if (fs.existsSync(LOCAL_AUDIT_FILE)) {
        const fileContent = fs.readFileSync(LOCAL_AUDIT_FILE, 'utf8');
        const logs: AuditLog[] = JSON.parse(fileContent);
        return logs.filter(log => log.ca_id === caId);
      }
    } catch (fsErr) {
      console.error('[Audit] Local file fallback read error:', fsErr);
    }
    
    return [];
  }
}

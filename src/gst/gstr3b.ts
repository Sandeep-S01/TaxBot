import { supabase } from '../db/client';
import { getGSTR3BSummary, GSTR3BData } from '../db/transactions';
import { GstReturn } from '../types';

export interface Gstr3bSummary extends GSTR3BData {
  netGstPayable: number;
  itcAvailable: number;
  liability: number;
}

/**
 * Builds GSTR-3B data and saves/updates it in the gst_returns database table.
 */
export async function buildGstr3b(clientId: string, period: string): Promise<Gstr3bSummary> {
  // 1. Get raw transactional aggregates
  const rawGstr3b = await getGSTR3BSummary(clientId, period);

  const liability = rawGstr3b.outwardSupplies.totalTax;
  const itcAvailable = rawGstr3b.inwardEligibleITC.totalTax;
  const netGstPayable = Math.max(0, liability - itcAvailable);

  const summary: Gstr3bSummary = {
    ...rawGstr3b,
    liability,
    itcAvailable,
    netGstPayable,
  };

  // 2. Save or update this return draft in the database
  try {
    const { error } = await supabase
      .from('gst_returns')
      .upsert(
        {
          client_id: clientId,
          period: period,
          return_type: 'GSTR-3B',
          status: 'draft',
          data: summary as any,
        },
        { onConflict: 'client_id,period,return_type' }
      );

    if (error) {
      console.error('Error saving GSTR-3B to db:', error);
    }
  } catch (err: any) {
    console.error('Failed to save GSTR-3B return:', err.message);
  }

  return summary;
}

/**
 * Updates the return status (e.g. marking it as filed)
 */
export async function markReturnFiled(clientId: string, period: string, returnType: 'GSTR-1' | 'GSTR-3B'): Promise<boolean> {
  try {
    const { error } = await supabase
      .from('gst_returns')
      .update({
        status: 'filed',
        filed_at: new Date().toISOString(),
      })
      .match({ client_id: clientId, period, return_type: returnType });

    if (error) {
      console.error('Error updating return status:', error);
      return false;
    }
    return true;
  } catch (err: any) {
    console.error('Failed to mark return as filed:', err.message);
    return false;
  }
}

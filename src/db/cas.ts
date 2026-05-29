import { supabase } from './client';
import { CA, Client } from '../types';
import { getGSTR3BSummary, GSTR3BData } from './transactions';

export async function createCA(
  ca: Omit<CA, 'id' | 'created_at' | 'updated_at'>
): Promise<CA> {
  const { data, error } = await supabase
    .from('cas')
    .insert([ca])
    .select()
    .single();

  if (error) {
    console.error('Error creating CA account:', error);
    throw error;
  }

  return data;
}

export async function getCAByEmail(email: string): Promise<CA | null> {
  const { data, error } = await supabase
    .from('cas')
    .select('*')
    .eq('email', email)
    .maybeSingle();

  if (error) {
    console.error('Error fetching CA by email:', error);
    throw error;
  }

  return data;
}

export async function getCAById(id: string): Promise<CA | null> {
  const { data, error } = await supabase
    .from('cas')
    .select('*')
    .eq('id', id)
    .maybeSingle();

  if (error) {
    console.error('Error fetching CA by ID:', error);
    throw error;
  }

  return data;
}

export async function getCAClients(caId: string): Promise<Client[]> {
  const { data, error } = await supabase
    .from('clients')
    .select('*')
    .eq('ca_id', caId)
    .order('created_at', { ascending: false });

  if (error) {
    console.error('Error fetching CA clients:', error);
    throw error;
  }

  return data || [];
}

export async function linkClientToCA(clientId: string, caId: string): Promise<Client> {
  const { data, error } = await supabase
    .from('clients')
    .update({ ca_id: caId })
    .eq('id', clientId)
    .select()
    .single();

  if (error) {
    console.error('Error linking client to CA:', error);
    throw error;
  }

  return data;
}

export interface CAAggregatedGSTRReport {
  period: string;
  clientsCount: number;
  totalOutwardTaxableValue: number;
  totalOutwardTaxAmount: number;
  totalInwardTaxableValue: number;
  totalInwardTaxAmount: number;
  netGstPayable: number;
  clientBreakdown: Array<{
    clientId: string;
    clientName: string;
    businessName: string | null;
    gstin: string | null;
    outwardTaxable: number;
    outwardTax: number;
    inwardTaxable: number;
    inwardTax: number;
  }>;
}

export async function getConsolidatedGSTRSummary(
  caId: string,
  period: string
): Promise<CAAggregatedGSTRReport> {
  const clients = await getCAClients(caId);
  
  let totalOutwardTaxableValue = 0;
  let totalOutwardTaxAmount = 0;
  let totalInwardTaxableValue = 0;
  let totalInwardTaxAmount = 0;
  
  const clientBreakdown: CAAggregatedGSTRReport['clientBreakdown'] = [];

  for (const client of clients) {
    try {
      const summary: GSTR3BData = await getGSTR3BSummary(client.id, period);
      
      const oTaxable = summary.outwardSupplies.taxableValue;
      const oTax = summary.outwardSupplies.totalTax;
      const iTaxable = summary.inwardEligibleITC.taxableValue;
      const iTax = summary.inwardEligibleITC.totalTax;

      totalOutwardTaxableValue += oTaxable;
      totalOutwardTaxAmount += oTax;
      totalInwardTaxableValue += iTaxable;
      totalInwardTaxAmount += iTax;

      clientBreakdown.push({
        clientId: client.id,
        clientName: client.name || 'Unnamed Client',
        businessName: client.business_name,
        gstin: client.gstin,
        outwardTaxable: oTaxable,
        outwardTax: oTax,
        inwardTaxable: iTaxable,
        inwardTax: iTax,
      });
    } catch (err: any) {
      console.warn(`Could not compute GSTR summary for client ${client.id}:`, err.message);
      // Fallback empty details for this client
      clientBreakdown.push({
        clientId: client.id,
        clientName: client.name || 'Unnamed Client',
        businessName: client.business_name,
        gstin: client.gstin,
        outwardTaxable: 0,
        outwardTax: 0,
        inwardTaxable: 0,
        inwardTax: 0,
      });
    }
  }

  const netGstPayable = Math.max(0, totalOutwardTaxAmount - totalInwardTaxAmount);

  return {
    period,
    clientsCount: clients.length,
    totalOutwardTaxableValue,
    totalOutwardTaxAmount,
    totalInwardTaxableValue,
    totalInwardTaxAmount,
    netGstPayable,
    clientBreakdown,
  };
}

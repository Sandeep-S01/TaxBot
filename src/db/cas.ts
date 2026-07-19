import { supabase } from './client';
import { CA, Client } from '../types';
import { getGSTR3BSummary, GSTR3BData } from './transactions';
import { summarizeProviderError } from '../utils/privacy';

export async function createCA(
  ca: Omit<CA, 'id' | 'created_at' | 'updated_at'>
): Promise<CA> {
  const { data, error } = await supabase
    .from('cas')
    .insert([ca])
    .select()
    .single();

  if (error) {
    console.error('Error creating CA account:', summarizeProviderError('supabase', 'create_ca', error));
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
    console.error('Error fetching CA by email:', summarizeProviderError('supabase', 'get_ca_by_email', error));
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
    console.error('Error fetching CA by ID:', summarizeProviderError('supabase', 'get_ca_by_id', error));
    throw error;
  }

  return data;
}

export async function updateCA(
  id: string,
  updates: Partial<Omit<CA, 'id' | 'created_at' | 'updated_at'>>
): Promise<CA> {
  const { data, error } = await supabase
    .from('cas')
    .update(updates)
    .eq('id', id)
    .select()
    .single();

  if (error) {
    console.error('Error updating CA account:', summarizeProviderError('supabase', 'update_ca', error));
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
    console.error('Error fetching CA clients:', summarizeProviderError('supabase', 'get_ca_clients', error));
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
    console.error('Error linking client to CA:', summarizeProviderError('supabase', 'link_client_to_ca', error));
    throw error;
  }

  return data;
}

export interface CAAggregatedGSTRReport {
  period: string;
  incomplete: boolean;
  warnings: string[];
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
    calculationStatus: 'ok' | 'error';
    reviewReason: string | null;
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
  const warnings: string[] = [];

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
        calculationStatus: 'ok',
        reviewReason: null,
      });
    } catch (err: any) {
      const warning = `Could not compute GSTR summary for client ${client.id}`;
      console.warn(warning, err.message);
      warnings.push(warning);
      clientBreakdown.push({
        clientId: client.id,
        clientName: client.name || 'Unnamed Client',
        businessName: client.business_name,
        gstin: client.gstin,
        outwardTaxable: 0,
        outwardTax: 0,
        inwardTaxable: 0,
        inwardTax: 0,
        calculationStatus: 'error',
        reviewReason: 'summary_calculation_failed',
      });
    }
  }

  const netGstPayable = Math.max(0, totalOutwardTaxAmount - totalInwardTaxAmount);

  return {
    period,
    incomplete: warnings.length > 0,
    warnings,
    clientsCount: clients.length,
    totalOutwardTaxableValue,
    totalOutwardTaxAmount,
    totalInwardTaxableValue,
    totalInwardTaxAmount,
    netGstPayable,
    clientBreakdown,
  };
}

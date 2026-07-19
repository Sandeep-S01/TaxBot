import { supabase } from './client';
import { Client } from '../types';
import { summarizeProviderError } from '../utils/privacy';

export async function getClientByPhone(phone: string): Promise<Client | null> {
  const { data, error } = await supabase
    .from('clients')
    .select('*')
    .eq('phone', phone)
    .maybeSingle();

  if (error) {
    console.error('Error fetching client by phone:', summarizeProviderError('supabase', 'get_client_by_phone', error));
    throw error;
  }

  return data;
}

export async function getClientById(id: string): Promise<Client | null> {
  const { data, error } = await supabase
    .from('clients')
    .select('*')
    .eq('id', id)
    .maybeSingle();

  if (error) {
    console.error('Error fetching client by ID:', summarizeProviderError('supabase', 'get_client_by_id', error));
    throw error;
  }

  return data;
}

export async function createClient(phone: string, name?: string): Promise<Client> {
  const { data, error } = await supabase
    .from('clients')
    .insert([{ phone, name: name || null }])
    .select()
    .single();

  if (error) {
    console.error('Error creating client:', summarizeProviderError('supabase', 'create_client', error));
    throw error;
  }

  return data;
}

export async function updateClient(id: string, updates: Partial<Omit<Client, 'id' | 'created_at' | 'updated_at'>>): Promise<Client> {
  const { data, error } = await supabase
    .from('clients')
    .update(updates)
    .eq('id', id)
    .select()
    .single();

  if (error) {
    console.error('Error updating client:', summarizeProviderError('supabase', 'update_client', error));
    throw error;
  }

  return data;
}

export async function getGstRegisteredClients(): Promise<Client[]> {
  const { data, error } = await supabase
    .from('clients')
    .select('*')
    .eq('gst_registered', true);

  if (error) {
    console.error('Error fetching GST registered clients:', summarizeProviderError('supabase', 'get_gst_registered_clients', error));
    throw error;
  }

  return data || [];
}

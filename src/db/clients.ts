import { supabase } from './client';
import { Client } from '../types';

export async function getClientByPhone(phone: string): Promise<Client | null> {
  const { data, error } = await supabase
    .from('clients')
    .select('*')
    .eq('phone', phone)
    .maybeSingle();

  if (error) {
    console.error('Error fetching client by phone:', error);
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
    console.error('Error fetching client by ID:', error);
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
    console.error('Error creating client:', error);
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
    console.error('Error updating client:', error);
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
    console.error('Error fetching GST registered clients:', error);
    throw error;
  }

  return data || [];
}

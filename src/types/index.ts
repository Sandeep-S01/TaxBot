export interface Client {
  id: string;
  phone: string;
  name: string | null;
  business_name: string | null;
  gstin: string | null;
  gst_registered: boolean;
  plan: 'trial' | 'starter' | 'pro';
  created_at: string;
  updated_at: string;
}

export type TransactionCategory = 'sales' | 'purchase' | 'expense' | 'salary' | 'other';
export type GstCategory = 'B2B' | 'B2C' | 'B2CL' | 'exempt' | 'nil_rated';
export type GstRate = 0 | 5 | 12 | 18 | 28;
export type TransactionSource = 'whatsapp_image' | 'whatsapp_text' | 'whatsapp_pdf' | 'manual';
export type ConfidenceLevel = 'high' | 'medium' | 'low';

export interface Transaction {
  id: string;
  client_id: string;
  date: string; // YYYY-MM-DD
  description: string | null;
  vendor_name: string | null;
  amount: number; // excluding tax
  tax_amount: number;
  category: TransactionCategory;
  gst_category: GstCategory | null;
  gst_rate: GstRate;
  hsn_sac: string | null;
  invoice_number: string | null;
  source: TransactionSource;
  raw_text: string | null;
  confidence: ConfidenceLevel;
  created_at: string;
}

export interface GstReturn {
  id: string;
  client_id: string;
  period: string; // YYYY-MM
  return_type: 'GSTR-1' | 'GSTR-3B';
  status: 'draft' | 'pending_signature' | 'filed';
  data: Record<string, any>;
  filed_at: string | null;
  created_at: string;
}

// WhatsApp Webhook Interfaces (Meta Cloud API v19.0)
export interface WhatsAppIncomingNotification {
  object: string;
  entry: Array<{
    id: string;
    changes: Array<{
      value: {
        messaging_product: 'whatsapp';
        metadata: {
          display_phone_number: string;
          phone_number_id: string;
        };
        contacts?: Array<{
          profile: {
            name: string;
          };
          wa_id: string;
        }>;
        messages?: Array<WhatsAppMessage>;
      };
      field: string;
    }>;
  }>;
}

export interface WhatsAppMessage {
  from: string; // e.g. "919876543210"
  id: string;
  timestamp: string;
  type: 'text' | 'image' | 'document' | 'audio' | 'unsupported';
  text?: {
    body: string;
  };
  image?: WhatsAppMedia;
  document?: WhatsAppMedia & {
    filename?: string;
    mime_type?: string;
  };
  audio?: WhatsAppMedia & {
    mime_type?: string;
  };
}

export interface WhatsAppMedia {
  id: string;
  sha256?: string;
  mime_type?: string;
}

// Claude Receipts parser output structure
export interface ReceiptExtractionResult {
  date: string;
  vendor_name: string;
  description: string;
  amount: number; // Excl. tax
  tax_amount: number;
  gst_rate: GstRate;
  category: TransactionCategory;
  gst_category: GstCategory;
  hsn_sac: string;
  invoice_number: string;
  confidence: ConfidenceLevel;
  error?: string;
}

import axios from 'axios';
import dotenv from 'dotenv';

dotenv.config();

const WA_TOKEN = process.env.WA_TOKEN;

if (!WA_TOKEN) {
  console.warn('WARNING: WA_TOKEN is not defined in the environment. Media downloads will fail.');
}

export interface DownloadedMedia {
  buffer: Buffer;
  mimeType: string;
}

/**
 * Downloads a media file from WhatsApp Cloud API servers using its media ID.
 */
export async function downloadMedia(mediaId: string): Promise<DownloadedMedia> {
  if (!WA_TOKEN) {
    throw new Error('Cannot download media: WA_TOKEN is missing from environment.');
  }

  try {
    // 1. Get media metadata (url and mime_type)
    const metadataResponse = await axios.get(`https://graph.facebook.com/v19.0/${mediaId}`, {
      headers: {
        Authorization: `Bearer ${WA_TOKEN}`,
      },
    });

    const { url, mime_type: mimeType } = metadataResponse.data;

    if (!url) {
      throw new Error(`Media metadata did not return a valid download URL for media ID: ${mediaId}`);
    }

    // 2. Download the actual binary file from the returned URL
    const mediaFileResponse = await axios.get(url, {
      headers: {
        Authorization: `Bearer ${WA_TOKEN}`,
      },
      responseType: 'arraybuffer',
    });

    const buffer = Buffer.from(mediaFileResponse.data);

    return {
      buffer,
      mimeType,
    };
  } catch (error: any) {
    console.error('Error downloading media from WhatsApp:', error.response?.data || error.message);
    throw error;
  }
}

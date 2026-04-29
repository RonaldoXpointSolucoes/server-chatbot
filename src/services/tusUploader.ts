import * as tus from 'tus-js-client';
import { supabase } from './supabase';

export interface TusUploadOptions {
  bucketName: string;
  fileName: string;
  file: File | Blob;
  onProgress?: (bytesUploaded: number, bytesTotal: number, percentage: string) => void;
  onSuccess?: (url: string) => void;
  onError?: (error: Error) => void;
}

// Extrai URL ótima de TUS seguindo padrão do Supabase
function getTusEndpoint() {
  const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
  // Se for Nuvem do Supabase, o ideal é injetar "storage" no subdomínio para alta performance (CDN route bypass)
  if (supabaseUrl && supabaseUrl.includes('supabase.co') && !supabaseUrl.includes('storage.supabase.co')) {
     const url = new URL(supabaseUrl);
     return `https://${url.hostname.split('.')[0]}.storage.supabase.co/storage/v1/upload/resumable`;
  }
  return `${supabaseUrl}/storage/v1/upload/resumable`;
}

export const uploadResumableFile = async (options: TusUploadOptions) => {
  const { data: { session } } = await supabase.auth.getSession();
  
  const token = session?.access_token || import.meta.env.VITE_SUPABASE_ANON_KEY;
  
  if (!token) {
    throw new Error('Sem token de autenticação disponível para fazer upload');
  }

  return new Promise<void>((resolve, reject) => {
    const upload = new tus.Upload(options.file, {
      endpoint: getTusEndpoint(),
      retryDelays: [0, 3000, 5000, 10000, 20000],
      headers: {
        authorization: `Bearer ${token}`,
        'x-upsert': 'true',
      },
      uploadDataDuringCreation: true,
      removeFingerprintOnSuccess: true, // Limpa o tracking localStorage após sucesso
      metadata: {
        bucketName: options.bucketName,
        objectName: options.fileName,
        contentType: options.file.type || 'application/octet-stream',
        cacheControl: '3600',
      },
      chunkSize: 6 * 1024 * 1024, // Limite mandatório do Supabase
      onError: (error) => {
        console.error('Falha no upload TUS:', error);
        if (options.onError) options.onError(error);
        reject(error);
      },
      onProgress: (bytesUploaded, bytesTotal) => {
        const percentage = ((bytesUploaded / bytesTotal) * 100).toFixed(2);
        if (options.onProgress) options.onProgress(bytesUploaded, bytesTotal, percentage);
      },
      onSuccess: () => {
        // Obter public URL para retornar ao onSuccess
        const { data: publicUrlData } = supabase.storage
          .from(options.bucketName)
          .getPublicUrl(options.fileName);
          
        if (options.onSuccess) options.onSuccess(publicUrlData.publicUrl);
        resolve();
      },
    });

    // Encontra e retoma de uploads anteriores
    upload.findPreviousUploads().then((previousUploads) => {
      if (previousUploads.length) {
        upload.resumeFromPreviousUpload(previousUploads[0]);
      }
      upload.start();
    }).catch(reject);
  });
};

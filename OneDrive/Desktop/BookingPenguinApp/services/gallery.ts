import {
  collection,
  query,
  where,
  orderBy,
  onSnapshot,
  Unsubscribe,
} from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import { db, functions } from './firebase';

export interface GalleryPhoto {
  id: string;
  businessId: string;
  imageUrl: string;
  url?: string;
  thumbnailUrl?: string;
  caption?: string;
  fileName?: string;
  uploadedBy: string;
  uploaderName?: string;
  createdAt: any;
}

export function subscribeToGallery(
  businessId: string,
  onData: (photos: GalleryPhoto[]) => void,
  onError?: (error: Error) => void
): Unsubscribe {
  const q = query(
    collection(db, 'galleryPhotos'),
    where('businessId', '==', businessId)
  );

  return onSnapshot(
    q,
    (snap) => {
      const photos = snap.docs
        .map((d) => ({ id: d.id, ...d.data() }) as GalleryPhoto)
        .sort((a, b) => {
          const aT = a.createdAt?.seconds || 0;
          const bT = b.createdAt?.seconds || 0;
          return bT - aT;
        });
      onData(photos);
    },
    (err) => {
      console.error('[Gallery] Subscription error:', err);
      onError?.(err);
    }
  );
}

export async function uploadPhoto(
  businessId: string,
  base64: string,
  caption: string,
  fileName: string
): Promise<{ photoId: string; url: string }> {
  const fn = httpsCallable<
    { businessId: string; imageBase64: string; caption: string; fileName: string },
    { photoId: string; url: string }
  >(functions, 'uploadGalleryPhoto');
  const res = await fn({ businessId, imageBase64: base64, caption, fileName });
  return res.data;
}

export async function deletePhoto(photoId: string): Promise<void> {
  const fn = httpsCallable(functions, 'deleteGalleryPhoto');
  await fn({ photoId });
}

export async function updateCaption(
  photoId: string,
  caption: string
): Promise<void> {
  const fn = httpsCallable(functions, 'updateGalleryCaption');
  await fn({ photoId, caption });
}

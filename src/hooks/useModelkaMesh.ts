import { useState, useEffect, useRef } from 'react';
import { ServerlessWebRTC } from '../services/serverlessWebRTC';
import { v4 as uuidv4 } from 'uuid';
import { makePassphrase } from '../utils/passphrase';

interface UseModelkaMesh {
  rtc: ServerlessWebRTC | null;
  inviteUrl: string;
  userId: string;
}

/**
 * Custom hook to initialize a serverless WebRTC mesh connection,
 * storing both room and passphrase in the URL fragment.
 */
export default function useModelkaMesh(): UseModelkaMesh {
  const [rtc, setRtc] = useState<ServerlessWebRTC | null>(null);
  const [inviteUrl, setInviteUrl] = useState<string>('');
  const [userId, setUserId] = useState<string>('');
  const providerRef = useRef<ServerlessWebRTC | null>(null);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      // Parse URL
      const url = new URL(window.location.href);
      // Read room and passphrase from fragment (e.g., #r=ROOM&i=PASS)
      const fragmentParams = new URLSearchParams(url.hash.substring(1));
      let room = fragmentParams.get('r');
      let pass = fragmentParams.get('i');
      
      // If no room in URL, generate one
      if (!room) {
        room = uuidv4();
      }
      
      // If no passphrase in URL, generate one
      if (!pass) {
        pass = makePassphrase();
      }

      console.log('🎯 useModelkaMesh room extraction:', { room, pass: pass ? '[REDACTED]' : 'none', urlHash: url.hash });

      // Build new URL: clear search params, set fragment with room and passphrase
      url.search = '';
      fragmentParams.set('r', room);
      fragmentParams.set('i', encodeURIComponent(pass));
      url.hash = fragmentParams.toString();

      const updatedUrl = url.toString();
      window.history.replaceState({}, '', updatedUrl);
      setInviteUrl(updatedUrl);

      // Get consistent user ID from localStorage or generate new one
      let id = localStorage.getItem('enterprise_user_id');
      if (!id) {
        id = `user_${Date.now()}_${Math.random().toString(36).substring(2, 11)}`;
        localStorage.setItem('enterprise_user_id', id);
      }
      setUserId(id);

      try {
        const connection = await ServerlessWebRTC.connect(room, id, pass);
        if (cancelled) {
          connection.disconnect();
          return;
        }
        providerRef.current = connection;
        setRtc(connection);
      } catch (e) {
        console.error('WebRTC init failed:', e);
      }
    })();

    return () => {
      cancelled = true;
      providerRef.current?.disconnect();
      providerRef.current = null;
    };
  }, []);

  return { rtc, inviteUrl, userId };
}

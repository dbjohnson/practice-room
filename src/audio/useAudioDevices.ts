import { useCallback, useEffect, useRef, useState } from 'react';
import {
  audioAccessError,
  availableInputs,
  requireMediaDevices,
  type AudioInputDevice,
} from './audioDevices';

export function useAudioDevices() {
  const [devices, setDevices] = useState<AudioInputDevice[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [authorized, setAuthorized] = useState(false);
  const generation = useRef(0);
  const refresh = useCallback(async () => {
    try {
      const list = await requireMediaDevices().enumerateDevices();
      setDevices(availableInputs(list));
      if (list.some((device) => device.kind === 'audioinput' && device.label)) setAuthorized(true);
    } catch (error) {
      setError(audioAccessError(error));
    }
  }, []);
  const discover = useCallback(async () => {
    const token = ++generation.current;
    setLoading(true);
    setError(null);
    let permissionStream: MediaStream | undefined;
    try {
      const media = requireMediaDevices();
      const before = await media.enumerateDevices();
      // A temporary stream unlocks device labels. It is never analyzed or monitored.
      if (!before.some((device) => device.kind === 'audioinput' && device.label))
        permissionStream = await media.getUserMedia({ audio: true });
      const list = await media.enumerateDevices();
      if (token !== generation.current) return;
      setDevices(availableInputs(list));
      setAuthorized(true);
      if (!availableInputs(list).length)
        setError('No selectable input was found. Connect your interface, then refresh the list.');
    } catch (error) {
      if (token === generation.current) setError(audioAccessError(error));
    } finally {
      permissionStream?.getTracks().forEach((track) => track.stop());
      if (token === generation.current) setLoading(false);
    }
  }, []);
  const cancel = useCallback(() => {
    generation.current++;
    setLoading(false);
  }, []);
  useEffect(() => {
    void refresh();
    const onChange = () => void refresh();
    navigator.mediaDevices?.addEventListener('devicechange', onChange);
    return () => {
      generation.current++;
      navigator.mediaDevices?.removeEventListener('devicechange', onChange);
    };
  }, [refresh]);
  return { devices, loading, error, authorized, discover, cancel };
}

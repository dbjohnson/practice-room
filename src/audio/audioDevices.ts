export interface AudioInputDevice {
  id: string;
  label: string;
}
export function availableInputs(devices: MediaDeviceInfo[]): AudioInputDevice[] {
  const seen = new Set<string>();
  const inputs: AudioInputDevice[] = [];
  for (const device of devices) {
    if (
      device.kind !== 'audioinput' ||
      !device.deviceId ||
      ['default', 'communications'].includes(device.deviceId) ||
      seen.has(device.deviceId)
    )
      continue;
    seen.add(device.deviceId);
    inputs.push({ id: device.deviceId, label: device.label || `Audio input ${inputs.length + 1}` });
  }
  return inputs;
}
export function audioAccessError(error: unknown): string {
  if (error instanceof DOMException) {
    if (error.name === 'NotAllowedError' || error.name === 'SecurityError')
      return 'Audio access was not granted. Allow microphone access in your browser’s site settings — that permission also covers audio interfaces — then try again.';
    if (error.name === 'NotFoundError')
      return 'No audio input was found. Connect your interface and check that your computer recognizes it.';
    if (error.name === 'NotReadableError')
      return 'The interface could not be opened. Check its connection and close other apps that may be using it.';
    if (error.name === 'OverconstrainedError')
      return 'That input is no longer available. Refresh the list and choose your interface again.';
  }
  return error instanceof Error
    ? error.message
    : 'Could not access audio inputs. Check your interface and try again.';
}
export function requireMediaDevices(): MediaDevices {
  if (!navigator.mediaDevices?.getUserMedia || !navigator.mediaDevices?.enumerateDevices)
    throw new Error(
      'Audio interfaces need HTTPS or localhost and a browser with audio-input support.',
    );
  return navigator.mediaDevices;
}

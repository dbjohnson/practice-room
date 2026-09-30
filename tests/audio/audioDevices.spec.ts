import { expect, it } from 'vitest';
import { audioAccessError, availableInputs } from '../../src/audio/audioDevices';
it('lists explicit input devices, without output devices or duplicate default aliases', () => {
  const device = (deviceId: string, kind = 'audioinput', label = 'USB interface') =>
    ({ deviceId, kind, label }) as MediaDeviceInfo;
  expect(
    availableInputs([
      device('default'),
      device('communications'),
      device('usb'),
      device('usb'),
      device('speakers', 'audiooutput'),
      device('hidden', 'audioinput', ''),
    ]),
  ).toEqual([
    { id: 'usb', label: 'USB interface' },
    { id: 'hidden', label: 'Audio input 2' },
  ]);
});
it('explains interface permission and connection errors', () => {
  expect(audioAccessError(new DOMException('', 'NotAllowedError'))).toContain(
    'also covers audio interfaces',
  );
  expect(audioAccessError(new DOMException('', 'NotFoundError'))).toContain('No audio input');
  expect(audioAccessError(new DOMException('', 'NotReadableError'))).toContain('other apps');
  expect(audioAccessError(new DOMException('', 'OverconstrainedError'))).toContain(
    'no longer available',
  );
});

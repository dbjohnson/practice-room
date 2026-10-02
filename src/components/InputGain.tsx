import { useRoom } from '../app/RoomContext';

export function InputGain() {
  const { input } = useRoom();
  return (
    <label className="input-gain">
      <span>Input volume</span>
      <input
        type="range"
        min={-24}
        max={12}
        step={1}
        value={input.gain}
        aria-label="Input volume"
        aria-valuetext={`${input.gain} decibels`}
        onChange={(event) => input.setGain(Number(event.target.value))}
      />
      <output>
        {input.gain > 0 ? '+' : ''}
        {input.gain} dB
      </output>
    </label>
  );
}

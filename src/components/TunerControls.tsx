import { useRoom } from '../app/RoomContext';
import { TunerPanel } from './TunerPanel';
import { InputLevelMeter } from './InputLevelMeter';
import { InputGain } from './InputGain';

export function TunerControls() {
  const r = useRoom();
  return (
    <div className="compact-tuner">
      <div className="tuner-connection">
        <span>
          {r.input.status.state === 'ready'
            ? r.input.status.deviceLabel
            : r.input.status.state === 'connecting'
              ? 'Reconnecting interface…'
              : 'No input connected'}
        </span>
        <button className="text-button" onClick={() => r.setPage('instrument')}>
          Input settings
        </button>
      </div>
      <InputGain />
      <InputLevelMeter status={r.input.status} />
      <TunerPanel status={r.input.status} />
    </div>
  );
}

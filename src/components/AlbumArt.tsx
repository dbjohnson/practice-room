export function AlbumArt({ color, small = false }: { color: string; small?: boolean }) {
  return (
    <div className={`album-art art-${color} ${small ? 'art-small' : ''}`} aria-hidden="true">
      <div className="art-orbit orbit-one" />
      <div className="art-orbit orbit-two" />
      <div className="art-orbit orbit-three" />
      <span className="art-sun" />
      <div className="art-label">
        PRACTICE
        <br />
        ROOM
      </div>
    </div>
  );
}

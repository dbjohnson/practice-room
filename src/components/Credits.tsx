export function Credits() {
  const credits = `${import.meta.env.BASE_URL}soundfont/credits/`;
  return (
    <details className="credits">
      <summary>Credits &amp; licenses</summary>
      <h3>Recorded instruments</h3>
      <ul>
        <li>
          <strong>Drums and woodblock:</strong> The Kount — Kount’s Memory Bank Drum Pack.
        </li>
        <li>
          <strong>Guitar:</strong>{' '}
          <a
            href="https://shop.karoryfer.com/pages/free-black-and-green-guitars"
            target="_blank"
            rel="noreferrer"
          >
            Karoryfer Black and Green Guitars
          </a>
          , green hollowbody.{' '}
          <a href={`${credits}karoryfer-guitar.txt`} target="_blank" rel="noreferrer">
            CC0 1.0
          </a>
          .
        </li>
        <li>
          <strong>Bass:</strong>{' '}
          <a
            href="https://shop.karoryfer.com/pages/free-black-and-blue-basses"
            target="_blank"
            rel="noreferrer"
          >
            Karoryfer Black and Blue Basses
          </a>
          , fingered black hollowbody.{' '}
          <a href={`${credits}karoryfer-bass.txt`} target="_blank" rel="noreferrer">
            CC0 1.0
          </a>
          .
        </li>
        <li>
          <strong>Piano:</strong>{' '}
          <a
            href="https://github.com/sfzinstruments/SalamanderGrandPiano"
            target="_blank"
            rel="noreferrer"
          >
            Salamander Grand Piano
          </a>{' '}
          by Alexander Holm.{' '}
          <a href="https://creativecommons.org/licenses/by/3.0/" target="_blank" rel="noreferrer">
            CC BY 3.0
          </a>
          .
        </li>
        <li>
          <strong>Other instrument voices:</strong> SONiVOX General MIDI SoundFont, supplied with
          alphaTab. Apache License 2.0.
        </li>
      </ul>
      <p>
        Practice Room uses selected pitch and velocity layers, converted to mono Ogg, trimmed,
        levelled and faded, with shortened decays. The woodblock preserves its original level.{' '}
        <a href={`${credits}NOTICE.txt`} target="_blank" rel="noreferrer">
          Full sample credits and changes
        </a>
        .
      </p>
      <h3>Notation, playback and type</h3>
      <ul>
        <li>
          <a href="https://www.alphatab.net/" target="_blank" rel="noreferrer">
            alphaTab
          </a>{' '}
          — score rendering, Guitar Pro/MusicXML import and sampled playback. Mozilla Public License
          2.0.
        </li>
        <li>
          <a href="https://github.com/steinbergmedia/bravura" target="_blank" rel="noreferrer">
            Bravura
          </a>{' '}
          by Steinberg — music notation font. SIL Open Font License 1.1.
        </li>
        <li>
          Manrope and Fraunces, distributed through{' '}
          <a href="https://fontsource.org/" target="_blank" rel="noreferrer">
            Fontsource
          </a>{' '}
          — interface typefaces. SIL Open Font License 1.1.
        </li>
        <li>
          <a href="https://lucide.dev/" target="_blank" rel="noreferrer">
            Lucide
          </a>{' '}
          — interface icons. ISC License.
        </li>
      </ul>
    </details>
  );
}

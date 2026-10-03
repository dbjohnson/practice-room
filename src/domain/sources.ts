/** `link` results cannot be loaded here; they open on the source's own site. */
export type SourceFormat = 'musicxml' | 'midi' | 'link';

export interface SourceHit {
  source: string;
  id: string;
  title: string;
  artist: string;
  format: SourceFormat;
  /** The licence as the source states it, or why it is unknown. */
  licence: string;
  /** True only when the source's maintainers vouch for an open licence on this piece. */
  open: boolean;
  detail: string;
  url: string;
}
export interface SourceInfo {
  id: string;
  name: string;
  note: string;
  ready: boolean;
}
export interface SearchResponse {
  hits: SourceHit[];
  /** Names of sources that did not answer; the others' results are still returned. */
  failed: string[];
}
export interface SourcesResponse {
  sources: SourceInfo[];
  generation: boolean;
}
export interface PieceOrigin {
  source: string;
  /** The source's display name at the time the piece was added. */
  name: string;
  id: string;
  licence: string;
  url: string;
}

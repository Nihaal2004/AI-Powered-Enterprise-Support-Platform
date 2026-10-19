import type { Citation } from './types';

export function CitationList({ citations }: { citations: Citation[] | null }) {
  if (!citations?.length) return <p className="muted ai-no-sources">No citation sources were returned. Knowledge-base evidence may be insufficient; review the draft before sending.</p>;
  return <section className="ai-sources" aria-label="Citation sources"><h3>Sources</h3>
    {citations.map(source => <article className="citation-card" key={source.citation}>
      <strong>Source [{source.citation}]</strong>
      <div className="citation-meta">
        {source.page_number != null && <span>Page {source.page_number}</span>}
        {source.similarity != null && <span>Similarity: {source.similarity.toFixed(2)}</span>}
        {source.chunk_index != null && <span>Chunk index: {source.chunk_index}</span>}
      </div>
      {source.document_id && <p className="identifier">Document: {source.document_id}</p>}
    </article>)}
  </section>;
}

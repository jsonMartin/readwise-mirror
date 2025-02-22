//
// Sample data for testing the Frontmatter Template
// The data is synthetic and inteded to stress-test
// the validity of the generated YAML
// TODO: Add more sample data for testing
// TODO: Base it on Readwise API and not internal metadata
//

import type { ReadwiseDocument, Tag } from 'types';

export const testTags: Tag[] = [
  { id: 1, name: 'important' },
  { id: 2, name: 'quote: reference' },
  { id: 3, name: 'follow-up & review' },
  { id: 4, name: 'chapter 1: introduction' },
  { id: 5, name: 'status: to-do' },
  { id: 6, name: 'tags with spaces' },
  { id: 7, name: 'tags-with-dashes' },
  { id: 8, name: 'tags_with_underscores' },
  { id: 9, name: '!special#chars@in%tags' },
  { id: 10, name: 'nested/path/tag' },
];

export const sampleMetadata: ReadwiseDocument = {
  id: 12345,
  highlights_url: 'https://readwise.io/bookreview/12345',
  unique_url: 'https://unique.com/[brackets]',
  source_url: 'https://test.com/path?q=special chars: & +',
  title: "My Book:\nA Subtitle's Journey",
  sanitized_title: "My Book - A Subtitle's Journey", 
  author: ['O\'Reilly, Tim', '"Doc" Smith'],
  authorStr: '[[O\'Reilly, Tim]] and [["Doc" Smith]]',
  document_note: 'Line 1\nLine 2\nLine 3: Important!',
  summary: 'Contains > and < symbols\nAnd some * wildcards & ampersands',
  category: 'books & articles',
  num_highlights: 42,
  created: '2024-03-15T10:30:00Z',
  updated: '', // Test empty value
  cover_image_url: 'https://example.com/image?size=large&type=cover',
  highlights: [
    {
      id: 12345,
      text: 'Quote with \'nested\' "quotes" and: colons',
      note: 'Annotation with *markdown* and\nmultiple\nlines',
      location: 42,
      location_type: 'page',
      highlighted_at: '2024-03-15T10:30:00Z',
      created_at: '2024-03-15T10:30:00Z',
      updated_at: '2024-03-15T11:45:00Z',
      url: 'https://example.com/book?page=42&highlight=12345',
      color: 'yellow',
      book_id: 98765,
      tags: [testTags[0], testTags[1], testTags[2]],
    },
    {
      id: 12346,
      text: 'Multi-line\ntext\nwith: colons',
      note: '',
      location: 0,
      location_type: '',
      highlighted_at: '2024-03-16T09:15:00Z',
      created_at: '2024-03-16T09:15:00Z',
      updated_at: '2024-03-16T09:15:00Z',
      url: null,
      color: 'blue',
      book_id: 98765,
      tags: [testTags[3], testTags[4], testTags[5]],
    },
  ],
  last_highlight_at: '2024-03-16T09:15:00Z', // Test null value
  tags: '#reading, #non-fiction: genre',
  highlight_tags: '#quote, #important: flag',
  tags_nohash: "'reading', 'non-fiction: genre'",
  hl_tags_nohash: "'quote', 'important: flag'",
};

import test from 'node:test';
import assert from 'node:assert/strict';
import { renderMarkdown } from '../public/markdown.js';

test('Markdown renderer formats headings, emphasis, lists and escapes raw HTML',()=>{
  const html=renderMarkdown('# Title\n\n- **bold** item\n\n<script>alert(1)</script>');
  assert.match(html,/<h1>Title<\/h1>/);assert.match(html,/<ul>/);assert.match(html,/<strong>bold<\/strong>/);assert.doesNotMatch(html,/<script>/);assert.match(html,/&lt;script&gt;/);
});

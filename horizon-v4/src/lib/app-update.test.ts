import { describe, expect, it } from 'vitest'

import { parseBuildMarker } from './app-update'

const page = (entry: string, css = 'index-a1b2c3.css') => `<!doctype html>
<html><head>
<link rel="stylesheet" href="/assets/${css}">
<script type="module" src="/assets/${entry}"></script>
</head><body><div id="root"></div></body></html>`

describe('parseBuildMarker', () => {
  it('ignores the surrounding markup and the non-hashed links', () => {
    const html = `<link rel="icon" href="/favicon.svg">${page('index-9f8e7d.js')}`

    expect(parseBuildMarker(html)).toBe(
      '/assets/index-9f8e7d.js|/assets/index-a1b2c3.css',
    )
  })

  it('detects a new deployment through a changed asset hash', () => {
    expect(parseBuildMarker(page('index-9f8e7d.js'))).not.toBe(
      parseBuildMarker(page('index-123abc.js')),
    )
  })

  it('stays stable for the same deployment, regardless of attribute order', () => {
    const html = page('index-9f8e7d.js')

    expect(parseBuildMarker(html)).toBe(parseBuildMarker(`\n${html}\n`))
  })

  it('returns null when the page has no hashed assets (for example dev mode)', () => {
    expect(parseBuildMarker('<script src="/src/main.tsx"></script>')).toBeNull()
  })
})

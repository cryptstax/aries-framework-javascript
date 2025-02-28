import type { DocumentLoader } from './jsonld'

export function getDocumentLoader(): () => DocumentLoader {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const loader = require('@digitalcredentials/jsonld/lib/documentLoaders/node')

  return loader as () => DocumentLoader
}

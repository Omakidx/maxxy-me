# Documentation format routing

Read only the section that matches the requested output. Repository conventions override these defaults.

## Markdown and MDX

Preserve frontmatter schemas, heading hierarchy, stable anchors, reference-link conventions, component imports, and the repository's formatter. In MDX, keep prose examples distinct from executable JSX, and run the docs build so imports and embedded components resolve.

## HTML and HTMX-enhanced documentation

Use semantic HTML as the durable document. Add HTMX only when the target already supports it or the request explicitly asks for progressive interaction. Keep essential reading and navigation working without JavaScript where practical. Validate landmarks, heading order, accessible names, focus behavior, URLs, history changes, loading and error states, and server-returned fragments. Do not introduce a frontend framework or application backend only for a documentation page.

## AsciiDoc, reStructuredText, plain text, and man pages

Follow the toolchain's syntax for headings, cross-references, directives, includes, metadata, and code blocks, and validate with the repository's renderer or parser. For man pages, preserve section conventions and generate the final form with the established tool rather than hand-editing generated output.

## API descriptions and reference documentation

Determine whether the source of truth is code annotations, OpenAPI, AsyncAPI, a GraphQL schema, protobuf, or another maintained contract. Keep machine-readable files valid and avoid hand-duplicating generated reference content. Document authentication, permissions, inputs, constraints, idempotency, pagination, errors, examples, versioning, and deprecation only as far as the contract or implementation supports them. Run the relevant schema validator or generator.

## Code comments, docstrings, and generated reference

Document public contracts, invariants, non-obvious constraints, side effects, failure behavior, and examples, not syntax the code already makes obvious. Follow the language's convention (JSDoc, TSDoc, Python docstrings, Rustdoc, Javadoc, XML comments). Keep generated-reference sources authoritative, and run the documentation generator when one is configured.

## Word and editable office documents

Use the available document-specific skill and its render-and-verify workflow. Preserve styles, headings, lists, tables, captions, links, page structure, and accessibility metadata. Deliver a genuine `.docx` file; never rename plain text to a Word extension.

## PDF

Decide whether the PDF is the authored source or rendered output from Markdown, HTML, LaTeX, Word, or another maintained source. Use the available PDF skill, render every page, and inspect layout, clipping, fonts, links, pagination, tables, and image quality. Keep the editable source alongside the generated output when the repository convention requires it.

## Other structured formats

For LaTeX, DITA, Jupyter notebooks, XML, JSON, YAML, or other format-specific documentation, inspect the repository's parser, schema, templates, and build path first. Preserve machine-readable structure, use the established generator where present, and validate with the native toolchain instead of treating the file as unconstrained prose.

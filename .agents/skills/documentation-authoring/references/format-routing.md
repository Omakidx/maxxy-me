# Documentation format routing

Read only the section that matches the requested output. Repository conventions override these defaults.

## Markdown and MDX

Preserve frontmatter schemas, heading hierarchy, stable anchors, reference-link conventions, component imports, and the repository's formatter. In MDX, distinguish prose examples from executable JSX and validate the docs build so imports and embedded components resolve.

## HTML and HTMX-enhanced documentation

Use semantic HTML as the durable document. Add HTMX only when the target already supports it or the request explicitly calls for progressive interaction. Keep essential reading and navigation functional without JavaScript where practical. Validate landmarks, heading order, accessible names, focus behavior, URLs, history changes, loading and error states, and server-returned fragments. Do not introduce a frontend framework or application backend solely for a documentation page.

## AsciiDoc, reStructuredText, plain text, and man pages

Follow the target toolchain's heading, cross-reference, directive, include, metadata, and code-block syntax. Validate with the repository's renderer or parser. For man pages, preserve section conventions and generate the final form through the established tool rather than hand-editing generated output.

## API descriptions and reference documentation

Determine whether the source of truth is code annotations, OpenAPI, AsyncAPI, GraphQL schema, protobuf, or another maintained contract. Preserve machine-readable validity and avoid duplicating generated reference content manually. Document authentication, permissions, inputs, constraints, idempotency, pagination, errors, examples, versioning, and deprecation only when supported by the contract or implementation. Run the relevant schema validator or generator.

## Code comments, docstrings, and generated reference

Document public contracts, invariants, non-obvious constraints, side effects, failure behavior, and examples—not syntax already obvious from the code. Follow the language's established convention such as JSDoc, TSDoc, Python docstrings, Rustdoc, Javadoc, or XML comments. Keep generated reference sources authoritative and validate the documentation generator when configured.

## Word and editable office documents

Use the available document-specific skill and its required render-and-verify workflow. Preserve styles, headings, lists, tables, captions, links, page structure, and accessibility metadata. Deliver a genuine `.docx` artifact; do not rename plain text to a Word extension.

## PDF

Decide whether PDF is the authored source or a rendered output from Markdown, HTML, LaTeX, Word, or another maintained source. Use the available PDF skill, render every page, and inspect layout, clipping, fonts, links, pagination, tables, and image quality. Prefer maintaining the editable source alongside generated output when the repository convention requires it.

## Other structured documentation formats

For LaTeX, DITA, Jupyter notebooks, XML, JSON, YAML, or format-specific documentation not listed above, inspect the repository's parser, schema, templates, and build path first. Preserve machine-readable structure, use the established generator where present, and validate with the native toolchain rather than treating the file as unconstrained prose.

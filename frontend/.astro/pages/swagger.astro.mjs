import { c as createComponent, d as renderHead, e as renderScript, a as renderTemplate } from '../chunks/astro/server_8IdLJlfN.mjs';
import 'clsx';
/* empty css                                   */
export { renderers } from '../renderers.mjs';

const $$Swagger = createComponent(($$result, $$props, $$slots) => {
  return renderTemplate`<html lang="en" class="dark" data-astro-cid-emomvgig> <head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"><link rel="icon" type="image/svg+xml" href="/favicon.svg"><link rel="shortcut icon" href="/favicon.svg"><title>Swagger Docs</title><link rel="stylesheet" href="https://unpkg.com/swagger-ui-dist@5/swagger-ui.css">${renderHead()}</head> <body data-astro-cid-emomvgig> <div id="swagger-ui" data-astro-cid-emomvgig></div> ${renderScript($$result, "/Volumes/Projects/workers/core-github-api/frontend/src/pages/swagger.astro?astro&type=script&index=0&lang.ts")} ${renderScript($$result, "/Volumes/Projects/workers/core-github-api/frontend/src/pages/swagger.astro?astro&type=script&index=1&lang.ts")} </body> </html>`;
}, "/Volumes/Projects/workers/core-github-api/frontend/src/pages/swagger.astro", void 0);

const $$file = "/Volumes/Projects/workers/core-github-api/frontend/src/pages/swagger.astro";
const $$url = "/swagger";

const _page = /*#__PURE__*/Object.freeze(/*#__PURE__*/Object.defineProperty({
  __proto__: null,
  default: $$Swagger,
  file: $$file,
  url: $$url
}, Symbol.toStringTag, { value: 'Module' }));

const page = () => _page;

export { page };

import { c as createComponent, d as renderHead, r as renderComponent, a as renderTemplate } from '../chunks/astro/server_8IdLJlfN.mjs';
export { renderers } from '../renderers.mjs';

const $$Index = createComponent(($$result, $$props, $$slots) => {
  return renderTemplate`<html lang="en" class="dark"> <head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"><link rel="icon" type="image/svg+xml" href="/favicon.svg"><link rel="shortcut icon" href="/favicon.svg"><title>Core GitHub API</title>${renderHead()}</head> <body> ${renderComponent($$result, "ClientApp", null, { "client:only": "react", "client:component-hydration": "only", "client:component-path": "@/components/client-app", "client:component-export": "default" })} </body></html>`;
}, "/Volumes/Projects/workers/core-github-api/frontend/src/pages/index.astro", void 0);

const $$file = "/Volumes/Projects/workers/core-github-api/frontend/src/pages/index.astro";
const $$url = "";

const _page = /*#__PURE__*/Object.freeze(/*#__PURE__*/Object.defineProperty({
  __proto__: null,
  default: $$Index,
  file: $$file,
  url: $$url
}, Symbol.toStringTag, { value: 'Module' }));

const page = () => _page;

export { page };

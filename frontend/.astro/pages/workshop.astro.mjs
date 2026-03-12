import { c as createComponent, d as renderHead, r as renderComponent, a as renderTemplate } from '../chunks/astro/server_8IdLJlfN.mjs';
export { renderers } from '../renderers.mjs';

const $$Workshop = createComponent(($$result, $$props, $$slots) => {
  return renderTemplate`<html lang="en" class="dark"> <head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"><link rel="icon" type="image/svg+xml" href="/favicon.svg"><title>Agent Workshop | Colony</title>${renderHead()}</head> <body class="bg-zinc-950 text-zinc-100 min-h-screen w-full m-0 overflow-hidden"> ${renderComponent($$result, "WorkshopWizard", null, { "client:only": "react", "client:component-hydration": "only", "client:component-path": "@/components/workshop/WorkshopWizard", "client:component-export": "WorkshopWizard" })} </body></html>`;
}, "/Volumes/Projects/workers/core-github-api/frontend/src/pages/workshop.astro", void 0);

const $$file = "/Volumes/Projects/workers/core-github-api/frontend/src/pages/workshop.astro";
const $$url = "/workshop";

const _page = /*#__PURE__*/Object.freeze(/*#__PURE__*/Object.defineProperty({
  __proto__: null,
  default: $$Workshop,
  file: $$file,
  url: $$url
}, Symbol.toStringTag, { value: 'Module' }));

const page = () => _page;

export { page };

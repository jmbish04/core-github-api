import { c as createComponent, a as renderTemplate, e as renderScript, d as renderHead } from '../chunks/astro/server_8IdLJlfN.mjs';
import 'clsx';
export { renderers } from '../renderers.mjs';

var __freeze = Object.freeze;
var __defProp = Object.defineProperty;
var __template = (cooked, raw) => __freeze(__defProp(cooked, "raw", { value: __freeze(cooked.slice()) }));
var _a;
const $$Scaler = createComponent(($$result, $$props, $$slots) => {
  return renderTemplate(_a || (_a = __template(['<html lang="en" class="dark"> <head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"><link rel="icon" type="image/svg+xml" href="/favicon.svg"><link rel="shortcut icon" href="/favicon.svg"><title>Scalar Docs</title>', '</head> <body style="margin:0;background:#09090b;"> <script id="api-reference" data-url="/openapi.json" data-configuration="{&quot;theme&quot;:&quot;moon&quot;,&quot;layout&quot;:&quot;modern&quot;}"><\/script> ', " </body> </html>"])), renderHead(), renderScript($$result, "/Volumes/Projects/workers/core-github-api/frontend/src/pages/scaler.astro?astro&type=script&index=0&lang.ts"));
}, "/Volumes/Projects/workers/core-github-api/frontend/src/pages/scaler.astro", void 0);

const $$file = "/Volumes/Projects/workers/core-github-api/frontend/src/pages/scaler.astro";
const $$url = "/scaler";

const _page = /*#__PURE__*/Object.freeze(/*#__PURE__*/Object.defineProperty({
  __proto__: null,
  default: $$Scaler,
  file: $$file,
  url: $$url
}, Symbol.toStringTag, { value: 'Module' }));

const page = () => _page;

export { page };

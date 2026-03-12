import { c as createComponent, r as renderComponent, a as renderTemplate } from '../../chunks/astro/server_8IdLJlfN.mjs';
export { renderers } from '../../renderers.mjs';

const $$History = createComponent(($$result, $$props, $$slots) => {
  return renderTemplate`${renderComponent($$result, "ConfigDashboard", null, { "client:only": "react", "category": "history", "client:component-hydration": "only", "client:component-path": "@/components/config/ConfigDashboard", "client:component-export": "ConfigDashboard" })}`;
}, "/Volumes/Projects/workers/core-github-api/frontend/src/pages/config/history.astro", void 0);

const $$file = "/Volumes/Projects/workers/core-github-api/frontend/src/pages/config/history.astro";
const $$url = "/config/history";

const _page = /*#__PURE__*/Object.freeze(/*#__PURE__*/Object.defineProperty({
	__proto__: null,
	default: $$History,
	file: $$file,
	url: $$url
}, Symbol.toStringTag, { value: 'Module' }));

const page = () => _page;

export { page };

import { c as createComponent, r as renderComponent, a as renderTemplate, b as createAstro } from '../../chunks/astro/server_8IdLJlfN.mjs';
export { renderers } from '../../renderers.mjs';

const $$Astro = createAstro();
function getStaticPaths() {
  return [
    { params: { category: "general" } },
    { params: { category: "ai" } },
    { params: { category: "github" } },
    { params: { category: "secrets" } }
  ];
}
const $$category = createComponent(($$result, $$props, $$slots) => {
  const Astro2 = $$result.createAstro($$Astro, $$props, $$slots);
  Astro2.self = $$category;
  const { category } = Astro2.params;
  return renderTemplate`${renderComponent($$result, "ConfigDashboard", null, { "client:only": "react", "category": category, "client:component-hydration": "only", "client:component-path": "@/components/config/ConfigDashboard", "client:component-export": "ConfigDashboard" })}`;
}, "/Volumes/Projects/workers/core-github-api/frontend/src/pages/config/[category].astro", void 0);

const $$file = "/Volumes/Projects/workers/core-github-api/frontend/src/pages/config/[category].astro";
const $$url = "/config/[category]";

const _page = /*#__PURE__*/Object.freeze(/*#__PURE__*/Object.defineProperty({
  __proto__: null,
  default: $$category,
  file: $$file,
  getStaticPaths,
  url: $$url
}, Symbol.toStringTag, { value: 'Module' }));

const page = () => _page;

export { page };

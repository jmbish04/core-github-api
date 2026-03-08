import { Palette, Gamepad2, Link, Bot, Wrench, Layers } from 'lucide-react';

export const categories = [
  { id: 'all', label: 'All Registries', icon: Layers },
  { id: 'creative', label: 'Creative & Animated', icon: Palette },
  { id: 'retro', label: 'Retro & Stylized', icon: Gamepad2 },
  { id: 'crypto', label: 'Crypto & Web3', icon: Link },
  { id: 'ai', label: 'AI & Chat', icon: Bot },
  { id: 'functional', label: 'Functional & Editors', icon: Wrench },
  { id: 'general', label: 'General Purpose', icon: Layers },
];

export const inferCategory = (title: string, desc: string) => {
  const t = (title + " " + desc).toLowerCase();
  if (t.includes('retro') || t.includes('8-bit') || t.includes('pixel') || t.includes('brutalist')) return 'retro';
  if (t.includes('crypto') || t.includes('web3') || t.includes('lens protocol')) return 'crypto';
  if (t.includes('ai ') || t.includes('agent') || t.includes('llm') || t.includes('chat') || t.includes('bot')) return 'ai';
  if (t.includes('motion') || t.includes('animate') || t.includes('3d') || t.includes('glass') || t.includes('creative') || t.includes('effects')) return 'creative';
  if (t.includes('editor') || t.includes('upload') || t.includes('form') || t.includes('map') || t.includes('billing') || t.includes('chart') || t.includes('grid') || t.includes('hook') || t.includes('auth')) return 'functional';
  return 'general';
};

export const inferCount = (desc: string) => {
  const match = desc.match(/(\d+)\+/);
  return match ? match[0] : "Unknown";
};

export const inferLicense = (desc: string) => {
  if (desc.toLowerCase().includes('premium') || desc.toLowerCase().includes('paid')) return 'Freemium';
  return 'Open Source';
};

export const inferRating = (title: string, desc: string) => {
  const t = title.toLowerCase();

  // Tier S: The Titans (Widely used, highly polished)
  if (t.includes('magicui') || t.includes('aceternity') || t.includes('origin-ui')) return "5.0";

  // Tier A: High Quality / Specialized (Very popular)
  if (t.includes('cult-ui') || t.includes('eldoraui') || t.includes('shadcnblocks') || t.includes('plate') || t.includes('shadcn-studio')) return "4.9";
  if (t.includes('clerk') || t.includes('supabase') || t.includes('shadcn-editor') || t.includes('react-bits')) return "4.8";

  // Tier B: Solid / niche (Good implementation)
  if (t.includes('kokonut') || t.includes('retro') || t.includes('anim') || t.includes('motion') || t.includes('formcn')) return "4.7";
  if (t.includes('assistant') || t.includes('ai-') || t.includes('agent')) return "4.6";

  // Tier C: Standard / Newer (Base rating + variance based on description length as proxy for effort)
  const baseRating = 4.0;
  const variance = Math.min(0.5, desc.length / 300);
  return (baseRating + variance).toFixed(1);
};

export interface RegistryItem {
  title: string;
  category: string;
  count: string;
  license: string;
  rating: string;
  description: string;
  url: string;
  featured: boolean;
}

export const rawData = [
    {
        "svg_link": "inline-svg",
        "item_title": "@8bitcn",
        "item_description": "A set of 8-bit styled retro components. Works with your favorite frameworks. Open Source. Open Code.",
        "item_actions": [ "https://www.8bitcn.com/?utm_source=ui.shadcn.com&utm_medium=referral&utm_campaign=directory" ]
    },
    {
        "svg_link": "inline-svg",
        "item_title": "@8starlabs-ui",
        "item_description": "A set of beautifully designed components designed for developers who want niche, high-utility UI elements that you won't find in standard libraries.",
        "item_actions": [ "https://ui.8starlabs.com/?utm_source=ui.shadcn.com&utm_medium=referral&utm_campaign=directory" ]
    },
    {
        "svg_link": "inline-svg",
        "item_title": "@abui",
        "item_description": "A shadcn-compatible registry of reusable components, blocks, and utilities conforming to Vercel's components.build specification",
        "item_actions": [ "https://abui.io/?utm_source=ui.shadcn.com&utm_medium=referral&utm_campaign=directory" ]
    },
    {
        "svg_link": "inline-svg",
        "item_title": "@abstract",
        "item_description": "A collection of React components for the most common crypto patterns",
        "item_actions": [ "https://build.abs.xyz/?utm_source=ui.shadcn.com&utm_medium=referral&utm_campaign=directory" ]
    },
    {
        "svg_link": "inline-svg",
        "item_title": "@aceternity",
        "item_description": "A modern component library built with Tailwind CSS and Motion for React, Aceternity UI contains unique and interactive components that can make your landing pages look 100x better.",
        "item_actions": [ "https://ui.aceternity.com/?utm_source=ui.shadcn.com&utm_medium=referral&utm_campaign=directory" ]
    },
    {
        "svg_link": "inline-svg",
        "item_title": "@agents-ui",
        "item_description": "This is a shadcn/ui component registry that distributes copy-paste React components for building LiveKit AI Agent interfaces.",
        "item_actions": [ "https://livekit.io/ui?utm_source=ui.shadcn.com&utm_medium=referral&utm_campaign=directory" ]
    },
    {
        "svg_link": "inline-svg",
        "item_title": "@aevr",
        "item_description": "A small collection of focused, production‑ready components and primitives for React/Next.js projects—built on shadcn/ui and complementary libraries.",
        "item_actions": [ "https://ui.aevr.space/?utm_source=ui.shadcn.com&utm_medium=referral&utm_campaign=directory" ]
    },
    {
        "svg_link": "inline-svg",
        "item_title": "@ai-blocks",
        "item_description": "AI components for the web. No server. No API keys. Built on WebLLM.",
        "item_actions": [ "https://webllm.org/blocks?utm_source=ui.shadcn.com&utm_medium=referral&utm_campaign=directory" ]
    },
    {
        "svg_link": "inline-svg",
        "item_title": "@ai-elements",
        "item_description": "Pre-built components like conversations, messages and more to help you build AI-native applications faster.",
        "item_actions": [ "https://ai-sdk.dev/elements?utm_source=ui.shadcn.com&utm_medium=referral&utm_campaign=directory" ]
    },
    {
        "svg_link": "inline-svg",
        "item_title": "@algolia",
        "item_description": "Enterprises and developers use Algolia's AI search infrastructure to understand users and show them what they're looking for.",
        "item_actions": [ "https://sitesearch.algolia.com/?utm_source=ui.shadcn.com&utm_medium=referral&utm_campaign=directory" ]
    },
    {
        "svg_link": "inline-svg",
        "item_title": "@aliimam",
        "item_description": "I create digital experiences that connect and inspire. I build apps, websites, brands, and products end-to-end.",
        "item_actions": [ "https://aliimam.in/?utm_source=ui.shadcn.com&utm_medium=referral&utm_campaign=directory" ]
    },
    {
        "svg_link": "inline-svg",
        "item_title": "@animate-ui",
        "item_description": "A fully animated, open-source React component distribution. Browse a list of animated primitives, components and icons you can install and use in your projects.",
        "item_actions": [ "https://animate-ui.com/?utm_source=ui.shadcn.com&utm_medium=referral&utm_campaign=directory" ]
    },
    {
        "svg_link": "inline-svg",
        "item_title": "@assistant-ui",
        "item_description": "Radix-style React primitives for AI chat with adapters for AI SDK, LangGraph, Mastra, and custom backends.",
        "item_actions": [ "https://www.assistant-ui.com/?utm_source=ui.shadcn.com&utm_medium=referral&utm_campaign=directory" ]
    },
    {
        "svg_link": "inline-svg",
        "item_title": "@better-upload",
        "item_description": "Simple and easy file uploads for React. Upload directly to any S3-compatible service with minimal setup.",
        "item_actions": [ "https://better-upload.com/?utm_source=ui.shadcn.com&utm_medium=referral&utm_campaign=directory" ]
    },
    {
        "svg_link": "inline-svg",
        "item_title": "@basecn",
        "item_description": "Beautifully crafted shadcn/ui components powered by Base UI",
        "item_actions": [ "https://basecn.dev/?utm_source=ui.shadcn.com&utm_medium=referral&utm_campaign=directory" ]
    },
    {
        "svg_link": "inline-svg",
        "item_title": "@billingsdk",
        "item_description": "BillingSDK is an open-source React and Next.js component library for SaaS billing and payments. It offers ready-to-use, customizable components for subscriptions, invoices, usage-based pricing and billing - fully compatible with Dodo Payments and Stripe.",
        "item_actions": [ "https://billingsdk.com/?utm_source=ui.shadcn.com&utm_medium=referral&utm_campaign=directory" ]
    },
    {
        "svg_link": "inline-svg",
        "item_title": "@blocks",
        "item_description": "A set of clean, modern application building blocks for you in your applications. Free and Open Source",
        "item_actions": [ "https://blocks.so/?utm_source=ui.shadcn.com&utm_medium=referral&utm_campaign=directory" ]
    },
    {
        "svg_link": "inline-svg",
        "item_title": "@bundui",
        "item_description": "A collection of 150+ handcrafted UI components built with Tailwind CSS and shadcn/ui, covering marketing, e-commerce, dashboards, real estate, and more.",
        "item_actions": [ "https://bundui.io/?utm_source=ui.shadcn.com&utm_medium=referral&utm_campaign=directory" ]
    },
    {
        "svg_link": "inline-svg",
        "item_title": "@cardcn",
        "item_description": "A set of beautifully-designed shadcn card components",
        "item_actions": [ "https://cardcn.dev/?utm_source=ui.shadcn.com&utm_medium=referral&utm_campaign=directory" ]
    },
    {
        "svg_link": "inline-svg",
        "item_title": "@clerk",
        "item_description": "The easiest way to add authentication and user management to your application. Purpose-built for React, Next.js, Remix, and The Modern Web.",
        "item_actions": [ "https://clerk.com/docs/guides/development/shadcn-cli?utm_source=ui.shadcn.com&utm_medium=referral&utm_campaign=directory" ]
    },
    {
        "svg_link": "inline-svg",
        "item_title": "@commercn",
        "item_description": "Shadcn UI Blocks for Ecommerce websites",
        "item_actions": [ "https://commercn.com/?utm_source=ui.shadcn.com&utm_medium=referral&utm_campaign=directory" ]
    },
    {
        "svg_link": "inline-svg",
        "item_title": "@coss",
        "item_description": "A new, modern UI component library built on top of Base UI. Built for developers and AI.",
        "item_actions": [ "https://coss.com/ui?utm_source=ui.shadcn.com&utm_medium=referral&utm_campaign=directory" ]
    },
    {
        "svg_link": "inline-svg",
        "item_title": "@creative-tim",
        "item_description": "A collection of open-source UI components, blocks and AI Agents. Integrate them in v0, Lovable, Claude or in your application.",
        "item_actions": [ "https://www.creative-tim.com/ui?utm_source=ui.shadcn.com&utm_medium=referral&utm_campaign=directory" ]
    },
    {
        "svg_link": "inline-svg",
        "item_title": "@cult-ui",
        "item_description": "Cult UI is a rare, curated set of shadcn-compatible, headless and composable components—tastefully animated with Framer Motion.",
        "item_actions": [ "https://www.cult-ui.com/?utm_source=ui.shadcn.com&utm_medium=referral&utm_campaign=directory" ]
    },
    {
        "svg_link": "inline-svg",
        "item_title": "@diceui",
        "item_description": "Accessible shadcn/ui components built with React, TypeScript, and Tailwind CSS. Copy-paste ready, and customizable.",
        "item_actions": [ "https://www.diceui.com/?utm_source=ui.shadcn.com&utm_medium=referral&utm_campaign=directory" ]
    },
    {
        "svg_link": "inline-svg",
        "item_title": "@doras-ui",
        "item_description": "A collection of beautiful, reusable component blocks built with React",
        "item_actions": [ "https://ui.doras.to/?utm_source=ui.shadcn.com&utm_medium=referral&utm_campaign=directory" ]
    },
    {
        "svg_link": "inline-svg",
        "item_title": "@elements",
        "item_description": "Full-stack shadcn/ui components that go beyond UI. Add auth, monetization, uploads, and AI to your app in seconds.",
        "item_actions": [ "https://www.tryelements.dev/?utm_source=ui.shadcn.com&utm_medium=referral&utm_campaign=directory" ]
    },
    {
        "svg_link": "inline-svg",
        "item_title": "@elevenlabs-ui",
        "item_description": "A collection of Open Source agent and audio components that you can customize and extend.",
        "item_actions": [ "https://ui.elevenlabs.io/?utm_source=ui.shadcn.com&utm_medium=referral&utm_campaign=directory" ]
    },
    {
        "svg_link": "inline-svg",
        "item_title": "@efferd",
        "item_description": "A collection of beautifully crafted Shadcn/UI blocks, designed to help developers build modern websites with ease.",
        "item_actions": [ "https://efferd.com/?utm_source=ui.shadcn.com&utm_medium=referral&utm_campaign=directory" ]
    },
    {
        "svg_link": "inline-svg",
        "item_title": "@einui",
        "item_description": "Beautiful, responsive Shadcn components with frosted glass morphism. Built for modern web applications with full dark mode support.",
        "item_actions": [ "https://ui.eindev.ir/?utm_source=ui.shadcn.com&utm_medium=referral&utm_campaign=directory" ]
    },
    {
        "svg_link": "inline-svg",
        "item_title": "@eldoraui",
        "item_description": "An open-source, modern UI component library for React, built with TypeScript, Tailwind CSS, and Framer Motion. Eldora UI offers beautifully crafted, reusable components designed for performance and elegance.",
        "item_actions": [ "https://eldoraui.site/?utm_source=ui.shadcn.com&utm_medium=referral&utm_campaign=directory" ]
    },
    {
        "svg_link": "inline-svg",
        "item_title": "@formcn",
        "item_description": "Build production-ready forms with a few clicks using shadcn components and modern tools.",
        "item_actions": [ "https://formcn.dev/?utm_source=ui.shadcn.com&utm_medium=referral&utm_campaign=directory" ]
    },
    {
        "svg_link": "inline-svg",
        "item_title": "@gaia",
        "item_description": "Production-ready UI components designed for building beautiful AI assistants and conversational interfaces, from the team behind GAIA.",
        "item_actions": [ "https://ui.heygaia.io/?utm_source=ui.shadcn.com&utm_medium=referral&utm_campaign=directory" ]
    },
    {
        "svg_link": "inline-svg",
        "item_title": "@glass-ui",
        "item_description": "A shadcn-ui compatible registry distributing 40+ glassmorphic React/TypeScript components with Apple-inspired design. Components include enhanced visual effects (glow, shimmer, ripple), theme support, and customizable glassmorphism styling.",
        "item_actions": [ "https://glass-ui.crenspire.com/?utm_source=ui.shadcn.com&utm_medium=referral&utm_campaign=directory" ]
    },
    {
        "svg_link": "inline-svg",
        "item_title": "@ha-components",
        "item_description": "A collection of customisable components to build Home Assistant dashboards.",
        "item_actions": [ "https://hacomponents.keshuac.com/?utm_source=ui.shadcn.com&utm_medium=referral&utm_campaign=directory" ]
    },
    {
        "svg_link": "inline-svg",
        "item_title": "@hextaui",
        "item_description": "Ready-to-use foundation components/blocks built on top of shadcn/ui.",
        "item_actions": [ "https://hextaui.com/?utm_source=ui.shadcn.com&utm_medium=referral&utm_campaign=directory" ]
    },
    {
        "svg_link": "inline-svg",
        "item_title": "@hooks",
        "item_description": "A comprehensive React Hooks Collection built with Shadcn.",
        "item_actions": [ "https://shadcn-hooks.vercel.app/?utm_source=ui.shadcn.com&utm_medium=referral&utm_campaign=directory" ]
    },
    {
        "svg_link": "inline-svg",
        "item_title": "@intentui",
        "item_description": "Accessible React component library to copy, customize, and own your UI.",
        "item_actions": [ "https://intentui.com/?utm_source=ui.shadcn.com&utm_medium=referral&utm_campaign=directory" ]
    },
    {
        "svg_link": "inline-svg",
        "item_title": "@kibo-ui",
        "item_description": "Kibo UI is a custom registry of composable, accessible and open source components designed for use with shadcn/ui.",
        "item_actions": [ "https://www.kibo-ui.com/?utm_source=ui.shadcn.com&utm_medium=referral&utm_campaign=directory" ]
    },
    {
        "svg_link": "inline-svg",
        "item_title": "@kanpeki",
        "item_description": "A set of perfect-designed components built on top of React Aria and Motion.",
        "item_actions": [ "https://kanpeki.vercel.app/?utm_source=ui.shadcn.com&utm_medium=referral&utm_campaign=directory" ]
    },
    {
        "svg_link": "inline-svg",
        "item_title": "@kokonutui",
        "item_description": "Collection of stunning components built with Tailwind CSS, shadcn/ui and Motion to use on your websites.",
        "item_actions": [ "https://kokonutui.com/?utm_source=ui.shadcn.com&utm_medium=referral&utm_campaign=directory" ]
    },
    {
        "svg_link": "inline-svg",
        "item_title": "@lens-blocks",
        "item_description": "A collection of social media components for use with Lens Social Protocol.",
        "item_actions": [ "https://lensblocks.com/?utm_source=ui.shadcn.com&utm_medium=referral&utm_campaign=directory" ]
    },
    {
        "svg_link": "inline-svg",
        "item_title": "@limeplay",
        "item_description": "Modern UI Library for building media players in React. Powered by Shaka Player.",
        "item_actions": [ "https://limeplay.winoffrg.dev/?utm_source=ui.shadcn.com&utm_medium=referral&utm_campaign=directory" ]
    },
    {
        "svg_link": "inline-svg",
        "item_title": "@lucide-animated",
        "item_description": "An open-source collection of smooth animated lucide icons for your projects",
        "item_actions": [ "https://lucide-animated.com/?utm_source=ui.shadcn.com&utm_medium=referral&utm_campaign=directory" ]
    },
    {
        "svg_link": "inline-svg",
        "item_title": "@lytenyte",
        "item_description": "LyteNyte Grid is a high performance, light weight, headless, React data grid. Our registry provides LyteNyte Grid themed using Tailwind and the Shadcn theme variables.",
        "item_actions": [ "https://www.1771technologies.com/?utm_source=ui.shadcn.com&utm_medium=referral&utm_campaign=directory" ]
    },
    {
        "svg_link": "inline-svg",
        "item_title": "@magicui",
        "item_description": "UI Library for Design Engineers. 150+ free and open-source animated components and effects built with React, Typescript, Tailwind CSS, and Motion. Perfect companion for shadcn/ui.",
        "item_actions": [ "https://magicui.design/?utm_source=ui.shadcn.com&utm_medium=referral&utm_campaign=directory" ]
    },
    {
        "svg_link": "inline-svg",
        "item_title": "@manifest",
        "item_description": "Agentic UI toolkit for building MCP Apps. Open-source components and blocks ready to use within your chat app.",
        "item_actions": [ "https://ui.manifest.build/?utm_source=ui.shadcn.com&utm_medium=referral&utm_campaign=directory" ]
    },
    {
        "svg_link": "inline-svg",
        "item_title": "@mui-treasury",
        "item_description": "A collection of hand-crafted interfaces built on top of MUI components",
        "item_actions": [ "https://www.mui-treasury.com/?utm_source=ui.shadcn.com&utm_medium=referral&utm_campaign=directory" ]
    },
    {
        "svg_link": "inline-svg",
        "item_title": "@moleculeui",
        "item_description": "A modern React component library focused on intuitive interactions and seamless user experiences.",
        "item_actions": [ "https://www.moleculeui.design/?utm_source=ui.shadcn.com&utm_medium=referral&utm_campaign=directory" ]
    },
    {
        "svg_link": "inline-svg",
        "item_title": "@motion-primitives",
        "item_description": "Beautifully designed motions components. Easy copy-paste. Customizable. Open Source. Built for engineers and designers.",
        "item_actions": [ "https://www.motion-primitives.com/?utm_source=ui.shadcn.com&utm_medium=referral&utm_campaign=directory" ]
    },
    {
        "svg_link": "inline-svg",
        "item_title": "@ncdai",
        "item_description": "A collection of reusable components.",
        "item_actions": [ "https://chanhdai.com/components?utm_source=ui.shadcn.com&utm_medium=referral&utm_campaign=directory" ]
    },
    {
        "svg_link": "inline-svg",
        "item_title": "@nuqs",
        "item_description": "Custom parsers, adapters and utilities from the community for type-safe URL state management.",
        "item_actions": [ "https://nuqs.dev/registry?utm_source=ui.shadcn.com&utm_medium=referral&utm_campaign=directory" ]
    },
    {
        "svg_link": "inline-svg",
        "item_title": "@nexus-elements",
        "item_description": "Ready-made React components for almost any use case. Use as is or customise and go to market fast",
        "item_actions": [ "https://elements.nexus.availproject.org/docs/view-components?utm_source=ui.shadcn.com&utm_medium=referral&utm_campaign=directory" ]
    },
    {
        "svg_link": "inline-svg",
        "item_title": "@optics",
        "item_description": "A design system that distributes re-styled components, utilities, and hooks ready to use.",
        "item_actions": [ "https://optics.agusmayol.com.ar/?utm_source=ui.shadcn.com&utm_medium=referral&utm_campaign=directory" ]
    },
    {
        "svg_link": "inline-svg",
        "item_title": "@oui",
        "item_description": "React Aria Components with shadcn characteristics.Copy-and-paste react aria components that run side-by-side with shadcn components.",
        "item_actions": [ "https://oui.mw10013.workers.dev/?utm_source=ui.shadcn.com&utm_medium=referral&utm_campaign=directory" ]
    },
    {
        "svg_link": "inline-svg",
        "item_title": "@paceui",
        "item_description": "Animated components and building blocks built for smooth interaction and rich detail. Copy, customise, and create without the extra setup.",
        "item_actions": [ "https://ui.paceui.com/?utm_source=ui.shadcn.com&utm_medium=referral&utm_campaign=directory" ]
    },
    {
        "svg_link": "inline-svg",
        "item_title": "@paykit-sdk",
        "item_description": "Unified payments SDK for builders — handle checkout, billing, and webhooks across Stripe, PayPal, Adyen, and regional gateways with a single integration.",
        "item_actions": [ "https://www.usepaykit.dev/?utm_source=ui.shadcn.com&utm_medium=referral&utm_campaign=directory" ]
    },
    {
        "svg_link": "inline-svg",
        "item_title": "@plate",
        "item_description": "AI-powered rich text editor for React.",
        "item_actions": [ "https://platejs.org/?utm_source=ui.shadcn.com&utm_medium=referral&utm_campaign=directory" ]
    },
    {
        "svg_link": "inline-svg",
        "item_title": "@prompt-kit",
        "item_description": "Core building blocks for AI apps. High-quality, accessible, and customizable components for AI interfaces.",
        "item_actions": [ "https://www.prompt-kit.com/?utm_source=ui.shadcn.com&utm_medium=referral&utm_campaign=directory" ]
    },
    {
        "svg_link": "inline-svg",
        "item_title": "@prosekit",
        "item_description": "Powerful and flexible rich text editor for React, Vue, Preact, Svelte, and SolidJS.",
        "item_actions": [ "https://prosekit.dev/?utm_source=ui.shadcn.com&utm_medium=referral&utm_campaign=directory" ]
    },
    {
        "svg_link": "inline-svg",
        "item_title": "@phucbm",
        "item_description": "A collection of modern React UI components with GSAP animations.",
        "item_actions": [ "https://phucbm.com/components?utm_source=ui.shadcn.com&utm_medium=referral&utm_campaign=directory" ]
    },
    {
        "svg_link": "inline-svg",
        "item_title": "@react-aria",
        "item_description": "Customizable Tailwind and Vanilla CSS components with adaptive interactions, top-tier accessibility, and internationalization.",
        "item_actions": [ "https://react-aria.adobe.com/?utm_source=ui.shadcn.com&utm_medium=referral&utm_campaign=directory" ]
    },
    {
        "svg_link": "inline-svg",
        "item_title": "@react-bits",
        "item_description": "A large collection of animated, interactive & fully customizable React components for building memorable websites. From smooth text animations all the way to eye-catching backgrounds, you can find it here.",
        "item_actions": [ "https://reactbits.dev/?utm_source=ui.shadcn.com&utm_medium=referral&utm_campaign=directory" ]
    },
    {
        "svg_link": "inline-svg",
        "item_title": "@retroui",
        "item_description": "A Neobrutalism styled React + TailwindCSS UI library for building bold, modern web apps. Perfect for any project using Shadcn/ui.",
        "item_actions": [ "https://retroui.dev/?utm_source=ui.shadcn.com&utm_medium=referral&utm_campaign=directory" ]
    },
    {
        "svg_link": "inline-svg",
        "item_title": "@reui",
        "item_description": "Open-source collection of UI components and animated effects built with React, Typescript, Tailwind CSS, and Motion. Pairs beautifully with shadcn/ui.",
        "item_actions": [ "https://reui.io/?utm_source=ui.shadcn.com&utm_medium=referral&utm_campaign=directory" ]
    },
    {
        "svg_link": "inline-svg",
        "item_title": "@scrollxui",
        "item_description": "ScrollX UI is an open-source React and shadcn-compatible component library for animated, interactive, and customizable user interfaces. It offers motion-driven components that blend seamlessly with modern ShadCN setups.",
        "item_actions": [ "https://www.scrollxui.dev/?utm_source=ui.shadcn.com&utm_medium=referral&utm_campaign=directory" ]
    },
    {
        "svg_link": "inline-svg",
        "item_title": "@square-ui",
        "item_description": "Collection of beautifully crafted open-source layouts UI built with shadcn/ui.",
        "item_actions": [ "https://square.lndev.me/?utm_source=ui.shadcn.com&utm_medium=referral&utm_campaign=directory" ]
    },
    {
        "svg_link": "inline-svg",
        "item_title": "@systaliko-ui",
        "item_description": "UI component library, Designed for flexibility, built for customization, and crafted to scale across variants and use cases.",
        "item_actions": [ "https://systaliko-ui.vercel.app/?utm_source=ui.shadcn.com&utm_medium=referral&utm_campaign=directory" ]
    },
    {
        "svg_link": "inline-svg",
        "item_title": "@roiui",
        "item_description": "Roi UI is a library that offers UI components and blocks built with Base UI primitives. Some blocks and components use motion (framer). Everything is open-source and will be forever.",
        "item_actions": [ "https://roiui.com/?utm_source=ui.shadcn.com&utm_medium=referral&utm_campaign=directory" ]
    },
    {
        "svg_link": "inline-svg",
        "item_title": "@solaceui",
        "item_description": "Production-ready and tastefully crafted sections, animated components, and full-page templates for Next.js, Tailwind CSS & Motion",
        "item_actions": [ "https://www.solaceui.com/?utm_source=ui.shadcn.com&utm_medium=referral&utm_campaign=directory" ]
    },
    {
        "svg_link": "inline-svg",
        "item_title": "@shadcnblocks",
        "item_description": "A registry with hundreds of extra blocks for shadcn ui.",
        "item_actions": [ "https://shadcnblocks.com/?utm_source=ui.shadcn.com&utm_medium=referral&utm_campaign=directory" ]
    },
    {
        "svg_link": "inline-svg",
        "item_title": "@shadcndesign",
        "item_description": "A growing collection of high-quality blocks and themes for shadcn/ui.",
        "item_actions": [ "https://www.shadcndesign.com/?utm_source=ui.shadcn.com&utm_medium=referral&utm_campaign=directory" ]
    },
    {
        "svg_link": "inline-svg",
        "item_title": "@shadcn-map",
        "item_description": "A map component for shadcn/ui. Built with Leaflet and React Leaflet.",
        "item_actions": [ "https://shadcn-map.vercel.app/?utm_source=ui.shadcn.com&utm_medium=referral&utm_campaign=directory" ]
    },
    {
        "svg_link": "inline-svg",
        "item_title": "@shadcn-studio",
        "item_description": "An open-source set of shadcn/ui components, blocks, and templates with a powerful theme generator.",
        "item_actions": [ "https://shadcnstudio.com/?utm_source=ui.shadcn.com&utm_medium=referral&utm_campaign=directory" ]
    },
    {
        "svg_link": "inline-svg",
        "item_title": "@shadcn-editor",
        "item_description": "Accessible, Customizable, Rich Text Editor. Made with Lexical and Shadcn/UI. Open Source. Open Code.",
        "item_actions": [ "https://shadcn-editor.vercel.app/?utm_source=ui.shadcn.com&utm_medium=referral&utm_campaign=directory" ]
    },
    {
        "svg_link": "inline-svg",
        "item_title": "@shadcnui-blocks",
        "item_description": "A collection of premium, production-ready shadcn/ui blocks, components and templates.",
        "item_actions": [ "https://shadcnui-blocks.com/?utm_source=ui.shadcn.com&utm_medium=referral&utm_campaign=directory" ]
    },
    {
        "svg_link": "inline-svg",
        "item_title": "@shadcraft",
        "item_description": "A collection of polished shadcn/ui components and marketing blocks built to production standards. Fast to use, easy to extend, and ready for any modern web project.",
        "item_actions": [ "https://shadcraft-free.vercel.app/?utm_source=ui.shadcn.com&utm_medium=referral&utm_campaign=directory" ]
    },
    {
        "svg_link": "inline-svg",
        "item_title": "@smoothui",
        "item_description": "A collection of beautifully crafted motion components built with React, Framer Motion, and TailwindCSS. Designed to elevate microinteractions, each component focuses on smooth animations, subtle feedback, and delightful UX. Perfect for designers and developers who want to add refined motion to their interfaces — copy, paste, and make your UI come alive.",
        "item_actions": [ "https://smoothui.dev/?utm_source=ui.shadcn.com&utm_medium=referral&utm_campaign=directory" ]
    },
    {
        "svg_link": "inline-svg",
        "item_title": "@spectrumui",
        "item_description": "A modern component library built with shadcn/ui and Tailwind CSS. Spectrum UI offers elegant, responsive components and smooth animations designed for high-quality interfaces.",
        "item_actions": [ "https://ui.spectrumhq.in/?utm_source=ui.shadcn.com&utm_medium=referral&utm_campaign=directory" ]
    },
    {
        "svg_link": "inline-svg",
        "item_title": "@supabase",
        "item_description": "A collection of React components and blocks built on the shadcn/ui library that connect your front-end to your Supabase back-end via a single command.",
        "item_actions": [ "https://supabase.com/ui?utm_source=ui.shadcn.com&utm_medium=referral&utm_campaign=directory" ]
    },
    {
        "svg_link": "inline-svg",
        "item_title": "@svgl",
        "item_description": "A beautiful library with SVG logos.",
        "item_actions": [ "https://svgl.app/?utm_source=ui.shadcn.com&utm_medium=referral&utm_campaign=directory" ]
    },
    {
        "svg_link": "inline-svg",
        "item_title": "@tailark",
        "item_description": "Shadcn blocks designed for building modern marketing websites.",
        "item_actions": [ "https://tailark.com/?utm_source=ui.shadcn.com&utm_medium=referral&utm_campaign=directory" ]
    },
    {
        "svg_link": "inline-svg",
        "item_title": "@taki",
        "item_description": "Beautifully designed, accessible components that you can copy and paste into your apps. Made with React Aria Components and Shadcn tokens.",
        "item_actions": [ "https://taki-ui.com/?utm_source=ui.shadcn.com&utm_medium=referral&utm_campaign=directory" ]
    },
    {
        "svg_link": "inline-svg",
        "item_title": "@tour",
        "item_description": "A component for building onboarding tours. Designed to integrate with shadcn/ui.",
        "item_actions": [ "https://onboarding-tour.vercel.app/?utm_source=ui.shadcn.com&utm_medium=referral&utm_campaign=directory" ]
    },
    {
        "svg_link": "inline-svg",
        "item_title": "@uitripled",
        "item_description": "An open-source, Production-ready UI components and blocks powered by shadcn/ui and Framer Motion",
        "item_actions": [ "https://ui.tripled.work/?utm_source=ui.shadcn.com&utm_medium=referral&utm_campaign=directory" ]
    },
    {
        "svg_link": "inline-svg",
        "item_title": "@utilcn",
        "item_description": "Fullstack registry items to start those big features. Utilcn has ChatGPT Apps, file uploading (with progress bars) and downloading, and a way to make your env vars typesafe on the backend.",
        "item_actions": [ "https://utilcn.dev/?utm_source=ui.shadcn.com&utm_medium=referral&utm_campaign=directory" ]
    },
    {
        "svg_link": "inline-svg",
        "item_title": "@wandry-ui",
        "item_description": "A set of open source fully controlled React Inertia form elements",
        "item_actions": [ "http://ui.wandry.com.ua/?utm_source=ui.shadcn.com&utm_medium=referral&utm_campaign=directory" ]
    },
    {
        "svg_link": "inline-svg",
        "item_title": "@wigggle-ui",
        "item_description": "A beautiful collection of copy-and-paste widgets for your next project.",
        "item_actions": [ "https://wigggle-ui.vercel.app/?utm_source=ui.shadcn.com&utm_medium=referral&utm_campaign=directory" ]
    },
    {
        "svg_link": "inline-svg",
        "item_title": "@zippystarter",
        "item_description": "Expertly crafted blocks, components & themes for shadcn/ui.",
        "item_actions": [ "https://zippystarter.com/?utm_source=ui.shadcn.com&utm_medium=referral&utm_campaign=directory" ]
    },
    {
        "svg_link": "inline-svg",
        "item_title": "@uicapsule",
        "item_description": "A curated collection of components that spark joy. Featuring interactive concepts, design experiments, and components in the intersection of AI/UI.",
        "item_actions": [ "https://uicapsule.com/?utm_source=ui.shadcn.com&utm_medium=referral&utm_campaign=directory" ]
    },
    {
        "svg_link": "inline-svg",
        "item_title": "@ui-layouts",
        "item_description": "UI Layouts offers components, effects, design tools, and ready-made blocks that make building modern interfaces more efficient—built with React, Next.js, Tailwind CSS, and shadcn/ui.",
        "item_actions": [ "https://ui-layouts.com/?utm_source=ui.shadcn.com&utm_medium=referral&utm_campaign=directory" ]
    },
    {
        "svg_link": "inline-svg",
        "item_title": "@pureui",
        "item_description": "Pure UI is a curated collection of refined, animated, and accessible components built with Base UI, Tailwind CSS, Motion, and other high-quality open source libraries.",
        "item_actions": [ "https://pure.kam-ui.com/?utm_source=ui.shadcn.com&utm_medium=referral&utm_campaign=directory" ]
    },
    {
        "svg_link": "inline-svg",
        "item_title": "@tailwind-builder",
        "item_description": "Tailwind Builder is a collection of free ui blocks and components and provide ai tools to generate production-ready forms, tables, and charts in seconds. Built with React, Next.js, Tailwind & ShadCN.",
        "item_actions": [ "https://tailwindbuilder.ai/?utm_source=ui.shadcn.com&utm_medium=referral&utm_campaign=directory" ]
    },
    {
        "svg_link": "inline-svg",
        "item_title": "@tailwind-admin",
        "item_description": "Tailwind Builder provides free tailwind admin dashboard templates, components and ui-blocks built with React, Next.js, Tailwind CSS, and shadcn/ui to help you build admin panels quickly and efficiently.",
        "item_actions": [ "https://tailwind-admin.com/?utm_source=ui.shadcn.com&utm_medium=referral&utm_campaign=directory" ]
    },
    {
        "svg_link": "inline-svg",
        "item_title": "@skiper-ui",
        "item_description": "Brand new uncommon components for your Next.js project. Use with ease through shadcn CLI 3.0, featuring fast-growing components and collections that are easy to edit and use.",
        "item_actions": [ "https://skiper-ui.com/?utm_source=ui.shadcn.com&utm_medium=referral&utm_campaign=directory" ]
    },
    {
        "svg_link": "inline-svg",
        "item_title": "@animbits",
        "item_description": "AnimBits is a collection animated UI components for React that use Framer Motion. The components provided include buttons, cards, text, icons, lists, loaders, and page transitions, animation hooks all of which have general-purpose effects that are not flashy and easy on the eyes, making them easy to use.",
        "item_actions": [ "https://animbits.dev/?utm_source=ui.shadcn.com&utm_medium=referral&utm_campaign=directory" ]
    }
];

export const registriesList: RegistryItem[] = rawData.map(item => ({
  title: item.item_title,
  category: inferCategory(item.item_title, item.item_description),
  count: inferCount(item.item_description),
  license: inferLicense(item.item_description),
  rating: inferRating(item.item_title, item.item_description),
  description: item.item_description,
  url: item.item_actions[0],
  featured: ['@origin-ui', '@magicui', '@aceternity'].includes(item.item_title)
}));

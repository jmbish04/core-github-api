import { motion, type Variants } from "framer-motion";
import { ArrowRight, Bot, Zap, Globe, Terminal, Code2, Database } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Link } from "react-router-dom";

export default function Home() {
    const container: Variants = {
        hidden: { opacity: 0 },
        show: {
            opacity: 1,
            transition: {
                staggerChildren: 0.15
            }
        }
    };

    const item: Variants = {
        hidden: { opacity: 0, y: 30 },
        show: { opacity: 1, y: 0, transition: { type: "spring", stiffness: 50 } }
    };

    return (
        <div className="flex flex-col min-h-[calc(100vh-4rem)]">
            {/* Background Effects */}
            <div className="fixed inset-0 -z-10 bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-indigo-900/20 via-background to-background"></div>
            <div className="fixed inset-0 -z-10 bg-[url('/grid.svg')] bg-center [mask-image:linear-gradient(180deg,white,rgba(255,255,255,0))]"></div>

            {/* Hero Section */}
            <section className="flex-1 flex flex-col justify-center items-center py-20 px-4 md:px-6 relative overflow-hidden">
                <motion.div
                    variants={container}
                    initial="hidden"
                    animate="show"
                    className="max-w-4xl mx-auto text-center space-y-8 z-10"
                >
                    <motion.div variants={item}>
                        <Badge variant="outline" className="px-4 py-1.5 text-sm border-emerald-500/30 text-emerald-400 bg-emerald-500/10 backdrop-blur-md rounded-full shadow-[0_0_20px_-5px_rgba(16,185,129,0.4)]">
                            <span className="relative flex h-2 w-2 mr-2">
                                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                                <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
                            </span>
                            System Operational • v2.4.0
                        </Badge>
                    </motion.div>

                    <motion.h1 variants={item} className="text-6xl md:text-8xl font-black tracking-tight leading-none">
                        <span className="bg-clip-text text-transparent bg-gradient-to-b from-white to-white/60">
                            Automate Your
                        </span>
                        <br />
                        <span className="bg-clip-text text-transparent bg-gradient-to-r from-indigo-400 via-cyan-400 to-emerald-400 animate-gradient-x">
                            DevOps Reality
                        </span>
                    </motion.h1>

                    <motion.p variants={item} className="text-xl md:text-2xl text-muted-foreground leading-relaxed max-w-2xl mx-auto">
                        Your autonomous "Gardener" for GitHub repositories.
                        Handles standardization, merge conflicts, and code reviews while you sleep.
                    </motion.p>

                    <motion.div variants={item} className="flex flex-col sm:flex-row gap-4 justify-center pt-8">
                        <Link to="/chat">
                            <Button size="lg" className="rounded-full px-8 text-lg bg-white text-black hover:bg-white/90 shadow-2xl shadow-indigo-500/20">
                                Enter Command Center <Terminal className="ml-2 h-5 w-5" />
                            </Button>
                        </Link>
                        <Link to="/docs">
                            <Button size="lg" variant="outline" className="rounded-full px-8 text-lg border-zinc-800 bg-black/50 backdrop-blur-xl hover:bg-zinc-900/80">
                                View Documentation <ArrowRight className="ml-2 h-5 w-5" />
                            </Button>
                        </Link>
                    </motion.div>

                    {/* Mock Terminal Output */}
                    <motion.div variants={item} className="mt-16 mx-auto max-w-3xl w-full perspective-1000">
                        <div className="rounded-xl border border-zinc-800 bg-zinc-950/80 backdrop-blur-md shadow-2xl p-4 text-left font-mono text-sm transform rotate-x-12 opacity-90 hover:opacity-100 transition-opacity">
                            <div className="flex gap-2 mb-4 border-b border-zinc-800 pb-2">
                                <div className="h-3 w-3 rounded-full bg-red-500/20 border border-red-500/50"></div>
                                <div className="h-3 w-3 rounded-full bg-yellow-500/20 border border-yellow-500/50"></div>
                                <div className="h-3 w-3 rounded-full bg-green-500/20 border border-green-500/50"></div>
                                <div className="ml-auto text-xs text-zinc-500">colby-ops-container — zsh</div>
                            </div>
                            <div className="space-y-2">
                                <p className="text-emerald-400">➜  ~ <span className="text-zinc-400">/colby fix all --pr=124</span></p>
                                <p className="text-zinc-300">[info] Cloning repository 'owner/repo'...</p>
                                <p className="text-zinc-300">[info] Found 3 unhandled review comments.</p>
                                <p className="text-blue-400">[agent] Running gemini-cli fix --context=comments.json</p>
                                <p className="text-zinc-300">   &gt; Patching src/routes/index.ts... <span className="text-green-500">Done</span></p>
                                <p className="text-zinc-300">   &gt; Patching wrangler.jsonc... <span className="text-green-500">Done</span></p>
                                <p className="text-purple-400">[git] Pushing to branch 'colby/fix-comments'...</p>
                                <p className="text-emerald-400 animate-pulse">_</p>
                            </div>
                        </div>
                    </motion.div>
                </motion.div>
            </section>

            {/* Features Grid */}
            <section className="py-20 px-4">
                <div className="max-w-6xl mx-auto grid md:grid-cols-3 gap-6">
                    {[
                        {
                            icon: Bot,
                            title: "Autonomous Agents",
                            desc: "Self-healing maintenance and intelligent PR reviews powered by Gemini 2.0.",
                            color: "text-indigo-400"
                        },
                        {
                            icon: Zap,
                            title: "Event-Driven",
                            desc: "Reacts instantly to Webhooks. Uses Durable Objects for stateful supervision.",
                            color: "text-amber-400"
                        },
                        {
                            icon: Database,
                            title: "Smart Context",
                            desc: "Maintains a D1 database of repo 'Fingerprints' to enforce your gold standards.",
                            color: "text-cyan-400"
                        },
                        {
                            icon: Terminal,
                            title: "Live Ops Console",
                            desc: "Watch your agents work in real-time via WebSocket-streamed xterm.js sessions.",
                            color: "text-emerald-400"
                        },
                        {
                            icon: Code2,
                            title: "Standardization",
                            desc: "Automatically upgrades wrangler.toml to jsonc and adds OpenAPI specs.",
                            color: "text-pink-400"
                        },
                        {
                            icon: Globe,
                            title: "Region: Earth",
                            desc: "Runs on Cloudflare Workers & Containers for zero-latency global management.",
                            color: "text-blue-400"
                        }
                    ].map((feature, i) => (
                        <motion.div
                            key={i}
                            initial={{ opacity: 0, y: 20 }}
                            whileInView={{ opacity: 1, y: 0 }}
                            viewport={{ once: true }}
                            transition={{ delay: i * 0.1 }}
                            className="group p-8 rounded-3xl border border-zinc-800 bg-zinc-950/50 hover:bg-zinc-900/80 backdrop-blur-sm transition-all duration-300 hover:border-indigo-500/30"
                        >
                            <div className={`h-12 w-12 rounded-2xl bg-zinc-900 flex items-center justify-center mb-6 group-hover:scale-110 transition-transform duration-300 ${feature.color}`}>
                                <feature.icon className="h-6 w-6" />
                            </div>
                            <h3 className="text-xl font-bold mb-3 text-zinc-100">{feature.title}</h3>
                            <p className="text-zinc-400 leading-relaxed">{feature.desc}</p>
                        </motion.div>
                    ))}
                </div>
            </section>
        </div>
    );
}